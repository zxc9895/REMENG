import { createHash } from 'node:crypto';
import { getJSON } from '../http.mjs';

const HEADERS = { Referer: 'https://www.bilibili.com/' };

// B 站 WBI 签名：用 nav 接口给的两段 key 打乱后做 md5
const MIXIN = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12,
  38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];
const keyOf = (u = '') => u.slice(u.lastIndexOf('/') + 1, u.lastIndexOf('.'));

async function signWbi(params, headers) {
  const nav = await getJSON('https://api.bilibili.com/x/web-interface/nav', { headers });
  const img = nav?.data?.wbi_img;
  const orig = keyOf(img?.img_url) + keyOf(img?.sub_url);
  if (orig.length < 64) throw new Error('拿不到 WBI key');
  const mixin = MIXIN.map((n) => orig[n]).join('').slice(0, 32);
  const query = Object.entries({ ...params, wts: Math.round(Date.now() / 1000) })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v).replace(/[!'()*]/g, ''))}`)
    .join('&');
  return `${query}&w_rid=${createHash('md5').update(query + mixin).digest('hex')}`;
}

// 游客 buvid cookie，能减少 -352 风控
async function guestHeaders() {
  try {
    const spi = await getJSON('https://api.bilibili.com/x/frontend/finger/spi', { headers: HEADERS });
    if (spi?.data?.b_3) return { ...HEADERS, Cookie: `buvid3=${spi.data.b_3}; buvid4=${spi.data.b_4}` };
  } catch {
    // 忽略
  }
  return HEADERS;
}

export default {
  id: 'bilibili',
  name: 'B站',
  kind: '视频',
  unit: '播放', // 热度数字后面显示的单位
  home: 'https://www.bilibili.com/v/popular/rank/all',

  async fetch() {
    const headers = await guestHeaders();
    try {
      // 全站排行榜（需要签名）
      const q = await signWbi({ rid: 0, type: 'all' }, headers);
      const raw = await getJSON(`https://api.bilibili.com/x/web-interface/ranking/v2?${q}`, { headers });
      if (raw?.code === 0 && raw.data?.list?.length) return raw;
    } catch {
      // 走备用
    }
    // 备用：综合热门
    return getJSON('https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1', { headers });
  },

  parse(raw) {
    const list = raw?.data?.list;
    if (!Array.isArray(list)) throw new Error(`返回异常：code=${raw?.code} ${raw?.message ?? ''}`);
    return list.map((v) => ({
      title: v.title,
      hot: v.stat?.view,
      url: `https://www.bilibili.com/video/${v.bvid}`,
      cover: v.pic,
      author: v.owner?.name,
      embed: `https://player.bilibili.com/player.html?bvid=${v.bvid}&autoplay=0`,
      excerpt: v.desc === '-' ? '' : v.desc,
    }));
  },
};
