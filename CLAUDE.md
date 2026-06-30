# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 启动与运行

```bash
npm install       # 首次安装依赖
npm start         # 启动服务器（端口 3000）
npm run dev       # 开发模式（node --watch，文件变更自动重启）
```

服务器启动后访问 `http://localhost:3000`。

## 环境变量

复制 `.env.example` 为 `.env` 并填入：

```
QWEN_API_KEY=sk-...          # 阿里云 DashScope API Key
SUPABASE_URL=https://...     # Supabase 项目 URL
SUPABASE_SERVICE_KEY=eyJ...  # Supabase service_role key
PORT=3000
SYNC_TOKEN=...               # OpenClaw Webhook 验证 token
```

## 架构概述

**纯静态前端 + Node.js 后端**，同一个 Express 进程同时托管两者。

```
根目录/
├── *.html              # 前端页面（纯静态，无构建步骤）
├── assets/
│   ├── shared.css      # 全局样式（CSS 变量、导航、聊天组件）
│   └── shared.js       # 全局 JS（语言切换、AI 聊天、预约表单提交）
├── server/
│   ├── index.js        # Express 入口，挂载静态文件和路由
│   ├── db.js           # Supabase 客户端单例
│   ├── prompts/
│   │   └── system.js   # 动态构建 AI 系统提示词
│   └── routes/
│       ├── chat.js           # POST /api/chat
│       ├── availability.js   # GET /api/availability、POST /api/availability/sync
│       └── reservations.js   # POST /api/reservations
└── supabase/
    └── schema.sql      # 数据库建表语句（在 Supabase 控制台执行）
```

## 关键设计决策

**语言切换（中日文）**：前端通过 `body.classList` 切换 `.zh` class，CSS 用 `body:not(.zh) .lang-cn { display: none }` 控制显示。所有双语文本均有 `.lang-ja` 和 `.lang-cn` 两个并列元素。语言偏好存入 `localStorage('shukr-lang')`，由 `shared.js` 的 `setLang()` 统一管理。

**AI 客服**：前端 `chatHistory[]` 保存对话历史（页面刷新后重置），每次发送最近10条给后端。后端每次请求都从 Supabase 读取最新空档数据，动态注入系统提示词，完全无状态。AI 使用千问 `qwen-plus`，通过 OpenAI 兼容格式接入（`openai` npm包，baseURL 指向 DashScope）。

**空档数据流**：GitHub Actions 每小时跑 `scripts/scrape.js`（调用 `server/scrapers/hotpepper.js`）抓 Hot Pepper Beauty 日历 → `POST /api/availability/sync`（需 SYNC_TOKEN 验证）→ 写入 Supabase `availability_cache` 表 → AI 聊天时读取最新一条注入提示词。Hot Pepper 抓取是 cookie session 驱动的 3 步链：店铺首页 → `/CSP/bt/reserve/?stylistId=X` → `/CSP/bt/reserve/afterCoupon?menuId=MN00000005987868&stylistId=X`，最后一页 `<a class="icnOpen">` 的 href 直接带 `rsvRequestDate1` / `rsvRequestTime1` 参数。无缓存数据时 AI 降级回复，引导顾客通过 Hot Pepper / 微信 / 电话确认。

**预约表单**：`reserve.html` 表单提交调用 `submitReservation()`（在 `shared.js`），POST 到 `/api/reservations` 保存至 Supabase，不做冲突检测（最终确认通过 Hot Pepper/LINE/微信完成）。

## Supabase 数据库表

- `availability_cache`：Hot Pepper 空档缓存，`data` 字段为 JSONB（格式：`{"2026-04-22": {"yuna": ["10:00","11:00"], "yu": [...]}}`），只取最新一条使用
- `reservations`：网页预约申请记录，service 枚举值为 `cut/color/perm/treatment`，stylist 枚举值为 `yuna/yu`

## API 接口速查

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/chat` | AI 客服，body: `{lang, messages[]}` |
| GET | `/api/availability` | 查询当前空档缓存 |
| POST | `/api/availability/sync` | OpenClaw webhook，body: `{token, data}` |
| POST | `/api/reservations` | 提交预约表单 |
| GET | `/api/articles` | 公开文章列表（仅 published，不含正文） |
| GET | `/api/articles/:id` | 公开文章详情（含 body_ja/body_cn） |
| POST | `/api/admin/login` | 管理员登录，body: `{password}` → 返回 JWT |
| GET/POST/PUT/DELETE | `/api/admin/articles[/:id]` | 文章增删改查（需 `Authorization: Bearer <jwt>`） |
| POST | `/api/admin/upload` | 图片上传到 Supabase Storage（multipart，需鉴权） |

## 添加专栏文章（CMS 后台，2026-06 起）

文章已迁移到 **Supabase `articles` 表**，通过后台页面增删改，**不再需要改文件 + git push**（Vercel 生产文件系统只读，这是关键原因）。

**日常流程：**
1. 浏览器打开 `/admin.html`，用 `ADMIN_PASSWORD` 登录
2. 「文章管理」→ 新建/编辑，填双语字段、上传封面与正文插图（自动传到 Storage 桶 `article-images`，返回公开 URL）
3. 保存即时生效——`column.html` / `article.html` 直接读 `/api/articles`，无需重新部署

`column.html` 渲染列表、`article.html` 用 marked.js 渲染 `body_ja/body_cn`（markdown）。「草稿」（`published=false`）不出现在公开页。

**数据库字段**（见 `supabase/schema.sql` 的 `articles` 表）：
- `id` — kebab-case slug（主键），对应 `article.html?id=<id>`，建后不可改
- `category` — `trend / care / brand / company / ec / ai`，与 column 页 `data-cat` 对齐
- `featured` — 整表仅一条 `true`（后台保存时应用层自动清零其余，见 `admin.js` 的 `clearOtherFeatured`）
- `published` — 上线/草稿开关
- `date` — `YYYY-MM-DD`，渲染转成 `2026.04.18`
- `cover` / `url` — 封面 URL（可为 Storage URL 或 `assets/` 相对路径）/ 外链（非空则卡片跳外链）
- `title_ja/cn`（必填）、`excerpt_ja/cn`、`author_ja/cn`、`dept_ja/cn`、`body_ja/cn`（正文 markdown）

**旧文件**：`assets/articles.json` 与 `articles/*.md` 是迁移源头（`scripts/migrate-articles.js` 一次性导入），保留作存档，前端已不再读取。

**后台架构**：`admin.html`（单页，标准「顶栏+侧边导航+主内容」布局，`renderView` 调度，便于扩展更多模块）→ `server/routes/admin.js`（JWT 鉴权 + CRUD + 上传）+ `server/middleware/auth.js`（验签）+ `server/routes/articles.js`（公开只读）。登录密钥见 `.env` 的 `ADMIN_PASSWORD` / `ADMIN_JWT_SECRET`。
