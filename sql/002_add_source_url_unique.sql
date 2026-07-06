-- 002_add_source_url_unique.sql
-- 为 source_url 添加唯一约束，防止重复插入
-- 执行前请确保现有数据中没有重复的 source_url，否则约束会创建失败

-- 检查是否有重复数据（可选，执行前确认）
-- SELECT source_url, COUNT(*) FROM articles GROUP BY source_url HAVING COUNT(*) > 1;

-- 清理重复数据（如果有）：保留最新一条
-- DELETE FROM articles a USING articles b
-- WHERE a.source_url = b.source_url AND a.id < b.id;

-- 添加唯一约束
ALTER TABLE articles ADD CONSTRAINT uq_articles_source_url UNIQUE (source_url);
