// 离线测试：用 scripts/fixtures 的样例数据检查每个平台的解析是否正确
// 用法：node scripts/test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sources from './sources/index.mjs';
import { normalize } from './http.mjs';
import { MAX_ITEMS } from './config.mjs';

const fixture = (id) => JSON.parse(readFileSync(new URL(`./fixtures/${id}.json`, import.meta.url), 'utf8'));
const byId = Object.fromEntries(sources.map((s) => [s.id, s]));

for (const s of sources) {
  test(`${s.name}：样例数据解析成统一格式`, () => {
    const items = normalize(s.parse(fixture(s.id)), MAX_ITEMS);
    assert.equal(items.length, MAX_ITEMS);
    items.forEach((it, i) => {
      assert.equal(it.rank, i + 1);
      assert.ok(it.title.length > 0);
      assert.match(it.url, /^https:\/\//);
      if (it.cover) assert.match(it.cover, /^https:\/\//);
    });
  });
}

test('微博：过滤广告', () => {
  const items = byId.weibo.parse(fixture('weibo'));
  assert.ok(!items.some((it) => it.title === '广告位'));
  assert.equal(items[0].url, 'https://s.weibo.com/weibo?q=%23%E5%BE%AE%E5%8D%9A%E7%A4%BA%E4%BE%8B%E8%AF%9D%E9%A2%98%201%23');
});

test('微博：备用接口格式', () => {
  const raw = { data: { cards: [{ card_group: [{ desc: '话题A', desc_extr: '12345' }, { desc: '推广', promotion: {} }] }] } };
  assert.deepEqual(byId.weibo.parse(raw).map((x) => [x.title, x.hot]), [['话题A', 12345]]);
});

test('知乎：api 链接转成网页链接，兼容新格式', () => {
  assert.equal(byId.zhihu.parse(fixture('zhihu'))[0].url, 'https://www.zhihu.com/question/600000');
  const raw = { data: [{ target: { title_area: { text: '新格式' }, link: { url: 'https://www.zhihu.com/question/1' }, metrics_area: { text: '99 万热度' } } }] };
  assert.deepEqual(byId.zhihu.parse(raw)[0], { title: '新格式', hot: '99 万热度', url: 'https://www.zhihu.com/question/1', cover: undefined, excerpt: undefined });
});

test('B站：http 封面转 https；风控时给出错误码', () => {
  assert.match(normalize(byId.bilibili.parse(fixture('bilibili')), 1)[0].cover, /^https:/);
  assert.throws(() => byId.bilibili.parse({ code: -352, message: '风控校验失败' }), /-352/);
});

test('TikTok：没有视频列表时退回热门话题', () => {
  const raw = { props: { pageProps: { data: { list: [{ hashtagName: 'fyp', videoViews: 100 }] } } } };
  assert.deepEqual(byId.tiktok.parse(raw)[0], { title: '#fyp', hot: 100, url: 'https://www.tiktok.com/tag/fyp' });
});

test('TikTok：兼容内部接口的下划线字段', () => {
  const raw = { code: 0, data: { videos: [{ item_id: '123', title: 'v', play_count: 9 }] } };
  assert.deepEqual(byId.tiktok.parse(raw)[0], { title: 'v', hot: 9, url: 'https://www.tiktok.com/@tiktok/video/123', cover: undefined, author: undefined, embed: 'https://www.tiktok.com/embed/v2/123' });
});

test('YouTube：接口报错时把错误信息抛出来', () => {
  assert.throws(() => byId.youtube.parse({ error: { message: 'API key not valid' } }), /API key not valid/);
});

test('站内浏览：B站/YouTube 生成播放器地址，知乎带摘要，抖音不做站内播放', () => {
  const first = (id) => normalize(byId[id].parse(fixture(id)), 5);
  assert.equal(first('bilibili')[0].embed, 'https://player.bilibili.com/player.html?bvid=BV1xx411c700&autoplay=0');
  assert.equal(first('bilibili')[4].excerpt, undefined); // B站简介为 “-” 时不显示
  assert.equal(first('youtube')[0].embed, 'https://www.youtube-nocookie.com/embed/vid00000000');
  assert.equal(first('douyin')[0].embed, undefined);
  assert.match(first('zhihu')[0].excerpt, /^知乎示例问题摘要 1/);
  assert.equal(first('weibo')[0].embed, undefined);
});

test('normalize：摘要压缩空白并截断，非 https 的播放地址丢弃', () => {
  const [it] = normalize([{ title: 't', url: 'https://a', excerpt: ` a \n  b ${'x'.repeat(400)}`, embed: 'javascript:alert(1)' }], 1);
  assert.equal(it.embed, undefined);
  assert.ok(it.excerpt.startsWith('a b x'));
  assert.equal(it.excerpt.length, 301);
});

test('normalize：丢弃无标题/无链接的条目，并重新编号', () => {
  const out = normalize([{ title: '', url: 'https://a' }, { title: 'b', url: 'https://b', hot: 0 }], 10);
  assert.deepEqual(out, [{ rank: 1, title: 'b', url: 'https://b', hot: 0 }]);
});
