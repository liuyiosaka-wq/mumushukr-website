require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// 托管静态文件（本地和 Vercel 均生效）
app.use(express.static(path.join(__dirname, '..')));

// API 路由
app.use('/api/chat', require('./routes/chat'));
app.use('/api/availability', require('./routes/availability'));
app.use('/api/reservations', require('./routes/reservations'));
app.use('/api/franchise', require('./routes/franchise'));

// 兜底：仅对无扩展名（SPA 风格）的路径返回首页；
// 带扩展名（如 .md / .json / .jpg）找不到就老老实实 404，避免污染 fetch 结果
app.get('*', (req, res) => {
  if (path.extname(req.path)) {
    return res.status(404).send('Not Found');
  }
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SHUKR 后端已启动 → http://localhost:${PORT}`);
  console.log('千问 API:', process.env.QWEN_API_KEY ? '✓ 已配置' : '✗ 未配置');
  console.log('Supabase:', process.env.SUPABASE_URL ? '✓ 已配置' : '✗ 未配置');
});

module.exports = app;
