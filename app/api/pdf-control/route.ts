import { Redis } from "@upstash/redis";
import {
  isPdfDirection,
  isPdfId,
  type PdfControlState,
  type PdfRemoteState,
  mediaDocuments,
} from "@/lib/pdf-control";
import { getDocuments } from "@/lib/db";

export const dynamic = "force-dynamic";

const redisUrl =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const redis =
  redisUrl && redisToken
    ? new Redis({ url: redisUrl, token: redisToken })
    : null;

const stateKey = `rubenius:pdf-control:${process.env.VERCEL_ENV ?? "local"}:v1`;

const globalState = globalThis as typeof globalThis & {
  pdfRemoteState?: PdfRemoteState;
};

function getDynamicPageCount(pdfId: string): number | null {
  const document = getDocuments().find((item) => item.id === pdfId);
  return document?.kind === "images" ? document.images.length : null;
}

function isVideoSource(src: string): boolean {
  return src.includes("/video/upload/") || /\.(mp4|webm|mov)(\?|$)/i.test(src);
}

function createInitialState(): PdfRemoteState {
  return {
    updatedAt: Date.now(),
    activePdfId: null,
    activeUpdatedAt: 0,
    videoPlaying: false,
    videoMuted: true,
    documents: Object.fromEntries(
      mediaDocuments.map((document) => [
        document.id,
        {
          page: 1,
          totalPages:
            getDynamicPageCount(document.id) ??
            (document.kind === "images" ? document.items.length : null),
          updatedAt: Date.now(),
        },
      ]),
    ) as PdfControlState,
  };
}

function normalizeState(storedState: PdfRemoteState): PdfRemoteState {
  storedState.activeUpdatedAt ??= 0;
  storedState.videoPlaying ??= false;
  storedState.videoMuted ??= true;

  for (const document of mediaDocuments) {
    storedState.documents[document.id] ??= {
      page: 1,
      totalPages: document.kind === "images" ? document.items.length : null,
      updatedAt: Date.now(),
    };

    if (document.kind === "images") {
      const totalPages = getDynamicPageCount(document.id) ?? document.items.length;
      storedState.documents[document.id].totalPages = totalPages;
      storedState.documents[document.id].page = Math.min(
        totalPages,
        Math.max(1, storedState.documents[document.id].page),
      );
    }
  }

  storedState.updatedAt ??= Math.max(
    storedState.activeUpdatedAt,
    ...Object.values(storedState.documents).map(
      (document) => document.updatedAt,
    ),
  );

  return storedState;
}

async function readState(): Promise<PdfRemoteState> {
  if (!redis) {
    globalState.pdfRemoteState ??= createInitialState();
    return normalizeState(globalState.pdfRemoteState);
  }

  const storedState = await redis.get<PdfRemoteState>(stateKey);
  if (storedState) return normalizeState(storedState);

  const initialState = createInitialState();
  await redis.set(stateKey, initialState, { nx: true });
  return normalizeState(
    (await redis.get<PdfRemoteState>(stateKey)) ?? initialState,
  );
}

async function writeState(state: PdfRemoteState) {
  if (redis) {
    await redis.set(stateKey, state);
  } else {
    globalState.pdfRemoteState = state;
  }
}

function markActiveStateChanged(state: PdfRemoteState) {
  state.activeUpdatedAt = Math.max(Date.now(), state.activeUpdatedAt + 1);
}

function markStateChanged(state: PdfRemoteState) {
  state.updatedAt = Math.max(Date.now(), state.updatedAt + 1);
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}

export async function GET() {
  return json({
    ...(await readState()),
    mediaDocuments: getDocuments(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    pdfId?: unknown;
    direction?: unknown;
    targetPage?: unknown;
    playback?: unknown;
    sound?: unknown;
  } | null;

  if (!body) {
    return json({ error: "Invalid PDF command" }, 400);
  }

  const state = await readState();

  if (body.action === "clear") {
    state.activePdfId = null;
    state.videoPlaying = false;
    state.videoMuted = true;
    for (const document of mediaDocuments) {
      state.documents[document.id].page = 1;
      state.documents[document.id].updatedAt = Date.now();
    }
    markActiveStateChanged(state);
    markStateChanged(state);
    await writeState(state);
    return json(state);
  }

  if (body.action === "activate" && isPdfId(body.pdfId)) {
    state.activePdfId = body.pdfId;
    state.documents[body.pdfId].page = 1;
    state.documents[body.pdfId].updatedAt = Date.now();
    state.videoPlaying = false;
    state.videoMuted = true;
    markActiveStateChanged(state);
    markStateChanged(state);
    await writeState(state);
    return json(state);
  }

  if (
    body.action === "playback" &&
    body.pdfId === "pdf-1" &&
    body.targetPage === mediaDocuments[0].items.length &&
    (body.playback === "play" || body.playback === "pause")
  ) {
    state.activePdfId = "pdf-1";
    state.documents["pdf-1"].page = body.targetPage;
    state.documents["pdf-1"].updatedAt = Date.now();
    state.videoPlaying = body.playback === "play";
    markStateChanged(state);
    await writeState(state);
    return json(state);
  }

  if (
    body.action === "sound" &&
    body.pdfId === "pdf-1" &&
    body.targetPage === mediaDocuments[0].items.length &&
    (body.sound === "on" || body.sound === "off")
  ) {
    state.activePdfId = "pdf-1";
    state.documents["pdf-1"].page = body.targetPage;
    state.documents["pdf-1"].updatedAt = Date.now();
    state.videoMuted = body.sound === "off";
    markStateChanged(state);
    await writeState(state);
    return json(state);
  }

  if (
    body.action !== "navigate" ||
    !isPdfId(body.pdfId) ||
    !isPdfDirection(body.direction)
  ) {
    return json({ error: "Invalid PDF command" }, 400);
  }

  const docs = getDocuments();
  const matchedDoc = docs.find((d) => d.id === body.pdfId);
  const document = state.documents[body.pdfId];
  state.activePdfId = body.pdfId;
  const lastPage =
    matchedDoc?.kind === "images"
      ? matchedDoc.images.length
      : document.totalPages ?? Number.MAX_SAFE_INTEGER;
  const requestedPage =
    typeof body.targetPage === "number" && Number.isInteger(body.targetPage)
      ? body.targetPage
      : body.direction === "next"
        ? document.page + 1
        : document.page - 1;

  document.page = Math.min(lastPage, Math.max(1, requestedPage));
  document.updatedAt = Date.now();

  state.videoPlaying = isVideoSource(matchedDoc?.images[document.page - 1] ?? "");
  if (state.videoPlaying) state.videoMuted = true;

  markStateChanged(state);
  await writeState(state);
  return json(state);
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    pdfId?: unknown;
    totalPages?: unknown;
  } | null;

  if (
    !body ||
    !isPdfId(body.pdfId) ||
    typeof body.totalPages !== "number" ||
    !Number.isInteger(body.totalPages) ||
    body.totalPages < 1
  ) {
    return json({ error: "Invalid PDF page count" }, 400);
  }

  const state = await readState();
  const document = state.documents[body.pdfId];
  document.totalPages = body.totalPages;
  document.page = Math.min(document.page, body.totalPages);
  document.updatedAt = Date.now();

  markStateChanged(state);
  await writeState(state);
  return json({ pdfId: body.pdfId, document });
}
