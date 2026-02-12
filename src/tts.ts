import type { TTSOptions, TTSResponse } from './types';

const MAX_RETRIES = 3;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function convertToSpeech(
  text: string,
  options: TTSOptions
): Promise<TTSResponse> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
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
            model_id: options.modelId ?? 'eleven_flash_v2_5',
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
          const retryAfterHeader = response.headers.get('Retry-After');
          let retryAfter = 5;

          if (retryAfterHeader) {
            const parsedSeconds = parseInt(retryAfterHeader, 10);
            if (!isNaN(parsedSeconds)) {
              retryAfter = parsedSeconds;
            } else {
              const httpDate = new Date(retryAfterHeader);
              if (!isNaN(httpDate.getTime())) {
                retryAfter = Math.max(1, Math.ceil((httpDate.getTime() - Date.now()) / 1000));
              }
            }
          }

          if (attempt < MAX_RETRIES) {
            console.warn(`Rate limited, waiting ${retryAfter}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
            await sleep(retryAfter * 1000);
            continue;
          }

          throw new Error(`Rate limit exceeded after ${MAX_RETRIES} retries.`);
        }

        if (response.status >= 500) {
          if (attempt < MAX_RETRIES) {
            const delay = 2000 * Math.pow(2, attempt);
            console.warn(`Server error, retrying in ${delay}ms (${attempt + 1}/${MAX_RETRIES})...`);
            await sleep(delay);
            continue;
          }
          throw new Error(`ElevenLabs server error: ${response.statusText}`);
        }

        throw new Error(`ElevenLabs API error: ${response.statusText}. ${errorText}`);
      }

      const audio = await response.arrayBuffer();

      return {
        audio,
        characters: text.length
      };

    } catch (error) {
      if (attempt === MAX_RETRIES) {
        throw error;
      }

      if (error instanceof Error && error.message.includes('API key')) {
        throw error;
      }

      if (error instanceof Error && error.message.includes('ElevenLabs API error')) {
        throw error;
      }

      const delay = 2000 * Math.pow(2, attempt);
      console.warn(`Network error, retrying in ${delay}ms (${attempt + 1}/${MAX_RETRIES}): ${error instanceof Error ? error.message : String(error)}`);
      await sleep(delay);
    }
  }

  throw new Error('Max retries exceeded');
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
