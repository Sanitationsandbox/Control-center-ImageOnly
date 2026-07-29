"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type MediaItem,
  type PdfId,
  type PdfRemoteState,
} from "@/lib/pdf-control";
import styles from "../preview.module.css";
import { ImageViewer } from "./ImageViewer";

type EditableMediaDocument = {
  id: PdfId;
  kind: "images";
  images: string[];
};

type ViewerMediaDocument = EditableMediaDocument & {
  items: MediaItem[];
};

type PdfControlResponse = PdfRemoteState & {
  mediaDocuments?: EditableMediaDocument[];
};

function isVideoSource(src: string): boolean {
  return src.includes("/video/upload/") || /\.(mp4|webm|mov)(\?|$)/i.test(src);
}

function toViewerDocument(document: EditableMediaDocument): ViewerMediaDocument {
  return {
    ...document,
    items: document.images.map((src) => ({
      kind: isVideoSource(src) ? "video" as const : "image" as const,
      src,
    })),
  };
}

export function PreviewWall() {
  const [mediaDocs, setMediaDocs] = useState<ViewerMediaDocument[]>([]);
  const [pages, setPages] = useState<Record<string, number>>({});
  const [activePdfId, setActivePdfId] = useState<PdfId | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);
  const stateUpdatedAtRef = useRef(-1);

  const refreshPages = useCallback(async () => {
    try {
      const response = await fetch("/api/pdf-control", { cache: "no-store" });
      if (!response.ok) throw new Error("State request failed");

      const data = (await response.json()) as PdfControlResponse;
      if (data.mediaDocuments) {
        setMediaDocs(data.mediaDocuments.map(toViewerDocument));
      }

      if (data.updatedAt <= stateUpdatedAtRef.current) return;

      stateUpdatedAtRef.current = data.updatedAt;
      setActivePdfId(data.activePdfId);
      setVideoPlaying(data.videoPlaying);
      setVideoMuted(data.videoMuted);
      setPages(
        Object.fromEntries(
          Object.entries(data.documents).map(([documentId, document]) => [
            documentId,
            document.page,
          ]),
        ) as Record<string, number>,
      );
    } catch {
      // Ignore API offline errors silently
    }
  }, []);

  const activeDocument = mediaDocs.find(
    (document) => document.id === activePdfId,
  );

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refreshPages(), 0);
    const timer = window.setInterval(() => void refreshPages(), 250);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [refreshPages]);

  return (
    <main className={styles.wall}>
      {activeDocument?.kind === "images" ? (
        <ImageViewer
          items={activeDocument.items}
          pageNumber={pages[activeDocument.id] ?? 1}
          label={activeDocument.id}
          videoPlaying={videoPlaying}
          videoMuted={videoMuted}
        />
      ) : (
        <PreviewSplash />
      )}
    </main>
  );
}

function PreviewSplash() {
  return (
    <section className={styles.splash} aria-label="Rubenius idle screen">
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      >
        <source src="/BG-VIDEO/Gates zone four title page.mp4" type="video/mp4" />
      </video>
    </section>
  );
}
