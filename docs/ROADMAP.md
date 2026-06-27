# ROADMAP.md — RSS Pipeline 版本路线图

> 最后更新：2026-06-27

---

## 当前状态

**Phase 1 骨架已完成**，4 个已知 bug 已修复。尚未进行线上部署和端到端测试。

---

## Phase 1：异步链路打通（当前阶段）

**目标**：飞书发链接 → 5 秒后 RSS 阅读器能看到文章。

| 任务 | 状态 | 说明 |
|---|---|---|
| API Worker webhook 接收 + URL 提取 | ✅ 完成 | 含飞书 token 验证 |
| API Worker 写入 Supabase + 发 Queue | ✅ 完成 | `pending → queued` |
| Extractor 消费 Queue + 解析正文 | ✅ 完成 | Readability + Turndown |
| Extractor 状态机流转 | ✅ 完成 | `queued → extracting → uploading → ready` |
| `GET /rss.xml` 实时生成 RSS | ✅ 完成 | RSS 2.0，含 content:encoded |
| `GET /health` 健康检查 | ✅ 完成 | |
| 修复 extractor/package.json 缺 turndown 依赖 | ✅ 完成 | Issue #1 |
| 修复 Extractor 漏写 published_at | ✅ 完成 | Issue #2 |
| 修复 message.retry() 无限重试 | ✅ 完成 | Issue #3 |
| 本地端到端测试 | ❌ 未做 | |
| 线上部署 | ❌ 未做 | |

**验收标准**：
- 向飞书群发送一个普通网页链接
- 30 秒内 `/rss.xml` 出现该文章
- 文章标题、正文、发布时间正确

---

## Phase 2：RSS 输出完善

**目标**：RSS feed 在主流阅读器（ReadYou、Reeder、Feedly）中显示正常。

| 任务 | 状态 | 说明 |
|---|---|---|
| `<guid>` 使用文章 id 而非 source_url | ❌ 未做 | 避免 URL 变化导致重复 |
| `<author>` 格式规范 | ❌ 未做 | RSS 规范要求 email 或 `name (email)` |
| `<enclosure>` MIME 类型按实际判断 | ❌ 未做 | 当前硬编码 `image/jpeg` |
| RSS channel 标题/链接可配置 | ❌ 未做 | 当前硬编码 `example.com` |
| 重复链接去重 | ❌ 未做 | 同一 URL 多次发送只保留一条 |
| RSS 缓存策略优化 | ❌ 未做 | 当前 `max-age=300`，可按需调整 |

**验收标准**：
- 在 ReadYou 中订阅，文章列表、封面图、全文阅读均正常
- 重复发送同一链接不会产生重复条目

---

## Phase 3：插件化解析器

**目标**：针对特殊来源（微信、知乎等）有专用解析器，提高正文提取成功率。

| 任务 | 状态 | 说明 |
|---|---|---|
| 解析器目录拆分到 `extractor/src/parsers/` | ❌ 未做 | |
| 微信公众号解析器 | ❌ 未做 | 处理 `mp.weixin.qq.com` |
| 知乎专栏解析器 | ❌ 未做 | 处理 `zhuanlan.zhihu.com` |
| 掘金解析器 | ❌ 未做 | 处理 `juejin.cn` |
| 解析器自动匹配（URL 模式） | ❌ 未做 | `canHandle(url)` 已有接口 |
| 三级降级策略 | ❌ 未做 | API → Readability → Browser Rendering |

**验收标准**：
- 微信公众号文章正确提取正文和图片
- 知乎专栏文章正确提取正文和作者
- 未知来源走 genericParser 兜底

---

## Phase 4：图片处理

**目标**：文章图片持久化到 R2，避免原站图片失效。

| 任务 | 状态 | 说明 |
|---|---|---|
| 方案选择：懒缓存 vs 异步上传 | ❌ 未做 | MVP 建议懒缓存 |
| 图片代理 Worker 路由 | ❌ 未做 | `GET /img/:hash` 回源 + 缓存 |
| 图片 URL 替换逻辑 | ❌ 未做 | 在 content_html 中替换 `<img src>` |
| R2 读写 | ❌ 未做 | binding 已配置 |
| 防盗链处理 | ❌ 未做 | 下载时带 Referer + User-Agent |

**验收标准**：
- 原站图片删除后，RSS 中图片仍可正常显示
- R2 成本可控（懒缓存命中率 > 80%）

---

## Phase 5：线上部署 & 稳定运行

**目标**：生产环境稳定运行，可日常使用。

| 任务 | 状态 | 说明 |
|---|---|---|
| Supabase 项目创建 + 执行 SQL | ✅ 完成 | 已在 Supabase 控制台执行 |
| Cloudflare Queue 创建 | ✅ 完成 | `article-extraction-queue` 已创建 |
| R2 Bucket 创建 | ⏸️ 跳过 | Cloudflare 账户未启用 R2，后续再开 |
| API Worker 部署 | ✅ 完成 | `https://rss-pipeline-api.wx-yyz-ai.workers.dev` |
| Extractor Worker 部署 | ❌ 待做 | 需单独部署 |
| 飞书 Webhook 配置 | ❌ 待做 | 见下方操作清单 |
| 密钥管理 | ✅ 完成 | 已用 `wrangler secret` 设置 |
| 监控 + 告警 | ❌ 待做 | `/health` + Cloudflare Analytics |
| 错误日志查看 | ❌ 待做 | `wrangler tail` |

### 飞书 Webhook 配置清单（下周做）

1. 打开飞书开放平台 → 进入你的应用
2. **事件与回调** → **事件配置**
3. 请求地址填：`https://rss-pipeline-api.wx-yyz-ai.workers.dev/webhook/feishu`
4. 添加事件：`im.message.receive_v1`（接收消息）
5. 权限配置：`im:chat:readonly`、`im:message:send`、`im:message.group_msg`
6. 把机器人拉进目标群聊
7. 在群里发一个链接，等 30 秒后检查 `/rss.xml`

### Extractor Worker 部署清单

```bash
cd extractor
npm install
wrangler secret put SUPABASE_URL      # 输入 .env 中的值
wrangler secret put SUPABASE_SERVICE_KEY
wrangler deploy
```

**验收标准**：
- 连续 7 天稳定运行，无未处理的 `failed` 状态文章
- 每日处理 10+ 篇文章无异常

---

## Phase 6：扩展入口

**目标**：支持更多输入入口和输出方式。

| 任务 | 状态 | 说明 |
|---|---|---|
| 飞书机器人接入 | ❌ 未做 | |
| 多用户支持 | ❌ 未做 | 每个飞书群/用户独立 feed |
| 自建阅读器前端 | ❌ 未做 | 可选，接入 ReadYou 优先 |
| 全文搜索 | ❌ 未做 | Supabase 全文索引 |
| 标签 / 分类 | ❌ 未做 | `tags` 字段已有 |
| 阅读进度同步 | ❌ 未做 | |
