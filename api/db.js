const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data.json');

function readDb() {
  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch {
    return { users: [], seq: 0 };
  }
}

function writeDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function getUserByUsername(username) {
  const db = readDb();
  return db.users.find(u => u.username === username);
}

function getUserById(id) {
  const db = readDb();
  return db.users.find(u => u.id === id);
}

function getUserByWechat(openid) {
  const db = readDb();
  return db.users.find(u => u.wechat_openid === openid);
}

function createUser({ username, passwordHash, wechatOpenid, nickname }) {
  const db = readDb();
  const user = {
    id: ++db.seq,
    username: username || null,
    password_hash: passwordHash || null,
    wechat_openid: wechatOpenid || null,
    nickname: nickname || username || '微信用户',
    status: 'active',
    cooling_until: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  db.users.push(user);
  writeDb(db);
  return user;
}

function updateUser(id, updates) {
  const db = readDb();
  const idx = db.users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  db.users[idx] = { ...db.users[idx], ...updates, updated_at: new Date().toISOString() };
  writeDb(db);
  return db.users[idx];
}

function updateUserStatus(id, { status, coolingUntil }) {
  return updateUser(id, { status, cooling_until: coolingUntil || null });
}

function updateWechat(id, { openid, nickname }) {
  const updates = { wechat_openid: openid };
  if (nickname) updates.nickname = nickname;
  return updateUser(id, updates);
}

module.exports = {
  getUserByUsername,
  getUserById,
  getUserByWechat,
  createUser,
  updateUserStatus,
  updateWechat
};
