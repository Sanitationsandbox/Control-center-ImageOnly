import { isPdfId } from "@/lib/pdf-control";
import {
  applyControlCommand,
  getControlSnapshot,
  updateControlPageCount,
  type PdfControlCommand,
} from "@/lib/control-state";
import { broadcastControlState } from "@/lib/control-events";
import { publishControlState } from "@/lib/control-pubsub";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}

export async function GET() {
  return json(await getControlSnapshot());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | PdfControlCommand
    | null;
  const result = await applyControlCommand(body);

  if (result.ok) {
    broadcastControlState(result.data);
    await publishControlState(result.data);
  }

  return json(result.data, result.status);
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

  const { pdfId, document, state } = await updateControlPageCount(
    body.pdfId,
    body.totalPages,
  );
  broadcastControlState(state);
  await publishControlState(state);

  return json({ pdfId, document });
}
