import { getJSON } from '../http.mjs';
import { MAX_ITEMS, REGION } from '../config.mjs';

export default {
  id: 'youtube',
  name: 'YouTube',
  kind: '视频',
  unit: '播放', // 热度数字后面显示的单位
  home: 'https://www.youtube.com/',

  async fetch() {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) throw new Error('未配置 YOUTUBE_API_KEY（见 README）');
    const params = new URLSearchParams({
      part: 'snippet,statistics',
      chart: 'mostPopular',
      regionCode: REGION,
      maxResults: String(MAX_ITEMS),
      key,
    });
    return getJSON(`https://www.googleapis.com/youtube/v3/videos?${params}`);
  },

  parse(raw) {
    const list = raw?.items;
    if (!Array.isArray(list)) throw new Error(raw?.error?.message ?? '返回格式变了：缺少 items');
    return list.map((v) => ({
      title: v.snippet?.title,
      hot: v.statistics?.viewCount ? Number(v.statistics.viewCount) : undefined,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      cover: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url,
      author: v.snippet?.channelTitle,
      embed: `https://www.youtube-nocookie.com/embed/${v.id}`,
      excerpt: v.snippet?.description,
    }));
  },
};
