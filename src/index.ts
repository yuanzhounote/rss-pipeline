import { createClient } from '@supabase/supabase-js';
import { Queue } from '@cloudflare/workers-types';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  QUEUE: Queue;
  FEISHU_APP_ID: string;
  FEISHU_APP_SECRET: string;
  FEISHU_VERIFICATION_TOKEN: string;
  FEISHU_ENCRYPT_KEY: string;
  SITE_TITLE: string;
  SITE_URL: string;
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
    

    
    if (request.method === 'POST' && url.pathname === '/webhook/feishu') {
      return handleFeishuWebhook(request, env);
    }
    
    if (request.method === 'GET' && url.pathname === '/rss.xml') {
      return handleRSS(env);
    }
    
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response('Not Found', { status: 404 });
  },
};

async function enqueueArticle(env: Env, sourceUrl: string, sourceType: string): Promise<{ id: number; status: string }> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  
  // 检查URL是否已存在（去重）
  const { data: existing } = await supabase
    .from('articles')
    .select('id, status')
    .eq('source_url', sourceUrl)
    .maybeSingle();
  
  if (existing) {
    return { id: existing.id, status: existing.status };
  }
  
  // 插入文章记录，状态为pending
  const { data, error } = await supabase
    .from('articles')
    .insert({
      source_url: sourceUrl,
      source_type: sourceType,
      status: 'pending',
    })
    .select()
    .single();
  
  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }
  
  // 发送消息到 Queue
  await env.QUEUE.send({ articleId: data.id, sourceUrl });
  
  // 更新状态为 queued
  await supabase
    .from('articles')
    .update({ status: 'queued', updated_at: new Date().toISOString() })
    .eq('id', data.id);
  
  return { id: data.id, status: 'queued' };
}

async function handleFeishuWebhook(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as any;
  
  // 处理飞书URL验证挑战（首次配置事件订阅时）
  if (body.challenge) {
    return new Response(JSON.stringify({ challenge: body.challenge }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // 验证token（Verification Token方式）
  if (body.header && body.header.token && env.FEISHU_VERIFICATION_TOKEN) {
    if (body.header.token !== env.FEISHU_VERIFICATION_TOKEN) {
      return new Response('Forbidden', { status: 403 });
    }
  }
  
  // 确保是消息接收事件
  if (!body.event || !body.event.message || body.event.message.message_type !== 'text') {
    return new Response('Not a text message');
  }
  
  // 提取消息内容
  let text = '';
  try {
    const content = JSON.parse(body.event.message.content);
    text = content.text || '';
  } catch (e) {
    return new Response('Invalid message content');
  }
  
  // 提取URL
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) {
    return new Response('No URL found in message');
  }
  
  const sourceUrl = urlMatch[0];
  
  try {
    const result = await enqueueArticle(env, sourceUrl, 'feishu');
    return new Response('已加入处理队列');
  } catch (err: any) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
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
  const rss = generateRSS(articles || [], env);
  
  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

function generateRSS(articles: Article[], env: Env): string {
  const siteTitle = env.SITE_TITLE || 'RSS Pipeline';
  const siteUrl = env.SITE_URL || 'https://example.com';
  const rssUrl = `${siteUrl.replace(/\/$/, '')}/rss.xml`;

  const items = articles.map(article => {
    const guid = article.id ? String(article.id) : article.source_url;
    const enclosureMime = getMimeFromUrl(article.cover);
    return `
    <item>
      <title><![CDATA[${article.title || 'Untitled'}]]></title>
      <link>${escapeXml(article.source_url)}</link>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <pubDate>${article.published_at ? new Date(article.published_at).toUTCString() : new Date(article.created_at || '').toUTCString()}</pubDate>
      <description><![CDATA[${article.summary || ''}]]></description>
      <content:encoded><![CDATA[${article.content_html || ''}]]></content:encoded>
      ${article.author ? `<dc:creator><![CDATA[${article.author}]]></dc:creator>` : ''}
      ${article.cover ? `<enclosure url="${escapeXml(article.cover)}" type="${enclosureMime}" />` : ''}
    </item>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title><![CDATA[${siteTitle}]]></title>
    <link>${escapeXml(siteUrl)}</link>
    <description>RSS feed generated by RSS Pipeline</description>
    <language>zh-cn</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(rssUrl)}" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getMimeFromUrl(url?: string): string {
  if (!url) return 'image/jpeg';
  const ext = url.split('.').pop()?.toLowerCase().split('?')[0] || '';
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    avif: 'image/avif',
  };
  return mimeMap[ext] || 'image/jpeg';
}