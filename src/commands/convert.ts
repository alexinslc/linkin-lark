import ora from 'ora';
import { config } from 'dotenv';
import { parseInput } from '../parsers/parser';
import { convertToSpeech, getApiKey, getDefaultVoiceId } from '../tts';
import { saveMp3File, ensureOutputDir } from '../generator';
import type { ConvertOptions, ConversionResult } from '../types';

config();

export async function convertCommand(
  input: string,
  options: ConvertOptions
): Promise<void> {
  const isJsonMode = options.format === 'json';
  const spinner = isJsonMode ? null : ora('Initializing...').start();

  try {
    if (spinner) spinner.text = 'Parsing input...';
    const result = await parseInput(input, options.pagesPerChapter);

    const totalChars = result.chapters.reduce((sum, ch) => sum + ch.content.length, 0);
    const estimatedCost = (totalChars / 1000000) * 30;

    if (spinner) spinner.succeed(`Found ${result.chapters.length} chapters in ${result.type.toUpperCase()}`);

    if (options.dryRun) {
      if (isJsonMode) {
        const jsonResult: ConversionResult = {
          success: true,
          chapters: result.chapters.map((ch, i) => ({
            index: i,
            title: ch.title,
            characters: ch.content.length
          })),
          totalChapters: result.chapters.length,
          totalCharacters: totalChars,
          estimatedCost,
          outputDir: options.output,
          source: result.source,
          type: result.type
        };
        console.log(JSON.stringify(jsonResult, null, 2));
      } else {
        console.log('\nDry run - no conversion performed\n');
        console.log('Chapters detected:');
        result.chapters.forEach((ch, i) => {
          console.log(`  ${i + 1}. ${ch.title} (${ch.content.length} characters)`);
        });
        console.log(`\nTotal characters: ${totalChars.toLocaleString()}`);
        console.log(`Estimated cost: $${estimatedCost.toFixed(2)} (approximate)`);
      }
      return;
    }

    // Only get API key/voice after dry-run check
    const apiKey = getApiKey();
    const voiceId = options.voice || getDefaultVoiceId();

    await ensureOutputDir(options.output);

    const conversionResult: ConversionResult = {
      success: true,
      chapters: [],
      totalChapters: result.chapters.length,
      totalCharacters: totalChars,
      estimatedCost,
      outputDir: options.output,
      source: result.source,
      type: result.type
    };

    for (const [i, chapter] of result.chapters.entries()) {
      const progress = `${i + 1}/${result.chapters.length}`;

      try {
        if (spinner) spinner.start(`Converting chapter ${progress}: ${chapter.title}`);

        const ttsResponse = await convertToSpeech(chapter.content, {
          apiKey,
          voiceId,
          modelId: 'eleven_flash_v2_5'
        });

        const filePath = await saveMp3File(
          ttsResponse.audio,
          i,
          result.chapters.length,
          { outputDir: options.output }
        );

        conversionResult.chapters.push({
          index: i,
          title: chapter.title,
          characters: ttsResponse.characters,
          filePath
        });

        if (spinner) spinner.succeed(`Converted chapter ${progress}: ${chapter.title} → ${filePath}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        conversionResult.success = false;
        conversionResult.chapters.push({
          index: i,
          title: chapter.title,
          characters: chapter.content.length,
          error: errorMsg
        });

        if (spinner) {
          spinner.fail(`Failed chapter ${progress}: ${chapter.title}`);
          console.error(`  Error: ${errorMsg}`);
        }
      }
    }

    if (isJsonMode) {
      console.log(JSON.stringify(conversionResult, null, 2));
    } else {
      const failed = conversionResult.chapters.filter(ch => ch.error);
      if (failed.length === 0) {
        console.log(`\n✓ Successfully converted all ${result.chapters.length} chapters to ${options.output}`);
      } else {
        console.log(`\n⚠ Converted ${result.chapters.length - failed.length}/${result.chapters.length} chapters`);
        console.log('Failed chapters:', failed.map(ch => ch.title).join(', '));
      }
    }

  } catch (error) {
    if (spinner) spinner.fail('Conversion failed');
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (isJsonMode) {
      const errorResult: ConversionResult = {
        success: false,
        chapters: [],
        totalChapters: 0,
        totalCharacters: 0,
        estimatedCost: 0,
        outputDir: options.output,
        source: input,
        type: 'html' // Default type, error occurred before type detection
      };
      console.log(JSON.stringify(errorResult, null, 2));
    } else {
      console.error(`\nError: ${errorMsg}`);
    }
    process.exit(1);
  }
}
