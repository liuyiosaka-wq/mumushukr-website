const express = require('express');
const router = express.Router();
const supabase = require('../db');

// 公开字段（作品页 / 首页预览 / FC 滚动条 / 造型师页 都用这一份）
const PUBLIC_FIELDS = 'id, sort, image, title_ja, title_cn, category, stylist_id';

// GET /api/gallery —— 公开作品列表（仅已上线）
// 排序：sort 升序，其次 created_at 升序。全量返回，前端各页自行 slice/filter
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('gallery')
      .select(PUBLIC_FIELDS)
      .eq('published', true)
      .order('sort', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.set('Cache-Control', 'no-store');
    res.json(data || []);
  } catch (err) {
    console.error('读取作品列表失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '读取作品列表失败' });
  }
});

module.exports = router;
