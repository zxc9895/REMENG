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

function renderItem(item, platform) {
  const url = safeUrl(item.url);
  const cover = safeUrl(item.cover);
  const slot = el('div', { class: 'cover-slot' });
  if (cover) {
    const img = el('img', { class: 'cover', src: cover, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' });
    img.addEventListener('error', () => img.remove());
    slot.append(img);
  }
  const meta = [formatHot(item.hot, platform.unit), item.author].filter(Boolean).join(' · ');
  return el(
    'li',
    {},
    el('span', { class: 'rank', textContent: item.rank }),
    slot,
    el(
      'div',
      { class: 'item-main' },
      el('a', { href: url ?? '#', target: '_blank', rel: 'noopener noreferrer', textContent: item.title, title: item.title }),
      meta ? el('div', { class: 'meta', textContent: meta }) : null,
    ),
  );
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
    card.append(el('ol', { class: 'list' }, ...shown.map((it) => renderItem(it, p))));
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

renderControls();
loadDates();
loadData('latest');
