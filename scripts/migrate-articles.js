// 一次性迁移：把 assets/articles.json + articles/*.md 导入 Supabase articles 表
//   - 元数据来自 articles.json
//   - body_ja / body_cn 来自 articles/<id>.ja.md / .cn.md（缺失则留空）
//   - cover / 正文插图沿用现有相对路径（assets/ 静态托管，无需迁图）
// 用法：node scripts/migrate-articles.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabase = require('../server/db');

const ROOT = path.join(__dirname, '..');

function readMd(id, lang) {
  const p = path.join(ROOT, 'articles', `${id}.${lang}.md`);
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('✗ 缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY，请先配置 .env');
    process.exit(1);
  }

  const jsonPath = path.join(ROOT, 'assets', 'articles.json');
  const list = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`读取到 ${list.length} 篇文章，开始导入…\n`);

  let ok = 0, fail = 0;
  for (const a of list) {
    const row = {
      id: a.id,
      category: a.category,
      featured: !!a.featured,
      published: true,
      date: a.date,
      cover: a.cover || '',
      url: a.url || '',
      title_ja: a.title_ja || '',
      title_cn: a.title_cn || '',
      excerpt_ja: a.excerpt_ja || '',
      excerpt_cn: a.excerpt_cn || '',
      author_ja: a.author_ja || '',
      author_cn: a.author_cn || '',
      dept_ja: a.dept_ja || '',
      dept_cn: a.dept_cn || '',
      body_ja: readMd(a.id, 'ja'),
      body_cn: readMd(a.id, 'cn'),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('articles').upsert(row, { onConflict: 'id' });
    if (error) {
      console.error(`  ✗ ${a.id}: ${error.message}`);
      fail++;
    } else {
      const hasBody = row.body_ja || row.body_cn ? '含正文' : '仅卡片';
      console.log(`  ✓ ${a.id} (${hasBody})`);
      ok++;
    }
  }

  console.log(`\n完成：成功 ${ok}，失败 ${fail}。`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
