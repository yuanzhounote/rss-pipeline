create table articles (
  id bigint generated always as identity primary key,
  source_url text not null,
  source_type text,                    -- generic / wechat / zhihu / juejin / ...
  title text,
  author text,
  summary text,
  cover text,                          -- 封面图 URL
  content_html text,
  content_md text,
  status text not null default 'pending', -- pending / queued / extracting / uploading / ready / failed
  error text,                          -- 403 / timeout / captcha / parse_error / ...
  tags text[],                         -- 可空，后期用于分类
  published_at timestamptz,            -- 文章真实发布时间，用于 RSS <pubDate>
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 创建索引
create index idx_articles_status on articles(status);
create index idx_articles_published_at on articles(published_at desc);
create index idx_articles_source_url on articles(source_url);

-- 创建更新时间触发器
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_articles_updated_at
  before update on articles
  for each row
  execute function update_updated_at_column();