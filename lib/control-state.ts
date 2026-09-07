import { Redis } from "@upstash/redis";
import {
  isPdfDirection,
  isPdfId,
  type PdfControlState,
  type PdfId,
  type PdfRemoteState,
  mediaDocuments,
} from "@/lib/pdf-control";
import { getDocuments, type DocumentInfo } from "@/lib/db";

const redisUrl =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const redis =
  redisUrl && redisToken
    ? new Redis({ url: redisUrl, token: redisToken })
    : null;

const stateKey = `rubenius:pdf-control:${process.env.VERCEL_ENV ?? "local"}:v1`;
const versionKey = `${stateKey}:version`;

const globalState = globalThis as typeof globalThis & {
  pdfRemoteState?: PdfRemoteState;
};

export type PdfControlResponse = PdfRemoteState & {
  mediaDocuments: DocumentInfo[];
};

export type PdfControlCommand = {
  action?: unknown;
  pdfId?: unknown;
  direction?: unknown;
  targetPage?: unknown;
  playback?: unknown;
  sound?: unknown;
};

export type PdfControlResult =
  | { ok: true; status: 200; data: PdfControlResponse }
  | { ok: false; status: 400; data: { error: string } };

function getDynamicPageCount(pdfId: string): number | null {
  const document = getDocuments().find((item) => item.id === pdfId);
  return document?.kind === "images" ? document.images.length : null;
}

function isVideoSource(src: string): boolean {
  return src.includes("/video/upload/") || /\.(mp4|webm|mov)(\?|$)/i.test(src);
}

function createInitialState(): PdfRemoteState {
  return {
    version: 0,
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
  storedState.version ??= 0;
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

async function nextVersion(state: PdfRemoteState) {
  if (redis) {
    state.version = await redis.incr(versionKey);
    return;
  }

  state.version += 1;
}

function markActiveStateChanged(state: PdfRemoteState) {
  state.activeUpdatedAt = Math.max(Date.now(), state.activeUpdatedAt + 1);
}

async function markStateChanged(state: PdfRemoteState) {
  state.updatedAt = Math.max(Date.now(), state.updatedAt + 1);
  await nextVersion(state);
}

function withDocuments(state: PdfRemoteState): PdfControlResponse {
  return {
    ...state,
    mediaDocuments: getDocuments(),
  };
}

export async function getControlSnapshot(): Promise<PdfControlResponse> {
  return withDocuments(await readState());
}

export async function applyControlCommand(
  body: PdfControlCommand | null,
): Promise<PdfControlResult> {
  if (!body) {
    return { ok: false, status: 400, data: { error: "Invalid PDF command" } };
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
    await markStateChanged(state);
    await writeState(state);
    return { ok: true, status: 200, data: withDocuments(state) };
  }

  if (body.action === "activate" && isPdfId(body.pdfId)) {
    state.activePdfId = body.pdfId;
    state.documents[body.pdfId].page = 1;
    state.documents[body.pdfId].updatedAt = Date.now();
    state.videoPlaying = false;
    state.videoMuted = true;
    markActiveStateChanged(state);
    await markStateChanged(state);
    await writeState(state);
    return { ok: true, status: 200, data: withDocuments(state) };
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
    await markStateChanged(state);
    await writeState(state);
    return { ok: true, status: 200, data: withDocuments(state) };
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
    await markStateChanged(state);
    await writeState(state);
    return { ok: true, status: 200, data: withDocuments(state) };
  }

  if (
    body.action !== "navigate" ||
    !isPdfId(body.pdfId) ||
    !isPdfDirection(body.direction)
  ) {
    return { ok: false, status: 400, data: { error: "Invalid PDF command" } };
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

  await markStateChanged(state);
  await writeState(state);
  return { ok: true, status: 200, data: withDocuments(state) };
}

export async function updateControlPageCount(
  pdfId: PdfId,
  totalPages: number,
) {
  const state = await readState();
  const document = state.documents[pdfId];
  document.totalPages = totalPages;
  document.page = Math.min(document.page, totalPages);
  document.updatedAt = Date.now();
  await markStateChanged(state);
  await writeState(state);

  return {
    pdfId,
    document,
    state: withDocuments(state),
  };
}

export async function touchControlState(): Promise<PdfControlResponse> {
  const state = await readState();
  await markStateChanged(state);
  await writeState(state);
  return withDocuments(state);
}
