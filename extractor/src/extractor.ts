import { createClient } from '@supabase/supabase-js';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { NodeHtmlMarkdown } from 'node-html-markdown';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
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

const genericParser: ArticleParser = {
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

const parsers: ArticleParser[] = [genericParser];
const nhm = new NodeHtmlMarkdown();

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
        await supabase
          .from('articles')
          .update({ status: 'extracting', updated_at: new Date().toISOString() })
          .eq('id', articleId);
        
        const parser = getParserForUrl(sourceUrl);
        const result = await parser.extract(sourceUrl);
        
        await supabase
          .from('articles')
          .update({ status: 'uploading', updated_at: new Date().toISOString() })
          .eq('id', articleId);
        
        await supabase
          .from('articles')
          .update({
            title: result.title,
            author: result.author,
            summary: result.summary,
            cover: result.cover,
            content_html: result.content_html,
            content_md: result.content_md,
            published_at: result.published_at?.toISOString() || new Date().toISOString(),
            status: 'ready',
            updated_at: new Date().toISOString(),
          })
          .eq('id', articleId);
        
        message.ack();
      } catch (error) {
        console.error(`Failed to extract article ${articleId}:`, error);

        const attempts = (message as any).attempts ?? 1;

        if (attempts >= 3) {
          await supabase
            .from('articles')
            .update({
              status: 'failed',
              error: (error as Error).message,
              updated_at: new Date().toISOString(),
            })
            .eq('id', articleId);
          message.ack();
        } else {
          message.retry();
        }
      }
    }
  },
};
