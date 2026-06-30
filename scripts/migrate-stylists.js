// 一次性迁移：把 stylists.html 里写死的两位造型师导入 Supabase stylists 表
//   - 照片沿用现有相对路径（assets/ 静态托管，无需迁图）
//   - hotpepper_id 来自 server/scrapers/hotpepper.js 的 DEFAULT_STYLISTS
//   - bio 以纯文本存储（段落用空行分隔），前台 nl2br 渲染
// 用法：node scripts/migrate-stylists.js
require('dotenv').config();
const supabase = require('../server/db');

const STYLISTS = [
  {
    id: 'yuna',
    sort: 1,
    published: true,
    name_en: 'Katuki Yuna',
    name_ja: '勝木 由奈',
    name_cn: '勝木 由奈',
    role_en: 'ART DIRECTOR',
    role_ja: '店長',
    role_cn: '店长',
    photo: 'assets/stylist-01-yamada.jpg',
    tags: 'CUT,COLOR,ALL-ROUND',
    specialty_ja: 'オールマイティーな技術 / 幅広い客層対応',
    specialty_cn: '多元全能技术 / 全客层对应',
    languages: '日本語 / 中文',
    hotpepper_id: 'T000997895',
    extra_minutes: 0,
    bio_ja: `みなさん、こんにちは！美容師歴10年のYunaです！

東京・六本木のハリウッド美容専門学校を卒業後、関東圏の大手美容グループに入社し、入社2年目でスタイリストデビューしました。オールマイティーな技術で、幅広いお客様に愛される美容師を目指してやってきました！^ ^

中国語も話せますので、海外からお越しのお客様もどうぞ安心してご指名ください。

お一人おひとりと丁寧にカウンセリングしながら、より素敵なスタイルをご提案できる空間を大切にしています。どんなご希望もぜひお任せください！

SHUKRにお越しいただくすべてのお客様にご満足いただけるよう、日々改善を重ね全力で努めてまいります。ご来店を心よりお待ちしております(^^)`,
    bio_cn: `大家好！我是 Yuna，一名拥有 10 年经验的美发师！

从东京六本木的好莱坞美容专门学校毕业后，我加入了关东地区的大型美发集团，并在入职第二年就成为了发型师。凭借全面的技术，我一直致力于成为能够服务各类客群、深受顾客喜爱的美发师！^ ^

我还能说中文，所以海外来的客人也可以放心找我哦。

我希望在能够与每位客人充分沟通的空间里，为大家打造更棒的发型。无论什么样的发型需求，都请交给我！

为了让每一位来到 SHUKR 的客人都能满意而归，我会不断寻找改进之处并全力以赴。期待你的光临！(^^)`,
  },
  {
    id: 'yu',
    sort: 2,
    published: true,
    name_en: 'Yu Changxiao',
    name_ja: '于 常校',
    name_cn: '于 常校',
    role_en: 'SENIOR STYLIST',
    role_ja: 'シニアスタイリスト',
    role_cn: '资深造型师',
    photo: 'assets/stylist-02-li.jpg',
    tags: 'COLOR,HIGHLIGHT,DESIGN',
    specialty_ja: 'ブラウン〜ハイトーンカラー全般',
    specialty_cn: '棕色系至亮色系全系染发',
    languages: '日本語 / 中文',
    hotpepper_id: 'T001083659',
    extra_minutes: 30,
    bio_ja: `はじめまして！

大阪美容専門学校を卒業し、美容師として6年間働いてきました。

カラーは、暗めのブラウン系から鮮やかなハイトーンまで全てお任せください‼️

パーマはナチュラルから強めまで幅広く対応。
「朝楽で再現性の高いパーマ」を得意とし、ちょうどいい"おしゃれカジュアル"をお作りします。

「自分に似合うスタイルが分からない」「失敗したくない」という方も、ぜひ安心してお任せください‼️

中国語でも対応可能で、お一人おひとりに心を込めて丁寧にサービスいたします。
どうぞよろしくお願いいたします！`,
    bio_cn: `初次见面！

我从大阪美容专门学校毕业，已经从事美发师工作 6 年了。

染发——从深色棕色系到鲜艳的高色调，全部交给我就对了！‼️

烫发——从自然款到强力款都能应对。
我擅长打造"早上好打理、可重现性高"的烫发，帮你拿捏"刚刚好的帅气感"。

"不知道自己适合什么发型""不想翻车"——这种朋友请放心交给我！‼️

我还能用中文交流，会用心为每位客人提供细致周到的服务。
请多多关照！`,
  },
];

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('✗ 缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY，请先配置 .env');
    process.exit(1);
  }

  console.log(`开始导入 ${STYLISTS.length} 位造型师…\n`);
  let ok = 0, fail = 0;
  for (const s of STYLISTS) {
    const row = { ...s, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('stylists').upsert(row, { onConflict: 'id' });
    if (error) {
      console.error(`  ✗ ${s.id}: ${error.message}`);
      fail++;
    } else {
      console.log(`  ✓ ${s.id}（${s.name_cn}）`);
      ok++;
    }
  }
  console.log(`\n完成：成功 ${ok}，失败 ${fail}。`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
