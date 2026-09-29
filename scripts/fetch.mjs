// 抓取所有平台热榜，写入 data/latest.json 和 data/history/<日期>.json
// 用法：node scripts/fetch.mjs          真实抓取
//       node scripts/fetch.mjs --mock   用 scripts/fixtures 里的样例数据（离线预览用）
import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sources from './sources/index.mjs';
import { normalize } from './http.mjs';
import { MAX_ITEMS } from './config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const HISTORY = path.join(DATA, 'history');
const KEEP_DAYS = 90;
const mock = process.argv.includes('--mock');

const readJSON = async (file) => JSON.parse(await readFile(file, 'utf8'));
const writeJSON = (file, obj) => writeFile(file, JSON.stringify(obj));

// 按北京时间算“今天”
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

async function run() {
  await mkdir(HISTORY, { recursive: true });
  const prev = await readJSON(path.join(DATA, 'latest.json')).catch(() => null);
  const now = new Date().toISOString();

  const platforms = await Promise.all(
    sources.map(async (s) => {
      const base = { id: s.id, name: s.name, kind: s.kind, unit: s.unit, home: s.home };
      try {
        const raw = mock ? await readJSON(path.join(ROOT, 'scripts/fixtures', `${s.id}.json`)) : await s.fetch();
        const items = normalize(s.parse(raw), MAX_ITEMS);
        if (!items.length) throw new Error('拿到的是空列表');
        console.log(`✓ ${s.name.padEnd(8)} ${items.length} 条`);
        return { ...base, ok: true, updatedAt: now, items };
      } catch (e) {
        // 失败了就沿用上一次成功的数据，页面上标记“数据暂旧”
        const old = prev?.platforms?.find((p) => p.id === s.id);
        console.log(`✗ ${s.name.padEnd(8)} ${e.message}${old?.items?.length ? '（沿用上次数据）' : ''}`);
        return { ...base, ok: false, error: e.message, updatedAt: old?.updatedAt ?? null, items: old?.items ?? [] };
      }
    }),
  );

  const date = today();
  const out = { date, generatedAt: now, ...(mock && { mock: true }), platforms };
  await writeJSON(path.join(DATA, 'latest.json'), out);
  await writeJSON(path.join(HISTORY, `${date}.json`), out);

  // 更新日期索引，删掉超过 KEEP_DAYS 天的存档
  const dates = (await readdir(HISTORY))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort()
    .reverse();
  for (const d of dates.slice(KEEP_DAYS)) await unlink(path.join(HISTORY, `${d}.json`));
  await writeJSON(path.join(HISTORY, 'index.json'), dates.slice(0, KEEP_DAYS));

  const okCount = platforms.filter((p) => p.ok).length;
  console.log(`完成：${okCount}/${platforms.length} 个平台成功，日期 ${date}`);
  // 全部失败才算失败（让 Actions 标红提醒你）
  if (okCount === 0) process.exitCode = 1;
}

run();
