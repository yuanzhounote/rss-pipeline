# Code Review 模板

> AI 完成代码修改后，用这个模板让它自查。CTO 也可以用这个清单做最终审核。

---

## 模板

```
请对刚才的代码修改进行 Code Review，按以下清单逐项检查：

## 1. 架构一致性
- [ ] 修改是否符合 ARCHITECTURE.md 中定义的架构？
- [ ] 是否引入了架构文档中没有的模块或依赖？
- [ ] 状态机流转是否正确（pending → queued → extracting → uploading → ready / failed）？

## 2. 类型安全
- [ ] npm run typecheck 是否通过？
- [ ] 是否有 any 类型需要收窄？
- [ ] Env 接口是否与 wrangler.toml 的 binding 一致？

## 3. 错误处理
- [ ] fetch 失败是否有 try-catch？
- [ ] Supabase 操作失败是否有错误处理？
- [ ] message.retry() 是否有重试次数限制？
- [ ] 失败时是否写入 error 字段？

## 4. 数据一致性
- [ ] 数据库字段是否与 sql/create_articles_table.sql 一致？
- [ ] 状态更新是否幂等（重复执行不会出错）？
- [ ] published_at 是否正确写入？

## 5. 安全
- [ ] 飞书 webhook 是否验证了 token？
- [ ] 是否有 SQL 注入风险？
- [ ] 环境变量是否通过 Env 接口访问，而非硬编码？

## 6. 性能
- [ ] 是否有阻塞事件循环的同步操作？
- [ ] Worker 是否可能在 30 秒内完成？
- [ ] 是否有不必要的重复数据库查询？

## 7. 文档
- [ ] 如有接口变更，ARCHITECTURE.md 是否已更新？
- [ ] 如有新依赖，README 和 package.json 是否已更新？
- [ ] 代码是否有必要的注释？

## 输出
对每一项给出 pass / fail / N/A，fail 项说明原因和修复建议。
```
