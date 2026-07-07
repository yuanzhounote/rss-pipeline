# Bug Fix Report - RSS Pipeline Extractor

## Issue
所有文章卡在 `queued` 状态，无法进入 `extracting`/`ready`/`failed` 状态。

## Root Cause
Cloudflare Workers 运行时缺少完整的 DOM 环境：
1. 无内置 `DOMParser` API
2. Turndown 的浏览器版本依赖 `document.implementation.createHTMLDocument`
3. Wrangler 打包时自动选择 browser 字段版本

## Solution
1. **linkedom@0.15.0 → linkedom@0.18.6**：修复 Readability 兼容性问题
2. **turndown → node-html-markdown**：替换为纯 JS 实现，零 DOM 依赖

## Files Changed
- `extractor/package.json` - 更新依赖
- `extractor/src/extractor.ts` - 替换 HTML→Markdown 转换器
- `src/index.ts` - 删除临时 admin 端点

## Verification
| 文章 | URL | 结果 |
|------|-----|------|
| id=5 | httpbin.org/html | ✅ ready |
| id=6 | 微信公众号 | ✅ ready |
| id=7 | 微信公众号 | ✅ ready |
| id=4 | 微信公众号 | ✅ ready |

## DLQ Config
- max_retries: 3
- dead_letter_queue: article-extraction-dlq

## Commit
[25be203] fix(extractor): resolve document is not defined in Cloudflare Workers

## Deploy Time
2026-07-07
