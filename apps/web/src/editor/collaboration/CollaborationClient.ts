import type {
  AppliedProjectOperation,
  ProjectErrorPayload,
  ProjectOperation,
  ServerToClientCollaborationEvent,
  SharedProjectPresence,
  SharedProjectStatePayload
} from "@webster/shared";

export type CollaborationConnectionStatus = "connected" | "connecting" | "disconnected" | "reconnecting";

type CollaborationClientOptions = {
  clientId: string;
  onAppliedOperation: (payload: AppliedProjectOperation) => void;
  onError: (payload: ProjectErrorPayload) => void;
  onPresence: (payload: SharedProjectPresence[]) => void;
  onReadyToResend: () => void;
  onState: (payload: SharedProjectStatePayload) => void;
  onStatusChange: (status: CollaborationConnectionStatus) => void;
  onPreviewOperation: (operation: ProjectOperation) => void;
  projectId: string;
  webSocketUrl: string;
};

/**
 * Thin WebSocket wrapper for the shared-project room.
 *
 * The editor never imports WebSocket directly. It asks this client to join a
 * project room, send preview/commit operations, and resend queued commits when
 * a reconnect succeeds. The backend is expected to dedupe commits by
 * clientOperationId.
 */
export class CollaborationClient {
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private socket: WebSocket | null = null;
  private wasClosedIntentionally = false;

  constructor(private readonly options: CollaborationClientOptions) {}

  connect() {
    this.clearReconnectTimer();
    this.wasClosedIntentionally = false;
    this.openSocket(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");
  }

  disconnect() {
    this.wasClosedIntentionally = true;
    this.clearReconnectTimer();
    this.leaveProject();
    this.socket?.close();
    this.socket = null;
    this.options.onStatusChange("disconnected");
  }

  sendPreview(operation: ProjectOperation) {
    this.send("operation:preview", operation);
  }

  sendCommit(operation: ProjectOperation) {
    this.send("operation:commit", operation);
  }

  sendPresence(cursor: { x: number; y: number } | null, tool?: string | null) {
    this.send("presence:cursor", {
      clientId: this.options.clientId,
      cursor,
      projectId: this.options.projectId,
      tool
    });
  }

  get isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private openSocket(status: CollaborationConnectionStatus) {
    this.options.onStatusChange(status);

    const socket = new WebSocket(this.options.webSocketUrl);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.options.onStatusChange("connected");
      this.send("project:join", {
        clientId: this.options.clientId,
        projectId: this.options.projectId
      });
      this.options.onReadyToResend();
    });

    socket.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });

    socket.addEventListener("error", () => {
      this.options.onError({
        code: "socket_error",
        message: "The realtime connection reported an error.",
        projectId: this.options.projectId
      });
    });

    socket.addEventListener("close", () => {
      if (this.wasClosedIntentionally) {
        return;
      }

      this.options.onStatusChange("disconnected");
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect() {
    this.clearReconnectTimer();
    this.reconnectAttempt += 1;
    const delay = Math.min(1000 * 2 ** (this.reconnectAttempt - 1), 10000);

    this.reconnectTimer = window.setTimeout(() => {
      this.openSocket("reconnecting");
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private leaveProject() {
    if (!this.isConnected) {
      return;
    }

    this.send("project:leave", {
      clientId: this.options.clientId,
      projectId: this.options.projectId
    });
  }

  private send(type: string, payload: unknown) {
    if (!this.isConnected) {
      return false;
    }

    this.socket?.send(JSON.stringify({ payload, type }));
    return true;
  }

  private handleMessage(data: unknown) {
    const event = parseServerEvent(data);

    if (!event) {
      return;
    }

    switch (event.type) {
      case "project:state":
        this.options.onState(event.payload);
        break;
      case "operation:applied":
        this.options.onAppliedOperation(event.payload);
        break;
      case "operation:preview":
        this.options.onPreviewOperation(event.payload);
        break;
      case "presence:update":
        this.options.onPresence(event.payload);
        break;
      case "project:error":
        this.options.onError(event.payload);
        break;
    }
  }
}

function parseServerEvent(data: unknown): ServerToClientCollaborationEvent | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as Partial<ServerToClientCollaborationEvent>;

    return typeof parsed.type === "string" && "payload" in parsed
      ? (parsed as ServerToClientCollaborationEvent)
      : null;
  } catch {
    return null;
  }
}
