export interface Chapter {
  title: string;
  content: string;
}

export interface ConvertOptions {
  output: string;
  voice?: string;
  pagesPerChapter?: number;
  dryRun?: boolean;
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
