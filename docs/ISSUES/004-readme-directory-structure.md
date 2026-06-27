# Issue #4: README 目录结构描述有误

**优先级**：🟢 低（文档问题）
**状态**：✅ 已修复
**发现日期**：2026-06-27

## 问题描述

`README.md` 第 85-99 行的目录结构中，`extractor/` 出现了两次，且没有反映实际的 `extractor/package.json` 和 `docs/` 目录：

```text
rss-pipeline/
├── src/
│   └── index.ts          # API Gateway Worker
├── extractor/
│   └── src/
│       └── extractor.ts  # Extractor Worker    ← 缺少 package.json、wrangler.toml
├── sql/
│   └── create_articles_table.sql
├── wrangler.toml         # API Worker 配置
├── extractor/            ← 重复出现
│   └── wrangler.toml     # Extractor Worker 配置
├── .env.example
└── README.md
```

## 修复方案

更新为实际目录结构：

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

## 涉及文件

- `README.md`（第 85-99 行）
