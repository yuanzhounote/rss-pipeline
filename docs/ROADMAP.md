# ROADMAP.md — RSS Pipeline 版本路线图

> 最后更新：2026-07-07

---

## 当前状态

**Phase 1 已全部完成并上线**：代码侧 4 个已知 bug 已修、`/rss.xml` 输出完善、队列卡死根因已修（Turndown→node-html-markdown + linkedom，commit `25be203`）；双 Worker 已部署、自定义域名 `rss.yuanzhounote.com` 实测可达、端到端验证通过（5 篇文章 `ready`）。

**当前仅剩两块未闭环**：① 飞书控制台事件订阅配置（代码已就绪，需用户本机操作）② 监控/告警（仅 `/health` 端点存在，无定时巡检与告警）。

**Phase 2（RSS 输出）已完成**；Phase 3/4/6 待开始。

---

## Phase 1：异步链路打通（当前阶段）

**目标**：飞书发链接 → 5 秒后 RSS 阅读器能看到文章。

| 任务 | 状态 | 说明 |
|---|---|---|
| API Worker webhook 接收 + URL 提取 | ✅ 完成 | 含飞书 token 验证 |
| API Worker 写入 Supabase + 发 Queue | ✅ 完成 | `pending → queued` |
| Extractor 消费 Queue + 解析正文 | ✅ 完成 | Readability + node-html-markdown（原 Turndown 在 Workers 抛 `document is not defined`，已替换，commit `25be203`） |
| Extractor 状态机流转 | ✅ 完成 | `queued → extracting → uploading → ready` |
| `GET /rss.xml` 实时生成 RSS | ✅ 完成 | RSS 2.0，含 content:encoded |
| `GET /health` 健康检查 | ✅ 完成 | |
| 修复 extractor/package.json 缺 turndown 依赖 | ✅ 完成 | Issue #1 |
| 修复 Extractor 漏写 published_at | ✅ 完成 | Issue #2 |
| 修复 message.retry() 无限重试 | ✅ 完成 | Issue #3 |
| 本地端到端测试 | ✅ 完成 | 2026-07-07 线上验证，5 篇文章 `ready`（id=4/5/6/7 为微信/httpbin） |
| 线上部署 | ✅ 完成 | 双 Worker 已部署 + 自定义域名 `rss.yuanzhounote.com` 可达 |

**验收标准**：
- 向飞书群发送一个普通网页链接
- 30 秒内 `/rss.xml` 出现该文章
- 文章正文、发布时间正确
- ⚠️ 已知质量缺口：Readability 对部分站点（含微信公众号/httpbin）抽不到标题，落库 `title=Untitled`；Phase 3 需加站点专用 parser 或 og:title 回退

---

## Phase 2：RSS 输出完善

**目标**：RSS feed 在主流阅读器（ReadYou、Reeder、Feedly）中显示正常。

| 任务 | 状态 | 说明 |
|---|---|---|
| `<guid>` 使用文章 id 而非 source_url | ✅ 完成 | 避免 URL 变化导致重复 |
| `<author>` 格式规范 | ✅ 完成 | 改用 `<dc:creator>` |
| `<enclosure>` MIME 类型按实际判断 | ✅ 完成 | 按扩展名匹配 |
| RSS channel 标题/链接可配置 | ✅ 完成 | `SITE_TITLE` / `SITE_URL` 环境变量 |
| 重复链接去重 | ✅ 完成 | `maybeSingle()` + 数据库唯一约束 |
| RSS 缓存策略优化 | ❌ 未做 | 当前 `max-age=300`，可按需调整 |

**验收标准**：
- 在 ReadYou 中订阅，文章列表、封面图、全文阅读均正常
- 重复发送同一链接不会产生重复条目

---

## Phase 3：插件化解析器

**目标**：针对特殊来源（微信、知乎等）有专用解析器，提高正文提取成功率。

> 现状：专用解析器已支持微信公众号、知乎专栏、掘金，自动按 URL 匹配。通用解析器（Readability）兜底。

| 任务 | 状态 | 说明 |
|---|---|---|
| 解析器目录拆分到 `extractor/src/parsers/` | ✅ 完成 | `wechat.ts`, `zhihu.ts`, `juejin.ts`, `generic.ts`, `index.ts` |
| 微信公众号解析器 | ✅ 完成 | 处理 `mp.weixin.qq.com`，直接提取 `#js_content` |
| 知乎专栏解析器 | ✅ 完成 | 处理 `zhuanlan.zhihu.com`/`www.zhihu.com`，支持 `data-actual-src` 懒加载图片替换 |
| 掘金解析器 | ✅ 完成 | 处理 `juejin.cn`，支持 `data-src` 懒加载图片替换 |
| 解析器自动匹配（URL 模式） | ✅ 完成 | `getParserForUrl()` 按 `canHandle(url)` 优先级匹配 |
| 三级降级策略 | ✅ 完成 | 专用解析器 → `genericParser`（Readability 兜底） |

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
| R2 Bucket 创建 | ⏸️ 跳过 | MVP 决议跳过图片托管（Phase 4 暂缓）；`IMAGES` binding 未配 |
| API Worker 部署 | ✅ 完成 | 自定义域 `rss.yuanzhounote.com`（已验证可达）/ `*.workers.dev` 备用 |
| Extractor Worker 部署 | ✅ 完成 | commit `25be203` 已部署，`rss-pipeline-extractor` |
| 飞书 Webhook 配置 | ❌ 待做 | **代码已就绪，仅差飞书控制台配置（需用户本机操作）**，见下方清单 |
| 密钥管理 | ✅ 完成 | `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` 已注入；`FEISHU_VERIFICATION_TOKEN` 待设 |
| 监控 + 告警 | ⚠️ 部分 | API Worker `/health` 端点存在（`src/index.ts`），但无定时巡检 / Cloudflare Analytics 告警 / DLQ 告警 |
| 错误日志查看 | ❌ 待做 | 未建立 `wrangler tail` 巡检习惯 |

### 飞书 Webhook 配置清单（待做 — 需用户本机飞书控制台操作，AI 无法代登）

> 完整步骤见 `docs/DEPLOYMENT.md` 第 5 步。以下为要点：

1. 打开飞书开放平台 → 进入你的应用
2. **事件订阅** → 请求地址填：`https://rss.yuanzhounote.com/webhook/feishu`
   （⚠️ 必须用自定义域名：`*.workers.dev` 国内不可达，飞书回调会超时；路径是 `/webhook/feishu` 不是 `/feishu/webhook`）
3. 添加事件：`im.message.receive_v1`（接收消息）
4. 开通权限：`im:message`（读取消息；机器人主动发消息暂未用到 APP_ID/APP_SECRET）
5. **关闭消息加密**（代码未实现解密，启用后无法解析；不要设 `FEISHU_ENCRYPT_KEY`）
6. 本机执行 `wrangler secret put FEISHU_VERIFICATION_TOKEN`（值取自飞书 Verification Token）
7. 把机器人拉进目标群聊，群里发链接 → 30 秒后 `/rss.xml` 出现条目即成功

### Extractor Worker 部署清单（已完成，2026-07-07）

```bash
cd extractor
npm install
wrangler secret put SUPABASE_URL      # 输入 .env 中的值
wrangler secret put SUPABASE_SERVICE_KEY
wrangler deploy
```

> 以上步骤已于 2026-07-07 执行，Extractor 已上线。后续仅依赖代码改动后重新 `wrangler deploy`。

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
