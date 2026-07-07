export interface ArticleParser {
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
