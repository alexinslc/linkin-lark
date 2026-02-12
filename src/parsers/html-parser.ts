import * as cheerio from 'cheerio';
import type { Chapter, ParserResult } from '../types';
import { cleanHTMLContent } from '../cleaner';

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
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }

  return response.text();
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

      chapters.push({ title, content, index: i });
    }
  });

  if (chapters.length < 5) {
    const mainContent = $('main, article, .content').first();
    const content = mainContent.length ? mainContent.html() || '' : $('body').html() || '';
    const cleanedContent = cleanHTMLContent(content);

    return [{ title: 'Full Book', content: cleanedContent, index: 0 }];
  }

  return chapters.map(ch => ({
    ...ch,
    content: cleanHTMLContent(ch.content)
  }));
}

function extractContentUntilNext($: cheerio.CheerioAPI, element: cheerio.Element): string {
  const $el = $(element);
  const tagName = element.tagName;
  let content = '';

  $el.nextUntil(`${tagName}, h1, h2`).each((_, nextEl) => {
    content += $(nextEl).html() || '';
  });

  return content;
}
