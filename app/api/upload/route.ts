import { NextResponse } from "next/server";
import { getDocuments, saveDocuments } from "@/lib/db";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { touchControlState } from "@/lib/control-state";
import { broadcastControlState } from "@/lib/control-events";
import { publishControlState } from "@/lib/control-pubsub";
import path from "node:path";

export const dynamic = "force-dynamic";

const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
]);

function toDataUri(file: File, buffer: Buffer): string {
  return `data:${file.type || "application/octet-stream"};base64,${buffer.toString("base64")}`;
}

function toCloudinaryPublicId(fileName: string): string {
  const parsed = path.parse(fileName);
  const safeBaseName = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBaseName || "asset"}`;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        { error: "Upload request must be multipart/form-data" },
        { status: 400 }
      );
    }

    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const uploadedUrls: string[] = [];

    for (const file of files) {
      if (!file.name) continue;

      if (!ALLOWED_MEDIA_TYPES.has(file.type)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.name}` },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await uploadToCloudinary(toDataUri(file, buffer), {
        folder: "rubenius/slides",
        public_id: toCloudinaryPublicId(file.name),
        resource_type: "auto",
      });

      uploadedUrls.push(result.secure_url);
    }

    if (uploadedUrls.length === 0) {
      return NextResponse.json({ error: "No valid files saved" }, { status: 400 });
    }

    // Add new images to the dynamic database for pdf-1
    const docs = getDocuments();
    const pdf1 = docs.find((d) => d.id === "pdf-1");
    
    if (pdf1) {
      pdf1.images = [...pdf1.images, ...uploadedUrls];
      saveDocuments(docs);
      const state = await touchControlState();
      broadcastControlState(state);
      await publishControlState(state);
    }

    return NextResponse.json({
      success: true,
      uploadedUrls,
      mediaDocuments: docs,
    });
  } catch (error) {
    console.error("Upload handler error:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
