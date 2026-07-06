# 飞书订阅模式决策：为何必须用 HTTP 回调而非 WebSocket 长连接

> 记录时间：2026-07-06
> 背景：部署 RSS Pipeline 飞书 webhook 时，发现 Hermes Bot 默认处于「长连接」订阅模式，需切换为 HTTP 回调模式。

## 两种模式本质区别

| 维度 | WebSocket 长连接 | HTTP 回调 |
|---|---|---|
| 谁主动连谁 | 你的程序**主动连飞书**，保持 24h 不断 | 飞书**主动 POST 到你的网址** |
| 需要跑什么 | 一个**常驻进程**（daemon），用官方 SDK 一直占着连接 | 一个**公开网址**，能收 POST 即可 |
| 断线处理 | 需自己重连、保活 | 不用管，请求来了就处理 |

## 为什么本架构只能选 HTTP 回调

RSS Pipeline 基于 **Cloudflare Workers**，其特点是**无状态、按需启动、跑完即销毁**。Worker 没有「常驻进程」概念，无法像虚拟机那样 7×24 保持 WebSocket 连接。

我们写的代码（`src/index.ts`）实现的是 **HTTP 接收端**：

```js
router.post('/webhook/feishu', handleFeishuWebhook)
```

它**等着飞书来敲门**，不是自己跑去连飞书。长连接模式要求相反的形态——你得有个程序主动连飞书，但 Worker 不具备此能力，代码也未实现 WebSocket 客户端。

## 若坚持用长连接的后果

- 飞书根本不会 POST 到 `rss.yuanzhounote.com/webhook/feishu`
- webhook 端点永远收不到消息
- 飞书群发链接 → 无反应 → 文章进不了库 → RSS 无新内容
- 整个管道「入口」死亡，后续解析、出 RSS 全失效

## 一句话结论

> 长连接 = 养一个 24h 在线的客户端；HTTP 回调 = 给飞书一个网址让它来敲。
> Cloudflare Worker 是「门」不是「电话」——只能走 HTTP 回调。

## 配置要点（Hermes Bot）

1. 事件与回调 → 事件配置 → 点「订阅方式」链接，从长连接切到 **HTTP 回调 / 请求地址**
2. 请求地址填：`https://rss.yuanzhounote.com/webhook/feishu`
3. 切到 HTTP 模式后页面出现 **Verification Token** → 复制到本地
4. 本机注入：
   ```bash
   cd /Users/wangyanqin/Documents/ALL-IN-ONE/020学习/rss-pipeline
   npx wrangler secret put FEISHU_VERIFICATION_TOKEN
   ```
5. **不要开启消息加密**（代码未实现解密逻辑）
6. 事件需已订阅 `im.message.receive_v1`（接收消息 v2.0）
