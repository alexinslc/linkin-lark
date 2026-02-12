export interface ConversionState {
  source: string;
  completedChapters: number[];
  failedChapters: Array<{ index: number; title: string; error: string }>;
  timestamp: string;
  totalChapters: number;
}

export class StateManager {
  private getStatePath(outputDir: string): string {
    return `${outputDir}/.linkin-lark-state.json`;
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
      await Bun.write(statePath, '');
    } catch {
      // Ignore if file doesn't exist
    }
  }

  private isValidState(state: unknown): state is ConversionState {
    if (typeof state !== 'object' || state === null) return false;

    const s = state as Record<string, unknown>;

    return (
      typeof s.source === 'string' &&
      Array.isArray(s.completedChapters) &&
      s.completedChapters.every((n: unknown) => typeof n === 'number') &&
      Array.isArray(s.failedChapters) &&
      typeof s.timestamp === 'string' &&
      typeof s.totalChapters === 'number'
    );
  }
}
