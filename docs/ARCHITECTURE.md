# ARCHITECTURE.md — RSS Pipeline 系统架构

> 最后更新：2026-06-27
> 代码版本：Phase 1（异步链路已完成，bug 已修复）

---

## 1. 系统概览

RSS Pipeline 将飞书消息中的链接自动抓取、解析并生成 RSS 供阅读器订阅。

```text
用户 (飞书)
    │
    │  发送文章链接
    ▼
┌─────────────────────────────────┐
│  API Gateway Worker             │
│  (rss-pipeline-api)             │
│                                 │
│  POST /webhook/feishu           │
│  GET  /rss.xml                  │
│  GET  /health                   │
└──────────┬──────────────────────┘
           │
           │  1. INSERT articles (status=pending)
           │  2. QUEUE.send({articleId, sourceUrl})
           │  3. UPDATE status=queued
           ▼
┌─────────────────────────────────┐
│  Supabase (PostgreSQL)          │
│  table: articles                │
└──────────┬──────────────────────┘
           │
           │  Cloudflare Queue
           │  (article-extraction-queue)
           ▼
┌─────────────────────────────────┐
│  Extractor Worker               │
│  (rss-pipeline-extractor)       │
│                                 │
│  Queue Consumer                 │
│  ├─ genericParser (Readability) │
│  ├─ wechatParser (TODO)         │
│  └─ ...                         │
│                                 │
│  R2 Bucket: rss-images          │
└──────────┬──────────────────────┘
           │
           │  解析完成 → UPDATE status=ready
           ▼
┌─────────────────────────────────┐
│  Supabase (articles.status=ready)│
└──────────┬──────────────────────┘
           │
           │  GET /rss.xml 实时查询
           ▼
┌─────────────────────────────────┐
│  RSS 阅读器 (ReadYou 等)         │
└─────────────────────────────────┘
```

---

## 2. 模块说明

### 2.1 API Gateway Worker (`src/index.ts`)

**职责**：接收飞书 webhook、输出 RSS、健康检查。不负责解析。

| 端点 | 方法 | 功能 |
|---|---|---|
| `/webhook/feishu` | POST | 接收飞书消息，提取 URL，写入 Supabase，发送 Queue 消息 |
| `/rss.xml` | GET | 查询 `status=ready` 的文章，实时生成 RSS 2.0 XML |
| `/health` | GET | 返回 `{status, timestamp}`，用于监控 |

**安全**：`/webhook/feishu` 验证 `header.token` 与 `FEISHU_VERIFICATION_TOKEN` 匹配，防止伪造。

**环境变量**：

| 变量 | 说明 |
|---|---|
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key（绕过 RLS） |
| `FEISHU_APP_ID` | 飞书应用 App ID |
| `FEISHU_APP_SECRET` | 飞书应用 App Secret |
| `FEISHU_VERIFICATION_TOKEN` | 飞书事件订阅验证 Token |
| `FEISHU_ENCRYPT_KEY` | 飞书事件加密 Key（可选） |
| `QUEUE` | Cloudflare Queue binding（`article-extraction-queue`） |

### 2.2 Extractor Worker (`extractor/src/extractor.ts`)

**职责**：从 Queue 消费消息，抓取网页，解析正文，更新数据库。

**解析器接口**：

```typescript
interface ArticleParser {
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
```

**当前解析器**：

| 解析器 | 状态 | 说明 |
|---|---|---|
| `genericParser` | ✅ 已实现 | 基于 Readability + JSDOM + Turndown |
| `wechatParser` | ❌ 未实现 | 微信公众号专用 |
| `zhihuParser` | ❌ 未实现 | 知乎专栏专用 |

**环境变量**：

| 变量 | 说明 |
|---|---|
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `IMAGES` | R2 Bucket binding（`rss-images`） |

### 2.3 Supabase 数据库

表 `articles`，详见 [schema](#3-数据库-schema)。

### 2.4 Cloudflare Queue

- 队列名：`article-extraction-queue`
- API Worker 是 producer，Extractor Worker 是 consumer
- 消费配置：`max_batch_size = 10`，`max_batch_timeout = 30`

### 2.5 Cloudflare R2

- Bucket：`rss-images`
- 当前**未使用**，预留用于图片懒缓存或异步上传

---

## 3. 数据库 Schema

```sql
create table articles (
  id            bigint generated always as identity primary key,
  source_url    text not null,
  source_type   text,                    -- generic / wechat / zhihu / juejin
  title         text,
  author        text,
  summary       text,
  cover         text,                    -- 封面图 URL
  content_html  text,
  content_md    text,
  status        text not null default 'pending',
  error         text,                    -- 失败原因
  tags          text[],
  published_at  timestamptz,             -- 文章真实发布时间
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
```

**索引**：
- `idx_articles_status` — 按状态查询
- `idx_articles_published_at` — RSS 按发布时间排序
- `idx_articles_source_url` — 去重查询

**触发器**：`update_articles_updated_at` — 每次 UPDATE 自动刷新 `updated_at`

---

## 4. 状态机

```text
pending ──────▶ queued ──────▶ extracting ──────▶ uploading ──────▶ ready
   │               │                │                  │
   │               │                │                  │
   └───────────────┴────────────────┴──────────────────┘
                              │
                              ▼
                           failed ──(retry)──▶ queued
```

| 状态 | 谁写入 | 含义 |
|---|---|---|
| `pending` | API Worker | 刚收到链接，已入库 |
| `queued` | API Worker | 已发送到 Queue，等待消费 |
| `extracting` | Extractor | 正在抓取/解析 |
| `uploading` | Extractor | 正在处理图片（当前跳过） |
| `ready` | Extractor | 解析完成，可进入 RSS |
| `failed` | API Worker / Extractor | 失败，`error` 字段记录原因 |

---

## 5. 技术选型

| 组件 | 选择 | 理由 |
|---|---|---|
| 运行时 | Cloudflare Workers | 边缘计算，低延迟，免费额度够用 |
| 消息队列 | Cloudflare Queue | 与 Workers 原生集成，无需额外服务 |
| 对象存储 | Cloudflare R2 | 零出口费用，与 Workers 原生集成 |
| 数据库 | Supabase (PostgreSQL) | 免费 Postgres + REST API，Workers 友好 |
| 正文解析 | @mozilla/readability | 浏览器级正文提取，通用性强 |
| HTML 解析 | jsdom | 配合 Readability 使用（**体积大，后续考虑换 linkedom**） |
| HTML→MD | turndown | 转换质量高，支持代码块、表格 |
| 入口 | 飞书机器人 | webhook 调试简单，团队协作友好 |

---

## 6. 项目结构

```text
rss-pipeline/
├── src/
│   └── index.ts              # API Gateway Worker
├── extractor/
│   ├── package.json          # Extractor 独立依赖
│   ├── wrangler.toml         # Extractor Worker 配置
│   └── src/
│       └── extractor.ts      # Queue Consumer + 解析器
├── sql/
│   └── create_articles_table.sql
├── docs/                     # 文档体系
│   ├── ARCHITECTURE.md       # 本文件
│   ├── ROADMAP.md            # 版本路线图
│   ├── ISSUES/               # Issue 跟踪
│   └── PROMPTS/              # AI 开发提示模板
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── wrangler.toml             # API Worker 配置
└── README.md
```

---

## 7. 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 填写环境变量
cp .env.example .env
# 编辑 .env 填入真实值

# 3. 启动 API Worker
npm run dev:api

# 4. 另一个终端启动 Extractor Worker
npm run dev:extractor

# 5. 类型检查
npm run typecheck
```

---

## 8. 部署

```bash
# 1. 执行 SQL 建表
#    在 Supabase 控制台执行 sql/create_articles_table.sql

# 2. 创建 Queue
wrangler queues create article-extraction-queue

# 3. 创建 R2 Bucket
wrangler r2 bucket create rss-images

# 4. 部署 API Worker
npm run deploy:api

# 5. 部署 Extractor Worker
npm run deploy:extractor

# 6. 配置飞书 Webhook
#    在飞书开放平台创建应用并启用机器人
#    订阅事件 im.message.receive_v1
#    请求地址填：https://<your-api-worker>.workers.dev/webhook/feishu
#    配置权限：im:chat:readonly、im:message:send、im:message.group_msg
#    将机器人拉入目标群聊
```
