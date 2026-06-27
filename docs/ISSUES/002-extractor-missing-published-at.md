# Issue #2: Extractor 更新 ready 状态时漏写 published_at

**优先级**：🟡 中（RSS 时间戳不准）
**状态**：✅ 已修复
**发现日期**：2026-06-27

## 问题描述

`extractor/src/extractor.ts` 中，`genericParser.extract()` 已经从 `meta[property="article:published_time"]`、`meta[name="pubdate"]`、`time[datetime]` 等位置提取了 `published_at`（第 56-69 行），返回值里也包含了 `published_at: publishedAt`。

但在第 131-143 行更新数据库为 `ready` 状态时，UPDATE 语句里**没有写入 `published_at` 字段**：

```typescript
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
    // ← 缺少 published_at
  })
  .eq('id', articleId);
```

导致 `published_at` 始终为 `NULL`，RSS 中的 `<pubDate>` 只能 fallback 到 `created_at`（入库时间），而非文章真实发布时间。

## 复现路径

1. 发送一篇文章链接给飞书 Bot
2. 等待 Extractor 处理完成
3. 查看 Supabase 中该文章的 `published_at` 字段 → 为 `NULL`
4. 查看 `/rss.xml` 中该条目的 `<pubDate>` → 不是文章真实发布时间

## 修复方案

在 UPDATE 语句中添加 `published_at`：

```typescript
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
```

## 涉及文件

- `extractor/src/extractor.ts`（第 131-143 行）
