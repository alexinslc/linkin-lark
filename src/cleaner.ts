import * as cheerio from 'cheerio';

export function cleanHTMLContent(html: string): string {
  const $ = cheerio.load(html);

  $('script, style, nav, header, footer, .ad, [class*="ad-"]').remove();
  $('[class*="toc"], [class*="table-of-contents"], [id*="toc"]').remove();
  $('[class*="sidebar"], [class*="menu"]').remove();
  $('a[href^="#"]').remove();

  $('*').contents().filter(function() {
    return this.type === 'comment';
  }).remove();

  let text = $('body').text();

  text = text.replace(/\s+/g, ' ').trim();

  return text;
}
