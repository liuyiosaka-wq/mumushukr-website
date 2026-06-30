const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const router = express.Router();
const supabase = require('../db');
const { requireAdmin } = require('../middleware/auth');

const JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const BUCKET = 'article-images';
const CATEGORIES = ['trend', 'care', 'brand', 'company', 'ec', 'ai'];

// 可写字段白名单（防止前端塞入 id 之外的非法列）
const WRITABLE = [
  'category', 'featured', 'published', 'date', 'cover', 'url',
  'title_ja', 'title_cn', 'excerpt_ja', 'excerpt_cn',
  'author_ja', 'author_cn', 'dept_ja', 'dept_cn', 'body_ja', 'body_cn',
];

// 造型师可写字段白名单
const WRITABLE_STYLIST = [
  'sort', 'published', 'name_en', 'name_ja', 'name_cn',
  'role_en', 'role_ja', 'role_cn', 'photo', 'bio_ja', 'bio_cn',
  'tags', 'specialty_ja', 'specialty_cn', 'languages', 'hotpepper_id', 'extra_minutes',
];

// 图片库 / 作品可写字段白名单
const WRITABLE_GALLERY = [
  'sort', 'published', 'image', 'title_ja', 'title_cn', 'category', 'stylist_id',
];

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB，与 Storage 桶一致
});

// 恒定时间比较密码，避免时序侧信道
function passwordMatches(input) {
  if (!ADMIN_PASSWORD || typeof input !== 'string') return false;
  const a = Buffer.from(input);
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// 从请求体里挑出白名单字段
function pickWritable(body) {
  const out = {};
  for (const k of WRITABLE) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

// 造型师：挑白名单字段，并把 sort / extra_minutes 规整成整数
function pickWritableStylist(body) {
  const out = {};
  for (const k of WRITABLE_STYLIST) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  if (out.sort !== undefined) out.sort = parseInt(out.sort, 10) || 0;
  if (out.extra_minutes !== undefined) out.extra_minutes = parseInt(out.extra_minutes, 10) || 0;
  return out;
}

// 校验造型师数据。create 时 requireId=true 且姓名必填；
// update 为部分更新，只校验「被提交了的」字段不能为空（如单独切换上下线时不带姓名）
function validateStylist(fields, { requireId, id } = {}) {
  const errs = [];
  if (requireId) {
    if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      errs.push('id 必须为小写字母/数字/连字符（kebab-case）');
    }
    if (!fields.name_ja?.trim()) errs.push('日文姓名必填');
    if (!fields.name_cn?.trim()) errs.push('中文姓名必填');
  } else {
    if (fields.name_ja !== undefined && !fields.name_ja.trim()) errs.push('日文姓名不能为空');
    if (fields.name_cn !== undefined && !fields.name_cn.trim()) errs.push('中文姓名不能为空');
  }
  return errs;
}

// 图片库：挑白名单字段，并把 sort 规整成整数
function pickWritableGallery(body) {
  const out = {};
  for (const k of WRITABLE_GALLERY) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  if (out.sort !== undefined) out.sort = parseInt(out.sort, 10) || 0;
  return out;
}

// 校验作品数据。create 时 requireId=true 且图片必填；
// update 为部分更新，只校验「被提交了的」字段（如单独切换上下线时不带 image）
function validateGallery(fields, { requireId, id } = {}) {
  const errs = [];
  if (requireId) {
    if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      errs.push('id 必须为小写字母/数字/连字符（kebab-case）');
    }
    if (!fields.image?.trim()) errs.push('作品图片必填（请先上传或填入图片 URL）');
  } else {
    if (fields.image !== undefined && !fields.image.trim()) errs.push('作品图片不能为空');
  }
  return errs;
}

// 校验文章数据（create 时 requireId=true）
function validateArticle(fields, { requireId, id } = {}) {
  const errs = [];
  if (requireId) {
    if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      errs.push('id 必须为小写字母/数字/连字符（kebab-case）');
    }
  }
  if (!fields.title_ja?.trim()) errs.push('日文标题必填');
  if (!fields.title_cn?.trim()) errs.push('中文标题必填');
  if (!fields.date) errs.push('日期必填');
  if (!fields.category || !CATEGORIES.includes(fields.category)) {
    errs.push(`分类必须为：${CATEGORIES.join(' / ')}`);
  }
  return errs;
}

// 保证整表仅一篇 featured：把除 keepId 外的 featured 全部清零
async function clearOtherFeatured(keepId) {
  await supabase.from('articles').update({ featured: false }).eq('featured', true).neq('id', keepId);
}

// ============ 登录（无需鉴权） ============
// POST /api/admin/login  body: { password }
router.post('/login', (req, res) => {
  if (!JWT_SECRET || !ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'server_misconfig', message: '服务端未配置管理员密码' });
  }
  if (!passwordMatches(req.body?.password)) {
    return res.status(401).json({ error: 'bad_password', message: '密码错误' });
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, expires_in: 7 * 24 * 3600 });
});

// 以下所有路由均需登录
router.use(requireAdmin);

// GET /api/admin/me —— 校验 token 是否仍有效（前端进页面时探活）
router.get('/me', (req, res) => res.json({ ok: true, role: req.admin?.role || 'admin' }));

// ============ 文章 CRUD ============

// GET /api/admin/articles —— 全部文章（含草稿），列表用
router.get('/articles', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('id, category, featured, published, date, cover, url, title_ja, title_cn')
      .order('featured', { ascending: false })
      .order('date', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('admin 读取文章列表失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '读取失败' });
  }
});

// GET /api/admin/articles/:id —— 单篇完整数据（编辑表单回填）
router.get('/articles/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('articles').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'not_found', message: '文章不存在' });
    res.json(data);
  } catch (err) {
    console.error('admin 读取文章失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '读取失败' });
  }
});

// POST /api/admin/articles —— 新建
router.post('/articles', async (req, res) => {
  const id = (req.body?.id || '').trim();
  const fields = pickWritable(req.body || {});
  const errs = validateArticle(fields, { requireId: true, id });
  if (errs.length) return res.status(400).json({ error: 'validation_error', message: errs.join('；') });

  try {
    const { data, error } = await supabase
      .from('articles')
      .insert({ id, ...fields })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'duplicate_id', message: `文章 id「${id}」已存在` });
      }
      throw error;
    }
    if (fields.featured) await clearOtherFeatured(id);
    res.status(201).json({ id: data.id, message: '文章已创建' });
  } catch (err) {
    console.error('新建文章失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '保存失败：' + err.message });
  }
});

// PUT /api/admin/articles/:id —— 更新（id 不可改）
router.put('/articles/:id', async (req, res) => {
  const id = req.params.id;
  const fields = pickWritable(req.body || {});
  const errs = validateArticle(fields, { requireId: false });
  if (errs.length) return res.status(400).json({ error: 'validation_error', message: errs.join('；') });

  try {
    const { data, error } = await supabase
      .from('articles')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'not_found', message: '文章不存在' });
    if (fields.featured) await clearOtherFeatured(id);
    res.json({ id: data.id, message: '文章已更新' });
  } catch (err) {
    console.error('更新文章失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '保存失败：' + err.message });
  }
});

// DELETE /api/admin/articles/:id
router.delete('/articles/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('articles').delete().eq('id', req.params.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'not_found', message: '文章不存在' });
    res.json({ id: data.id, message: '文章已删除' });
  } catch (err) {
    console.error('删除文章失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '删除失败' });
  }
});

// ============ 造型师 CRUD ============

// GET /api/admin/stylists —— 全部造型师（含下线），列表用
router.get('/stylists', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stylists')
      .select('id, sort, published, name_ja, name_cn, role_en, photo, hotpepper_id')
      .order('sort', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('admin 读取造型师列表失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '读取失败' });
  }
});

// GET /api/admin/stylists/:id —— 单条完整数据（编辑表单回填）
router.get('/stylists/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stylists').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'not_found', message: '造型师不存在' });
    res.json(data);
  } catch (err) {
    console.error('admin 读取造型师失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '读取失败' });
  }
});

// POST /api/admin/stylists —— 新建
router.post('/stylists', async (req, res) => {
  const id = (req.body?.id || '').trim();
  const fields = pickWritableStylist(req.body || {});
  const errs = validateStylist(fields, { requireId: true, id });
  if (errs.length) return res.status(400).json({ error: 'validation_error', message: errs.join('；') });

  try {
    const { data, error } = await supabase
      .from('stylists')
      .insert({ id, ...fields })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'duplicate_id', message: `造型师 id「${id}」已存在` });
      }
      throw error;
    }
    res.status(201).json({ id: data.id, message: '造型师已创建' });
  } catch (err) {
    console.error('新建造型师失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '保存失败：' + err.message });
  }
});

// PUT /api/admin/stylists/:id —— 更新（id 不可改）
router.put('/stylists/:id', async (req, res) => {
  const id = req.params.id;
  const fields = pickWritableStylist(req.body || {});
  const errs = validateStylist(fields, { requireId: false });
  if (errs.length) return res.status(400).json({ error: 'validation_error', message: errs.join('；') });

  try {
    const { data, error } = await supabase
      .from('stylists')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'not_found', message: '造型师不存在' });
    res.json({ id: data.id, message: '造型师已更新' });
  } catch (err) {
    console.error('更新造型师失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '保存失败：' + err.message });
  }
});

// DELETE /api/admin/stylists/:id
router.delete('/stylists/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stylists').delete().eq('id', req.params.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'not_found', message: '造型师不存在' });
    res.json({ id: data.id, message: '造型师已删除' });
  } catch (err) {
    console.error('删除造型师失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '删除失败' });
  }
});

// ============ 图片库 / 作品 CRUD ============

// GET /api/admin/gallery —— 全部作品（含下线），列表用
router.get('/gallery', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('gallery')
      .select('id, sort, published, image, title_ja, title_cn, category, stylist_id')
      .order('sort', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('admin 读取作品列表失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '读取失败' });
  }
});

// GET /api/admin/gallery/:id —— 单条完整数据（编辑表单回填）
router.get('/gallery/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('gallery').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'not_found', message: '作品不存在' });
    res.json(data);
  } catch (err) {
    console.error('admin 读取作品失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '读取失败' });
  }
});

// POST /api/admin/gallery —— 新建
router.post('/gallery', async (req, res) => {
  const id = (req.body?.id || '').trim();
  const fields = pickWritableGallery(req.body || {});
  const errs = validateGallery(fields, { requireId: true, id });
  if (errs.length) return res.status(400).json({ error: 'validation_error', message: errs.join('；') });

  try {
    const { data, error } = await supabase
      .from('gallery')
      .insert({ id, ...fields })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'duplicate_id', message: `作品 id「${id}」已存在` });
      }
      throw error;
    }
    res.status(201).json({ id: data.id, message: '作品已创建' });
  } catch (err) {
    console.error('新建作品失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '保存失败：' + err.message });
  }
});

// PUT /api/admin/gallery/:id —— 更新（id 不可改）
router.put('/gallery/:id', async (req, res) => {
  const id = req.params.id;
  const fields = pickWritableGallery(req.body || {});
  const errs = validateGallery(fields, { requireId: false });
  if (errs.length) return res.status(400).json({ error: 'validation_error', message: errs.join('；') });

  try {
    const { data, error } = await supabase
      .from('gallery')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'not_found', message: '作品不存在' });
    res.json({ id: data.id, message: '作品已更新' });
  } catch (err) {
    console.error('更新作品失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '保存失败：' + err.message });
  }
});

// DELETE /api/admin/gallery/:id
router.delete('/gallery/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('gallery').delete().eq('id', req.params.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'not_found', message: '作品不存在' });
    res.json({ id: data.id, message: '作品已删除' });
  } catch (err) {
    console.error('删除作品失败:', err.message);
    res.status(500).json({ error: 'database_error', message: '删除失败' });
  }
});

// ============ 图片上传 ============
// POST /api/admin/upload  multipart/form-data, field: file, 可选 query/field: dir
// → 上传到 Storage 桶 article-images，返回公开 URL
router.post('/upload', multerUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file', message: '未收到文件' });

  const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const dir = (req.body?.dir || req.query?.dir || 'misc').toString().replace(/[^a-z0-9_-]/gi, '') || 'misc';
  const rand = crypto.randomBytes(6).toString('hex');
  const path = `${dir}/${Date.now()}-${rand}.${ext}`;

  try {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (error) throw error;
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    res.status(201).json({ url: pub.publicUrl, path });
  } catch (err) {
    console.error('图片上传失败:', err.message);
    res.status(500).json({ error: 'upload_failed', message: '上传失败：' + err.message });
  }
});

module.exports = router;
