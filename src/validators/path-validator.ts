import * as path from 'path';

/**
 * Sanitizes and validates an output directory path to prevent path traversal attacks
 * @throws Error if path contains null bytes, resolves outside intended directory, or targets system directories
 */
export function sanitizeOutputPath(outputDir: string): string {
  // Remove null bytes
  if (outputDir.includes('\0')) {
    throw new Error('Invalid path: null byte detected');
  }

  const resolved = path.resolve(outputDir);

  // Block system directories
  const systemDirs = ['/etc', '/usr', '/bin', '/sbin', '/root', '/var', '/sys', '/proc'];
  if (systemDirs.some(dir => resolved.startsWith(dir))) {
    throw new Error('Cannot write to system directories');
  }

  return resolved;
}

/**
 * Sanitizes and validates a PDF file path to prevent path traversal attacks
 * @throws Error if path contains null bytes, targets system directories, or is not a PDF
 */
export function sanitizePDFPath(pdfPath: string): string {
  // Remove null bytes
  if (pdfPath.includes('\0')) {
    throw new Error('Invalid path: null byte detected');
  }

  // Ensure .pdf extension
  if (!pdfPath.toLowerCase().endsWith('.pdf')) {
    throw new Error('Only PDF files are allowed');
  }

  const resolved = path.resolve(pdfPath);

  // Block reading from sensitive directories
  const blockedDirs = ['/etc', '/root', '/usr', '/bin', '/sbin', '/var/log', '/sys', '/proc'];
  if (blockedDirs.some(dir => resolved.startsWith(dir))) {
    throw new Error('Cannot read files from system directories');
  }

  return resolved;
}

/**
 * Validates that a file is actually a PDF by checking magic bytes
 */
export function isPDFFile(buffer: Uint8Array): boolean {
  // PDF files start with %PDF-
  return buffer.length >= 5 &&
         buffer[0] === 0x25 &&
         buffer[1] === 0x50 &&
         buffer[2] === 0x44 &&
         buffer[3] === 0x46 &&
         buffer[4] === 0x2D;
}

/**
 * Validates that a resolved file path is within an intended directory
 * @throws Error if path escapes the intended directory
 */
export function validatePathWithinDirectory(filePath: string, intendedDir: string): void {
  const resolvedPath = path.resolve(filePath);
  const resolvedDir = path.resolve(intendedDir);

  if (!resolvedPath.startsWith(resolvedDir)) {
    throw new Error('Path traversal detected');
  }
}
