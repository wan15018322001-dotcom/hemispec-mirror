require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {
  getUserByUsername,
  getUserById,
  getUserByWechat,
  createUser,
  updateUserStatus,
  updateWechat
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'hemispec-dev-secret';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const WECHAT_APPID = process.env.WECHAT_APPID || '';
const WECHAT_APPSECRET = process.env.WECHAT_APPSECRET || '';
const WECHAT_REDIRECT_URI = process.env.WECHAT_REDIRECT_URI || `http://localhost:${PORT}/api/auth/wechat/callback`;

app.use(express.json());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));

function signToken(user) {
  return jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/, '');
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期' });
  }
}

function computeUserStatus(user) {
  const now = Date.now();
  if (user.status === 'cooling' && user.cooling_until) {
    const until = new Date(user.cooling_until).getTime();
    if (now < until) {
      return { userStatus: 'ACTIVE', cooling: true, coolingUntil: user.cooling_until };
    }
    return { userStatus: 'REENGAGED' };
  }
  if (user.status === 'deleted') {
    return { userStatus: 'REENGAGED' };
  }
  // Determine NEW vs ACTIVE by archive count or created_at threshold.
  // For this prototype, a user is NEW if created within the last minute and has no wechat_openid fallback.
  const isRecent = (now - new Date(user.created_at).getTime()) < 60 * 1000;
  return { userStatus: isRecent ? 'NEW' : 'ACTIVE' };
}

function userResponse(user) {
  const status = computeUserStatus(user);
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    status: user.status,
    createdAt: user.created_at,
    ...status
  };
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Register
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: '用户名需 2-20 个字符' });
  }
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({ error: '密码至少 8 位，需包含字母和数字' });
  }
  const existing = getUserByUsername(username);
  if (existing) {
    return res.status(409).json({ error: '用户名已被注册' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = createUser({ username, passwordHash, nickname: username });
  const token = signToken(user);
  res.json({ token, user: userResponse(user) });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  const user = getUserByUsername(username);
  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = signToken(user);
  res.json({ token, user: userResponse(user) });
});

// WeChat OAuth: redirect to WeChat
app.get('/api/auth/wechat', (req, res) => {
  if (!WECHAT_APPID || !WECHAT_APPSECRET) {
    return res.status(503).json({ error: '微信登录未配置，请在 .env 中填写 WECHAT_APPID 和 WECHAT_APPSECRET' });
  }
  const state = crypto.randomBytes(16).toString('hex');
  const url = `https://open.weixin.qq.com/connect/qrconnect?appid=${WECHAT_APPID}&redirect_uri=${encodeURIComponent(WECHAT_REDIRECT_URI)}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`;
  res.json({ url });
});

// WeChat OAuth: callback
app.get('/api/auth/wechat/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: '授权失败，缺少 code' });
  if (!WECHAT_APPID || !WECHAT_APPSECRET) {
    return res.status(503).json({ error: '微信登录未配置' });
  }
  try {
    const tokenRes = await fetch(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${WECHAT_APPID}&secret=${WECHAT_APPSECRET}&code=${code}&grant_type=authorization_code`
    );
    const tokenData = await tokenRes.json();
    if (tokenData.errcode) {
      return res.status(400).json({ error: tokenData.errmsg || '微信授权失败' });
    }
    const { openid } = tokenData;
    let user = getUserByWechat(openid);
    if (!user) {
      user = createUser({ wechatOpenid: openid, nickname: '微信用户' });
    }
    const token = signToken(user);
    // Redirect back to frontend with token
    const redirectBase = process.env.FRONTEND_URL || CORS_ORIGIN || 'http://127.0.0.1:8089';
    res.redirect(`${redirectBase}?token=${token}&userStatus=${userResponse(user).userStatus}`);
  } catch (err) {
    res.status(500).json({ error: '微信授权处理失败' });
  }
});

// Get current user
app.get('/api/user/me', authMiddleware, (req, res) => {
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ user: userResponse(user) });
});

// Request account deletion (enter cooling period)
app.post('/api/user/delete', authMiddleware, (req, res) => {
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  updateUserStatus(user.id, { status: 'cooling', coolingUntil: until });
  res.json({ ok: true, coolingUntil: until });
});

// Cancel deletion (within cooling period)
app.post('/api/user/cancel-delete', authMiddleware, (req, res) => {
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (user.status !== 'cooling') {
    return res.status(400).json({ error: '当前不在冷静期' });
  }
  updateUserStatus(user.id, { status: 'active', coolingUntil: null });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Hemispec API running on http://localhost:${PORT}`);
});
