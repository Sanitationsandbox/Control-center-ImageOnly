import {
  isPdfDirection,
  isPdfId,
  mediaDocuments,
  type PdfControlState,
  type PdfRemoteState,
} from "@/lib/pdf-control";

export const dynamic = "force-dynamic";

const globalState = globalThis as typeof globalThis & {
  pdfRemoteState?: PdfRemoteState;
};

function createInitialState(): PdfControlState {
  return Object.fromEntries(
    mediaDocuments.map((document) => [
      document.id,
      {
        page: 1,
        totalPages:
          document.kind === "images" ? document.images.length : null,
        updatedAt: Date.now(),
      },
    ]),
  ) as PdfControlState;
}

const state = (globalState.pdfRemoteState ??= {
  activePdfId: null,
  videoPlaying: false,
  documents: createInitialState(),
});

state.videoPlaying ??= false;

for (const document of mediaDocuments) {
  state.documents[document.id] ??= {
    page: 1,
    totalPages: document.kind === "images" ? document.images.length : null,
    updatedAt: Date.now(),
  };

  if (document.kind === "images") {
    state.documents[document.id].totalPages = document.images.length;
    state.documents[document.id].page = Math.min(
      state.documents[document.id].page,
      document.images.length,
    );
  }
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  return json(state);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    pdfId?: unknown;
    direction?: unknown;
    playback?: unknown;
  } | null;

  if (!body) {
    return json({ error: "Invalid PDF command" }, 400);
  }

  if (body.action === "clear") {
    state.activePdfId = null;
    state.videoPlaying = false;
    return json(state);
  }

  if (body.action === "activate" && isPdfId(body.pdfId)) {
    state.activePdfId = body.pdfId;
    state.videoPlaying = (body.pdfId as string) === "pdf-2";
    return json(state);
  }

  if (
    body.action === "playback" &&
    (state.activePdfId as string) === "pdf-2" &&
    (body.playback === "play" || body.playback === "pause")
  ) {
    state.videoPlaying = body.playback === "play";
    return json(state);
  }

  if (
    body.action !== "navigate" ||
    !isPdfId(body.pdfId) ||
    !isPdfDirection(body.direction)
  ) {
    return json({ error: "Invalid PDF command" }, 400);
  }

  const document = state.documents[body.pdfId];
  const lastPage = document.totalPages ?? Number.MAX_SAFE_INTEGER;
  const nextPage =
    body.direction === "next" ? document.page + 1 : document.page - 1;

  document.page = Math.min(lastPage, Math.max(1, nextPage));
  document.updatedAt = Date.now();

  return json({ pdfId: body.pdfId, document });
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

  const document = state.documents[body.pdfId];
  document.totalPages = body.totalPages;
  document.page = Math.min(document.page, body.totalPages);
  document.updatedAt = Date.now();

  return json({ pdfId: body.pdfId, document });
}
