// 从线上网站取回上一次的数据，放进 data/，给这次抓取当“上次成功的数据”和历史存档。
// 数据每小时更新但一天只往仓库提交一次，所以线上的版本比仓库里的新。
// 用法：node scripts/restore.mjs https://zxc9895.github.io/REMENG/
// 任何一个文件取不到就保留仓库里的版本，不会报错退出。
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getJSON } from './http.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] || '').replace(/\/?$/, '/');

async function pull(rel) {
  try {
    // 加时间戳绕过 GitHub Pages 的 10 分钟缓存
    const data = await getJSON(new URL(`${rel}?t=${Date.now()}`, base).href);
    const file = path.join(ROOT, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data));
    return data;
  } catch (e) {
    console.log(`  跳过 ${rel}：${e.message}`);
    return null;
  }
}

if (!/^https?:\/\//.test(base)) {
  console.log('没有提供网站地址，跳过恢复');
} else {
  console.log(`从 ${base} 恢复数据`);
  const latest = await pull('data/latest.json');
  const dates = (await pull('data/history/index.json')) ?? [];
  let n = 0;
  for (const d of dates) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && (await pull(`data/history/${d}.json`))) n++;
  }
  console.log(`恢复完成：latest ${latest ? '✓' : '✗'}，历史 ${n}/${dates.length} 天`);
}
