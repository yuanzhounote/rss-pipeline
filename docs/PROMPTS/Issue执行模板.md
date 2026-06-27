# Issue 执行模板

> 当 CTO 拆好一个 Issue 后，用这个模板让 AI 执行。

---

## 模板

```
## 任务
执行 Issue: [Issue 编号和标题]

## 前置阅读
1. docs/ARCHITECTURE.md — 了解架构
2. docs/ISSUES/[issue文件名] — 了解 Issue 详情

## 执行步骤
1. 读取 Issue 中标注的涉及文件，确认问题存在
2. 按 Issue 中的修复方案实现代码修改
3. 运行 npm run typecheck 确保类型正确
4. 如有必要，更新相关文档（README、ARCHITECTURE）
5. 输出修改摘要：改了哪些文件、改了什么、为什么

## 输出格式
### 修改文件
- `文件路径` — 改了什么

### 验证
- typecheck 结果: pass / fail

### 风险
- 是否有破坏性变更
- 是否需要迁移数据库
- 是否需要新增环境变量
```

---

## 使用示例

```
## 任务
执行 Issue: #1 extractor/package.json 缺少 turndown 依赖

## 前置阅读
1. docs/ARCHITECTURE.md
2. docs/ISSUES/001-extractor-missing-turndown.md

## 执行步骤
1. 读取 extractor/package.json，确认缺少 turndown
2. 按 Issue 方案添加 turndown 和 @types/turndown
3. 运行 npm run typecheck
4. 输出修改摘要
```
