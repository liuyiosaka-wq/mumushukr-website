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

// 抓单个造型师的日历，返回 [{ date: 'YYYY-MM-DD', time: 'HH:MM' }]
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

  // 解析：找出所有可用槽位 <a class="icnOpen">，从 href 提取日期+时间
  // href 形如 ...rsvRequestDate1=20260430&rsvRequestTime1=1200
  const $ = cheerio.load(html);
  const slots = [];
  $('a.icnOpen').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/rsvRequestDate1=(\d{8}).*?rsvRequestTime1=(\d{3,4})/);
    if (!m) return;
    const [, dateRaw, timeRaw] = m;
    const date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
    const t = timeRaw.padStart(4, '0');
    const time = `${t.slice(0, 2)}:${t.slice(2, 4)}`;
    slots.push({ date, time });
  });
  return slots;
}

// 主入口：抓两位造型师，合并、限制为今后 7 天
async function scrapeAvailability({ days = 7 } = {}) {
  const todayJST = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const cutoff = new Date(todayJST + 'T00:00:00Z');
  cutoff.setUTCDate(cutoff.getUTCDate() + days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const result = {};
  for (const [key, stylistId] of Object.entries(STYLISTS)) {
    const slots = await scrapeStylist(stylistId);
    for (const { date, time } of slots) {
      if (date < todayJST || date >= cutoffStr) continue;
      if (!result[date]) result[date] = { yuna: [], yu: [] };
      if (!result[date][key].includes(time)) result[date][key].push(time);
    }
  }
  // sort times
  for (const day of Object.values(result)) {
    day.yuna.sort();
    day.yu.sort();
  }
  return result;
}

module.exports = { scrapeAvailability, scrapeStylist, STYLISTS };
