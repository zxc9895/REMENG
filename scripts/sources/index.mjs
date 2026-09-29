import douyin from './douyin.mjs';
import bilibili from './bilibili.mjs';
import weibo from './weibo.mjs';
import zhihu from './zhihu.mjs';
import youtube from './youtube.mjs';
import tiktok from './tiktok.mjs';

// 网页上的显示顺序就是这里的顺序；想加平台：新建一个文件，照着格式写，再加到这里
export default [douyin, bilibili, weibo, zhihu, youtube, tiktok];
