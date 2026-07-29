-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('images', 'video');

-- CreateEnum
CREATE TYPE "SlideKind" AS ENUM ('image', 'video');

-- CreateTable
CREATE TABLE "MediaDocument" (
    "id" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Slide" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "src" TEXT NOT NULL,
    "kind" "SlideKind" NOT NULL DEFAULT 'image',
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Slide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Slide_documentId_idx" ON "Slide"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Slide_documentId_position_key" ON "Slide"("documentId", "position");

-- AddForeignKey
ALTER TABLE "Slide" ADD CONSTRAINT "Slide_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "MediaDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
