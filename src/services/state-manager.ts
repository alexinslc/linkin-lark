import { join } from 'path';

export interface ConversionState {
  source: string;
  completedChapters: number[];
  failedChapters: Array<{ index: number; title: string; error: string }>;
  timestamp: string;
  totalChapters: number;
}

export class StateManager {
  private readonly STATE_FILENAME = '.linkin-lark-state.json';

  getStatePath(outputDir: string): string {
    return join(outputDir, this.STATE_FILENAME);
  }

  async save(state: ConversionState, outputDir: string): Promise<void> {
    const statePath = this.getStatePath(outputDir);
    await Bun.write(statePath, JSON.stringify(state, null, 2));
  }

  async load(outputDir: string): Promise<ConversionState | null> {
    const statePath = this.getStatePath(outputDir);
    const file = Bun.file(statePath);

    if (await file.exists()) {
      try {
        const data = await file.json();
        this.validateState(data);
        return data as ConversionState;
      } catch (error) {
        console.warn('Warning: Failed to load state file, starting fresh');
        return null;
      }
    }

    return null;
  }

  shouldSkipChapter(chapterIndex: number, state: ConversionState | null): boolean {
    return state?.completedChapters.includes(chapterIndex) ?? false;
  }

  async clear(outputDir: string): Promise<void> {
    const statePath = this.getStatePath(outputDir);
    const file = Bun.file(statePath);

    if (await file.exists()) {
      try {
        await Bun.write(statePath, '');
        // Delete the file after emptying it
        const fs = await import('fs/promises');
        await fs.unlink(statePath);
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  }

  private validateState(data: unknown): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid state: not an object');
    }

    const state = data as Partial<ConversionState>;

    if (typeof state.source !== 'string') {
      throw new Error('Invalid state: missing or invalid source');
    }

    if (!Array.isArray(state.completedChapters)) {
      throw new Error('Invalid state: missing or invalid completedChapters');
    }

    if (!Array.isArray(state.failedChapters)) {
      throw new Error('Invalid state: missing or invalid failedChapters');
    }

    if (typeof state.timestamp !== 'string') {
      throw new Error('Invalid state: missing or invalid timestamp');
    }

    if (typeof state.totalChapters !== 'number') {
      throw new Error('Invalid state: missing or invalid totalChapters');
    }
  }
}
