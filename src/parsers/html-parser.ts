import * as cheerio from 'cheerio';
import type { Chapter, ParserResult } from '../types';

export async function parseHTML(url: string): Promise<ParserResult> {
  const html = await fetchHTML(url);
  const chapters = detectHTMLChapters(html);

  return {
    chapters,
    source: url,
    type: 'html'
  };
}

async function fetchHTML(url: string): Promise<string> {
  // Validate URL and block SSRF
  const parsedUrl = new URL(url);

  // Whitelist protocols
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`);
  }

  // Block private IP ranges and internal hosts
  const hostname = parsedUrl.hostname;
  const blockedPatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^169\.254\./,  // AWS metadata
    /^0\./,
    /^\[::/,        // IPv6 localhost
    /^fc00:/,       // IPv6 private
  ];

  if (blockedPatterns.some(pattern => pattern.test(hostname))) {
    throw new Error(`Access to private/internal hosts not allowed: ${hostname}`);
  }

  // Add timeout and size limit
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual'  // Don't follow redirects automatically
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    // Check content length
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) {
      throw new Error('Content too large (max 50MB)');
    }

    return response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

function detectHTMLChapters(html: string): Chapter[] {
  const $ = cheerio.load(html);

  $('script, style, nav, header, footer, .ad, [class*="ad-"]').remove();
  $('[class*="toc"], [class*="table-of-contents"], [id*="toc"]').remove();
  $('[class*="sidebar"], [class*="menu"]').remove();

  const chapters: Chapter[] = [];

  $('h1, h2').each((i, el) => {
    const $el = $(el);
    const text = $el.text();

    if (/chapter|section|prologue|epilogue|part/i.test(text) || $el.hasClass('chapter')) {
      const title = text.trim();
      const content = extractContentUntilNext($, el);

      chapters.push({ title, content });
    }
  });

  if (chapters.length < 5) {
    const mainContent = $('main, article, .content').first();
    const content = mainContent.length ? mainContent.html() || '' : $('body').html() || '';
    const cleanedContent = cleanHTMLContent(content);

    return [{ title: 'Full Book', content: cleanedContent }];
  }

  return chapters.map(ch => ({
    ...ch,
    content: cleanHTMLContent(ch.content)
  }));
}

function extractContentUntilNext($: cheerio.CheerioAPI, element: cheerio.Element): string {
  const $el = $(element);
  const tagName = 'tagName' in element ? element.tagName : 'div';
  let content = '';

  $el.nextUntil(`${tagName}, h1, h2`).each((_, nextEl) => {
    content += $(nextEl).html() || '';
  });

  return content;
}

function cleanHTMLContent(html: string): string {
  const $content = cheerio.load(html);

  $content('a[href^="#"]').remove();

  $content('*').contents().filter(function() {
    return this.type === 'comment';
  }).remove();

  let text = $content('body').text();

  text = text.replace(/\s+/g, ' ').trim();

  return text;
}
