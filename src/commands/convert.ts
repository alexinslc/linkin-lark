import ora from 'ora';
import { config } from 'dotenv';
import PQueue from 'p-queue';
import { parseInput } from '../parsers/parser';
import { convertToSpeech, getApiKey, getDefaultVoiceId } from '../tts';
import { saveMp3File, ensureOutputDir } from '../generator';
import type { ConvertOptions } from '../types';

config();

const ELEVENLABS_MAX_REQUESTS_PER_MINUTE = 50;
const ELEVENLABS_MIN_INTERVAL = 1200;

export async function convertCommand(
  input: string,
  options: ConvertOptions
): Promise<void> {
  const spinner = ora('Initializing...').start();

  try {
    const apiKey = getApiKey();
    const voiceId = options.voice || getDefaultVoiceId();

    spinner.text = 'Parsing input...';
    const result = await parseInput(input);

    spinner.succeed(`Found ${result.chapters.length} chapters in ${result.type.toUpperCase()}`);

    if (options.dryRun) {
      console.log('\nDry run - no conversion performed\n');
      console.log('Chapters detected:');
      result.chapters.forEach((ch, i) => {
        console.log(`  ${i + 1}. ${ch.title} (${ch.content.length} characters)`);
      });

      const totalChars = result.chapters.reduce((sum, ch) => sum + ch.content.length, 0);
      const estimatedCost = (totalChars / 1000000) * 30;
      console.log(`\nTotal characters: ${totalChars.toLocaleString()}`);
      console.log(`Estimated cost: $${estimatedCost.toFixed(2)} (approximate)`);
      return;
    }

    await ensureOutputDir(options.output);

    const stateManager = new StateManager();
    let state: ConversionState | null = null;

    if (options.force) {
      await stateManager.clear(options.output);
      console.log('Starting fresh conversion (--force flag used)\n');
    } else {
      state = await stateManager.load(options.output);

      if (state && !options.resume) {
        console.log('\nFound existing conversion state:');
        console.log(`  Source: ${state.source}`);
        console.log(`  Progress: ${state.completedChapters.length}/${state.totalChapters} chapters completed`);
        console.log(`  Failed: ${state.failedChapters.length} chapters`);
        console.log(`  Started: ${new Date(state.timestamp).toLocaleString()}`);
        console.log('\nUse --resume to continue or --force to start fresh\n');
        process.exit(0);
      }
    }

    if (state && options.resume) {
      console.log(`Resuming conversion: ${state.completedChapters.length}/${state.totalChapters} chapters already completed\n`);
    } else {
      state = {
        source: input,
        completedChapters: [],
        failedChapters: [],
        timestamp: new Date().toISOString(),
        totalChapters: result.chapters.length
      };
      await stateManager.save(state, options.output);
    }

    for (let i = 0; i < result.chapters.length; i++) {
      const chapter = result.chapters[i];
      if (!chapter) continue;

      const progress = `${i + 1}/${result.chapters.length}`;

      if (stateManager.shouldSkipChapter(i, state)) {
        console.log(`Skipping chapter ${progress}: ${chapter.title} (already completed)`);
        continue;
      }

      try {
        spinner.start(`Converting chapter ${progress}: ${chapter.title}`);

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

        spinner.succeed(`Converted chapter ${progress}: ${chapter.title} → ${filePath}`);

        state.completedChapters.push(i);
        await stateManager.save(state, options.output);
      } catch (error) {
        spinner.fail(`Failed chapter ${progress}: ${chapter.title}`);
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`  Error: ${errorMsg}`);

        state.failedChapters.push({
          index: i,
          title: chapter.title,
          error: errorMsg
        });
        await stateManager.save(state, options.output);
      }
    }

    if (state.failedChapters.length === 0) {
      console.log(`\n✓ Successfully converted all ${result.chapters.length} chapters to ${options.output}`);
      await stateManager.clear(options.output);
    } else {
      console.log(`\n⚠ Converted ${state.completedChapters.length}/${result.chapters.length} chapters`);
      console.log(`Failed chapters: ${state.failedChapters.map(f => f.title).join(', ')}`);
      console.log('\nRun with --resume to retry failed chapters');
    }

  } catch (error) {
    spinner.fail('Conversion failed');
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`\nError: ${errorMsg}`);
    process.exit(1);
  }
}
