import fs from "node:fs";
import path from "node:path";

export interface DocumentInfo {
  id: string;
  kind: "images" | "video";
  images: string[];
  src?: string;
}

const DB_FILE = path.join(process.cwd(), "lib", "db.json");

const defaultDocuments: DocumentInfo[] = [
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
];

export function getDocuments(): DocumentInfo[] {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(data) as DocumentInfo[];
    }
  } catch (error) {
    console.error("Failed to read db.json, returning defaults", error);
  }
  
  // Write default to file on first load if it doesn't exist
  saveDocuments(defaultDocuments);
  return defaultDocuments;
}

export function saveDocuments(documents: DocumentInfo[]): void {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(documents, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to write to db.json", error);
  }
}
