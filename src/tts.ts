import type { TTSOptions, TTSResponse } from './types';

const MAX_CHARS = 11000;

export async function convertToSpeech(
  text: string,
  options: TTSOptions
): Promise<TTSResponse> {
  // Single chunk path (fast)
  if (text.length <= MAX_CHARS) {
    return convertSingleChunk(text, options);
  }

  // Multi-chunk path with smart splitting
  const chunks = splitTextIntoChunks(text, MAX_CHARS);
  const audioBuffers: ArrayBuffer[] = [];

  for (const chunk of chunks) {
    const response = await convertSingleChunk(chunk, options);
    audioBuffers.push(response.audio);
  }

  // Concatenate MP3 buffers
  const totalLength = audioBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;

  for (const buf of audioBuffers) {
    combined.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }

  return {
    audio: combined.buffer,
    characters: text.length
  };
}

function splitTextIntoChunks(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChars;

    // Smart boundary detection (prefer sentence/paragraph breaks)
    if (end < text.length) {
      const searchEnd = Math.min(end + 100, text.length);
      const slice = text.substring(start, searchEnd);

      const sentenceEnd = slice.lastIndexOf('. ');
      const paragraphEnd = slice.lastIndexOf('\n\n');

      if (paragraphEnd > maxChars - 500) {
        end = start + paragraphEnd;
      } else if (sentenceEnd > maxChars - 200) {
        end = start + sentenceEnd + 1;
      }
    }

    chunks.push(text.substring(start, end).trim());
    start = end;
  }

  return chunks;
}

async function convertSingleChunk(
  text: string,
  options: TTSOptions
): Promise<TTSResponse> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${options.voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': options.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_flash_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    if (response.status === 401) {
      throw new Error('Invalid ElevenLabs API key. Check ELEVENLABS_API_KEY in .env');
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new Error(`Rate limit exceeded. Retry after ${retryAfter || 'unknown'} seconds.`);
    }

    if (response.status >= 500) {
      throw new Error(`ElevenLabs server error: ${response.statusText}`);
    }

    throw new Error(`ElevenLabs API error: ${response.statusText}. ${errorText}`);
  }

  const audio = await response.arrayBuffer();

  return {
    audio,
    characters: text.length
  };
}

export function getDefaultVoiceId(): string {
  return process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
}

export function getApiKey(): string {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    throw new Error(
      'ElevenLabs API key not found. Set ELEVENLABS_API_KEY in .env file.\n' +
      'Get your API key from: https://elevenlabs.io/'
    );
  }

  return apiKey;
}
