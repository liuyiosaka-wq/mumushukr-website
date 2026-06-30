const express = require('express');
const router = express.Router();
const supabase = require('../db');

// 公开字段：不含 hotpepper_id（内部信息，仅抓取名册端点返回）
const PUBLIC_FIELDS =
  'id, sort, name_en, name_ja, name_cn, role_en, role_ja, role_cn, ' +
  'photo, bio_ja, bio_cn, tags, specialty_ja, specialty_cn, languages, extra_minutes';

// GET /api/stylists —— 公开造型师列表（仅已上线），stylists.html / index.html / reserve.html 使用
// 排序：sort 升序，其次 created_at 升序
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stylists')
      .select(PUBLIC_FIELDS)
      .eq('published', true)
      .order('sort', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.set('Cache-Control', 'no-store');
    res.json(data || []);
  } catch (err) {
    console.error('读取造型师列表失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '读取造型师列表失败' });
  }
});

module.exports = router;
