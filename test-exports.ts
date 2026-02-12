import type {
  Chapter,
  ConvertOptions,
  TTSOptions,
  ParserResult,
  TTSResponse,
  GeneratorOptions,
  ConversionResult
} from './src/index';

import {
  parseInput,
  convertToSpeech,
  getApiKey,
  getDefaultVoiceId,
  saveMp3File,
  generateFileName,
  ensureOutputDir,
  cleanHTMLContent
} from './src/index';

// Dummy usages to ensure all imports are exercised for static analysis
type _TestTypes =
  | Chapter
  | ConvertOptions
  | TTSOptions
  | ParserResult
  | TTSResponse
  | GeneratorOptions
  | ConversionResult;

void parseInput;
void convertToSpeech;
void getApiKey;
void getDefaultVoiceId;
void saveMp3File;
void generateFileName;
void ensureOutputDir;
void cleanHTMLContent;

console.log('All exports loaded successfully!');
console.log('Available functions:');
console.log('- parseInput');
console.log('- convertToSpeech');
console.log('- getApiKey');
console.log('- getDefaultVoiceId');
console.log('- saveMp3File');
console.log('- generateFileName');
console.log('- ensureOutputDir');
console.log('- cleanHTMLContent');
console.log('\nAvailable types:');
console.log('- Chapter');
console.log('- ConvertOptions');
console.log('- TTSOptions');
console.log('- ParserResult');
console.log('- TTSResponse');
console.log('- GeneratorOptions');
console.log('- ConversionResult');
