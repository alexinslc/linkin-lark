export interface ConversionState {
  source: string;
  completedChapters: number[];
  failedChapters: Array<{ index: number; title: string; error: string }>;
  timestamp: string;
  totalChapters: number;
}

import * as path from 'path';
import { unlink } from 'fs/promises';

export class StateManager {
  private getStatePath(outputDir: string): string {
    // Use path.join for proper path construction across platforms
    const normalizedDir = path.resolve(outputDir);
    return path.join(normalizedDir, '.linkin-lark-state.json');
  }

  async save(state: ConversionState, outputDir: string): Promise<void> {
    const statePath = this.getStatePath(outputDir);
    await Bun.write(statePath, JSON.stringify(state, null, 2));
  }

  async load(outputDir: string): Promise<ConversionState | null> {
    const statePath = this.getStatePath(outputDir);
    const file = Bun.file(statePath);

    if (!(await file.exists())) {
      return null;
    }

    try {
      const state = await file.json() as ConversionState;

      if (!this.isValidState(state)) {
        console.warn('Invalid state file found, ignoring');
        return null;
      }

      return state;
    } catch (error) {
      console.warn('Failed to parse state file, ignoring');
      return null;
    }
  }

  shouldSkipChapter(chapterIndex: number, state: ConversionState | null): boolean {
    return state?.completedChapters.includes(chapterIndex) ?? false;
  }

  async clear(outputDir: string): Promise<void> {
    const statePath = this.getStatePath(outputDir);
    try {
      await unlink(statePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  private isValidState(state: unknown): state is ConversionState {
    if (typeof state !== 'object' || state === null) return false;

    const s = state as Record<string, unknown>;

    // Validate basic structure
    if (
      typeof s.source !== 'string' ||
      !Array.isArray(s.completedChapters) ||
      !Array.isArray(s.failedChapters) ||
      typeof s.timestamp !== 'string' ||
      typeof s.totalChapters !== 'number'
    ) {
      return false;
    }

    // Validate completedChapters array
    if (!s.completedChapters.every((n: unknown) => typeof n === 'number')) {
      return false;
    }

    // Validate failedChapters array structure
    const totalChapters = s.totalChapters as number;
    return (s.failedChapters as unknown[]).every((f: unknown) => {
      if (typeof f !== 'object' || f === null) return false;
      const item = f as Record<string, unknown>;

      const index = item.index;
      const title = item.title;
      const error = item.error;

      const validIndex =
        typeof index === 'number' &&
        Number.isInteger(index) &&
        index >= 0 &&
        index < totalChapters;

      return (
        validIndex &&
        typeof title === 'string' &&
        typeof error === 'string'
      );
    });
  }
}
