"use client";

import { useEffect, useState, useCallback } from "react";
import { mediaDocuments, type PdfDirection, type PdfId, type PdfRemoteState } from "@/lib/pdf-control";
import { controlOptions } from "../control-options";
import styles from "../control-center.module.css";

export function ControlCenter() {
  const [activePdfId, setActivePdfId] = useState<PdfId>("pdf-1"); // Default to pdf-1
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number | null>(7);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState("");

  // Find the details of the active document
  const activeOption = controlOptions.find((opt) => opt.pdfId === activePdfId);
  const activeDocName = activeOption ? activeOption.shortName : "Slideshow";

  const fetchState = useCallback(async (isInitial = false) => {
    try {
      const response = await fetch("/api/pdf-control", { cache: "no-store" });
      if (!response.ok) throw new Error("Fetch failed");
      const data = (await response.json()) as PdfRemoteState;

      // If there is an active image document, use it.
      // Otherwise, if it's initial load, we can activate pdf-1.
      let targetPdfId = data.activePdfId;
      const targetDoc = mediaDocuments.find(d => d.id === targetPdfId);

      if (!targetPdfId || targetDoc?.kind !== "images") {
        targetPdfId = "pdf-1";
      }

      setActivePdfId(targetPdfId);
      
      const docState = data.documents[targetPdfId];
      if (docState) {
        setCurrentPage(docState.page);
        setTotalPages(docState.totalPages);
      }

      // If initial load and the remote active PDF is not this one, activate it
      if (isInitial && data.activePdfId !== targetPdfId) {
        await fetch("/api/pdf-control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "activate", pdfId: targetPdfId }),
        });
      }
    } catch {
      // Ignore errors during polling
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    void fetchState(true);

    // Poll state every 1000ms
    const timer = setInterval(() => {
      void fetchState(false);
    }, 1000);

    return () => clearInterval(timer);
  }, [fetchState]);

  async function sendCommand(direction: PdfDirection) {
    if (isSending) return;

    setIsSending(true);
    setStatus("Sending…");

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
        }),
      });

      if (!response.ok) throw new Error("Command failed");
      setStatus("");
    } catch {
      setStatus("Unable to reach preview");
      // Rollback optimistic update
      setCurrentPage(prevPage);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      
      <div className={styles.remoteContainer}>
        <h1 className={styles.remoteTitle}>{activeDocName}</h1>
        <div className={styles.remoteButtonsContainer}>
          <button
            type="button"
            className={`${styles.remoteBtn} ${styles.prevBtn}`}
            aria-label="Previous Slide"
            disabled={isSending || currentPage <= 1}
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
            disabled={isSending || (totalPages !== null && currentPage >= totalPages)}
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
      </div>
    </main>
  );
}
