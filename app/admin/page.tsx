"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import type { DocumentInfo } from "@/lib/db";
import type { PdfControlResponse } from "@/lib/control-state";
import { useControlSocket } from "@/lib/use-control-socket";
import styles from "./admin.module.css";

export default function AdminPage() {
  const [activePdfId, setActivePdfId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [mediaDocs, setMediaDocs] = useState<DocumentInfo[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Modal UI State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ imageUrl: string; index: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Array<{ file: File; progress: number }>>([]);
  
  // Draggable strip states
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const requestInFlightRef = useRef(false);
  const stateVersionRef = useRef(-1);

  const applyControlState = useCallback((data: PdfControlResponse) => {
    if (data.version <= stateVersionRef.current) return;

    stateVersionRef.current = data.version;
    setActivePdfId(data.activePdfId);
    setMediaDocs(data.mediaDocuments || []);

    const docState = data.documents["pdf-1"];
    if (docState) {
      setCurrentPage(docState.page);
    }
  }, []);

  const { status: socketStatus } = useControlSocket(applyControlState);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const fetchState = useCallback(async () => {
    if (requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    try {
      const response = await fetch("/api/pdf-control", { cache: "no-store" });
      if (!response.ok) throw new Error("Fetch failed");
      const data = (await response.json()) as PdfControlResponse;
      applyControlState(data);
    } catch {
      // Ignore initial state load errors silently.
    } finally {
      requestInFlightRef.current = false;
    }
  }, [applyControlState]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void fetchState(), 0);

    return () => {
      window.clearTimeout(initialTimer);
    };
  }, [fetchState]);

  const requestDeleteSlide = (imageUrl: string, index: number) => {
    setDeleteTarget({ imageUrl, index });
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setDeleteTarget(null);
  };

  const confirmDeleteSlide = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const response = await fetch("/api/admin-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          imageUrl: deleteTarget.imageUrl,
        }),
      });

      if (!response.ok) throw new Error("Delete failed");
      
      showToast("Slide deleted successfully!", "success");
      setDeleteTarget(null);
      await fetchState();
    } catch (error) {
      console.error(error);
      showToast("Failed to delete slide.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // Draggable horizontal strip handlers
  const handleSequenceDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleSequenceDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleSequenceDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleSequenceDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleSequenceDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndex = draggedIndex;
    
    setDraggedIndex(null);
    setDragOverIndex(null);

    if (sourceIndex === null || sourceIndex === targetIndex) return;

    const pdf1Doc = mediaDocs.find((d) => d.id === "pdf-1");
    if (!pdf1Doc) return;

    const newImages = [...pdf1Doc.images];
    const [draggedItem] = newImages.splice(sourceIndex, 1);
    newImages.splice(targetIndex, 0, draggedItem);

    // Optimistic state update
    const updatedMediaDocs = mediaDocs.map((doc) => {
      if (doc.id === "pdf-1") {
        return { ...doc, images: newImages };
      }
      return doc;
    });
    setMediaDocs(updatedMediaDocs);

    try {
      const response = await fetch("/api/admin-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reorder",
          images: newImages,
        }),
      });

      if (!response.ok) throw new Error("Reorder failed");

      showToast("Slide position updated!", "success");
      await fetchState();
    } catch (error) {
      console.error(error);
      showToast("Failed to update slide order.", "error");
      await fetchState();
    }
  };

  // Modal Drag & Drop Upload
  const handleModalFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFilesToQueue(e.target.files);
    }
  };

  const handleModalFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files) {
      addFilesToQueue(e.dataTransfer.files);
    }
  };

  const addFilesToQueue = (fileList: FileList) => {
    const newFiles: Array<{ file: File; progress: number }> = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
        newFiles.push({ file, progress: 0 });
      }
    }

    if (newFiles.length === 0) {
      showToast("Please select image or video files only.", "error");
      return;
    }

    setSelectedFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFileFromQueue = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const isVideoSlide = (src: string) => {
    return src.includes("/video/upload/") || /\.(mp4|webm|mov)(\?|$)/i.test(src);
  };

  const startModalUpload = async () => {
    if (selectedFiles.length === 0) return;
    setIsUploading(true);
    setUploadProgress(0);

    const progressTimer = window.setInterval(() => {
      setUploadProgress((current) => Math.min(95, current + 5));
      setSelectedFiles((prev) =>
        prev.map((item) => ({ ...item, progress: Math.min(95, item.progress + 5) }))
      );
    }, 250);

    try {
      const formData = new FormData();
      selectedFiles.forEach(({ file }) => {
        formData.append("files", file);
      });

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Upload failed");
      }

      setUploadProgress(100);
      setSelectedFiles((prev) => prev.map((item) => ({ ...item, progress: 100 })));
      setMediaDocs(data.mediaDocuments || []);
      await fetchState();

      setSelectedFiles([]);
      setIsModalOpen(false);
      showToast(`Uploaded ${data.uploadedUrls?.length || selectedFiles.length} asset(s) to Cloudinary.`, "success");
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "Upload failed.", "error");
    } finally {
      window.clearInterval(progressTimer);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const pdf1Doc = mediaDocs.find((d) => d.id === "pdf-1");
  const slides = pdf1Doc ? pdf1Doc.images : [];

  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      
      <div className={styles.container}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.titleContainer}>
            <h1 className={styles.title}>
              Screen Control System
              <span>Screen Control Dashboard</span>
            </h1>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <span
              className={styles.connectionStatus}
              data-online={socketStatus === "Connected"}
            >
              WebSocket: {socketStatus}
            </span>
            <button
              onClick={() => setIsModalOpen(true)}
              className={styles.btnPrimary}
              style={{ padding: "10px 20px", borderRadius: "12px", fontSize: "0.9rem" }}
            >
              Upload
            </button>
            <Link href="/control-center" className={styles.navLink}>
              Remote Control
            </Link>
            <Link href="/preview" className={styles.navLink} target="_blank">
              Open Preview
            </Link>
          </div>
        </header>

        {/* Drag Sequence Editor Row */}
        <section className={styles.tableContainer} style={{ marginTop: "10px" }}>
          <div style={{ marginBottom: "16px" }}>
            <h2 className={styles.tableTitle}>Arrange Slide Sequence</h2>
            <p style={{ margin: "4px 0 0 0", fontSize: "0.9rem", color: "rgba(255, 255, 255, 0.6)", lineHeight: "1.4" }}>
              Drag and drop slide thumbnails horizontally to re-arrange their indices. Active slide index will display a glowing teal outline.
            </p>
          </div>

          {slides.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px", color: "rgba(255,255,255,0.4)", fontSize: "0.9rem" }}>
              No slides to arrange. Click the Upload button above to add slides.
            </div>
          ) : (
            <div className={styles.dragStrip}>
              {slides.map((src: string, index: number) => {
                const isActive = activePdfId === "pdf-1" && currentPage === index + 1;
                
                // Determine dragging animations/classes
                let dragClass = "";
                if (draggedIndex === index) {
                  dragClass = styles.dragging;
                } else if (draggedIndex !== null && dragOverIndex === index) {
                  if (index > draggedIndex) {
                    dragClass = styles.dragOverRight;
                  } else {
                    dragClass = styles.dragOverLeft;
                  }
                }

                return (
                  <div
                    key={`drag-${src}-${index}`}
                    draggable
                    onDragStart={(e) => handleSequenceDragStart(e, index)}
                    onDragOver={(e) => handleSequenceDragOver(e, index)}
                    onDragLeave={handleSequenceDragLeave}
                    onDragEnd={handleSequenceDragEnd}
                    onDrop={(e) => handleSequenceDrop(e, index)}
                    className={`${styles.dragItem} ${isActive ? styles.dragItemActive : ""} ${dragClass}`}
                  >
                    <span className={styles.dragIndexLabel}>
                      Slide {index + 1}
                    </span>
                    <div className={styles.dragCard}>
                      <div className={styles.dragThumbContainer}>
                        {isVideoSlide(src) ? (
                          <video
                            src={src}
                            className={styles.dragThumbImg}
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <Image
                            src={src}
                            alt={`Slide thumbnail ${index + 1}`}
                            fill
                            sizes="100px"
                            className={styles.dragThumbImg}
                          />
                        )}
                      </div>
                      <div className={styles.dragLabel} title={src.split("/").pop()}>
                        {src.split("/").pop()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Table list section */}
        <section className={styles.tableContainer} style={{ marginTop: "10px" }}>
          <div className={styles.tableHeaderRow}>
            <h2 className={styles.tableTitle}>Slides & Sequences Table</h2>
            <div style={{ fontSize: "0.85rem", color: "rgba(255, 255, 255, 0.5)" }}>
              Total items: {slides.length}
            </div>
          </div>

          {slides.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "rgba(255,255,255,0.4)" }}>
              No slides in the sequence. Click the Upload button above to add slides.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className={styles.slidesTable}>
                <thead>
                  <tr>
                    <th style={{ width: "60px" }}>Slide</th>
                    <th style={{ width: "120px" }}>Thumbnail</th>
                    <th>File Path</th>
                    <th style={{ width: "120px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {slides.map((src: string, index: number) => {
                    const isActive = activePdfId === "pdf-1" && currentPage === index + 1;
                    return (
                      <tr key={src + "_" + index} className={isActive ? styles.rowActive : ""}>
                        <td>
                          <span className={`${styles.slideBadge} ${isActive ? styles.slideBadgeActive : ""}`}>
                            {index + 1}
                          </span>
                        </td>
                        <td>
                          <div className={styles.tableThumb}>
                            {isVideoSlide(src) ? (
                              <video
                                src={src}
                                className={styles.tableThumbImg}
                                muted
                                playsInline
                                preload="metadata"
                              />
                            ) : (
                              <Image
                                src={src}
                                alt={`Slide thumbnail ${index + 1}`}
                                fill
                                sizes="120px"
                                className={styles.tableThumbImg}
                              />
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={styles.filePath}>{src}</span>
                        </td>
                        <td>
                          <div className={styles.tableActions}>
                            <button
                              type="button"
                              onClick={() => requestDeleteSlide(src, index)}
                              className={`${styles.btn} ${styles.btnDanger}`}
                              style={{ padding: "6px 12px", fontSize: "0.8rem", borderRadius: "8px" }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Upload Modal Overlay */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => !isUploading && setIsModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Upload Media Slides
              </h3>
              <button
                type="button"
                onClick={() => !isUploading && setIsModalOpen(false)}
                className={styles.modalClose}
                disabled={isUploading}
                aria-label="Close modal"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <p style={{ margin: 0, fontSize: "0.9rem", color: "rgba(255, 255, 255, 0.6)", lineHeight: "1.4" }}>
              Drag and drop multiple image or video files, or click to browse. Supported formats: images (JPG, PNG, GIF, WebP) and videos (MP4, WebM).
            </p>

            <input
              type="file"
              multiple
              accept="image/*,video/*"
              ref={modalFileInputRef}
              onChange={handleModalFileSelect}
              style={{ display: "none" }}
              disabled={isUploading}
            />

            {/* Upload Zone Area */}
            <div
              className={`${styles.uploadZone} ${isDragging ? styles.uploadZoneActive : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleModalFileDrop}
              onClick={() => !isUploading && modalFileInputRef.current?.click()}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <p className={styles.uploadText}>Drag & drop images/videos here</p>
              <p className={styles.uploadSubtext}>or click to select files</p>
            </div>

            {/* Selected Files Queue */}
            {selectedFiles.length > 0 && (
              <div className={styles.fileQueue}>
                {selectedFiles.map((fileObj, idx) => (
                  <div key={idx} className={styles.fileQueueItem}>
                    <div className={styles.fileInfo}>
                      {fileObj.file.type.startsWith("video/") ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      )}
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span className={styles.fileName}>{fileObj.file.name}</span>
                        <span className={styles.fileSize}>{(fileObj.file.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    </div>
                    
                    {!isUploading ? (
                      <button
                        type="button"
                        onClick={() => removeFileFromQueue(idx)}
                        className={styles.fileRemoveBtn}
                        aria-label="Remove file"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    ) : (
                      <span style={{ fontSize: "0.8rem", color: "#00ffc8", fontWeight: 600 }}>
                        {fileObj.progress}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Overall Progress Bar */}
            {isUploading && (
              <div className={styles.uploadProgressContainer}>
                <div className={styles.progressText}>Uploading batch... {uploadProgress}%</div>
                <div className={styles.progressBarBg}>
                  <div className={styles.progressBarFill} style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "10px" }}>
              <button
                type="button"
                onClick={() => {
                  setSelectedFiles([]);
                  setIsModalOpen(false);
                }}
                className={styles.btnSecondary}
                disabled={isUploading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={startModalUpload}
                className={styles.btnPrimary}
                disabled={isUploading || selectedFiles.length === 0}
              >
                Start Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className={styles.modalOverlay} onClick={closeDeleteModal}>
          <div className={`${styles.modalContent} ${styles.deleteModalContent}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={`${styles.modalTitle} ${styles.deleteModalTitle}`}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                Delete Slide
              </h3>
              <button
                type="button"
                onClick={closeDeleteModal}
                className={styles.modalClose}
                disabled={isDeleting}
                aria-label="Close delete modal"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className={styles.deletePreviewRow}>
              <div className={styles.deletePreviewThumb}>
                {isVideoSlide(deleteTarget.imageUrl) ? (
                  <video
                    src={deleteTarget.imageUrl}
                    className={styles.tableThumbImg}
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <Image
                    src={deleteTarget.imageUrl}
                    alt={`Slide ${deleteTarget.index + 1} thumbnail`}
                    fill
                    sizes="120px"
                    className={styles.tableThumbImg}
                  />
                )}
              </div>
              <div className={styles.deleteCopy}>
                <p className={styles.deletePrompt}>Delete slide {deleteTarget.index + 1}?</p>
                <p className={styles.deletePath}>{deleteTarget.imageUrl}</p>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={closeDeleteModal}
                className={styles.btnSecondary}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteSlide()}
                className={`${styles.btn} ${styles.btnDanger}`}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete Slide"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast alert */}
      {toast && (
        <div className={`${styles.toast} ${styles.toastShow} ${toast.type === "success" ? styles.toastSuccess : styles.toastError}`}>
          {toast.message}
        </div>
      )}
    </main>
  );
}
