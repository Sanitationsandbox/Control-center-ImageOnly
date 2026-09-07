import { Redis } from "@upstash/redis";
import type { PdfControlResponse } from "@/lib/control-state";
import type { ControlStateMessage } from "@/lib/control-events";

const redisUrl =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const redis =
  redisUrl && redisToken
    ? new Redis({ url: redisUrl, token: redisToken })
    : null;

const channelName = `rubenius:pdf-control:${process.env.VERCEL_ENV ?? "local"}:updates`;

const globalPubSub = globalThis as typeof globalThis & {
  controlStateSubscriptionStarted?: boolean;
};

export async function publishControlState(state: PdfControlResponse) {
  if (!redis) return;

  await redis.publish(channelName, {
    type: "CONTROL_STATE_CHANGED",
    version: state.version,
    state,
  } satisfies ControlStateMessage);
}

export function ensureControlStateSubscription(
  onState: (state: PdfControlResponse) => void,
) {
  if (!redis || globalPubSub.controlStateSubscriptionStarted) return;

  globalPubSub.controlStateSubscriptionStarted = true;
  const subscriber = redis.subscribe<ControlStateMessage>(channelName);

  subscriber.on("message", ({ message }) => {
    if (message.type === "CONTROL_STATE_CHANGED") {
      onState(message.state);
    }
  });

  subscriber.on("error", () => {
    globalPubSub.controlStateSubscriptionStarted = false;
  });
}
