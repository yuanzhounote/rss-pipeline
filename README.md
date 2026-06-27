# RSS 信息管道

将飞书消息中的链接自动抓取、解析并生成 RSS 供阅读器订阅。

## 架构

```text
飞书
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
FEISHU_APP_ID=your_feishu_app_id
FEISHU_APP_SECRET=your_feishu_app_secret
FEISHU_VERIFICATION_TOKEN=your_feishu_verification_token
FEISHU_ENCRYPT_KEY=your_feishu_encrypt_key (可选)
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



### 6. 配置飞书 Webhook

1. 在飞书开放平台创建应用并启用机器人
2. 订阅事件 `im.message.receive_v1`
3. 请求地址填：`https://<your-api-worker>.workers.dev/webhook/feishu`
4. 配置权限：`im:chat:readonly`、`im:message:send`、`im:message.group_msg`
5. 将机器人拉入目标群聊

## 目录结构

```text
rss-pipeline/
├── src/
│   └── index.ts              # API Gateway Worker
├── extractor/
│   ├── package.json          # Extractor 依赖
│   ├── wrangler.toml         # Extractor Worker 配置
│   └── src/
│       └── extractor.ts      # Queue Consumer + 解析器
├── sql/
│   └── create_articles_table.sql
├── docs/
│   ├── ARCHITECTURE.md
│   ├── ROADMAP.md
│   ├── ISSUES/
│   └── PROMPTS/
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── wrangler.toml             # API Worker 配置
└── README.md
```

## 开发流程

1. 填写 `.env` 环境变量
2. 本地开发：`wrangler dev`
3. 部署：`wrangler deploy`
4. 测试：在飞书群发链接，检查 `/rss.xml` 输出

## Roadmap

- [ ] Phase 1: 打通异步链路 (Queue + Extractor)
- [ ] Phase 2: RSS 输出完整字段
- [ ] Phase 3: 插件化解析器 (WeChat, Zhihu, etc.)
- [ ] Phase 4: 图片懒缓存 (R2)
- [ ] Phase 5: 完整线上部署
- [x] Phase 6: 飞书机器人支持