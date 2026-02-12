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

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) continue;

    try {
      const response = await convertSingleChunk(chunk, options);
      audioBuffers.push(response.audio);
    } catch (error) {
      throw new Error(`Failed to convert chunk ${i + 1}/${chunks.length}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Concatenate MP3 buffers (simple byte concatenation - works for MP3 format)
  // Note: This approach works because MP3 frames are self-contained
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

    // Find optimal split point: prefer paragraph breaks, then sentence breaks
    // Searches forward up to 500 chars to find natural boundaries
    if (end < text.length) {
      const searchEnd = Math.min(end + 500, text.length);
      const slice = text.substring(start, searchEnd);

      // Use regex to find sentence boundaries (period followed by space)
      let sentenceEnd = -1;
      const regex = /\.\s/g;
      let match;
      while ((match = regex.exec(slice)) !== null) {
        sentenceEnd = match.index + 1;
      }
      const paragraphEnd = slice.lastIndexOf('\n\n');

      // Prefer boundaries closest to the limit, within tolerance range
      // Ensure end always advances to prevent infinite loops
      if (paragraphEnd > maxChars - 500 && paragraphEnd > 0) {
        end = start + paragraphEnd;
      } else if (sentenceEnd > maxChars - 200) {
        end = start + sentenceEnd + 1;
      }
    }

    // Ensure end always advances
    if (end <= start) {
      end = start + maxChars;
    }

    const chunk = text.substring(start, end);

    // Only trim first chunk's start and last chunk's end to preserve internal whitespace
    const trimmedChunk = start === 0
      ? chunk.trimStart()
      : (end >= text.length ? chunk.trimEnd() : chunk);

    // Validate non-whitespace chunks
    if (trimmedChunk.trim().length > 0) {
      chunks.push(trimmedChunk);
    }

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
