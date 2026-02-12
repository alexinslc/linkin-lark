export interface Chapter {
  title: string;
  content: string;
}

export interface ConvertOptions {
  output: string;
  voice?: string;
  pagesPerChapter?: number;
  dryRun?: boolean;
  format?: 'text' | 'json';
}

export interface TTSOptions {
  apiKey: string;
  voiceId: string;
  modelId?: string;
}

export interface ParserResult {
  chapters: Chapter[];
  source: string;
  type: 'html' | 'pdf';
}

export interface TTSResponse {
  audio: ArrayBuffer;
  characters: number;
}

export interface GeneratorOptions {
  outputDir: string;
}

export interface ConversionResult {
  success: boolean;
  chapters: {
    index: number;
    title: string;
    characters: number;
    filePath?: string;
    error?: string;
  }[];
  totalChapters: number;
  totalCharacters: number;
  estimatedCost: number;
  outputDir: string;
  source: string;
  type: 'html' | 'pdf';
}
