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

// GET /api/availability/roster — 抓取脚本用：返回需抓空档的造型师名册
// 复用 SYNC_TOKEN 鉴权（与 /sync 同一套，无需给 GitHub 新增 secret）
// 仅返回 published=true 且 hotpepper_id 非空的造型师
router.get('/roster', async (req, res) => {
  const token = req.query.token || req.headers['x-sync-token'];
  if (!token || token !== process.env.SYNC_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const { data, error } = await supabase
      .from('stylists')
      .select('id, hotpepper_id, sort')
      .eq('published', true)
      .not('hotpepper_id', 'is', null)
      .neq('hotpepper_id', '')
      .order('sort', { ascending: true });
    if (error) throw error;
    res.json((data || []).map(({ id, hotpepper_id }) => ({ id, hotpepper_id })));
  } catch (err) {
    console.error('读取造型师名册失败:', err.message);
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
