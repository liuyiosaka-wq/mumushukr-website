#!/usr/bin/env node
// Hot Pepper 空档抓取 CLI
//
// 用法（GitHub Actions 每小时跑一次）：
//   node scripts/scrape.js
//
// 环境变量：
//   SYNC_URL    - 目标 sync 接口完整 URL，如 https://shukr.vercel.app/api/availability/sync
//   SYNC_TOKEN  - 已有的鉴权 token（与服务端 .env 相同）
//
// 行为：抓取失败时直接退出，不动 Supabase（保留旧数据，避免清空）

require('dotenv').config();
const { scrapeAvailability } = require('../server/scrapers/hotpepper');

(async () => {
  const SYNC_URL = process.env.SYNC_URL;
  const SYNC_TOKEN = process.env.SYNC_TOKEN;
  if (!SYNC_URL || !SYNC_TOKEN) {
    console.error('SYNC_URL 和 SYNC_TOKEN 环境变量必填');
    process.exit(1);
  }

  console.log('[scrape] 开始抓取 Hot Pepper...');
  let data;
  try {
    data = await scrapeAvailability({ days: 7 });
  } catch (err) {
    console.error('[scrape] 抓取失败：', err.message);
    process.exit(1);
  }

  const dayCount = Object.keys(data).length;
  const slotCount = Object.values(data).reduce((sum, d) => sum + d.yuna.length + d.yu.length, 0);
  console.log(`[scrape] 解析完成：${dayCount} 天，共 ${slotCount} 个空档`);

  if (slotCount === 0) {
    console.warn('[scrape] 警告：抓到 0 个空档。可能 Hot Pepper 改版或店铺真的全部满档。仍然写入空对象以更新时间戳。');
  }

  console.log('[scrape] 推送到', SYNC_URL);
  const res = await fetch(SYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: SYNC_TOKEN, data }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`[scrape] 推送失败 ${res.status}: ${body}`);
    process.exit(1);
  }
  console.log('[scrape] 完成 →', body);
})();
