require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// 本地开发时托管静态文件（Vercel 生产环境由 Vercel CDN 直接托管）
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, '..')));
}

// API 路由
app.use('/api/chat', require('./routes/chat'));
app.use('/api/availability', require('./routes/availability'));
app.use('/api/reservations', require('./routes/reservations'));

// 本地开发兜底路由
if (process.env.NODE_ENV !== 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  });
}

const PORT = process.env.PORT || 3000;

// 本地开发时启动监听，Vercel 直接导出 app
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`SHUKR 后端已启动 → http://localhost:${PORT}`);
    console.log('千问 API:', process.env.QWEN_API_KEY ? '✓ 已配置' : '✗ 未配置');
    console.log('Supabase:', process.env.SUPABASE_URL ? '✓ 已配置' : '✗ 未配置');
  });
}

module.exports = app;
