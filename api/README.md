# 半镜 Hemispec 后端 API

Node.js + Express + JSON 文件存储的轻量后端，为前端提供真实的用户名/密码注册登录与微信 OAuth 接入。

## 本地开发

```bash
cd api
npm install
npm run dev
```

默认监听 `http://localhost:3000`。

## 环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

必填：

- `JWT_SECRET`：JWT 签名密钥，生产环境请替换为随机长字符串。
- `CORS_ORIGIN`：前端域名，本地为 `http://127.0.0.1:8089`。

微信登录（可选，未配置时微信按钮会提示）：

- `WECHAT_APPID`
- `WECHAT_APPSECRET`
- `WECHAT_REDIRECT_URI`：必须是微信开放平台后台配置的回调域名，例如 `https://your-api.com/api/auth/wechat/callback`

## 部署到 Render（推荐）

1. 在 [Render](https://render.com) 注册并新建 Web Service。
2. 选择本 GitHub 仓库，Root Directory 填 `api`。
3. Build Command：`npm install`
4. Start Command：`npm start`
5. 在 Environment 中填入 `.env` 变量。
6. 部署完成后，将 Render 域名填回前端 `index.html` 中的 `API_BASE_URL`。

## 接口

- `POST /api/auth/register` 用户名密码注册
- `POST /api/auth/login` 用户名密码登录
- `GET /api/auth/wechat` 获取微信授权 URL
- `GET /api/auth/wechat/callback` 微信回调
- `GET /api/user/me` 获取当前用户
- `POST /api/user/delete` 申请注销（进入 7 天冷静期）
- `POST /api/user/cancel-delete` 冷静期内撤销注销
