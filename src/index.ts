import { createClient } from '@supabase/supabase-js';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  R2_PUBLIC_URL: string;
}

interface Article {
  id?: number;
  source_url: string;
  source_type: string;
  title: string;
  author?: string;
  summary?: string;
  cover?: string;
  content_html: string;
  content_md: string;
  status: string;
  error?: string;
  tags?: string[];
  published_at?: string;
  created_at?: string;
  updated_at?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (request.method === 'POST' && url.pathname === '/webhook/telegram') {
      return handleTelegramWebhook(request, env);
    }
    
    if (request.method === 'GET' && url.pathname === '/rss.xml') {
      return handleRSS(env);
    }
    
    return new Response('Not Found', { status: 404 });
  },
};

async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as any;
  
  // 提取消息中的URL
  const message = body.message;
  if (!message || !message.text) {
    return new Response('No text in message');
  }
  
  const text = message.text;
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) {
    return new Response('No URL found in message');
  }
  
  const sourceUrl = urlMatch[0];
  
  // 初始化Supabase客户端
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  
  // 插入文章记录，状态为pending
  const { data, error } = await supabase
    .from('articles')
    .insert({
      source_url: sourceUrl,
      source_type: 'generic', // 初始为通用，后续可识别
      status: 'pending',
    })
    .select()
    .single();
  
  if (error) {
    return new Response(`Database error: ${error.message}`, { status: 500 });
  }
  
  // 这里应该发送消息到Cloudflare Queue，但MVP先同步解析
  // 直接调用解析函数
  try {
    const article = await extractArticle(sourceUrl);
    // 更新文章记录
    const { error: updateError } = await supabase
      .from('articles')
      .update({
        title: article.title,
        author: article.author,
        summary: article.summary,
        cover: article.cover,
        content_html: article.content_html,
        content_md: article.content_md,
        status: 'ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id);
    
    if (updateError) {
      return new Response(`Update error: ${updateError.message}`, { status: 500 });
    }
    
    return new Response('已加入处理队列');
  } catch (err: any) {
    // 更新状态为failed
    await supabase
      .from('articles')
      .update({
        status: 'failed',
        error: err.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id);
    
    return new Response(`Extraction failed: ${err.message}`, { status: 500 });
  }
}

async function extractArticle(url: string) {
  // 获取网页内容
  const response = await fetch(url);
  const html = await response.text();
  
  // 使用JSDOM和Readability解析
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  
  if (!article) {
    throw new Error('Failed to parse article');
  }
  
  // 提取图片（简单实现）
  const images = Array.from(dom.window.document.querySelectorAll('img'))
    .map((img: HTMLImageElement) => img.src)
    .filter(src => src.startsWith('http'));
  
  // 简单的HTML转Markdown（生产环境应使用专门的库）
  const contentMd = (article.content || '')
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  return {
    title: article.title || 'Untitled',
    author: article.byline || undefined,
    summary: article.excerpt || undefined,
    cover: images[0] || undefined,
    content_html: article.content,
    content_md: contentMd,
    images,
    published_at: new Date(),
  };
}

async function handleRSS(env: Env): Promise<Response> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  
  // 查询状态为ready的文章，按published_at降序，取前100条
  const { data: articles, error } = await supabase
    .from('articles')
    .select('*')
    .eq('status', 'ready')
    .order('published_at', { ascending: false })
    .limit(100);
  
  if (error) {
    return new Response(`Database error: ${error.message}`, { status: 500 });
  }
  
  // 生成RSS XML
  const rss = generateRSS(articles || []);
  
  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

function generateRSS(articles: Article[]): string {
  const items = articles.map(article => `
    <item>
      <title><![CDATA[${article.title || 'Untitled'}]]></title>
      <link>${article.source_url}</link>
      <guid isPermaLink="false">${article.source_url}</guid>
      <pubDate>${article.published_at ? new Date(article.published_at).toUTCString() : new Date(article.created_at || '').toUTCString()}</pubDate>
      <description><![CDATA[${article.summary || ''}]]></description>
      <content:encoded><![CDATA[${article.content_html || ''}]]></content:encoded>
      ${article.author ? `<author>${article.author}</author>` : ''}
      ${article.cover ? `<enclosure url="${article.cover}" type="image/jpeg" />` : ''}
    </item>
  `).join('');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>RSS Pipeline</title>
    <link>https://example.com</link>
    <description>RSS feed generated by RSS Pipeline</description>
    <language>zh-cn</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="https://example.com/rss.xml" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`;
}