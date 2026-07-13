"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  mediaDocuments,
  type PdfRemoteState,
  type PdfId,
} from "@/lib/pdf-control";
import styles from "../preview.module.css";
import { ImageViewer } from "./ImageViewer";

const initialPages = Object.fromEntries(
  mediaDocuments.map((document) => [document.id, 1]),
) as Record<PdfId, number>;

export function PreviewWall() {
  const [pages, setPages] = useState(initialPages);
  const [activePdfId, setActivePdfId] = useState<PdfId | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);
  const activeUpdatedAtRef = useRef(0);

  const refreshPages = useCallback(async () => {
    try {
      const response = await fetch("/api/pdf-control", { cache: "no-store" });
      if (!response.ok) throw new Error("State request failed");

      const data = (await response.json()) as PdfRemoteState;
      if (data.activeUpdatedAt >= activeUpdatedAtRef.current) {
        activeUpdatedAtRef.current = data.activeUpdatedAt;
        setActivePdfId(data.activePdfId);
        setVideoPlaying(data.videoPlaying);
        setVideoMuted(data.videoMuted);
      }
      setPages(
        Object.fromEntries(
          mediaDocuments.map((document) => [
            document.id,
            data.documents[document.id].page,
          ]),
        ) as Record<PdfId, number>,
      );
    } catch {
      // Ignore API offline errors silently
    }
  }, []);

  const activeDocument = mediaDocuments.find(
    (document) => document.id === activePdfId,
  );

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refreshPages(), 0);
    const timer = window.setInterval(() => void refreshPages(), 700);
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
          pageNumber={pages[activeDocument.id]}
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
