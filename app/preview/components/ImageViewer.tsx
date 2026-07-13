"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
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
          <SequenceVideo src={item.src} />
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

function SequenceVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const playWithSound = async () => {
    const video = videoRef.current;
    if (!video) return;

    video.defaultMuted = false;
    video.muted = false;
    video.volume = 1;

    try {
      await video.play();
      setAutoplayBlocked(false);
    } catch {
      setAutoplayBlocked(true);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.defaultMuted = false;
    video.muted = false;
    video.volume = 1;
    void video.play().catch(() => setAutoplayBlocked(true));
  }, [src]);

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        controls
        autoPlay
        playsInline
        preload="auto"
        className={styles.sequenceVideo}
        onCanPlay={() => void playWithSound()}
        onVolumeChange={(event) => {
          if (event.currentTarget.muted || event.currentTarget.volume === 0) {
            event.currentTarget.muted = false;
            event.currentTarget.volume = 1;
          }
        }}
      >
        Your browser does not support the video tag.
      </video>
      {autoplayBlocked ? (
        <button
          type="button"
          className={styles.autoplayFallback}
          onClick={() => void playWithSound()}
        >
          Play video with sound
        </button>
      ) : null}
    </>
  );
}
