import ora from 'ora';
import { config } from 'dotenv';
import { parseInput } from '../parsers/parser';
import { convertToSpeech, getApiKey, getDefaultVoiceId } from '../tts';
import { saveMp3File, ensureOutputDir } from '../generator';
import { YotoValidator } from '../validators/yoto-validator';
import type { ConvertOptions } from '../types';

config();

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

    const validator = new YotoValidator();

    if (options.dryRun) {
      console.log('\nDry run - no conversion performed\n');
      console.log('Chapters detected:');
      result.chapters.forEach((ch, i) => {
        const estimatedMin = validator.estimateDuration(ch.content);
        const warn = estimatedMin > YotoValidator.MAX_DURATION_MINUTES ? ' ⚠ EXCEEDS LIMIT' : '';
        console.log(`  ${i + 1}. ${ch.title} (${ch.content.length} characters, ~${estimatedMin.toFixed(0)}min${warn})`);
      });

      const totalChars = result.chapters.reduce((sum, ch) => sum + ch.content.length, 0);
      const estimatedCost = (totalChars / 1000000) * 30;
      const { estimatedMB, withinLimit } = validator.validateEstimatedCardSize(result.chapters);
      console.log(`\nTotal characters: ${totalChars.toLocaleString()}`);
      console.log(`Estimated total size: ~${estimatedMB.toFixed(0)}MB`);
      console.log(`Estimated cost: $${estimatedCost.toFixed(2)} (approximate)`);

      const trackLimitOk = result.chapters.length <= YotoValidator.MAX_TRACKS;
      console.log('\nYoto compliance:');
      console.log(`  Tracks: ${result.chapters.length}/${YotoValidator.MAX_TRACKS} ${trackLimitOk ? '✓' : '⚠ EXCEEDS LIMIT'}`);
      console.log(`  Estimated card size: ${estimatedMB.toFixed(0)}MB/${YotoValidator.MAX_CARD_SIZE_MB}MB ${withinLimit ? '✓' : '⚠ MAY EXCEED LIMIT'}`);
      return;
    }

    spinner.start('Validating Yoto constraints...');
    validator.validateTrackCount(result.chapters);
    const { estimatedMB, withinLimit } = validator.validateEstimatedCardSize(result.chapters);
    if (withinLimit) {
      spinner.succeed('Yoto constraints validated');
    } else {
      spinner.warn(`Yoto constraints validated (estimated size ${estimatedMB.toFixed(0)}MB may exceed ${YotoValidator.MAX_CARD_SIZE_MB}MB limit)`);
    }

    await ensureOutputDir(options.output);

    const failed: string[] = [];

    for (let i = 0; i < result.chapters.length; i++) {
      const chapter = result.chapters[i];
      if (!chapter) continue;

      const progress = `${i + 1}/${result.chapters.length}`;

      try {
        spinner.start(`Converting chapter ${progress}: ${chapter.title}`);

        validator.validateEstimatedDuration(chapter.content, chapter.title);

        const ttsResponse = await convertToSpeech(chapter.content, {
          apiKey,
          voiceId,
          modelId: 'eleven_flash_v2_5'
        });

        validator.validateFileSize(ttsResponse.audio);

        const filePath = await saveMp3File(
          ttsResponse.audio,
          i,
          result.chapters.length,
          { outputDir: options.output }
        );

        spinner.succeed(`Converted chapter ${progress}: ${chapter.title} → ${filePath}`);
      } catch (error) {
        spinner.fail(`Failed chapter ${progress}: ${chapter.title}`);
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`  Error: ${errorMsg}`);
        failed.push(chapter.title);
      }
    }

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
