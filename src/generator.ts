import type { GeneratorOptions } from './types';

export async function saveMp3File(
  audio: ArrayBuffer,
  chapterIndex: number,
  totalChapters: number,
  options: GeneratorOptions
): Promise<string> {
  const fileName = generateFileName(chapterIndex, totalChapters);
  const filePath = `${options.outputDir}/${fileName}`;

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
