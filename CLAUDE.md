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

**空档数据流**：OpenClaw 每2小时抓取 Hot Pepper Beauty 页面 → `POST /api/availability/sync`（需 SYNC_TOKEN 验证）→ 写入 Supabase `availability_cache` 表 → AI 聊天时读取最新一条注入提示词。无缓存数据时 AI 降级回复，引导顾客通过 LINE/微信确认。

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

## 添加专栏文章

`column.html` 由 `assets/articles.json` 数据驱动渲染，加文章无需改 HTML。

1. （可选）把封面图放进 `assets/articles/`，文件名建议等于文章 `id`，例如 `assets/articles/spring-color-trends-2026.jpg`
2. 在 `assets/articles.json` 数组末尾追加一段（复制现有任意条改字段即可）
3. `git add . && git commit -m "post: <title>" && git push`

字段说明：
- `id` — kebab-case slug（详情页 URL 预留 key）
- `category` — `trend / care / brand / company / ec / ai`，必须与 column 页筛选按钮 `data-cat` 对齐
- `featured` — boolean。整个数组只允许一条为 `true`（钉到顶部大卡）
- `date` — `YYYY-MM-DD`，渲染时自动转成 `2026.04.18`，未 featured 的文章按日期降序排
- `cover` — 封面图相对路径；留空则显示条纹占位 + 大写分类标签
- `title_ja/cn`、`excerpt_ja/cn`、`author_ja/cn` — 必填双语
- `dept_ja/cn` — 选填部门标签（如「电商事业部」），两边都为空时不渲染
- `url` — 详情页地址，留空则点击不跳转
