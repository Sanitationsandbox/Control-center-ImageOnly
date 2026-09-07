"use client";

import { useEffect, useRef } from "react";
import styles from "../preview.module.css";

type VideoViewerProps = {
  src: string;
  playing: boolean;
};

export function VideoViewer({ src, playing }: VideoViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (playing) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [playing]);

  return (
    <section className={styles.videoViewer} aria-label="Video preview">
      <video
        ref={videoRef}
        src={src}
        controls
        autoPlay
        muted
        playsInline
        preload={playing ? "auto" : "metadata"}
      >
        Your browser does not support the video tag.
      </video>
    </section>
  );
}
