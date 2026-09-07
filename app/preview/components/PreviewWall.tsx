"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type MediaItem,
  type PdfId,
} from "@/lib/pdf-control";
import type { PdfControlResponse } from "@/lib/control-state";
import { useControlSocket } from "@/lib/use-control-socket";
import styles from "../preview.module.css";
import { ImageViewer } from "./ImageViewer";

type EditableMediaDocument = {
  id: string;
  kind: "images" | "video";
  images: string[];
};

type ViewerMediaDocument = EditableMediaDocument & {
  items: MediaItem[];
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
  const stateVersionRef = useRef(-1);
  const requestInFlightRef = useRef(false);

  const applyControlState = useCallback((data: PdfControlResponse) => {
    if (data.mediaDocuments) {
      setMediaDocs(data.mediaDocuments.map(toViewerDocument));
    }

    if (data.version <= stateVersionRef.current) return;

    stateVersionRef.current = data.version;
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
  }, []);

  const { status: socketStatus } = useControlSocket(applyControlState);

  const refreshPages = useCallback(async () => {
    if (requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    try {
      const response = await fetch("/api/pdf-control", { cache: "no-store" });
      if (!response.ok) throw new Error("State request failed");

      const data = (await response.json()) as PdfControlResponse;
      applyControlState(data);
    } catch {
      // Ignore initial state load errors silently.
    } finally {
      requestInFlightRef.current = false;
    }
  }, [applyControlState]);

  const activeDocument = mediaDocs.find(
    (document) => document.id === activePdfId,
  );

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refreshPages(), 0);

    return () => {
      window.clearTimeout(initialTimer);
    };
  }, [refreshPages]);

  return (
    <main className={styles.wall}>
      <span
        className={styles.connection}
        data-online={socketStatus === "Connected"}
      >
        <span className={styles.connectionDot} aria-hidden="true" />
        {socketStatus}
      </span>
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
        preload="metadata"
        aria-hidden="true"
      >
        <source src="/BG-VIDEO/Gates zone four title page.mp4" type="video/mp4" />
      </video>
    </section>
  );
}
