import type { PdfControlResponse } from "@/lib/control-state";

export type ControlStateMessageType =
  | "INITIAL_STATE"
  | "CONTROL_STATE_CHANGED"
  | "STATE_SYNC";

export type ControlStateMessage = {
  type: ControlStateMessageType;
  version: number;
  state: PdfControlResponse;
};

type ControlSocketClient = {
  readyState: number;
  send(data: string): void;
};

const SOCKET_OPEN = 1;

const globalEvents = globalThis as typeof globalThis & {
  controlSocketClients?: Set<ControlSocketClient>;
};

function getClients() {
  globalEvents.controlSocketClients ??= new Set<ControlSocketClient>();
  return globalEvents.controlSocketClients;
}

export function addControlClient(client: ControlSocketClient) {
  getClients().add(client);
}

export function removeControlClient(client: ControlSocketClient) {
  getClients().delete(client);
}

export function sendControlState(
  client: ControlSocketClient,
  state: PdfControlResponse,
  type: ControlStateMessageType = "CONTROL_STATE_CHANGED",
) {
  if (client.readyState !== SOCKET_OPEN) return;

  client.send(JSON.stringify({ type, version: state.version, state }));
}

export function broadcastControlState(state: PdfControlResponse) {
  const payload = JSON.stringify({
    type: "CONTROL_STATE_CHANGED",
    version: state.version,
    state,
  } satisfies ControlStateMessage);

  for (const client of getClients()) {
    if (client.readyState === SOCKET_OPEN) {
      client.send(payload);
    } else {
      removeControlClient(client);
    }
  }
}
