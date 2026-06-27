# Issue #3: message.retry() 无限重试

**优先级**：🟡 中（错误文章会阻塞队列）
**状态**：✅ 已修复
**发现日期**：2026-06-27

## 问题描述

`extractor/src/extractor.ts` 第 159 行，任何解析失败都会调用 `message.retry()`，将消息重新放回队列。

Cloudflare Queue 默认最多重试 3 次，但当前代码没有检查 `message.attempts` 属性，导致：

1. 如果是永久性错误（如 URL 格式错误、页面 404），会无意义重试 3 次
2. 每次重试都会把状态从 `failed` 改回 `extracting`，再改回 `failed`，产生无意义的数据库写入
3. 重试期间该消息占住队列位置

## 复现路径

1. 发送一个不存在的 URL（如 `https://example.com/this-page-does-not-exist-12345`）
2. 观察 Extractor 日志，会看到同样的错误重复出现 3 次
3. 每次都会写入 `failed` → `extracting` → `failed` 的状态变更

## 修复方案

方案 A（推荐）：检查重试次数，超限后 ack 并标记为永久失败

```typescript
} catch (error) {
  console.error(`Failed to extract article ${articleId}:`, error);

  const isLastAttempt = (message as any).attempts >= 3;

  await supabase
    .from('articles')
    .update({
      status: 'failed',
      error: (error as Error).message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', articleId);

  if (isLastAttempt) {
    message.ack();  // 不再重试，从队列移除
  } else {
    message.retry();
  }
}
```

方案 B：区分错误类型，临时错误重试，永久错误直接 ack

```typescript
const permanentErrors = ['404', 'parse_error', 'ENOTFOUND'];
const isPermanent = permanentErrors.some(e =>
  (error as Error).message.includes(e)
);

if (isPermanent) {
  message.ack();
} else {
  message.retry();
}
```

## 涉及文件

- `extractor/src/extractor.ts`（第 146-160 行）
