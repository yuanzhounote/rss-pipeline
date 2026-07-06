
## 功能
用户通过 Telegram/飞书机器人发送链接 → 后端自动抓取正文+图片 → 
正文存 Supabase，图片存 Cloudflare R2 → 生成 RSS 供阅读器订阅

## 技术栈
- Cloudflare Worker（接收 webhook + 生成 RSS + 爬取）
- Supabase（存储文章数据）
- Cloudflare R2（存储图片）
- 开源 RSS 阅读器 ReadYou（消费端）

## 核心流程
1. 用户发链接给机器人 → Worker 接收
2. Worker 判断来源 → 有 API 的走 API，没有的开无头浏览器爬
3. 正文存 Supabase，图片下载到 R2 并替换链接
4. 标记 ready 状态
5. Worker 定期查 Supabase 生成 RSS XML
6. 阅读器订阅 RSS 地址

## 数据库核心字段
- title / content / markdown / html
- source_url / source_type
- cover_image / author
- status（关键：只有 ready 才进 RSS）
- created_at

## 要求
先跑通最小可用版本，再逐步迭代