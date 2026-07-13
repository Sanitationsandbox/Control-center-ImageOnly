export const mediaDocuments = [
  {
    id: "pdf-1",
    kind: "images",
    items: [
      { kind: "image", src: "/images/1.png" },
      { kind: "image", src: "/images/2.png" },
      { kind: "image", src: "/images/3.png" },
      { kind: "image", src: "/images/4.png" },
      { kind: "image", src: "/images/5.png" },
      { kind: "image", src: "/images/6.png" },
      { kind: "image", src: "/images/7.png" },
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
  activePdfId: PdfId | null;
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
