import ora from 'ora';
import { config } from 'dotenv';
import PQueue from 'p-queue';
import { parseInput } from '../parsers/parser';
import { convertToSpeech, getApiKey, getDefaultVoiceId } from '../tts';
import { saveMp3File, ensureOutputDir } from '../generator';
import type { ConvertOptions, ConversionResult } from '../types';
import { StateManager, type ConversionState } from '../services/state-manager';

config();

const DEFAULT_CONCURRENT_REQUESTS = 5;
const DEFAULT_REQUESTS_PER_SECOND = 3;

function getConcurrentRequests(): number {
  const envValue = process.env.CONCURRENT_REQUESTS;

  if (!envValue) {
    return DEFAULT_CONCURRENT_REQUESTS;
  }

  const parsed = Number.parseInt(envValue, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    console.warn(
      `Invalid CONCURRENT_REQUESTS value "${envValue}". Using minimum value of 1.`
    );
    return 1;
  }

  return parsed;
}

function getRequestsPerSecond(): number {
  const envValue = process.env.REQUESTS_PER_SECOND;

  if (!envValue) {
    return DEFAULT_REQUESTS_PER_SECOND;
  }

  const parsed = Number.parseInt(envValue, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    console.warn(
      `Invalid REQUESTS_PER_SECOND value "${envValue}". Using minimum value of 1.`
    );
    return 1;
  }

  return parsed;
}

const CONCURRENT_REQUESTS = getConcurrentRequests();
const REQUESTS_PER_SECOND = getRequestsPerSecond();

function displayCostSummary(
  chaptersCount: number,
  totalChars: number,
  estimatedCost: number,
  mode: 'normal' | 'resume' = 'normal',
  completedChapters?: number
): void {
  console.log('\n💰 Cost Estimate:');
  console.log(`  Chapters: ${chaptersCount}`);

  if (mode === 'resume' && completedChapters !== undefined) {
    const remainingChapters = chaptersCount - completedChapters;
    console.log(`  Completed: ${completedChapters}`);
    console.log(`  Remaining: ${remainingChapters}`);
  }

  console.log(`  Characters: ${totalChars.toLocaleString()}`);
  console.log(`  Estimated cost: $${estimatedCost.toFixed(2)} (approximate)`);
  console.log('  Note: Actual cost may vary based on your ElevenLabs plan\n');
}

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

    // Calculate cost for display (only show resume mode when --resume is used)
    let displayChars = totalChars;
    let displayCost = estimatedCost;
    let displayMode: 'normal' | 'resume' = 'normal';
    let completedCount = 0;

    if (options.resume && state.completedChapters.length > 0) {
      // Use Set for O(1) lookup performance
      const completedChaptersSet = new Set(state.completedChapters);
      const remainingChapters = result.chapters.filter((_, i) =>
        !completedChaptersSet.has(i)
      );
      displayChars = remainingChapters.reduce((sum, ch) => sum + ch.content.length, 0);
      displayCost = (displayChars / 1000000) * 30;
      completedCount = state.completedChapters.length;
      displayMode = 'resume';
    }

    // Display cost summary (skip in JSON mode - cost is in result)
    if (!isJsonMode) {
      displayCostSummary(result.chapters.length, displayChars, displayCost, displayMode, completedCount);
    }

    // Check if confirmation needed (after state handling)
    // JSON mode auto-confirms, dry-run doesn't need confirmation
    const needsConfirmation = !options.yes && !isJsonMode;

    if (needsConfirmation) {
      console.log('⚠  To proceed with conversion, add the --yes flag:');
      console.log(`   linkin-lark convert "${input}" --yes`);
      if (options.resume) {
        console.log(`   With resume: linkin-lark convert "${input}" --resume --yes`);
      }
      console.log('\n💡 Tip: Use --dry-run to preview without converting\n');
      return; // Graceful exit, exit code 0
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

    // Configure queue with concurrency AND rate limiting
    const queue = new PQueue({
      concurrency: CONCURRENT_REQUESTS,
      intervalCap: REQUESTS_PER_SECOND,
      interval: 1000 // 1 second
    });

    let completed = 0;

    // Use single overall spinner for progress, not per-task spinners
    if (spinner) spinner.start(`Converting ${result.chapters.length} chapters (0/${result.chapters.length})`);

    const tasks = result.chapters.map((chapter, i) =>
      queue.add(async () => {
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
          completed++;
          if (spinner) spinner.text = `Converting ${result.chapters.length} chapters (${completed}/${result.chapters.length})`;
          return;
        }

        try {
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

          state!.completedChapters.push(i);

          // Remove from failedChapters if it was previously failed (retry success)
          state!.failedChapters = state!.failedChapters.filter(f => f.index !== i);

          await stateManager.save(state!, options.output);

          conversionResult.chapters.push({
            index: i,
            title: chapter.title,
            characters: ttsResponse.characters,
            filePath
          });

          completed++;
          if (spinner) spinner.text = `Converting ${result.chapters.length} chapters (${completed}/${result.chapters.length})`;
          console.log(`  ✓ Chapter ${progress}: ${chapter.title} → ${filePath}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);

          state!.failedChapters.push({
            index: i,
            title: chapter.title,
            error: errorMsg
          });
          await stateManager.save(state!, options.output);

          conversionResult.success = false;
          conversionResult.chapters.push({
            index: i,
            title: chapter.title,
            characters: chapter.content.length,
            error: errorMsg
          });

          completed++;
          if (spinner) spinner.text = `Converting ${result.chapters.length} chapters (${completed}/${result.chapters.length})`;
          console.log(`  ✗ Chapter ${progress}: ${chapter.title} - ${errorMsg}`);
        }
      })
    );

    await Promise.all(tasks);
    if (spinner) spinner.stop();

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
