import { NextResponse } from "next/server";
import { getDocuments, saveDocuments } from "@/lib/db";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const uploadedUrls: string[] = [];

    for (const file of files) {
      if (!file.name) continue;
      
      const buffer = Buffer.from(await file.arrayBuffer());
      const fileExt = path.extname(file.name);
      const safeName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${fileExt}`;
      const filePath = path.join(uploadDir, safeName);
      
      await writeFile(filePath, buffer);
      uploadedUrls.push(`/uploads/${safeName}`);
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
    }

    return NextResponse.json({
      success: true,
      uploadedUrls,
      mediaDocuments: docs,
    });
  } catch (error) {
    console.error("Upload handler error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
