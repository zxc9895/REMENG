// 每个平台最多抓多少条（前端滑块上限也读这个值）
export const MAX_ITEMS = 50;

// 单个请求超时（毫秒）
export const TIMEOUT_MS = 15000;

// YouTube / TikTok 按哪个国家/地区取热门，改成 JP、KR、TW、HK 等都可以
export const REGION = process.env.REGION || 'US';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
