"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaItem } from "@/lib/pdf-control";
import styles from "../preview.module.css";

type ImageViewerProps = {
  items: readonly MediaItem[];
  pageNumber: number;
  label: string;
  videoPlaying: boolean;
  videoMuted: boolean;
};

export function ImageViewer({
  items,
  pageNumber,
  label,
  videoPlaying,
  videoMuted,
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
          <SequenceVideo
            src={item.src}
            playing={videoPlaying}
            muted={videoMuted}
          />
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

type SequenceVideoProps = {
  src: string;
  playing: boolean;
  muted: boolean;
};

function SequenceVideo({ src, playing, muted }: SequenceVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const playVideo = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (video.ended) video.currentTime = 0;
      await video.play();
      setAutoplayBlocked(false);
    } catch {
      setAutoplayBlocked(true);
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.defaultMuted = muted;
    video.muted = muted;
    if (!muted) video.volume = 1;
  }, [muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (playing) {
      if (video.ended) video.currentTime = 0;
      void video
        .play()
        .then(() => setAutoplayBlocked(false))
        .catch(() => setAutoplayBlocked(true));
    } else {
      video.pause();
    }
  }, [playVideo, playing, src]);

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        controls
        autoPlay
        muted={muted}
        playsInline
        preload="auto"
        className={styles.sequenceVideo}
        onCanPlay={() => {
          if (playing) void playVideo();
        }}
      >
        Your browser does not support the video tag.
      </video>
      {playing && autoplayBlocked ? (
        <button
          type="button"
          className={styles.autoplayFallback}
          onClick={() => void playVideo()}
        >
          Play video{muted ? "" : " with sound"}
        </button>
      ) : null}
    </>
  );
}
