import type { Chapter } from '../types';

export class YotoValidator {
  static readonly MAX_FILE_SIZE_MB = 100;
  static readonly MAX_DURATION_MINUTES = 60;
  static readonly MAX_CARD_SIZE_MB = 500;
  static readonly MAX_TRACKS = 100;

  static readonly CHARS_PER_MINUTE = 150;

  validateFileSize(audio: ArrayBuffer): void {
    const sizeMB = audio.byteLength / (1024 * 1024);
    if (sizeMB > YotoValidator.MAX_FILE_SIZE_MB) {
      throw new Error(
        `File size ${sizeMB.toFixed(2)}MB exceeds Yoto limit of ${YotoValidator.MAX_FILE_SIZE_MB}MB`
      );
    }
  }

  validateCardCapacity(chapters: Chapter[]): void {
    if (chapters.length > YotoValidator.MAX_TRACKS) {
      throw new Error(
        `Chapter count ${chapters.length} exceeds Yoto limit of ${YotoValidator.MAX_TRACKS} tracks`
      );
    }
  }

  estimateDuration(text: string): number {
    return text.length / YotoValidator.CHARS_PER_MINUTE;
  }

  validateEstimatedDuration(text: string, title: string): void {
    const estimatedMinutes = this.estimateDuration(text);
    if (estimatedMinutes > YotoValidator.MAX_DURATION_MINUTES) {
      throw new Error(
        `Chapter "${title}" estimated duration ${estimatedMinutes.toFixed(0)}min exceeds Yoto limit of ${YotoValidator.MAX_DURATION_MINUTES}min`
      );
    }
  }

  estimateTotalSize(chapters: Chapter[]): number {
    const totalChars = chapters.reduce((sum, ch) => sum + ch.content.length, 0);
    const totalMinutes = totalChars / YotoValidator.CHARS_PER_MINUTE;
    const estimatedMB = totalMinutes * 1.5;
    return estimatedMB;
  }

  validateEstimatedCardSize(chapters: Chapter[]): void {
    const estimatedMB = this.estimateTotalSize(chapters);
    if (estimatedMB > YotoValidator.MAX_CARD_SIZE_MB) {
      console.warn(
        `⚠ Warning: Estimated total size ${estimatedMB.toFixed(0)}MB may exceed Yoto card limit of ${YotoValidator.MAX_CARD_SIZE_MB}MB`
      );
    }
  }
}
