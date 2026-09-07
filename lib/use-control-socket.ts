"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PdfControlCommand, PdfControlResponse } from "@/lib/control-state";

export type ControlSocketStatus =
  | "Connecting"
  | "Connected"
  | "Reconnecting"
  | "Disconnected"
  | "Error";

type ServerMessage =
  | {
      type: "INITIAL_STATE" | "CONTROL_STATE_CHANGED" | "STATE_SYNC";
      version: number;
      state: PdfControlResponse;
    }
  | { type: "pong" }
  | { type: "error"; error: string };

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];
const isDevelopment = process.env.NODE_ENV === "development";

function logSocketEvent(message: string, details?: unknown) {
  if (!isDevelopment) return;

  if (details) {
    console.debug(`[WS] ${message}`, details);
    return;
  }

  console.debug(`[WS] ${message}`);
}

function getSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/ws`;
}

function parseServerMessage(data: string): ServerMessage | null {
  try {
    const parsed = JSON.parse(data) as Partial<ServerMessage>;

    if (
      (parsed.type === "INITIAL_STATE" ||
        parsed.type === "CONTROL_STATE_CHANGED" ||
        parsed.type === "STATE_SYNC") &&
      parsed.state &&
      typeof parsed.version === "number"
    ) {
      return parsed as ServerMessage;
    }

    if (parsed.type === "pong") {
      return { type: "pong" };
    }

    if (parsed.type === "error" && typeof parsed.error === "string") {
      return { type: "error", error: parsed.error };
    }
  } catch {
    return null;
  }

  return null;
}

export function useControlSocket(
  onState: (state: PdfControlResponse) => void,
) {
  const [status, setStatus] = useState<ControlSocketStatus>("Connecting");
  const onStateRef = useRef(onState);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    onStateRef.current = onState;
  }, [onState]);

  useEffect(() => {
    let isDisposed = false;

    function clearReconnectTimer() {
      if (reconnectTimerRef.current === null) return;

      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    function sendSync(socket: WebSocket) {
      socket.send(JSON.stringify({ type: "sync" }));
      logSocketEvent("sync requested");
    }

    function scheduleReconnect() {
      if (isDisposed) return;
      clearReconnectTimer();

      const baseDelay =
        RECONNECT_DELAYS_MS[
          Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS_MS.length - 1)
        ];
      const jitter = Math.floor(Math.random() * 250);
      const delay = baseDelay + jitter;

      setStatus("Reconnecting");
      reconnectAttemptRef.current += 1;
      logSocketEvent("reconnecting", { delay });
      reconnectTimerRef.current = window.setTimeout(connect, delay);
    }

    function connect() {
      if (isDisposed) return;
      clearReconnectTimer();

      setStatus(
        reconnectAttemptRef.current === 0 ? "Connecting" : "Reconnecting",
      );
      logSocketEvent("connecting", { url: getSocketUrl() });
      const socket = new WebSocket(getSocketUrl());
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        reconnectAttemptRef.current = 0;
        setStatus("Connected");
        logSocketEvent("connected");
        sendSync(socket);
      });

      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;

        const message = parseServerMessage(event.data);
        if (
          message?.type === "INITIAL_STATE" ||
          message?.type === "CONTROL_STATE_CHANGED" ||
          message?.type === "STATE_SYNC"
        ) {
          logSocketEvent("message received", {
            type: message.type,
            version: message.version,
          });
          onStateRef.current(message.state);
          return;
        }

        if (message?.type === "error") {
          logSocketEvent("server error", message.error);
        }
      });

      socket.addEventListener("close", () => {
        logSocketEvent("closed");
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        setStatus("Disconnected");
        scheduleReconnect();
      });

      socket.addEventListener("error", () => {
        setStatus("Error");
        logSocketEvent("error");
        socket.close();
      });
    }

    connect();

    return () => {
      isDisposed = true;
      clearReconnectTimer();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const sendCommand = useCallback((command: PdfControlCommand) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;

    socket.send(JSON.stringify({ type: "command", command }));
    return true;
  }, []);

  return { status, sendCommand };
}
