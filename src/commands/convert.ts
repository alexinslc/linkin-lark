import ora from 'ora';
import { config } from 'dotenv';
import PQueue from 'p-queue';
import { parseInput } from '../parsers/parser';
import { convertToSpeech, getApiKey, getDefaultVoiceId } from '../tts';
import { saveMp3File, ensureOutputDir } from '../generator';
import type { ConvertOptions } from '../types';

config();

const ELEVENLABS_MAX_REQUESTS_PER_MINUTE = 50;
const ELEVENLABS_MIN_INTERVAL = 60_000 / ELEVENLABS_MAX_REQUESTS_PER_MINUTE;

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

    const failed: string[] = [];

    const queue = new PQueue({
      concurrency: 3,
      interval: ELEVENLABS_MIN_INTERVAL,
      intervalCap: 1
    });

    for (let i = 0; i < result.chapters.length; i++) {
      const chapter = result.chapters[i];
      const chapterIndex = i;
      const progress = `${i + 1}/${result.chapters.length}`;

      queue.add(async () => {
        try {
          console.log(`Converting chapter ${progress}: ${chapter.title} (${queue.size} queued)`);

          const ttsResponse = await convertToSpeech(chapter.content, {
            apiKey,
            voiceId,
            modelId: options.modelId ?? 'eleven_flash_v2_5'
          });

          const filePath = await saveMp3File(
            ttsResponse.audio,
            chapterIndex,
            result.chapters.length,
            { outputDir: options.output }
          );

          console.log(`✓ Converted chapter ${progress}: ${chapter.title} → ${filePath}`);
        } catch (error) {
          console.error(`✗ Failed chapter ${progress}: ${chapter.title}`);
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`  Error: ${errorMsg}`);
          failed.push(chapter.title);
        }
      });
    }

    await queue.onIdle();

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
