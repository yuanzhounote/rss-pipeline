# 部署清单 / Deployment Checklist

> 目标：飞书群发链接 → 30 秒内进入 RSS，可被 ReadYou / Reeder 订阅。
> 适用阶段：Phase 1 验收通过后，进入线上部署。

---

## 前置准备（Prerequisites）

- [ ] Node 22 + Wrangler CLI 已安装（`npx wrangler --version`）
- [ ] Supabase 项目已建，`articles` 表已执行 `sql/create_articles_table.sql`
- [ ] 已拿到 `SUPABASE_URL` 与 `SUPABASE_SERVICE_KEY`（service_role key，有写权限）
- [ ] 一个可公网访问的地址（Cloudflare `*.workers.dev` 或绑定自定义域），用于飞书 webhook 回调

---

## 1. 注入密钥（Secrets）

两个 Worker 分别注入，密钥不会进代码仓库。

### Extractor Worker
```bash
cd extractor
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
# 注：R2 IMAGES binding 暂未配置（Roadmap 已明确 MVP 跳过图片托管）
```

### API Gateway Worker
```bash
cd ..
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
# Webhook 校验当前只用 VERIFICATION_TOKEN（代码未实现消息解密，故加密务必关闭）
npx wrangler secret put FEISHU_VERIFICATION_TOKEN
# 以下两项代码暂未使用，可先不设；待后续让机器人主动回消息时再补
# npx wrangler secret put FEISHU_APP_ID
# npx wrangler secret put FEISHU_APP_SECRET
# ⚠️ 不要启用事件加密，也不要设置 FEISHU_ENCRYPT_KEY，否则消息无法解析
```

---

## 2. 创建 Cloudflare Queue

```bash
npx wrangler queues create article-extraction-queue
```

确认 `extractor/wrangler.toml` 中 `[[queues.consumers]]` 的 `queue` 与上面同名。

---

## 3. 部署 Extractor Worker（队列消费者）

```bash
cd extractor
npx wrangler deploy
```

---

## 4. 部署 API Gateway Worker（webhook + RSS）

```bash
cd ..
npx wrangler deploy
```

部署后记录分配的地址（如 `https://rss-pipeline-api.<sub>.workers.dev`）。

---

## 5. 配置飞书群机器人 Webhook

1. 飞书开放平台（open.feishu.cn）→ 创建 **企业自建应用**
2. 左侧「机器人」开启机器人能力，并把该机器人**加入目标飞书群**
3. 左侧「事件订阅」→ 请求地址填：`https://<your-domain>/webhook/feishu`
   （注意路径是 `/webhook/feishu`，不是 `/feishu/webhook`）
4. 在「事件订阅」中勾选 **接收消息** 事件（`im.message.receive_v1`）
5. Verification Token 与第 1 步 `FEISHU_VERIFICATION_TOKEN` secret **严格一致**
6. **不要启用消息加密**（代码未实现解密，启用后无法解析）
7. 验证 URL：飞书会发 `url_verification` challenge，代码已处理返回 `challenge`

---

## 6. 本地端到端联调（推荐，部署前先跑通）

```bash
node test-flow.mjs
```

手动验证链路：
插入一条 `pending` 文章 → 本地 `npm run dev:extractor` 消费队列并解析 → 查库 `status=ready` → 访问 `/rss.xml` 可见该条目。

---

## 7. 线上验收

- [ ] 飞书群里发一条公众号 / 文章链接
- [ ] 30 秒内访问 `/rss.xml` 出现该条目
- [ ] 在 ReadYou / Reeder 订阅 `https://<your-worker>/rss.xml` 能正常刷新

---

## 后续（Roadmap 中，非阻塞）

- [ ] R2 图片托管（`IMAGES` binding）
- [ ] 监控告警 + 失败文章重跑后台
- [ ] 多解析器（公众号 / 知乎 / 微博 专用 parser）
- [x] `enqueueArticle` 失败兜底（已修复：QUEUE.send 失败标记 `failed` 并返回真实结果，commit `7c384ca`）
