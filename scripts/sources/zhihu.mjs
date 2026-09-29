import { getJSON } from '../http.mjs';

// api.zhihu.com/questions/123 → www.zhihu.com/question/123
const webUrl = (u = '') => u.replace(/^https?:\/\/api\.zhihu\.com\/questions\//, 'https://www.zhihu.com/question/');

export default {
  id: 'zhihu',
  name: '知乎',
  kind: '问答',
  unit: '', // 知乎返回的就是“xx 万热度”文字，不用再加单位
  home: 'https://www.zhihu.com/hot',

  async fetch() {
    const headers = process.env.ZHIHU_COOKIE ? { Cookie: process.env.ZHIHU_COOKIE } : {};
    try {
      return await getJSON('https://api.zhihu.com/topstory/hot-lists/total?limit=50', { headers });
    } catch {
      return getJSON('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50&desktop=true', { headers });
    }
  },

  parse(raw) {
    const list = raw?.data;
    if (!Array.isArray(list)) throw new Error('返回格式变了：缺少 data');
    return list.map((v) => {
      const t = v.target ?? {};
      return {
        // 新旧两种返回格式都兼容
        title: t.title ?? t.title_area?.text,
        hot: v.detail_text ?? t.metrics_area?.text,
        url: webUrl(t.url ?? t.link?.url),
        cover: v.children?.[0]?.thumbnail || t.image_area?.url,
      };
    });
  },
};
