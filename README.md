# RSS 信息管道

将 Telegram/飞书消息中的链接自动抓取、解析并生成 RSS 供阅读器订阅。

## 架构

```text
Telegram
    │
    ▼
Cloudflare Worker (API Gateway)
    │
    ▼
Supabase (articles.status = pending)
    │
    ▼
Cloudflare Queue
    │
    ▼
Extractor Worker
    ├─ Generic Parser (Readability)
    ├─ WeChat Parser
    ├─ Zhihu Parser
    └─ ...
    │
    ▼
Article Normalize + Image Cache (R2)
    │
    ▼
Supabase (articles.status = ready)
    │
    ▼
GET /rss.xml (实时生成)
    │
    ▼
ReadYou / RSS 阅读器
```

## 环境变量

在项目根目录创建 `.env` 文件，包含以下变量：

```bash
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
R2_PUBLIC_URL=your_r2_public_url
```

## 部署

### 1. 创建 Supabase 表

在 Supabase 控制台的 SQL 编辑器中执行 `sql/create_articles_table.sql`。

### 2. 创建 Cloudflare Queue

```bash
wrangler queues create article-extraction-queue
```

### 3. 部署 API Worker

```bash
wrangler deploy
```

### 4. 部署 Extractor Worker

```bash
cd extractor
wrangler deploy
```

### 5. 配置 Telegram Webhook

将 Telegram Bot 的 Webhook 设置为：

```
https://<your-api-worker>.workers.dev/webhook/telegram
```

## 目录结构

```text
rss-pipeline/
├── src/
│   └── index.ts          # API Gateway Worker
├── extractor/
│   └── src/
│       └── extractor.ts  # Extractor Worker
├── sql/
│   └── create_articles_table.sql
├── wrangler.toml         # API Worker 配置
├── extractor/
│   └── wrangler.toml     # Extractor Worker 配置
├── .env.example
└── README.md
```

## 开发流程

1. 填写 `.env` 环境变量
2. 本地开发：`wrangler dev`
3. 部署：`wrangler deploy`
4. 测试：发送链接给 Telegram Bot，检查 `/rss.xml` 输出

## Roadmap

- [ ] Phase 1: 打通异步链路 (Queue + Extractor)
- [ ] Phase 2: RSS 输出完整字段
- [ ] Phase 3: 插件化解析器 (WeChat, Zhihu, etc.)
- [ ] Phase 4: 图片懒缓存 (R2)
- [ ] Phase 5: 完整线上部署
- [ ] Phase 6: 飞书机器人支持