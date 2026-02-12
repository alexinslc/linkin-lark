import {
  Chapter,
  ConvertOptions,
  TTSOptions,
  ParserResult,
  TTSResponse,
  GeneratorOptions,
  ConversionResult,
  parseInput,
  convertToSpeech,
  getApiKey,
  getDefaultVoiceId,
  saveMp3File,
  generateFileName,
  ensureOutputDir,
  cleanHTMLContent
} from './src/index';

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
