// Hot Pepper Beauty 空档抓取
//
// 流程：店铺首页 → 选造型师 → afterCoupon 拿到 14 天日历
// afterCoupon 必须带前两步种下的 session cookie，否则返回错误页
//
// 输出：{ "YYYY-MM-DD": { yuna: ["10:00", "10:30", ...], yu: [...] } }

const cheerio = require('cheerio');

const STORE_ID = 'H000743235';
const CUT_MENU_ID = 'MN00000005987868'; // カット ¥4,400
const STYLISTS = {
  yuna: 'T000997895', // 勝木 由奈
  yu:   'T001083659', // 于 常校
};

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BASE = 'https://beauty.hotpepper.jp';

// 极简 CookieJar：只跟踪 name=value 用于跨请求复用 session
class CookieJar {
  constructor() { this.jar = new Map(); }
  ingest(setCookieList) {
    if (!setCookieList) return;
    for (const sc of setCookieList) {
      const first = sc.split(';')[0];
      const eq = first.indexOf('=');
      if (eq > 0) this.jar.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
    }
  }
  header() {
    if (this.jar.size === 0) return '';
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

// fetch 包装：手动跟随重定向，每跳都吃 Set-Cookie
async function fetchWithJar(url, jar, referer) {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en;q=0.7',
        ...(referer ? { 'Referer': referer } : {}),
        ...(jar.header() ? { 'Cookie': jar.header() } : {}),
      },
    });
    jar.ingest(res.headers.getSetCookie?.());
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new Error(`too many redirects from ${url}`);
}

// 生成从今日 JST 起的 N 天日期数组（YYYY-MM-DD）
// Hot Pepper 日历表头有时是 "Thu Apr 30 ... 2026" 长格式，有时只显示 "30(木)" 短格式
// 不依赖 HTML 表头解析，直接基于 JST 今日 + 索引推算最稳
function buildDateWindow(n) {
  const todayJST = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const dates = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(todayJST + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// 抓单个造型师的日历，返回 { 'YYYY-MM-DD': { closed: bool, slots: ['HH:MM', ...] } }
// closed=true 表示该列是 closeCol（休業日 / 不在班）；innerCol 但 slots 为空表示当天满档
async function scrapeStylist(stylistId) {
  const jar = new CookieJar();

  // step 1: 店铺首页（种 session cookie）
  await fetchWithJar(`${BASE}/sln${STORE_ID}/`, jar);

  // step 2: 进入预约入口（再种一些 cookie）
  const reserveUrl = `${BASE}/CSP/bt/reserve/?storeId=${STORE_ID}&stylistId=${stylistId}`;
  await fetchWithJar(reserveUrl, jar, `${BASE}/sln${STORE_ID}/`);

  // step 3: afterCoupon 拿到 14 天日历
  const calUrl = `${BASE}/CSP/bt/reserve/afterCoupon?storeId=${STORE_ID}&menuId=${CUT_MENU_ID}&addMenu=0&rootCd=10&stylistId=${stylistId}`;
  const res = await fetchWithJar(calUrl, jar, reserveUrl);
  const html = await res.text();

  if (html.includes('Cookieは有効になっていますか')) {
    throw new Error('hotpepper rejected request (cookie session not established)');
  }

  const $ = cheerio.load(html);
  const days = {};

  // 1. Hot Pepper 日历固定是"今日 + 13 天"窗口，14 个 innerCol/closeCol 列按顺序对应
  //    closeCol = 休業日 / 不在班；innerCol = 营业日（slots 为空 = 全天满档）
  const dateWindow = buildDateWindow(14);
  const cols = $('th.innerCol, th.closeCol').toArray();
  const len = Math.min(dateWindow.length, cols.length);
  for (let i = 0; i < len; i++) {
    const closed = $(cols[i]).hasClass('closeCol');
    days[dateWindow[i]] = { closed, slots: [] };
  }

  // 2. 收集 a.icnOpen 里的可预约槽位（href 直接带日期+时间）
  $('a.icnOpen').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/rsvRequestDate1=(\d{8}).*?rsvRequestTime1=(\d{3,4})/);
    if (!m) return;
    const [, dateRaw, timeRaw] = m;
    const date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
    const t = timeRaw.padStart(4, '0');
    const time = `${t.slice(0, 2)}:${t.slice(2, 4)}`;
    if (!days[date]) days[date] = { closed: false, slots: [] };
    if (!days[date].slots.includes(time)) days[date].slots.push(time);
  });
  return days;
}

// 主入口：抓两位造型师并合并
// 返回 { 'YYYY-MM-DD': { yuna: [], yu: [], closed: bool } }
//   closed=true → 休業日（两位都是 closeCol，整店关门）
//   yuna/yu 数组为空 → 该造型师当天全满或不在班（仍属营业日）
async function scrapeAvailability({ days = 14 } = {}) {
  const todayJST = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const cutoff = new Date(todayJST + 'T00:00:00Z');
  cutoff.setUTCDate(cutoff.getUTCDate() + days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const perStylist = {};
  for (const [key, stylistId] of Object.entries(STYLISTS)) {
    perStylist[key] = await scrapeStylist(stylistId);
  }

  const allDates = new Set([
    ...Object.keys(perStylist.yuna || {}),
    ...Object.keys(perStylist.yu || {}),
  ]);

  const result = {};
  for (const date of [...allDates].sort()) {
    if (date < todayJST || date >= cutoffStr) continue;
    const ya = perStylist.yuna[date] || { closed: false, slots: [] };
    const yu = perStylist.yu[date]   || { closed: false, slots: [] };
    const obj = { yuna: [...ya.slots], yu: [...yu.slots] };
    if (ya.closed && yu.closed) obj.closed = true;
    result[date] = obj;
  }
  // sort times
  for (const day of Object.values(result)) {
    day.yuna.sort();
    day.yu.sort();
  }
  return result;
}

module.exports = { scrapeAvailability, scrapeStylist, STYLISTS };
