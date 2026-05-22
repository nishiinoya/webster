import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type {
  AppliedProjectOperation,
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
  onPreviewOperation: (operation: ProjectOperation) => void;
  projectId: string;
  webSocketUrl: string;
};

/**
 * Socket.IO wrapper for the shared-project room.
 *
 * The editor never imports socket.io-client directly. It asks this client to
 * join a project room, send preview/commit operations, and resend queued
 * commits when a reconnect succeeds. The backend dedupes commits by
 * clientOperationId.
 */
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
      // Skip long-polling entirely. Polling holds a persistent HTTP connection
      // open against the API origin; with Chrome's 6-per-origin HTTP/1.1 limit
      // on localhost, that can starve REST fetches and make /me, /projects
      // etc. sit "pending" forever. WebSocket uses its own connection slot.
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

    // The server authenticates asynchronously in handleConnection (JWT verify +
    // DB lookups). If we joined on "connect", the join could arrive before
    // socket.data.user was set and be silently dropped. We wait for the server
    // to confirm auth is complete via "connection:ready" before joining.
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
      // BUG 3 fix: refresh the auth token before reconnecting so the
      // gateway doesn't reject stale or expired tokens.
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
