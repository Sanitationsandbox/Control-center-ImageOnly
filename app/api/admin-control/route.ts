import { NextResponse } from "next/server";
import { getDocuments, saveDocuments } from "@/lib/db";
import { deleteFromCloudinary, getPublicIdFromUrl } from "@/lib/cloudinary";
import { unlink } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

function getCloudinaryResourceType(url: string): "image" | "video" | "raw" {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const resourceType = parts[1];

    if (resourceType === "video") return "video";
    if (resourceType === "raw") return "raw";
  } catch {
    // Fall through to the default image resource type.
  }

  return "image";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      action?: "delete" | "reorder" | "setPage";
      imageUrl?: string;
      images?: string[];
      page?: number;
    } | null;

    if (!body || !body.action) {
      return NextResponse.json({ error: "Invalid action request" }, { status: 400 });
    }

    const docs = getDocuments();
    const pdf1 = docs.find((d) => d.id === "pdf-1");

    if (!pdf1) {
      return NextResponse.json({ error: "Document pdf-1 not found" }, { status: 404 });
    }

    if (body.action === "delete") {
      if (!body.imageUrl) {
        return NextResponse.json({ error: "Missing imageUrl for delete" }, { status: 400 });
      }

      // Check if image exists in list
      const index = pdf1.images.indexOf(body.imageUrl);
      if (index === -1) {
        return NextResponse.json({ error: "Image not found in slideshow" }, { status: 404 });
      }

      // Remove from list
      pdf1.images.splice(index, 1);
      saveDocuments(docs);

      // Try to physically delete from disk if it was uploaded
      if (body.imageUrl.startsWith("/uploads/")) {
        try {
          const filename = body.imageUrl.replace("/uploads/", "");
          const filePath = path.join(process.cwd(), "public", "uploads", filename);
          await unlink(filePath);
        } catch (err) {
          console.error(`Failed to delete file from disk: ${body.imageUrl}`, err);
          // Don't fail the request, just log it
        }
      }

      const publicId = getPublicIdFromUrl(body.imageUrl);
      if (publicId) {
        try {
          await deleteFromCloudinary(publicId, {
            resource_type: getCloudinaryResourceType(body.imageUrl),
            invalidate: true,
          });
        } catch (err) {
          console.error(`Failed to delete file from Cloudinary: ${body.imageUrl}`, err);
        }
      }

      return NextResponse.json({ success: true, mediaDocuments: docs });
    }

    if (body.action === "reorder") {
      if (!body.images || !Array.isArray(body.images)) {
        return NextResponse.json({ error: "Invalid images array for reorder" }, { status: 400 });
      }

      pdf1.images = body.images;
      saveDocuments(docs);

      return NextResponse.json({ success: true, mediaDocuments: docs });
    }

    if (body.action === "setPage") {
      if (typeof body.page !== "number" || body.page < 1) {
        return NextResponse.json({ error: "Invalid page number" }, { status: 400 });
      }

      // We'll update the global remote control state as well
      const globalState = globalThis as typeof globalThis & {
        pdfRemoteState?: {
          documents: Record<string, { page: number; totalPages: number | null; updatedAt: number }>;
        };
      };

      if (globalState.pdfRemoteState?.documents["pdf-1"]) {
        const total = pdf1.images.length;
        const targetPage = Math.min(total, Math.max(1, body.page));
        globalState.pdfRemoteState.documents["pdf-1"].page = targetPage;
        globalState.pdfRemoteState.documents["pdf-1"].updatedAt = Date.now();
      }

      return NextResponse.json({ success: true, page: body.page });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    console.error("Admin control handler error:", error);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}
