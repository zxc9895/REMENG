import { getText } from '../http.mjs';
import { REGION } from '../config.mjs';

// TikTok 没有公开的热门接口。这里读 TikTok Creative Center 页面里服务端渲染好的数据
// （<script id="__NEXT_DATA__">），先试热门视频，不行再用热门话题。属于“尽力而为”。
const PAGES = [
  `https://ads.tiktok.com/business/creativecenter/inspiration/popular/pc/en?countryCode=${REGION}&period=7`,
  `https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en?countryCode=${REGION}&period=7`,
];

function nextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('页面里没有 __NEXT_DATA__');
  return JSON.parse(m[1]);
}

// 在整棵 JSON 里找第一个“像视频列表”或“像话题列表”的数组
function findList(node, test) {
  if (Array.isArray(node)) {
    if (node.length && node.every((x) => x && typeof x === 'object' && test(x))) return node;
    for (const x of node) {
      const r = findList(x, test);
      if (r) return r;
    }
  } else if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const r = findList(node[k], test);
      if (r) return r;
    }
  }
  return null;
}

const isVideo = (x) => 'itemId' in x || 'itemUrl' in x;
const isHashtag = (x) => 'hashtagName' in x;

export default {
  id: 'tiktok',
  name: 'TikTok',
  kind: '视频',
  unit: '播放', // 热度数字后面显示的单位
  home: 'https://www.tiktok.com/explore',

  async fetch() {
    const errors = [];
    for (const url of PAGES) {
      try {
        const data = nextData(await getText(url));
        if (findList(data, isVideo) || findList(data, isHashtag)) return data;
        errors.push('页面里没找到列表');
      } catch (e) {
        errors.push(e.message);
      }
    }
    throw new Error(errors.join('；'));
  },

  parse(raw) {
    const videos = findList(raw, isVideo);
    if (videos) {
      return videos.map((v) => ({
        title: v.title || v.desc || '（无标题视频）',
        hot: v.vv ?? v.playCount ?? v.videoViews,
        url: v.itemUrl || `https://www.tiktok.com/@tiktok/video/${v.itemId}`,
        cover: v.cover,
        author: v.nickName ?? v.author,
      }));
    }
    const tags = findList(raw, isHashtag);
    if (tags) {
      return tags.map((v) => ({
        title: `#${v.hashtagName}`,
        hot: v.videoViews ?? v.publishCnt,
        url: `https://www.tiktok.com/tag/${encodeURIComponent(v.hashtagName)}`,
      }));
    }
    throw new Error('返回格式变了：找不到视频或话题列表');
  },
};
