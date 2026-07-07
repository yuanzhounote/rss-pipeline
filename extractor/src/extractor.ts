import { createClient } from '@supabase/supabase-js';
import { getParserForUrl } from './parsers';

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

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', worker: 'extractor' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Not Found', { status: 404 });
  },

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
