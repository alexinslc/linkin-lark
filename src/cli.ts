#!/usr/bin/env bun
import { Command } from 'commander';
import { convertCommand } from './commands/convert';

const program = new Command();

program
  .name('linkin-lark')
  .description('Convert HTML books and PDFs to MP3 audiobooks for Yoto player')
  .version('1.0.0');

program
  .command('convert')
  .description('Convert a book to audio')
  .argument('<input>', 'URL or PDF file path')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('-v, --voice <id>', 'ElevenLabs voice ID')
  .option('-p, --pages-per-chapter <number>', 'Pages per chapter for PDFs without TOC', '10')
  .option('--dry-run', 'Preview chapters and cost without conversion')
  .option('--resume', 'Resume from previous state')
  .option('--force', 'Ignore previous state and start fresh')
  .action(convertCommand);

program.parse();
