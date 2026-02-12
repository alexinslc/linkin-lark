import { parseInput, convertToSpeech, saveMp3File, ensureOutputDir } from '../src/index';

async function example() {
  const input = 'https://example.com/book';
  const outputDir = './output';

  await ensureOutputDir(outputDir);

  const result = await parseInput(input);
  console.log(`Parsed ${result.chapters.length} chapters from ${result.source}`);

  for (let i = 0; i < result.chapters.length; i++) {
    const chapter = result.chapters[i];
    if (!chapter) continue;

    const audio = await convertToSpeech(chapter.content, {
      apiKey: process.env.ELEVENLABS_API_KEY!,
      voiceId: process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'
    });

    console.log(`Chapter ${i + 1}: ${audio.characters} characters`);

    const filePath = await saveMp3File(
      audio.audio,
      i,
      result.chapters.length,
      { outputDir }
    );

    console.log(`Saved: ${filePath}`);
  }
}

example().catch(console.error);
