// 每日热榜前端：读 data/*.json，按“看前 N 名”和平台筛选后渲染
const MAX_N = 50;
const COLORS = {
  douyin: '#fe2c55',
  bilibili: '#00a1d6',
  weibo: '#ff8200',
  zhihu: '#0066ff',
  youtube: '#ff0000',
  tiktok: '#00c2c7',
};

const $ = (sel) => document.querySelector(sel);

// localStorage 在隐私模式下可能不可用，读写都包一层
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 忽略
    }
  },
};

const clampN = (v) => Math.min(MAX_N, Math.max(1, Math.round(Number(v)) || 10));

const state = {
  n: clampN(store.get('topN', 10)),
  tab: store.get('tab', 'all'),
  data: null,
};

// ---------- 小工具 ----------
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined) node.append(c);
  return node;
}

// 只放行 http(s) 链接，防止数据里混进 javascript: 之类
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

// 站内播放器只允许这些官方嵌入地址
const EMBED_HOSTS = ['player.bilibili.com', 'www.youtube-nocookie.com', 'open.douyin.com', 'www.tiktok.com'];
function safeEmbed(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && EMBED_HOSTS.includes(x.hostname) ? u : null;
  } catch {
    return null;
  }
}
// 竖屏视频的平台，播放器按 9:16 显示
const PORTRAIT = new Set(['douyin', 'tiktok']);
const canView = (item) => Boolean(safeEmbed(item.embed) || item.excerpt);

function formatHot(hot, unit) {
  if (hot === undefined || hot === null || hot === '') return '';
  if (typeof hot === 'string' && !/^\d+(\.\d+)?$/.test(hot)) return hot; // 已经是“123 万热度”这种文字
  const n = Number(hot);
  const trim = (x) => x.toFixed(1).replace(/\.0$/, '');
  const text = n >= 1e8 ? `${trim(n / 1e8)}亿` : n >= 1e4 ? `${trim(n / 1e4)}万` : String(n);
  return unit ? `${text} ${unit}` : text;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

// ---------- 数据 ----------
async function loadJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function loadDates() {
  try {
    const dates = await loadJSON('data/history/index.json');
    const select = $('#date');
    for (const d of dates) select.append(el('option', { value: d, textContent: d }));
  } catch {
    // 还没有历史数据
  }
}

async function loadData(date) {
  const url = date === 'latest' ? 'data/latest.json' : `data/history/${date}.json`;
  try {
    state.data = await loadJSON(url);
  } catch {
    state.data = null;
  }
  render();
}

// ---------- 渲染 ----------
function renderHeader() {
  const d = state.data;
  $('#updated').textContent = d
    ? `数据日期 ${d.date} · 抓取于 ${formatTime(d.generatedAt)}`
    : '暂无数据';

  const notice = $('#notice');
  if (!d) {
    notice.textContent = '还没有数据：到 GitHub 仓库的 Actions 页面，手动运行一次「更新热榜」即可。';
    notice.hidden = false;
  } else if (d.mock) {
    notice.textContent = '当前显示的是示例数据，GitHub Actions 第一次抓取成功后会自动换成真实榜单。';
    notice.hidden = false;
  } else {
    notice.hidden = true;
  }
}

function renderTabs() {
  const tabs = $('#tabs');
  tabs.replaceChildren();
  const platforms = state.data?.platforms ?? [];
  if (state.tab !== 'all' && !platforms.some((p) => p.id === state.tab)) state.tab = 'all';

  const make = (id, label, color) => {
    const a = el('a', { href: `#${id}`, 'aria-current': String(state.tab === id) });
    if (color) a.append(el('span', { class: 'dot', style: `--c:${color}` }));
    a.append(label);
    a.addEventListener('click', (e) => {
      e.preventDefault();
      state.tab = id;
      store.set('tab', id);
      render();
    });
    return a;
  };
  tabs.append(make('all', '全部'));
  for (const p of platforms) tabs.append(make(p.id, p.name, COLORS[p.id]));
}

function renderItem(item, platform, list, index) {
  const url = safeUrl(item.url);
  const cover = safeUrl(item.cover);
  const slot = el('div', { class: 'cover-slot' });
  if (cover) {
    const img = el('img', { class: 'cover', src: cover, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' });
    img.addEventListener('error', () => img.remove());
    slot.append(img);
  }
  const meta = [formatHot(item.hot, platform.unit), item.author].filter(Boolean).join(' · ');
  const link = el('a', { href: url ?? '#', target: '_blank', rel: 'noopener noreferrer', textContent: item.title, title: item.title });
  const metaRow = el('div', { class: 'meta' });
  if (canView(item)) {
    // 能站内看的：普通点击打开弹窗；按住 Ctrl/⌘ 点击仍然新标签打开原平台
    const open = (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      openViewer(platform, list, index);
    };
    link.addEventListener('click', open);
    slot.addEventListener('click', open);
    slot.classList.add('clickable');
    metaRow.append(el('span', { class: 'chip', textContent: safeEmbed(item.embed) ? '▶ 站内播放' : '摘要' }));
  }
  if (meta) metaRow.append(meta);
  return el(
    'li',
    {},
    el('span', { class: 'rank', textContent: item.rank }),
    slot,
    el('div', { class: 'item-main' }, link, metaRow.childNodes.length ? metaRow : null),
  );
}

// ---------- 站内查看弹窗 ----------
const viewer = { platform: null, list: [], index: 0 };

function openViewer(platform, list, index) {
  Object.assign(viewer, { platform, list, index });
  renderViewer();
  if (!$('#viewer').open) $('#viewer').showModal();
}

function renderViewer() {
  const { platform: p, list, index } = viewer;
  const item = list[index];
  $('#viewer-dot').style.setProperty('--c', COLORS[p.id] ?? 'var(--accent)');
  $('#viewer-source').textContent = `${p.name} · 第 ${item.rank} 名`;
  $('#viewer-title').textContent = item.title;
  $('#viewer-meta').textContent = [formatHot(item.hot, p.unit), item.author].filter(Boolean).join(' · ');

  const body = $('#viewer-body');
  body.replaceChildren();
  const src = safeEmbed(item.embed);
  if (src) {
    body.append(
      el(
        'div',
        { class: `frame${PORTRAIT.has(p.id) ? ' portrait' : ''}` },
        el('iframe', {
          src,
          title: item.title,
          allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture',
          allowFullscreen: true,
          // YouTube 嵌入需要带来源，这里覆盖页面默认的 no-referrer
          referrerPolicy: 'strict-origin-when-cross-origin',
        }),
      ),
    );
  }
  if (item.excerpt) body.append(el('p', { class: 'excerpt', textContent: item.excerpt }));
  if (!src && !item.excerpt) {
    body.append(el('p', { class: 'excerpt muted', textContent: '这一条没有能在站内看的内容，点「去原平台」查看。' }));
  }

  const url = safeUrl(item.url);
  $('#viewer-open').href = url ?? '#';
  $('#viewer-open').hidden = !url;
  $('#viewer-pos').textContent = `${index + 1} / ${list.length}`;
  $('#viewer-prev').disabled = index === 0;
  $('#viewer-next').disabled = index === list.length - 1;
}

function stepViewer(delta) {
  const next = viewer.index + delta;
  if (next < 0 || next >= viewer.list.length) return;
  viewer.index = next;
  renderViewer();
}

function renderCard(p) {
  const items = p.items ?? [];
  const shown = items.slice(0, state.n);

  let statusText;
  let warn = false;
  if (p.ok) statusText = `更新于 ${formatTime(p.updatedAt)}`;
  else if (items.length) {
    statusText = `本次抓取失败，显示 ${formatTime(p.updatedAt)} 的数据`;
    warn = true;
  } else {
    statusText = '暂时抓不到';
    warn = true;
  }

  const card = el(
    'article',
    { class: 'card', id: `card-${p.id}` },
    el(
      'header',
      { class: 'card-head' },
      el('span', { class: 'dot', style: `--c:${COLORS[p.id] ?? 'var(--accent)'}` }),
      el('h2', { textContent: p.name }),
      el('span', { class: 'badge', textContent: p.kind }),
      el('span', { class: `status${warn ? ' warn' : ''}`, textContent: statusText, title: p.error ?? '' }),
    ),
  );

  if (shown.length) {
    card.append(el('ol', { class: 'list' }, ...shown.map((it, i) => renderItem(it, p, shown, i))));
  } else {
    card.append(el('div', { class: 'empty', textContent: p.error ? `原因：${p.error}` : '暂无数据', title: p.error ?? '' }));
  }

  const home = safeUrl(p.home);
  card.append(
    el(
      'footer',
      { class: 'card-foot' },
      el('span', { textContent: items.length && items.length < state.n ? `该平台只有 ${items.length} 条` : '' }),
      home ? el('a', { href: home, target: '_blank', rel: 'noopener noreferrer', textContent: `去${p.name}看完整榜单 →` }) : null,
    ),
  );
  return card;
}

function renderBoard() {
  const board = $('#board');
  const platforms = (state.data?.platforms ?? []).filter((p) => state.tab === 'all' || p.id === state.tab);
  board.classList.toggle('single', state.tab !== 'all');
  board.replaceChildren(...platforms.map(renderCard));
}

function renderControls() {
  $('#n-range').value = state.n;
  $('#n-num').value = state.n;
  for (const b of document.querySelectorAll('#presets button')) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.n) === state.n));
  }
}

function render() {
  renderHeader();
  renderControls();
  renderTabs();
  renderBoard();
}

// ---------- 交互 ----------
function setN(v) {
  const n = clampN(v);
  if (n === state.n) return renderControls();
  state.n = n;
  store.set('topN', n);
  renderControls();
  renderBoard();
}

$('#n-range').addEventListener('input', (e) => setN(e.target.value));
$('#n-num').addEventListener('change', (e) => setN(e.target.value));
$('#presets').addEventListener('click', (e) => {
  const n = e.target.closest('button')?.dataset.n;
  if (n) setN(n);
});
$('#date').addEventListener('change', (e) => loadData(e.target.value));

const dialog = $('#viewer');
$('#viewer-close').addEventListener('click', () => dialog.close());
$('#viewer-prev').addEventListener('click', () => stepViewer(-1));
$('#viewer-next').addEventListener('click', () => stepViewer(1));
// 点弹窗外面的暗色区域关闭
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});
// 左右方向键切换上一条/下一条（挂在 document 上，焦点在哪都能用）
document.addEventListener('keydown', (e) => {
  if (!dialog.open) return;
  if (e.key === 'ArrowLeft') stepViewer(-1);
  if (e.key === 'ArrowRight') stepViewer(1);
});
// 关掉时移除播放器，视频随之停止
dialog.addEventListener('close', () => $('#viewer-body').replaceChildren());

renderControls();
loadDates();
loadData('latest');
