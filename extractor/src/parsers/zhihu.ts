import { parseHTML } from 'linkedom';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import type { ArticleParser } from './types';

const nhm = new NodeHtmlMarkdown();

function isZhihuUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'zhuanlan.zhihu.com' || u.hostname === 'www.zhihu.com';
  } catch {
    return false;
  }
}

/**
 * 知乎专栏/文章解析器
 *
 * 注意：知乎有严格的反爬机制（zh-zse-ck JS 校验），
 * 在 Cloudflare Workers 环境中可能无法直接获取内容。
 * 本解析器会尝试多种方式，并在失败时抛出清晰的错误。
 */
export const zhihuParser: ArticleParser = {
  name: 'zhihu',
  canHandle: isZhihuUrl,

  async extract(url: string) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });
    const html = await response.text();

    // 检测反爬验证页
    if (html.includes('zh-zse-ck') || html.includes('完成验证后即可继续访问') || html.length < 1000) {
      throw new Error(
        'Zhihu anti-bot verification blocked the request. ' +
        'Zhihu requires JavaScript rendering which is not available in Workers environment. '
      );
    }

    const { document } = parseHTML(html, { url });

    // 1. 标题
    let title = '';
    const titleEl = document.querySelector('h1.Post-Title, h1.Title, .Post-Title h1');
    if (titleEl) {
      title = (titleEl.textContent || '').trim();
    }
    if (!title) {
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        title = (ogTitle.getAttribute('content') || '').trim();
      }
    }
    if (!title) {
      title = document.title || 'Untitled';
    }

    // 2. 作者
    let author: string | undefined;
    const authorEl = document.querySelector('.AuthorInfo-name, .UserLink-link, [data-za-detail-view-id="User"]');
    if (authorEl) {
      author = (authorEl.textContent || '').trim();
    }

    // 3. 发布时间
    let publishedAt = new Date();
    const timeEl = document.querySelector('time');
    if (timeEl) {
      const datetime = timeEl.getAttribute('datetime') || timeEl.textContent;
      if (datetime) {
        const parsed = new Date(datetime);
        if (!isNaN(parsed.getTime())) publishedAt = parsed;
      }
    }
    if (publishedAt.getTime() === new Date().getTime()) {
      const metaTime = document.querySelector('meta[property="article:published_time"]');
      if (metaTime) {
        const content = metaTime.getAttribute('content');
        if (content) {
          const parsed = new Date(content);
          if (!isNaN(parsed.getTime())) publishedAt = parsed;
        }
      }
    }

    // 4. 正文提取
    let contentHtml = '';
    const contentEl = document.querySelector('.Post-RichTextContainer, .RichText, article.Post-Main');
    if (contentEl) {
      contentHtml = contentEl.innerHTML || '';
    }

    if (!contentHtml) {
      throw new Error('Failed to extract Zhihu article content');
    }

    // 5. 图片处理：替换 data-actual-src 为实际 src，并收集图片 URL
    const images: string[] = [];

    // 在 contentHtml 中替换懒加载图片
    const tempDoc = parseHTML(contentHtml, { url });
    const imgs = Array.from(tempDoc.document.querySelectorAll('img')) as any[];
    for (const img of imgs) {
      const actualSrc = img.getAttribute('data-actual-src') || img.getAttribute('data-src') || img.src;
      if (actualSrc && actualSrc.startsWith('http')) {
        images.push(actualSrc);
        // 替换 src 属性为实际 URL
        img.setAttribute('src', actualSrc);
        img.removeAttribute('data-actual-src');
        img.removeAttribute('data-src');
      }
    }
    contentHtml = tempDoc.document.innerHTML || contentHtml;

    // 6. 封面图
    let cover: string | undefined;
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) {
      const ogImageUrl = ogImage.getAttribute('content');
      if (ogImageUrl) cover = ogImageUrl;
    }
    if (!cover && images.length > 0) {
      cover = images[0];
    }

    // 7. 摘要
    let summary: string | undefined;
    const text = contentEl?.textContent || '';
    const trimmed = text.trim().slice(0, 200);
    if (trimmed.length > 50) {
      summary = trimmed + (trimmed.length >= 200 ? '...' : '');
    }

    // 8. 转换为 Markdown
    const contentMd = nhm.translate(contentHtml);

    const uniqueImages = [...new Set(images)];

    return {
      title,
      author: author || undefined,
      summary,
      cover,
      content_html: contentHtml,
      content_md: contentMd,
      images: uniqueImages,
      published_at: publishedAt,
    };
  },
};
