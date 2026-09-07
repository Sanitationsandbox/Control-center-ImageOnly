import {
  experimental_upgradeWebSocket,
  type WebSocketData,
} from "@vercel/functions";
import {
  addControlClient,
  broadcastControlState,
  removeControlClient,
  sendControlState,
} from "@/lib/control-events";
import {
  applyControlCommand,
  getControlSnapshot,
  type PdfControlCommand,
} from "@/lib/control-state";
import {
  ensureControlStateSubscription,
  publishControlState,
} from "@/lib/control-pubsub";

export const runtime = "nodejs";

type ClientMessage =
  | { type: "command"; command: PdfControlCommand }
  | { type: "ping" }
  | { type: "sync" };

function parseClientMessage(data: WebSocketData): ClientMessage | null {
  try {
    const parsed = JSON.parse(data.toString()) as Partial<ClientMessage>;

    if (parsed.type === "ping") {
      return { type: "ping" };
    }

    if (parsed.type === "sync") {
      return { type: "sync" };
    }

    if (
      parsed.type === "command" &&
      typeof parsed.command === "object" &&
      parsed.command !== null
    ) {
      return {
        type: "command",
        command: parsed.command as PdfControlCommand,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function GET() {
  return experimental_upgradeWebSocket((socket) => {
    ensureControlStateSubscription(broadcastControlState);
    addControlClient(socket);

    void getControlSnapshot()
      .then((state) => sendControlState(socket, state, "INITIAL_STATE"))
      .catch(() => undefined);

    socket.on("message", (data: WebSocketData) => {
      const message = parseClientMessage(data);

      if (!message) {
        socket.send(JSON.stringify({ type: "error", error: "Invalid message" }));
        return;
      }

      if (message.type === "ping") {
        socket.send(JSON.stringify({ type: "pong" }));
        return;
      }

      if (message.type === "sync") {
        void getControlSnapshot()
          .then((state) => sendControlState(socket, state, "STATE_SYNC"))
          .catch(() => {
            socket.send(
              JSON.stringify({ type: "error", error: "Sync failed" }),
            );
          });
        return;
      }

      void applyControlCommand(message.command)
        .then((result) => {
          if (result.ok) {
            broadcastControlState(result.data);
            void publishControlState(result.data).catch(() => undefined);
            return;
          }

          socket.send(
            JSON.stringify({ type: "error", error: result.data.error }),
          );
        })
        .catch(() => {
          socket.send(
            JSON.stringify({ type: "error", error: "Command failed" }),
          );
        });
    });

    socket.on("close", () => removeControlClient(socket));
    socket.on("error", () => removeControlClient(socket));
  });
}
