import { getJSON } from '../http.mjs';

const searchUrl = (word) => `https://s.weibo.com/weibo?q=${encodeURIComponent(`#${word}#`)}`;

export default {
  id: 'weibo',
  name: '微博',
  kind: '话题',
  unit: '热度', // 热度数字后面显示的单位
  home: 'https://s.weibo.com/top/summary',

  async fetch() {
    try {
      const raw = await getJSON('https://weibo.com/ajax/side/hotSearch', { headers: { Referer: 'https://weibo.com/' } });
      if (raw?.data?.realtime?.length) return raw;
    } catch {
      // 走备用
    }
    // 备用：移动版热搜
    return getJSON(
      'https://m.weibo.cn/api/container/getIndex?containerid=106003type%3D25%26t%3D3%26disable_hot%3D1%26filter_type%3Drealtimehot',
      { headers: { Referer: 'https://m.weibo.cn/' } },
    );
  },

  parse(raw) {
    const realtime = raw?.data?.realtime;
    if (Array.isArray(realtime)) {
      return realtime
        .filter((v) => !v.is_ad)
        .map((v) => ({ title: v.word ?? v.note, hot: v.num, url: searchUrl(v.word ?? v.note) }));
    }
    const group = raw?.data?.cards?.[0]?.card_group;
    if (Array.isArray(group)) {
      return group
        .filter((v) => v.desc && !v.promotion)
        .map((v) => ({ title: v.desc, hot: Number(v.desc_extr) || undefined, url: searchUrl(v.desc) }));
    }
    throw new Error('返回格式变了：缺少 data.realtime');
  },
};
