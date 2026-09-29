# 每日热榜 TopN

每天自动汇总 **抖音、B站、微博、知乎、YouTube、TikTok** 的热榜，网页上可以自己拖动滑块，调节看前几名（1～50）。

- 网页：纯静态（`index.html` + `style.css` + `app.js`），托管在 GitHub Pages，免费
- 数据：GitHub Actions 每天北京时间 8 点抓取一次，存成 `data/latest.json`，并按日期存档到 `data/history/`（保留 90 天），网页上可以回看往日榜单
- 零依赖：只需要 Node.js 20+，不用 `npm install`

## 上线步骤（只需做一次）

1. **仓库要能用 Pages**：私有仓库的 GitHub Pages 需要付费账号（GitHub Pro）。免费账号请把仓库改成公开：Settings → General → 最底部 Danger Zone → Change visibility → Public。
2. **开启 Pages**：Settings → Pages → Build and deployment → Source 选 **GitHub Actions**。
3. **（可选）YouTube**：YouTube 必须用官方 API Key（免费）。
   - 到 [Google Cloud Console](https://console.cloud.google.com/) 新建项目 → 启用 “YouTube Data API v3” → 凭据 → 创建 API 密钥
   - 仓库 Settings → Secrets and variables → Actions → New repository secret，名字填 `YOUTUBE_API_KEY`
   - 不配也没关系，网页上 YouTube 卡片会显示“暂时抓不到”，其他平台照常
4. **跑第一次**：Actions → 更新热榜 → Run workflow。跑完后在 Settings → Pages 能看到网址。

> 定时任务只在**默认分支**上运行。如果你在别的分支开发，合并到默认分支后才会每天自动更新。

## 常见问题

**某个平台显示“本次抓取失败，显示 xx 的数据”？**
那个平台这次没抓到（接口改了或者被限流），会先显示上一次成功的数据，下次定时任务会再试。在 Actions 运行日志里能看到具体原因。

**TikTok 显示“暂时抓不到”？**
TikTok 没有公开的热门接口。脚本会尝试 TikTok Creative Center 的页面和内部接口，但它现在改成了浏览器端渲染 + 请求签名，普通请求拿不到数据（Actions 日志里能看到具体原因）。要抓得用无头浏览器模拟打开页面，比较重，暂未做。

**YouTube / TikTok 是哪个国家的热门？**
默认美国（US）。想改：仓库 Settings → Secrets and variables → Actions → Variables → 新建 `REGION`，填 `JP`、`KR`、`TW` 等。

**知乎抓不到？**
知乎有时要求登录。可以把浏览器里登录后的 Cookie 存成 Secret `ZHIHU_COOKIE`。

**想改更新时间 / 一天更新多次？**
改 `.github/workflows/update.yml` 里的 `cron`。注意是 UTC 时间，北京时间要减 8 小时，例如每天 8 点和 20 点：`'0 0,12 * * *'`。

## 本地预览 / 开发

```bash
node scripts/fetch.mjs --mock   # 用样例数据生成 data/（不联网）
node scripts/fetch.mjs          # 真实抓取（国内网络下抖音/B站/微博/知乎能直接抓）
node scripts/test.mjs           # 测试各平台的解析逻辑
python3 -m http.server 8080     # 然后打开 http://localhost:8080
```

## 加一个新平台

1. 在 `scripts/sources/` 新建一个文件，照着 `weibo.mjs` 的格式写 `fetch()`（去拿数据）和 `parse()`（转成 `{ title, url, hot, cover?, author? }` 列表）
2. 在 `scripts/sources/index.mjs` 里加上它
3. 在 `scripts/fixtures/` 放一份接口返回样例，跑 `node scripts/test.mjs` 确认解析正确

## 目录

```
index.html / style.css / app.js   网页
data/latest.json                  最新数据（Actions 自动生成）
data/history/                     每日存档（Actions 自动生成）
scripts/fetch.mjs                 抓取入口
scripts/sources/                  每个平台一个文件
scripts/fixtures/                 各平台接口样例（测试用）
.github/workflows/update.yml      定时抓取 + 部署
```
