require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// 托管前端静态文件（项目根目录）
app.use(express.static(path.join(__dirname, '..')));

// API 路由
app.use('/api/chat', require('./routes/chat'));
app.use('/api/availability', require('./routes/availability'));
app.use('/api/reservations', require('./routes/reservations'));

// 所有未匹配路由返回 index.html（SPA 兼容）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SHUKR 后端已启动 → http://localhost:${PORT}`);
  console.log('千问 API:', process.env.QWEN_API_KEY ? '✓ 已配置' : '✗ 未配置');
  console.log('Supabase:', process.env.SUPABASE_URL ? '✓ 已配置' : '✗ 未配置');
});
