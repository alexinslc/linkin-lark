import ora from 'ora';
import { config } from 'dotenv';
import { parseInput } from '../parsers/parser';
import { convertToSpeech, getApiKey, getDefaultVoiceId } from '../tts';
import { saveMp3File, ensureOutputDir } from '../generator';
import type { ConvertOptions, ConversionResult } from '../types';
import { StateManager, type ConversionState } from '../services/state-manager';

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

    const stateManager = new StateManager();
    let state: ConversionState | null = null;

    if (!options.force) {
      state = await stateManager.load(options.output);

      // Validate that state matches current run
      if (state) {
        if (state.source !== input || state.totalChapters !== result.chapters.length) {
          console.warn('\nWarning: Existing state file does not match current input.');
          console.warn(`  State source: ${state.source}`);
          console.warn(`  Current input: ${input}`);
          console.warn(`  State chapters: ${state.totalChapters}, Current: ${result.chapters.length}`);
          console.warn('Ignoring state. Use --force to explicitly start fresh.\n');
          state = null;
        }
      }

      if (state && !options.resume) {
        console.log(`\nFound previous conversion state (${state.completedChapters.length}/${state.totalChapters} chapters completed)`);
        console.log('Use --resume to continue or --force to start fresh\n');
        if (spinner) spinner.stop();
        return;
      }

      if (state && options.resume) {
        console.log(`\nResuming conversion (${state.completedChapters.length}/${state.totalChapters} chapters already completed)\n`);
      }
    }

    if (!state) {
      state = {
        source: input,
        completedChapters: [],
        failedChapters: [],
        timestamp: new Date().toISOString(),
        totalChapters: result.chapters.length
      };
      await stateManager.save(state, options.output);
    }

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

      if (stateManager.shouldSkipChapter(i, state)) {
        console.log(`Skipping already completed chapter ${progress}: ${chapter.title}`);
        // Add to conversionResult for JSON mode
        if (isJsonMode) {
          conversionResult.chapters.push({
            index: i,
            title: chapter.title,
            characters: chapter.content.length,
            filePath: `Chapter ${i + 1}.mp3` // Approximate filename
          });
        }
        continue;
      }

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

        state.completedChapters.push(i);

        // Remove from failedChapters if it was previously failed (retry success)
        state.failedChapters = state.failedChapters.filter(f => f.index !== i);

        await stateManager.save(state, options.output);

        conversionResult.chapters.push({
          index: i,
          title: chapter.title,
          characters: ttsResponse.characters,
          filePath
        });

        if (spinner) spinner.succeed(`Converted chapter ${progress}: ${chapter.title} → ${filePath}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (spinner) {
          spinner.fail(`Failed chapter ${progress}: ${chapter.title}`);
          console.error(`  Error: ${errorMsg}`);
        }

        state.failedChapters.push({
          index: i,
          title: chapter.title,
          error: errorMsg
        });
        await stateManager.save(state, options.output);

        conversionResult.success = false;
        conversionResult.chapters.push({
          index: i,
          title: chapter.title,
          characters: chapter.content.length,
          error: errorMsg
        });
      }
    }

    const totalCompleted = state.completedChapters.length;
    const totalFailed = state.failedChapters.length;

    if (isJsonMode) {
      console.log(JSON.stringify(conversionResult, null, 2));
    } else {
      if (totalFailed === 0) {
        console.log(`\n✓ Successfully converted all ${result.chapters.length} chapters to ${options.output}`);
        await stateManager.clear(options.output);
      } else {
        console.log(`\n⚠ Converted ${totalCompleted}/${result.chapters.length} chapters`);
        console.log('Failed chapters:', state.failedChapters.map(f => f.title).join(', '));
        console.log('\nUse --resume to retry failed chapters');
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
