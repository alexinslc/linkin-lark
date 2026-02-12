import type { ParserResult } from '../types';
import { parseHTML } from './html-parser';
import { parsePDF } from './pdf-parser';

export async function parseInput(input: string): Promise<ParserResult> {
  if (isURL(input)) {
    return await parseHTML(input);
  } else if (await isPDFFile(input)) {
    return await parsePDF(input);
  } else {
    throw new Error(`Invalid input: ${input}. Must be a URL or PDF file path.`);
  }
}

function isURL(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function isPDFFile(input: string): Promise<boolean> {
  try {
    const file = Bun.file(input);
    const exists = await file.exists();
    if (!exists) return false;

    return input.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}
