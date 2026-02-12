import * as path from 'path';
import type { GeneratorOptions } from './types';
import { sanitizeOutputPath, validatePathWithinDirectory } from './validators/path-validator';

export async function saveMp3File(
  audio: ArrayBuffer,
  chapterIndex: number,
  totalChapters: number,
  options: GeneratorOptions
): Promise<string> {
  // Validate and sanitize output directory
  const sanitizedDir = sanitizeOutputPath(options.outputDir);

  const fileName = generateFileName(chapterIndex, totalChapters);
  const filePath = path.join(sanitizedDir, fileName);

  // Ensure resolved path is still within intended directory
  validatePathWithinDirectory(filePath, sanitizedDir);

  await Bun.write(filePath, audio);

  return filePath;
}

export function generateFileName(chapterIndex: number, totalChapters: number): string {
  const padding = String(totalChapters).length;
  return `${String(chapterIndex + 1).padStart(padding, '0')}.mp3`;
}

export async function ensureOutputDir(outputDir: string): Promise<void> {
  try {
    const stats = await Bun.file(outputDir).exists();
    if (!stats) {
      await Bun.write(`${outputDir}/.keep`, '');
    }
  } catch {
    await Bun.write(`${outputDir}/.keep`, '');
  }
}
