"use client";

import Image from "next/image";
import type { MediaItem } from "@/lib/pdf-control";
import styles from "../preview.module.css";

type ImageViewerProps = {
  items: readonly MediaItem[];
  pageNumber: number;
  label: string;
};

export function ImageViewer({
  items,
  pageNumber,
  label,
}: ImageViewerProps) {
  const safeIndex = Math.min(items.length - 1, Math.max(0, pageNumber - 1));
  const item = items[safeIndex];

  return (
    <section
      className={styles.imageViewer}
      aria-label={`${label} item ${safeIndex + 1} of ${items.length}`}
    >
      <div key={item.src} className={styles.imageSlide}>
        {item.kind === "video" ? (
          <video
            src={item.src}
            controls
            autoPlay
            muted
            playsInline
            preload="auto"
            className={styles.sequenceVideo}
          >
            Your browser does not support the video tag.
          </video>
        ) : (
          <Image
            src={item.src}
            alt=""
            fill
            priority
            sizes="100vw"
            className={styles.sequenceImage}
          />
        )}
      </div>
    </section>
  );
}
