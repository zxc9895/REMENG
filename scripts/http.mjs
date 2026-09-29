import { TIMEOUT_MS, UA } from './config.mjs';

// 带超时和浏览器 UA 的 fetch；非 2xx 直接抛错
export async function request(url, { headers = {}, ...opts } = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8', ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.split('?')[0]}`);
  return res;
}

export const getJSON = async (url, opts) => (await request(url, opts)).json();
export const getText = async (url, opts) => (await request(url, opts)).text();

// 统一条目格式：{ rank, title, url, hot, cover?, author? }
export function normalize(list, max) {
  return list
    .filter((it) => it && it.title && it.url)
    .slice(0, max)
    .map((it, i) => {
      const out = { rank: i + 1, title: String(it.title).trim(), url: it.url };
      if (it.hot !== undefined && it.hot !== null && it.hot !== '') out.hot = it.hot;
      if (it.cover) out.cover = String(it.cover).replace(/^http:/, 'https:');
      if (it.author) out.author = String(it.author);
      return out;
    });
}
