export const mediaDocuments = [
  {
    id: "pdf-1",
    kind: "images",
    items: [
      { kind: "image", src: "/images/1.jpg" },
      { kind: "image", src: "/images/2.jpg" },
      { kind: "image", src: "/images/3.jpg" },
      { kind: "image", src: "/images/4.jpg" },
      { kind: "image", src: "/images/5.jpg" },
      { kind: "image", src: "/images/6.jpg" },
      { kind: "image", src: "/images/7.jpg" },
      { kind: "image", src: "/images/8.jpg" },
      { kind: "image", src: "/images/9.jpg" },
      { kind: "image", src: "/images/10.jpg" },
      { kind: "image", src: "/images/11.jpg" },
      { kind: "image", src: "/images/12.jpg" },
      { kind: "image", src: "/images/13.jpg" },
      { kind: "image", src: "/images/14.jpg" },
      { kind: "image", src: "/images/15.jpg" },
      { kind: "image", src: "/images/16.jpg" },
      { kind: "image", src: "/images/17.jpg" },
      { kind: "image", src: "/images/18.jpg" },
      { kind: "image", src: "/images/19.jpg" },
      { kind: "image", src: "/images/20.jpg" },
      { kind: "image", src: "/images/21.jpg" },
      {
        kind: "video",
        src: "/video0111.mp4",
      },
    ],
  },
] as const;

export type MediaItem = (typeof mediaDocuments)[number]["items"][number];

export type PdfId = (typeof mediaDocuments)[number]["id"];
export type PdfDirection = "previous" | "next";

export type PdfPageState = {
  page: number;
  totalPages: number | null;
  updatedAt: number;
};

export type PdfControlState = Record<PdfId, PdfPageState>;

export type PdfRemoteState = {
  updatedAt: number;
  activePdfId: PdfId | null;
  activeUpdatedAt: number;
  videoPlaying: boolean;
  videoMuted: boolean;
  documents: PdfControlState;
};

export function isPdfId(value: unknown): value is PdfId {
  return mediaDocuments.some((document) => document.id === value);
}

export function isPdfDirection(value: unknown): value is PdfDirection {
  return value === "previous" || value === "next";
}
