import ora from 'ora';
import { config } from 'dotenv';
import PQueue from 'p-queue';
import { parseInput } from '../parsers/parser';
import { convertToSpeech, getApiKey, getDefaultVoiceId } from '../tts';
import { saveMp3File, ensureOutputDir } from '../generator';
import type { ConvertOptions } from '../types';

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

    // Configure queue with concurrency AND rate limiting
    const queue = new PQueue({
      concurrency: CONCURRENT_REQUESTS,
      intervalCap: REQUESTS_PER_SECOND,
      interval: 1000 // 1 second
    });

    const failed: string[] = [];
    let completed = 0;

    // Use single overall spinner for progress, not per-task spinners
    spinner.start(`Converting ${result.chapters.length} chapters (0/${result.chapters.length})`);

    const tasks = result.chapters.map((chapter, i) =>
      queue.add(async () => {
        const progress = `${i + 1}/${result.chapters.length}`;

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

          completed++;
          // Update overall progress without stopping spinner
          spinner.text = `Converting ${result.chapters.length} chapters (${completed}/${result.chapters.length})`;
          console.log(`  ✓ Chapter ${progress}: ${chapter.title} → ${filePath}`);
        } catch (error) {
          completed++;
          spinner.text = `Converting ${result.chapters.length} chapters (${completed}/${result.chapters.length})`;
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.log(`  ✗ Chapter ${progress}: ${chapter.title} - ${errorMsg}`);
          failed.push(chapter.title);
        }
      })
    );

    await Promise.all(tasks);
    spinner.stop();

    if (failed.length === 0) {
      console.log(`\n✓ Successfully converted all ${result.chapters.length} chapters to ${options.output}`);
    } else {
      console.log(`\n⚠ Converted ${result.chapters.length - failed.length}/${result.chapters.length} chapters`);
      console.log('Failed chapters:', failed.join(', '));
    }

  } catch (error) {
    spinner.fail('Conversion failed');
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`\nError: ${errorMsg}`);
    process.exit(1);
  }
}
