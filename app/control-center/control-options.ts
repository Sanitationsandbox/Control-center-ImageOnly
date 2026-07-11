import type { PdfId } from "@/lib/pdf-control";

export type ControlOption = {
  id: string;
  pdfId: PdfId;
  label: string;
  shortName: string;
  tagline: string;
  controlKind: "pages" | "video";
};

export const controlOptions: ControlOption[] = [
  {
    id: "image-slide",
    pdfId: "pdf-1",
    label: "Image Slide",
    shortName: "Image Slide",
    tagline: "Interactive slideshow.",
    controlKind: "pages",
  },
];
