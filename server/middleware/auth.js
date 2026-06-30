const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.ADMIN_JWT_SECRET;

// 校验请求头 Authorization: Bearer <jwt>，失败返回 401
// 校验通过则把解码出的 payload 挂到 req.admin
function requireAdmin(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(500).json({ error: 'server_misconfig', message: '服务端未配置 ADMIN_JWT_SECRET' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: '请先登录' });
  }

  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token', message: '登录已失效，请重新登录' });
  }
}

module.exports = { requireAdmin };
