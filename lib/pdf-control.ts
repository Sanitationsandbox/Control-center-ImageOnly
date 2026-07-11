export const mediaDocuments = [
  {
    id: "pdf-1",
    kind: "images",
    images: [
      "/images/1.jpg",
      "/images/2.jpg",
      "/images/3.jpg",
      "/images/4.jpg",
      "/images/5.jpg",
      "/images/6.jpg",
      "/images/7.jpg",
    ],
  },
] as const;

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
  documents: PdfControlState;
};

export function isPdfId(value: unknown): value is PdfId {
  return mediaDocuments.some((document) => document.id === value);
}

export function isPdfDirection(value: unknown): value is PdfDirection {
  return value === "previous" || value === "next";
}
