# linkin-lark

Convert HTML books and PDF documents into high-quality MP3 audiobooks for Yoto MakeYourOwn cards.

Built with Bun + TypeScript, powered by ElevenLabs TTS for natural narration.

## Features

- **Dual Format Support**: Convert HTML books from URLs or local PDF files
- **Smart Chapter Detection**:
  - HTML: Automatic h1/h2 tag detection with fallback strategies
  - PDF: Table of contents parsing with page-based fallback
- **High-Quality Audio**: ElevenLabs TTS for natural narration
- **Yoto Compatible**: MP3 files optimized for Yoto MakeYourOwn constraints
- **Progress Tracking**: Visual spinners showing conversion progress
- **Dry Run Mode**: Preview chapters and estimate costs before converting
- **Error Recovery**: Failed chapters don't block other conversions

## Installation

### Prerequisites

- [Bun](https://bun.com) 1.x or later
- [ElevenLabs API key](https://elevenlabs.io/) (free tier available)

### Install Dependencies

```bash
bun install
```

### Configure API Key

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and add your ElevenLabs API key:
```bash
ELEVENLABS_API_KEY=your_api_key_here
```

Get your API key from: https://elevenlabs.io/

## Usage

### CLI Usage

#### Convert HTML Book

```bash
bun run src/cli.ts convert https://basecamp.com/shapeup
```

### Convert PDF File

```bash
bun run src/cli.ts convert ~/Downloads/book.pdf
```

### With Options

```bash
# Specify output directory
bun run src/cli.ts convert https://basecamp.com/shapeup --output ~/yoto-books/shapeup

# Use specific voice
bun run src/cli.ts convert book.pdf --voice rachel

# Set bitrate (default: 128kbps)
bun run src/cli.ts convert book.pdf --bitrate 192

# Configure pages per chapter for PDFs without TOC
bun run src/cli.ts convert book.pdf --pages-per-chapter 15
```

#### Dry Run (Preview Only)

```bash
# See chapter structure and cost estimate without converting
bun run src/cli.ts convert https://basecamp.com/shapeup --dry-run
```

#### JSON Output Mode

```bash
# Get structured JSON output for programmatic parsing
bun run src/cli.ts convert https://basecamp.com/shapeup --format json

# Dry run with JSON output
bun run src/cli.ts convert book.pdf --dry-run --format json
```

### Library Usage

You can import and use linkin-lark programmatically in your TypeScript/JavaScript applications:

```typescript
import { parseInput, convertToSpeech, saveMp3File, ensureOutputDir } from 'linkin-lark';

async function convertBook() {
  const input = 'https://example.com/book';
  const outputDir = './output';

  await ensureOutputDir(outputDir);

  const result = await parseInput(input);
  console.log(`Parsed ${result.chapters.length} chapters from ${result.source}`);

  for (const [i, chapter] of result.chapters.entries()) {
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

convertBook().catch(console.error);
```

#### Available Exports

```typescript
// Types
import type {
  Chapter,
  ConvertOptions,
  TTSOptions,
  ParserResult,
  TTSResponse,
  GeneratorOptions,
  ConversionResult
} from 'linkin-lark';

// Parsing
import { parseInput } from 'linkin-lark';

// Text-to-Speech
import { convertToSpeech, getApiKey, getDefaultVoiceId } from 'linkin-lark';

// File Generation
import { saveMp3File, generateFileName, ensureOutputDir } from 'linkin-lark';

// HTML Cleaning
import { cleanHTMLContent } from 'linkin-lark';
```

## Yoto Compatibility

MP3 files are generated with the following constraints to ensure Yoto MakeYourOwn compatibility:

**Per Track:**
- Max file size: 100MB
- Max duration: 60 minutes
- Format: MP3 (128-192 kbps recommended)

**Per Card:**
- Max total size: 500MB
- Max total duration: 5 hours
- Max tracks: 100

**File Naming:** Files are named with zero-padded numbers (01.mp3, 02.mp3, etc.) to ensure correct playback order on Yoto.

## How It Works

### HTML Books

1. Fetches HTML content from URL
2. Parses structure with Cheerio
3. Detects chapters using h1/h2 tags containing keywords like "chapter", "section", "prologue"
4. Cleans content (removes navigation, ads, scripts)
5. Converts each chapter to audio via ElevenLabs
6. Saves as sequentially named MP3 files

**Fallback:** If fewer than 5 chapters detected, treats entire book as single chapter.

### PDF Files

1. Reads local PDF file
2. Extracts text with pdf-parse
3. Parses table of contents/bookmarks if available
4. Falls back to page-based splitting (10 pages per chapter by default)
5. Converts each chapter to audio via ElevenLabs
6. Saves as sequentially named MP3 files

## Examples

```bash
# Convert Shape Up book
bun run src/cli.ts convert https://basecamp.com/shapeup

# Preview chapters and cost
bun run src/cli.ts convert https://basecamp.com/shapeup --dry-run

# Convert local PDF with custom settings
bun run src/cli.ts convert ~/Downloads/ruby-book.pdf \
  --output ~/yoto-books/ruby \
  --voice rachel \
  --bitrate 128

# PDF without TOC (use page-based splitting)
bun run src/cli.ts convert manual.pdf --pages-per-chapter 20
```

## Configuration

### Environment Variables

Create a `.env` file (copy from `.env.example`):

```bash
# Required
ELEVENLABS_API_KEY=your_api_key_here

# Optional
ELEVENLABS_VOICE_ID=rachel
ELEVENLABS_MODEL_ID=eleven_flash_v2_5
```

### Voice IDs

Find available voice IDs at: https://elevenlabs.io/docs/voices

Default voice: EXAVITQu4vr4xnSDxMaL (Rachel)

### Models

- `eleven_flash_v2_5` (default) - Fastest, ~75ms latency
- `eleven_multilingual_v2` - Best quality, more expressive

## Cost Estimation

ElevenLabs pricing (as of 2026):
- Free: 10k characters/month
- Starter: $5/mo, 30k characters
- Pro: $99/mo, 500k characters

Average book: ~200k characters ≈ $0.15-0.50 depending on tier.

Use `--dry-run` to see exact character count and cost estimate before converting.

## Troubleshooting

### "Invalid ElevenLabs API key"

Make sure `ELEVENLABS_API_KEY` is set in `.env` file. Get your key from https://elevenlabs.io/

### "Rate limit exceeded"

You've hit ElevenLabs API rate limits. Wait or upgrade your plan. The tool will show retry-after time.

### No chapters detected (HTML)

Try:
1. Check if the book uses h1/h2 tags for chapters
2. The tool falls back to treating the whole book as one chapter
3. Future: custom selectors will be supported

### PDF has no TOC

Use `--pages-per-chapter` to split by page count:
```bash
bun run src/cli.ts convert book.pdf --pages-per-chapter 15
```

## Development

```bash
# Run with Bun
bun run src/cli.ts convert <input>

# Compile to standalone executable
bun build ./src/cli.ts --compile --outfile linkin-lark
```

## License

MIT

## Credits

Built with:
- [Bun](https://bun.com) - Fast JavaScript runtime
- [Commander.js](https://github.com/tj/commander.js) - CLI framework
- [Cheerio](https://cheerio.js.org/) - HTML parsing
- [pdf-parse](https://www.npmjs.com/package/pdf-parse) - PDF text extraction
- [ElevenLabs](https://elevenlabs.io/) - Text-to-speech API
- [Ora](https://github.com/sindresorhus/ora) - Terminal spinners
