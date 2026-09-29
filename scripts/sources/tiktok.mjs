import { request } from '../http.mjs';
import { REGION } from '../config.mjs';

// TikTok 没有公开的热门接口，这里依次试 TikTok Creative Center 的几个地址：
// 先试热门视频，再试热门话题；页面里嵌的 JSON 和它的内部接口都会尝试。属于“尽力而为”。
const CC = 'https://ads.tiktok.com';
const ATTEMPTS = [
  `${CC}/business/creativecenter/inspiration/popular/pc/en?countryCode=${REGION}&period=7`,
  `${CC}/creative_radar_api/v1/popular_trend/list?period=7&page=1&limit=50&order_by=vv&country_code=${REGION}`,
  `${CC}/business/creativecenter/inspiration/popular/hashtag/pc/en?countryCode=${REGION}&period=7`,
  `${CC}/creative_radar_api/v1/popular_trend/hashtag/list?period=7&page=1&limit=50&sort_by=popular&country_code=${REGION}`,
];

// 从 HTML 里取出所有内嵌 JSON：<script type="application/json">、__NEXT_DATA__、window.xxx = {...}
function embeddedJSON(html) {
  const out = [];
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const text = body.trim();
    const json = /application\/json/.test(attrs) || /^[{[]/.test(text)
      ? text
      : text.match(/^window\.[\w$]+\s*=\s*(\{[\s\S]*\})\s*;?$/)?.[1];
    if (!json) continue;
    try {
      out.push(JSON.parse(json));
    } catch {
      // 不是合法 JSON，跳过
    }
  }
  return out;
}

// 在整棵 JSON 里找第一个“每一项都满足 test”的数组
function findList(node, test) {
  if (Array.isArray(node)) {
    if (node.length && node.every((x) => x && typeof x === 'object' && !Array.isArray(x) && test(x))) return node;
    for (const x of node) {
      const r = findList(x, test);
      if (r) return r;
    }
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) {
      const r = findList(v, test);
      if (r) return r;
    }
  }
  return null;
}

// 页面数据是驼峰命名，内部接口是下划线命名，两种都认
const isVideo = (x) => ['itemId', 'itemUrl', 'item_id', 'item_url'].some((k) => k in x);
const isHashtag = (x) => 'hashtagName' in x || 'hashtag_name' in x;

// 失败时说明拿到了什么，方便在 Actions 日志里排查
function describe(text) {
  const title = text.match(/<title>([^<]*)<\/title>/)?.[1]?.trim();
  const ids = [...text.matchAll(/<script[^>]*\bid="([^"]+)"/g)].map((m) => m[1]).slice(0, 5);
  return `${text.length}字节${title ? ` 标题「${title}」` : ''}${ids.length ? ` script:${ids.join(',')}` : ''}`;
}

export default {
  id: 'tiktok',
  name: 'TikTok',
  kind: '视频',
  unit: '播放', // 热度数字后面显示的单位
  home: 'https://www.tiktok.com/explore',

  async fetch() {
    const errors = [];
    for (const url of ATTEMPTS) {
      const short = url.replace(CC, '').split('?')[0];
      try {
        const text = await (await request(url, { headers: { Referer: `${CC}/business/creativecenter/` } })).text();
        const candidates = /^\s*[{[]/.test(text) ? [JSON.parse(text)] : embeddedJSON(text);
        const hit = candidates.find((c) => findList(c, isVideo) || findList(c, isHashtag));
        if (hit) return hit;
        errors.push(`${short} 没找到列表（${describe(text)}）`);
      } catch (e) {
        errors.push(`${short} ${e.message}`);
      }
    }
    throw new Error(errors.join('；'));
  },

  parse(raw) {
    const videos = findList(raw, isVideo);
    if (videos) {
      return videos.map((v) => {
        const id = v.itemId ?? v.item_id;
        return {
          title: v.title || v.desc || '（无标题视频）',
          hot: v.vv ?? v.playCount ?? v.play_count ?? v.videoViews ?? v.video_views,
          url: v.itemUrl || v.item_url || `https://www.tiktok.com/@tiktok/video/${id}`,
          cover: v.cover,
          author: v.nickName ?? v.nickname ?? v.author,
          embed: id ? `https://www.tiktok.com/embed/v2/${id}` : undefined,
        };
      });
    }
    const tags = findList(raw, isHashtag);
    if (tags) {
      return tags.map((v) => {
        const name = v.hashtagName ?? v.hashtag_name;
        return {
          title: `#${name}`,
          hot: v.videoViews ?? v.video_views ?? v.publishCnt ?? v.publish_cnt,
          url: `https://www.tiktok.com/tag/${encodeURIComponent(name)}`,
        };
      });
    }
    throw new Error('返回格式变了：找不到视频或话题列表');
  },
};
