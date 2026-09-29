import { request, getJSON } from '../http.mjs';

const API =
  'https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1';

export default {
  id: 'douyin',
  name: '抖音',
  kind: '热点',
  unit: '热度', // 热度数字后面显示的单位
  home: 'https://www.douyin.com/hot',

  async fetch() {
    // 先拿一个临时 cookie，不带的话接口偶尔返回空
    const headers = { Referer: 'https://www.douyin.com/' };
    try {
      const res = await request('https://www.douyin.com/passport/general/login_guiding_strategy/?aid=6383');
      const m = res.headers.getSetCookie().join(';').match(/passport_csrf_token=([^;]+)/);
      if (m) headers.Cookie = `passport_csrf_token=${m[1]}`;
    } catch {
      // 拿不到就裸请求
    }
    return getJSON(API, { headers });
  },

  parse(raw) {
    const list = raw?.data?.word_list;
    if (!Array.isArray(list)) throw new Error('返回格式变了：缺少 data.word_list');
    return list.map((v) => ({
      title: v.word,
      hot: v.hot_value,
      url: `https://www.douyin.com/hot/${v.sentence_id}`,
      // 抖音的嵌入播放器在外部网站放不出来（黑屏），所以抖音不做站内播放，点开直接跳转
      cover: v.word_cover?.url_list?.[0],
    }));
  },
};
