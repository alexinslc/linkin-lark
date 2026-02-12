import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Chapter, ParserResult } from '../types';
import { sanitizePDFPath, isPDFFile as validatePDFMagicBytes } from '../validators/path-validator';

export async function parsePDF(pdfPath: string, pagesPerChapter: number = 10): Promise<ParserResult> {
  // Validate and sanitize path
  const sanitizedPath = sanitizePDFPath(pdfPath);

  const file = Bun.file(sanitizedPath);

  if (!await file.exists()) {
    throw new Error(`PDF file not found: ${sanitizedPath}`);
  }

  // Verify it's actually a PDF by magic bytes
  const dataBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(dataBuffer);

  if (!validatePDFMagicBytes(uint8Array)) {
    throw new Error('File is not a valid PDF');
  }

  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdfDocument = await loadingTask.promise;

  const outline = await pdfDocument.getOutline();
  const numPages = pdfDocument.numPages;

  const chapters = await detectPDFChapters(pdfDocument, outline, numPages, pagesPerChapter);

  return {
    chapters,
    source: sanitizedPath,
    type: 'pdf'
  };
}

async function detectPDFChapters(
  pdfDocument: any,
  outline: any,
  numPages: number,
  pagesPerChapter: number
): Promise<Chapter[]> {
  const chapters: Chapter[] = [];

  if (outline && outline.length > 0) {
    for (let i = 0; i < outline.length; i++) {
      const item = outline[i];
      const nextItem = outline[i + 1];

      if (item.title) {
        const startPage = item.dest ? await getPageNumber(pdfDocument, item.dest) : 1;
        const endPage = nextItem?.dest ? await getPageNumber(pdfDocument, nextItem.dest) - 1 : numPages;

        const content = await extractTextFromPages(pdfDocument, startPage, endPage);

        chapters.push({
          title: item.title,
          content,
          index: i
        });
      }
    }
  }

  if (chapters.length === 0) {
    for (let i = 0; i < numPages; i += pagesPerChapter) {
      const startPage = i + 1;
      const endPage = Math.min(i + pagesPerChapter, numPages);

      const content = await extractTextFromPages(pdfDocument, startPage, endPage);

      chapters.push({
        title: `Pages ${startPage}-${endPage}`,
        content,
        index: Math.floor(i / pagesPerChapter)
      });
    }
  }

  return chapters;
}

async function getPageNumber(pdfDocument: any, dest: any): Promise<number> {
  try {
    if (typeof dest === 'string') {
      const match = dest.match(/p(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    if (Array.isArray(dest)) {
      const pageRef = dest[0];
      const pageIndex = await pdfDocument.getPageIndex(pageRef);
      return pageIndex + 1;
    }

    if (typeof dest === 'string') {
      const resolvedDest = await pdfDocument.getDestination(dest);
      if (resolvedDest && Array.isArray(resolvedDest)) {
        const pageRef = resolvedDest[0];
        const pageIndex = await pdfDocument.getPageIndex(pageRef);
        return pageIndex + 1;
      }
    }

    return 1;
  } catch {
    return 1;
  }
}

async function extractTextFromPages(pdfDocument: any, startPage: number, endPage: number): Promise<string> {
  const textParts: string[] = [];

  for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();

    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    textParts.push(pageText);
  }

  return textParts.join(' ').replace(/\s+/g, ' ').trim();
}
