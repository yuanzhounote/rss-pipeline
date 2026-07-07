import { genericParser } from './generic';
import { wechatParser } from './wechat';
import { zhihuParser } from './zhihu';
import { juejinParser } from './juejin';
import type { ArticleParser } from './types';

// 解析器列表：按优先级排序，越特殊的越靠前
export const parsers: ArticleParser[] = [
  wechatParser,
  zhihuParser,
  juejinParser,
  genericParser, // 兜底
];

export function getParserForUrl(url: string): ArticleParser {
  for (const parser of parsers) {
    if (parser.canHandle(url)) {
      return parser;
    }
  }
  return genericParser;
}

export type { ArticleParser } from './types';
