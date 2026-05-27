import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type {
  AppliedProjectOperation,
  ProjectCommentEventPayload,
  ProjectErrorPayload,
  ProjectOperation,
  SharedProjectPresence,
  SharedProjectStatePayload
} from "@webster/shared";
import { getAccessToken } from "./sharedProjectApi";

export type CollaborationConnectionStatus = "connected" | "connecting" | "disconnected" | "reconnecting";

type CollaborationClientOptions = {
  accessToken?: string;
  clientId: string;
  onAppliedOperation: (payload: AppliedProjectOperation) => void;
  onError: (payload: ProjectErrorPayload) => void;
  onPresence: (payload: SharedProjectPresence[]) => void;
  onReadyToResend: () => void;
  onState: (payload: SharedProjectStatePayload) => void;
  onStatusChange: (status: CollaborationConnectionStatus) => void;
  onCommentEvent?: (type: string, payload: ProjectCommentEventPayload) => void;
  onPreviewOperation: (operation: ProjectOperation) => void;
  projectId: string;
  webSocketUrl: string;
};

export class CollaborationClient {
  private socket: Socket | null = null;
  private wasClosedIntentionally = false;

  constructor(private readonly options: CollaborationClientOptions) {}

  connect() {
    this.wasClosedIntentionally = false;
    this.options.onStatusChange("connecting");

    const wsUrl =
      process.env.NEXT_PUBLIC_WEBSTER_WS_URL ?? this.options.webSocketUrl ?? "http://localhost:4000";

    const socket = io(wsUrl, {
      auth: { token: this.options.accessToken ?? "" },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000
    });

    this.socket = socket;

    socket.on("connect", () => {
      this.options.onStatusChange("connected");
    });

    socket.on("connection:ready", () => {
      socket.emit("project:join", {
        clientId: this.options.clientId,
        projectId: this.options.projectId
      });
      this.options.onReadyToResend();
    });

    socket.on("connect_error", () => {
      this.options.onStatusChange("reconnecting");
    });

    socket.on("disconnect", (reason) => {
      if (this.wasClosedIntentionally) {
        return;
      }

      this.options.onStatusChange(
        reason === "io server disconnect" ? "disconnected" : "reconnecting"
      );
    });

    socket.on("reconnect_attempt", () => {
      this.options.onStatusChange("reconnecting");
      void getAccessToken().then((token) => {
        if (token) {
          socket.auth = { token };
        }
      });
    });

    socket.on("project:state", (payload: SharedProjectStatePayload) => {
      this.options.onState(payload);
    });

    socket.on("operation:applied", (payload: AppliedProjectOperation) => {
      this.options.onAppliedOperation(payload);
    });

    socket.on("operation:preview", (payload: ProjectOperation) => {
      this.options.onPreviewOperation(payload);
    });

    socket.on("presence:update", (payload: SharedProjectPresence[]) => {
      this.options.onPresence(payload);
    });

    socket.on("project:error", (payload: ProjectErrorPayload) => {
      this.options.onError(payload);
    });

    for (const eventName of [
      "comment:create",
      "comment:update",
      "comment:delete",
      "comment:resolve",
      "comment:reopen"
    ] as const) {
      socket.on(eventName, (payload: ProjectCommentEventPayload) => {
        this.options.onCommentEvent?.(eventName, payload);
      });
    }
  }

  disconnect() {
    this.wasClosedIntentionally = true;

    if (this.socket) {
      if (this.socket.connected) {
        this.socket.emit("project:leave", {
          clientId: this.options.clientId,
          projectId: this.options.projectId
        });
      }

      this.socket.disconnect();
      this.socket = null;
    }

    this.options.onStatusChange("disconnected");
  }

  sendPreview(operation: ProjectOperation) {
    this.socket?.emit("operation:preview", operation);
  }

  sendCommit(operation: ProjectOperation) {
    this.socket?.emit("operation:commit", operation);
  }

  sendPresence(cursor: { x: number; y: number } | null, tool?: string | null) {
    this.socket?.emit("presence:cursor", {
      clientId: this.options.clientId,
      cursor,
      projectId: this.options.projectId,
      tool
    });
  }

  get isConnected() {
    return this.socket?.connected ?? false;
  }
}
