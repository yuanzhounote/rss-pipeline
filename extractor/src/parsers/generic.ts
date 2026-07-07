import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import type { ArticleParser } from './types';

const nhm = new NodeHtmlMarkdown();

export const genericParser: ArticleParser = {
  name: 'generic',
  canHandle: () => true,
  async extract(url: string) {
    const response = await fetch(url);
    const html = await response.text();

    const { document } = parseHTML(html, { url });

    const reader = new Readability(document);
    const article = reader.parse();

    if (!article) {
      throw new Error('Readability returned null');
    }

    const images = (Array.from(document.querySelectorAll('img')) as any[])
      .map((img: any) => img.src)
      .filter(src => src.startsWith('http'));

    let publishedAt = new Date();
    const metaTime = document.querySelector('meta[property="article:published_time"]')
      || document.querySelector('meta[name="pubdate"]')
      || document.querySelector('meta[name="date"]');
    if (metaTime) {
      const content = metaTime.getAttribute('content');
      if (content) publishedAt = new Date(content);
    } else {
      const timeElement = document.querySelector('time[datetime]');
      if (timeElement) {
        const datetime = timeElement.getAttribute('datetime');
        if (datetime) publishedAt = new Date(datetime);
      }
    }

    const contentMd = nhm.translate(article.content || '');

    return {
      title: article.title || 'Untitled',
      author: article.byline || undefined,
      summary: article.excerpt || undefined,
      cover: images[0] || undefined,
      content_html: article.content || '',
      content_md: contentMd,
      images,
      published_at: publishedAt,
    };
  },
};
