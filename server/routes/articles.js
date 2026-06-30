const express = require('express');
const router = express.Router();
const supabase = require('../db');

// 列表页 / 详情页都用到的字段（不含正文 body，列表减负）
const LIST_FIELDS =
  'id, category, featured, date, cover, url, ' +
  'title_ja, title_cn, excerpt_ja, excerpt_cn, author_ja, author_cn, dept_ja, dept_cn';

// GET /api/articles —— 公开文章列表（仅已上线），column.html 使用
// 排序：featured 置顶，其余按 date 降序（与原 articles.json 渲染逻辑一致）
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('articles')
      .select(LIST_FIELDS)
      .eq('published', true)
      .order('featured', { ascending: false })
      .order('date', { ascending: false });

    if (error) throw error;
    res.set('Cache-Control', 'no-store');
    res.json(data || []);
  } catch (err) {
    console.error('读取文章列表失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '读取文章列表失败' });
  }
});

// GET /api/articles/:id —— 公开文章详情（含正文 body），article.html 使用
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('id', req.params.id)
      .eq('published', true)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'not_found', message: '文章不存在' });
    }
    res.set('Cache-Control', 'no-store');
    res.json(data);
  } catch (err) {
    console.error('读取文章详情失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '读取文章详情失败' });
  }
});

module.exports = router;
