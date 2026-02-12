import pdfParse from 'pdf-parse';
import type { Chapter, ParserResult } from '../types';

export async function parsePDF(pdfPath: string, pagesPerChapter: number = 10): Promise<ParserResult> {
  const file = Bun.file(pdfPath);

  if (!await file.exists()) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }

  const dataBuffer = await file.arrayBuffer();
  const data = await pdfParse(Buffer.from(dataBuffer));

  const chapters = await detectPDFChapters(data, pagesPerChapter);

  return {
    chapters,
    source: pdfPath,
    type: 'pdf'
  };
}

async function detectPDFChapters(data: pdfParse.Result, pagesPerChapter: number): Promise<Chapter[]> {
  const chapters: Chapter[] = [];

  if (data.metadata?.outline && Array.isArray(data.metadata.outline) && data.metadata.outline.length > 0) {
    const outline = data.metadata.outline;

    for (let i = 0; i < outline.length; i++) {
      const item = outline[i];
      const nextItem = outline[i + 1];

      if (item?.title) {
        chapters.push({
          title: item.title,
          content: data.text,
          index: i
        });
      }
    }
  }

  if (chapters.length === 0) {
    const totalPages = data.numpages;
    const text = data.text;
    const wordsPerPage = Math.ceil(text.split(/\s+/).length / totalPages);
    const words = text.split(/\s+/);

    for (let i = 0; i < totalPages; i += pagesPerChapter) {
      const startPage = i + 1;
      const endPage = Math.min(i + pagesPerChapter, totalPages);
      const startWordIdx = i * wordsPerPage;
      const endWordIdx = Math.min(endPage * wordsPerPage, words.length);

      const chapterContent = words.slice(startWordIdx, endWordIdx).join(' ');

      chapters.push({
        title: `Pages ${startPage}-${endPage}`,
        content: chapterContent,
        index: Math.floor(i / pagesPerChapter)
      });
    }
  }

  return chapters;
}
