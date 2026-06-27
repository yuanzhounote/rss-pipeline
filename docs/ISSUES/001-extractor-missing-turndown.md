# Issue #1: extractor/package.json 缺少 turndown 依赖

**优先级**：🔴 高（部署直接报错）
**状态**：✅ 已修复
**发现日期**：2026-06-27

## 问题描述

`extractor/src/extractor.ts` 第 4 行 `import TurndownService from 'turndown'`，但 `extractor/package.json` 的 `dependencies` 中没有声明 `turndown` 和 `@types/turndown`。

根目录 `package.json` 有这个依赖，但 Extractor Worker 部署时使用 `extractor/package.json`，因此 `wrangler deploy` 在 extractor 目录下会因找不到模块而失败。

## 复现路径

```bash
cd extractor
npm install
wrangler deploy
# → Cannot find module 'turndown'
```

## 修复方案

在 `extractor/package.json` 的 `dependencies` 中添加：

```json
"turndown": "^7.2.4"
```

在 `devDependencies` 中添加：

```json
"@types/turndown": "^5.0.6"
```

## 涉及文件

- `extractor/package.json`
