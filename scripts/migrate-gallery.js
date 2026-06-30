// 一次性迁移：把 fc.html 写死的 8 张 marquee 工作照导入 Supabase gallery 表
//   - 图片沿用现有相对路径 assets/marquee/work-0N.jpg（静态托管，无需迁图）
//   - category / stylist_id / title 留空，店主后续在后台补充
// 用法：node scripts/migrate-gallery.js
require('dotenv').config();
const supabase = require('../server/db');

// fc.html 原本写死的 8 张工作照（work-01 ~ work-08）
const ITEMS = Array.from({ length: 8 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return {
    id: `work-${n}`,
    sort: i + 1,
    published: true,
    image: `assets/marquee/work-${n}.jpg`,
    title_ja: '',
    title_cn: '',
    category: '',
    stylist_id: '',
    updated_at: new Date().toISOString(),
  };
});

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('✗ 缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY，请先配置 .env');
    process.exit(1);
  }

  console.log(`准备导入 ${ITEMS.length} 张作品…\n`);
  let ok = 0, fail = 0;
  for (const row of ITEMS) {
    const { error } = await supabase.from('gallery').upsert(row, { onConflict: 'id' });
    if (error) {
      console.error(`  ✗ ${row.id}: ${error.message}`);
      fail++;
    } else {
      console.log(`  ✓ ${row.id} (${row.image})`);
      ok++;
    }
  }

  console.log(`\n完成：成功 ${ok}，失败 ${fail}。`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
