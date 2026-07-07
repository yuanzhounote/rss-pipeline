import { parseHTML } from 'linkedom';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import type { ArticleParser } from './types';

const nhm = new NodeHtmlMarkdown();

function isWeChatUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'mp.weixin.qq.com';
  } catch {
    return false;
  }
}

/**
 * 微信公众号文章解析器（适配移动端页面）
 *
 * 微信移动端页面特点：
 * - 标题在 #js_content 内的第一个 <h2>
 * - 正文在 <div id="js_content">
 * - 图片使用 src（桌面版用 data-src）
 * - 发布时间在 HTML script 中的 svr_time（Unix 时间戳）
 * - 作者/公众号在 <a id="js_name">
 */
export const wechatParser: ArticleParser = {
  name: 'wechat',
  canHandle: isWeChatUrl,

  async extract(url: string) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://mp.weixin.qq.com/',
      },
    });
    const html = await response.text();

    // 检测反爬验证页
    if (html.includes('环境异常') || html.includes('完成验证后即可继续访问')) {
      throw new Error('WeChat anti-bot verification page returned. Try again later or use browser rendering.');
    }

    const { document } = parseHTML(html, { url });

    // 1. 标题：优先 #js_content 内第一个 h2（微信移动版），其次 og:title
    let title = '';
    const jsContent = document.querySelector('#js_content');
    if (jsContent) {
      const firstH2 = jsContent.querySelector('h2');
      if (firstH2) {
        title = (firstH2.textContent || '').trim();
      }
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

    // 2. 作者/公众号
    let author: string | undefined;
    const jsName = document.querySelector('a#js_name');
    if (jsName) {
      author = (jsName.textContent || '').trim();
    } else {
      const nickname = document.querySelector('span.profile_nickname');
      if (nickname) {
        author = (nickname.textContent || '').trim();
      }
    }

    // 3. 发布时间：从 HTML 中的 svr_time 变量提取（Unix 时间戳）
    let publishedAt = new Date();
    const svrTimeMatch = html.match(/var svr_time\s*=\s*['"]?(\d+)['"]?/);
    if (svrTimeMatch) {
      const timestamp = parseInt(svrTimeMatch[1], 10);
      if (!isNaN(timestamp) && timestamp > 1000000000) {
        publishedAt = new Date(timestamp * 1000);
      }
    } else {
      // 回退：从 HTML 中找 YYYY-MM-DD 格式日期
      const dateMatch = html.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        const parsed = new Date(dateMatch[1]);
        if (!isNaN(parsed.getTime())) {
          publishedAt = parsed;
        }
      }
    }

    // 4. 正文提取
    // 微信文章直接用 #js_content，Readability 对微信移动版结构容易误判
    let contentHtml = '';
    let summary: string | undefined;

    if (jsContent) {
      contentHtml = jsContent.innerHTML || '';
      const text = (jsContent.textContent || '').trim().slice(0, 200);
      if (text.length > 50) {
        summary = text + (text.length >= 200 ? '...' : '');
      }
    }

    if (!contentHtml) {
      throw new Error('Failed to extract WeChat article content');
    }

    // 5. 图片提取（移动端用 src）
    const images: string[] = [];
    const imgElements = Array.from(document.querySelectorAll('img')) as any[];
    for (const img of imgElements) {
      const src = img.src || img.getAttribute('data-src');
      if (src && src.startsWith('http') && !src.includes('mmbiz.qpic.cn/mmhead')) {
        // 排除公众号头像
        images.push(src);
      }
    }

    // 去重
    const uniqueImages = [...new Set(images)];

    // 6. 封面图：优先 og:image
    let cover: string | undefined;
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) {
      const ogImageUrl = ogImage.getAttribute('content');
      if (ogImageUrl) cover = ogImageUrl;
    }
    if (!cover && uniqueImages.length > 0) {
      cover = uniqueImages[0];
    }

    // 7. 转换为 Markdown
    const contentMd = nhm.translate(contentHtml);

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
