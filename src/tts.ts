import type { TTSOptions, TTSResponse } from './types';

export async function convertToSpeech(
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
        model_id: options.modelId || 'eleven_flash_v2_5',
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
