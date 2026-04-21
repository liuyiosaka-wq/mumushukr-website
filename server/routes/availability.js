const express = require('express');
const router = express.Router();
const supabase = require('../db');

// GET /api/availability — 查询当前空档（供前端或调试使用）
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('availability_cache')
      .select('data, scraped_at, source')
      .order('scraped_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return res.json({ scraped_at: null, availability: {} });
    }

    res.json({
      scraped_at: data.scraped_at,
      source: data.source,
      availability: data.data
    });
  } catch (err) {
    console.error('查询空档失败:', err.message);
    res.status(500).json({ error: 'database_error' });
  }
});

// POST /api/availability/sync — OpenClaw Webhook，写入最新空档
router.post('/sync', async (req, res) => {
  const { token, data: availData } = req.body;

  // 验证 Token
  if (!token || token !== process.env.SYNC_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (!availData || typeof availData !== 'object') {
    return res.status(400).json({ error: 'invalid_data' });
  }

  try {
    // 插入新记录
    const { error } = await supabase
      .from('availability_cache')
      .insert({ data: availData, source: 'hotpepper' });

    if (error) throw error;

    // 清理旧记录，只保留最近5条
    const { data: old } = await supabase
      .from('availability_cache')
      .select('id')
      .order('scraped_at', { ascending: false })
      .range(5, 1000);

    if (old && old.length > 0) {
      const oldIds = old.map(r => r.id);
      await supabase.from('availability_cache').delete().in('id', oldIds);
    }

    res.json({ ok: true, saved_at: new Date().toISOString() });
  } catch (err) {
    console.error('写入空档失败:', err.message);
    res.status(500).json({ error: 'database_error' });
  }
});

module.exports = router;
