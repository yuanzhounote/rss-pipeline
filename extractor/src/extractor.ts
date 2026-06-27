import { createClient } from '@supabase/supabase-js';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  IMAGES: R2Bucket;
}

interface QueueMessage {
  id: string;
  body: {
    articleId: number;
    sourceUrl: string;
  };
}

interface ArticleParser {
  name: string;
  canHandle(url: string): boolean;
  extract(url: string): Promise<{
    title: string;
    author?: string;
    summary?: string;
    cover?: string;
    content_html: string;
    content_md: string;
    images: string[];
    published_at?: Date;
  }>;
}

// 通用解析器
const genericParser: ArticleParser = {
  name: 'generic',
  canHandle: () => true,
  async extract(url: string) {
    const response = await fetch(url);
    const html = await response.text();
    
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    
    if (!article) {
      throw new Error('Failed to parse article');
    }
    
    const images = Array.from(dom.window.document.querySelectorAll('img'))
      .map(img => img.src)
      .filter(src => src.startsWith('http'));
    
    // 提取发布时间
    let publishedAt = new Date();
    const metaTime = dom.window.document.querySelector('meta[property="article:published_time"]')
      || dom.window.document.querySelector('meta[name="pubdate"]')
      || dom.window.document.querySelector('meta[name="date"]');
    if (metaTime) {
      const content = metaTime.getAttribute('content');
      if (content) publishedAt = new Date(content);
    } else {
      const timeElement = dom.window.document.querySelector('time[datetime]');
      if (timeElement) {
        const datetime = timeElement.getAttribute('datetime');
        if (datetime) publishedAt = new Date(datetime);
      }
    }
    
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
    const contentMd = turndownService.turndown(article.content || '');
    
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

// 解析器列表
const parsers: ArticleParser[] = [genericParser];

function getParserForUrl(url: string): ArticleParser {
  for (const parser of parsers) {
    if (parser.canHandle(url)) {
      return parser;
    }
  }
  return genericParser;
}

export default {
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    
    for (const message of batch.messages) {
      const body = message.body as any;
      const { articleId, sourceUrl } = body;
      
      try {
        // 更新状态为extracting
        await supabase
          .from('articles')
          .update({ status: 'extracting', updated_at: new Date().toISOString() })
          .eq('id', articleId);
        
        // 获取合适的解析器
        const parser = getParserForUrl(sourceUrl);
        
        // 解析文章
        const result = await parser.extract(sourceUrl);
        
        // 更新状态为uploading
        await supabase
          .from('articles')
          .update({ status: 'uploading', updated_at: new Date().toISOString() })
          .eq('id', articleId);
        
        // 这里应该处理图片上传到R2，但MVP先跳过
        // 直接更新为ready状态
        await supabase
          .from('articles')
          .update({
            title: result.title,
            author: result.author,
            summary: result.summary,
            cover: result.cover,
            content_html: result.content_html,
            content_md: result.content_md,
            status: 'ready',
            updated_at: new Date().toISOString(),
          })
          .eq('id', articleId);
        
        message.ack();
      } catch (error) {
        console.error(`Failed to extract article ${articleId}:`, error);
        
        // 更新状态为failed
        await supabase
          .from('articles')
          .update({
            status: 'failed',
            error: (error as Error).message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', articleId);
        
        message.retry();
      }
    }
  },
};