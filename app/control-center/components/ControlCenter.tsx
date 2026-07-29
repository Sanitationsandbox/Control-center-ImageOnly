"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  type PdfDirection,
  type PdfId,
  type PdfRemoteState,
} from "@/lib/pdf-control";
import styles from "../control-center.module.css";

// All items are images — no video page in this build

export function ControlCenter() {
  const [activePdfId, setActivePdfId] = useState<PdfId | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number | null>(21);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const stateUpdatedAtRef = useRef(-1);

  // No video items — isVideoPage is always false
  const isVideoPage = false;

  // Determine current display title
  const displayTitle = activePdfId === "pdf-1" ? "Image Slide" : "Control Center";

  const applyRemoteState = useCallback((data: PdfRemoteState) => {
    if (data.updatedAt <= stateUpdatedAtRef.current) return;

    stateUpdatedAtRef.current = data.updatedAt;
    setActivePdfId(data.activePdfId);
    setVideoPlaying(data.videoPlaying);
    setVideoMuted(data.videoMuted);

    const docState = data.documents["pdf-1"];
    if (docState) {
      setCurrentPage(docState.page);
      setTotalPages(docState.totalPages);
    }
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const response = await fetch("/api/pdf-control", { cache: "no-store" });
      if (!response.ok) throw new Error("Fetch failed");
      const data = (await response.json()) as PdfRemoteState;
      applyRemoteState(data);
    } catch {
      // Ignore errors during polling
    }
  }, [applyRemoteState]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void fetchState(), 0);
    const timer = setInterval(() => {
      void fetchState();
    }, 500);

    return () => {
      window.clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [fetchState]);

  async function sendCommand(direction: PdfDirection) {
    if (isSending || activePdfId !== "pdf-1") return;

    setIsSending(true);

    // Optimistic update
    const prevPage = currentPage;
    let nextPage = direction === "next" ? currentPage + 1 : currentPage - 1;
    if (totalPages) {
      nextPage = Math.min(totalPages, Math.max(1, nextPage));
    } else {
      nextPage = Math.max(1, nextPage);
    }
    setCurrentPage(nextPage);

    try {
      const response = await fetch("/api/pdf-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "navigate",
          pdfId: activePdfId,
          direction,
          targetPage: nextPage,
        }),
      });

      if (!response.ok) throw new Error("Command failed");
      applyRemoteState((await response.json()) as PdfRemoteState);
    } catch {
      // Rollback optimistic update
      setCurrentPage(prevPage);
    } finally {
      setIsSending(false);
    }
  }

  async function sendPlayback(playback: "play" | "pause") {
    if (isSending || !isVideoPage) return;

    const wasPlaying = videoPlaying;
    setIsSending(true);
    setVideoPlaying(playback === "play");

    try {
      const response = await fetch("/api/pdf-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "playback",
          pdfId: activePdfId,
          targetPage: currentPage,
          playback,
        }),
      });

      if (!response.ok) throw new Error("Playback command failed");
      applyRemoteState((await response.json()) as PdfRemoteState);
    } catch {
      setVideoPlaying(wasPlaying);
    } finally {
      setIsSending(false);
    }
  }

  async function sendSound(sound: "on" | "off") {
    if (isSending || !isVideoPage) return;

    const wasMuted = videoMuted;
    const nextMuted = sound === "off";
    setIsSending(true);
    setVideoMuted(nextMuted);

    try {
      const response = await fetch("/api/pdf-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sound",
          pdfId: activePdfId,
          targetPage: currentPage,
          sound,
        }),
      });

      if (!response.ok) throw new Error("Sound command failed");
      applyRemoteState((await response.json()) as PdfRemoteState);
    } catch {
      setVideoMuted(wasMuted);
    } finally {
      setIsSending(false);
    }
  }

  async function togglePower() {
    if (isSending) return;
    setIsSending(true);

    const nextPdfId = activePdfId === "pdf-1" ? null : "pdf-1";
    setActivePdfId(nextPdfId);

    try {
      const response = await fetch("/api/pdf-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: nextPdfId ? "activate" : "clear",
          pdfId: nextPdfId,
        }),
      });

      if (!response.ok) throw new Error("Toggle power failed");
      const data = (await response.json()) as PdfRemoteState;
      applyRemoteState(data);
    } catch {
      // Rollback optimistic update
      setActivePdfId(activePdfId);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      
      <div className={styles.remoteContainer}>
        <div className={styles.remoteHeader}>
          <h1 className={styles.remoteTitle}>{displayTitle}</h1>
          <button
            type="button"
            className={`${styles.powerBtn} ${activePdfId === "pdf-1" ? styles.powerOn : styles.powerOff}`}
            onClick={() => void togglePower()}
            disabled={isSending}
            aria-label="Toggle Power"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.powerIcon}
            >
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
              <line x1="12" y1="2" x2="12" y2="12" />
            </svg>
          </button>
        </div>

        <div className={styles.remoteButtonsContainer}>
          <button
            type="button"
            className={`${styles.remoteBtn} ${styles.prevBtn}`}
            aria-label="Previous Slide"
            disabled={isSending || activePdfId !== "pdf-1" || currentPage <= 1}
            onClick={() => void sendCommand("previous")}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className={styles.btnIcon}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>

          <button
            type="button"
            className={`${styles.remoteBtn} ${styles.nextBtn}`}
            aria-label="Next Slide"
            disabled={
              isSending ||
              activePdfId !== "pdf-1" ||
              totalPages === null ||
              currentPage >= totalPages
            }
            onClick={() => void sendCommand("next")}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className={styles.btnIcon}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>

        {isVideoPage ? (
          <section
            className={styles.videoControlSection}
            aria-label="Video controls"
          >
            <p className={styles.videoControlLabel}>Video controls</p>
            <div className={styles.videoButtonsContainer}>
              <button
                type="button"
                className={`${styles.videoBtn} ${videoPlaying ? styles.activeVideoBtn : ""}`}
                aria-label="Play video"
                aria-pressed={videoPlaying}
                disabled={isSending}
                onClick={() => void sendPlayback("play")}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className={styles.videoBtnIcon}
                >
                  <path d="M8 5v14l11-7z" fill="currentColor" />
                </svg>
                <span>Play</span>
              </button>

              <button
                type="button"
                className={`${styles.videoBtn} ${!videoPlaying ? styles.activeVideoBtn : ""}`}
                aria-label="Pause video"
                aria-pressed={!videoPlaying}
                disabled={isSending}
                onClick={() => void sendPlayback("pause")}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className={styles.videoBtnIcon}
                >
                  <path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor" />
                </svg>
                <span>Pause</span>
              </button>

              <button
                type="button"
                className={`${styles.videoBtn} ${!videoMuted ? styles.activeVideoBtn : ""}`}
                aria-label="Sound on"
                aria-pressed={!videoMuted}
                disabled={isSending}
                onClick={() => void sendSound("on")}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className={styles.videoBtnIcon}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M11 5 6 9H3v6h3l5 4z" />
                  <path d="M15 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12" />
                </svg>
                <span>Sound on</span>
              </button>

              <button
                type="button"
                className={`${styles.videoBtn} ${videoMuted ? styles.activeVideoBtn : ""}`}
                aria-label="Sound off"
                aria-pressed={videoMuted}
                disabled={isSending}
                onClick={() => void sendSound("off")}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className={styles.videoBtnIcon}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M11 5 6 9H3v6h3l5 4z" />
                  <path d="m17 9 4 4m0-4-4 4" />
                </svg>
                <span>Sound off</span>
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
