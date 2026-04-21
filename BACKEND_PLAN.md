# SHUKR 美发沙龙 — 后端实施方案

## 背景

网站前端已完整开发（纯 HTML/CSS/JS），目前无后端。需要实现两个功能：

1. **中日文切换** — 前端已90%完成（CSS类切换 + localStorage），只需让AI客服跟随语言设置回复。
2. **AI客服** — 聊天组件已存在，但调用的 `window.claude.complete()` 不存在，需要实现真正的后端接口。

---

## 技术架构

**Node.js + Express** 服务器：

- 直接托管现有静态文件（所有页面URL不变）
- 新增 API 接口
- AI 使用 **通义千问 API**（`qwen-plus`，OpenAI兼容格式）
- 数据库使用 **Supabase**（托管 PostgreSQL，免运维）

---

## 新增 / 修改文件一览

### 新增文件

| 文件路径 | 用途 |
|---|---|
| `package.json` | Node.js 项目配置 + 依赖包 |
| `.env` | 存放密钥：`QWEN_API_KEY`、`SUPABASE_URL`、`SUPABASE_SERVICE_KEY`、`PORT`、`SYNC_TOKEN` |
| `.env.example` | 密钥模板（可提交到 Git，不含真实密钥） |
| `server/index.js` | Express 入口，挂载静态文件和路由 |
| `server/db.js` | Supabase 客户端初始化 |
| `server/prompts/system.js` | 构建千问系统提示词（沙龙信息 + 实时空档） |
| `server/routes/chat.js` | `POST /api/chat` → 调用千问 API |
| `server/routes/availability.js` | `GET /api/availability` + `POST /api/availability/sync` |
| `server/routes/reservations.js` | `POST /api/reservations` |
| `supabase/schema.sql` | 数据库建表语句（在 Supabase 控制台执行） |

### 修改文件

| 文件路径 | 修改内容 |
|---|---|
| `assets/shared.js` | 替换 `sendChat()`（改用 fetch 调用后端），新增 `submitReservation()` |
| `reserve.html` | 表单提交改为调用后端，修正造型师姓名，给输入框添加 `name` 属性 |

---

## 数据库结构（Supabase / PostgreSQL）

在 Supabase 控制台的 SQL Editor 中执行 `supabase/schema.sql`：

```sql
-- Hot Pepper 空档缓存（由 OpenClaw 每2小时更新）
CREATE TABLE availability_cache (
  id         BIGSERIAL PRIMARY KEY,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data       JSONB NOT NULL,   -- {"2026-04-22": {"yuna":["10:00","11:00"],...}}
  source     TEXT DEFAULT 'hotpepper'
);

-- 只保留最新一条，旧数据自动清理（通过触发器或应用层删除）

-- 网页预约表单申请（仅保存，最终确认通过 Hot Pepper / LINE / 微信完成）
CREATE TABLE reservations (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  email      TEXT,
  date       DATE NOT NULL,
  time       TIME NOT NULL,
  service    TEXT NOT NULL,   -- 'cut' | 'color' | 'perm' | 'treatment'
  stylist    TEXT,            -- 'yuna' | 'yu' | null
  notes      TEXT,
  lang       TEXT NOT NULL DEFAULT 'ja',
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Supabase 优势：**
- 无需自己管理数据库服务器
- 免费套餐足够沙龙规模使用
- 自带 REST API 和管理界面，可直接查看预约记录
- 支持实时订阅（未来可做预约通知推送）

---

## API 接口

### `POST /api/chat` — AI 客服对话

```json
请求:
{
  "lang": "zh",
  "messages": [
    { "role": "user", "content": "最近有什么空档？" }
  ]
}

响应:
{
  "reply": "本周三10点、11点、14点还有空位..."
}
```

- 每次请求从 Supabase 读取最新空档，注入到系统提示词
- 前端保存完整对话历史，每次最多发送最近10条给千问
- 模型：`qwen-plus`，`max_tokens: 512`

---

### `POST /api/availability/sync` — OpenClaw Webhook

```json
请求:
{
  "token": "SYNC_SECRET",
  "data": {
    "2026-04-22": {
      "yuna": ["10:00", "11:00", "14:00"],
      "yu":   ["11:00", "13:00", "15:00"]
    },
    "2026-04-23": {
      "yuna": ["10:00", "11:00"],
      "yu":   ["14:00", "15:00", "16:00"]
    }
  }
}

响应:
{
  "ok": true,
  "saved_at": "2026-04-21T10:00:00Z"
}
```

OpenClaw 每2小时抓取 Hot Pepper 后调用此接口，数据存入 Supabase。  
通过 `SYNC_TOKEN` 验证，防止未授权写入。

---

### `GET /api/availability` — 查询当前空档

```json
响应:
{
  "scraped_at": "2026-04-21T10:00:00Z",
  "availability": {
    "2026-04-22": {
      "yuna": ["10:00", "11:00"],
      "yu":   ["14:00", "15:00"]
    }
  }
}
```

---

### `POST /api/reservations` — 提交网页预约表单

```json
请求:
{
  "name": "张三",
  "phone": "090-1234-5678",
  "email": "zhang@example.com",
  "date": "2026-04-25",
  "time": "14:00",
  "service": "color",
  "stylist": "yuna",
  "notes": "第一次来店",
  "lang": "zh"
}

响应(201):
{
  "id": 42,
  "message": "预约申请已提交，工作人员将与您联系。"
}
```

---

## AI 系统提示词结构

在 `server/prompts/system.js` 中动态构建，分4层：

| 层级 | 内容 |
|---|---|
| 1. 语言锁定 | 强制只用中文或日文回复，不混用其他语言 |
| 2. 沙龙静态知识 | 服务项目+价格、造型师介绍、营业时间、地址、交通方式 |
| 3. 实时空档注入 | 每次请求从 Supabase 读取最近7天空档（约200 token） |
| 4. 行为规则 | AI 引导顾客通过表单/LINE/微信预约，不自行确认预约；回复控制在3~5句 |

**空档注入示例：**

```
【近期可预约时间（今日：2026-04-21）】
04/22（周三）：勝木由奈 10:00 11:00 14:00 / 于常校 11:00 13:00 15:00
04/23（周四）：勝木由奈 10:00 11:00 / 于常校 14:00 15:00 16:00
04/24（周五）：全天满员

顾客询问空档时，请根据以上信息进行说明。
```

---

## 数据流程

```
OpenClaw（每2小时定时任务）
  → 抓取 Hot Pepper 空档页面
  → POST /api/availability/sync（Webhook）
  → 存入 Supabase availability_cache 表
  → AI 客服读取最新数据，向顾客实时播报空档
```

**无数据时的降级处理：**  
若 Supabase 中无缓存数据，AI 回复：「最新空档请通过 Hot Pepper / LINE / 微信确认」。

---

## 千问 API 接入方式

千问支持 **OpenAI 兼容格式**，使用 `openai` npm 包即可，无需额外SDK：

```javascript
// server/routes/chat.js
const OpenAI = require('openai');

const qwen = new OpenAI({
  apiKey: process.env.QWEN_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
});

const response = await qwen.chat.completions.create({
  model: 'qwen-plus',
  messages: [
    { role: 'system', content: systemPrompt },
    ...messages.slice(-10)
  ],
  max_tokens: 512
});

const reply = response.choices[0].message.content;
```

---

## Supabase 接入方式

```javascript
// server/db.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // 使用 service_role key，绕过 RLS
);

module.exports = supabase;
```

读取最新空档：

```javascript
const { data } = await supabase
  .from('availability_cache')
  .select('data, scraped_at')
  .order('scraped_at', { ascending: false })
  .limit(1)
  .single();
```

---

## `assets/shared.js` 核心改动

```javascript
// 模块级别新增：对话历史（页面刷新后重置，符合聊天窗口预期）
let chatHistory = [];

// 替换原有 sendChat()
async function sendChat() {
  const isZh = document.body.classList.contains('zh');
  const inputEl = document.getElementById(isZh ? 'chatInputCn' : 'chatInput');
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';

  // 显示用户气泡 + 加载气泡（逻辑与原版相同）
  // ...

  chatHistory.push({ role: 'user', content: text });

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lang: isZh ? 'zh' : 'ja',
        messages: chatHistory.slice(-10)
      })
    });
    const data = await res.json();
    loadBubble.textContent = data.reply;
    chatHistory.push({ role: 'assistant', content: data.reply });
  } catch (e) {
    loadBubble.textContent = isZh ? '抱歉，请稍后再试。' : '申し訳ございません。しばらくお待ちください。';
    chatHistory.pop();
  }
}

// 新增：预约表单提交
async function submitReservation(event) {
  event.preventDefault();
  // 收集表单数据 → POST /api/reservations → 显示成功提示或错误信息
}
```

---

## .env 配置

```env
# 通义千问
QWEN_API_KEY=sk-xxxxxxxxxxxxxxxx

# Supabase
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJxxxxxxxxxxxxxxxx

# 服务器
PORT=3000

# OpenClaw Webhook 验证token
SYNC_TOKEN=your-random-secret-here
```

---

## 依赖包

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "openai": "^4.0.0",
    "@supabase/supabase-js": "^2.0.0",
    "dotenv": "^16.0.0"
  }
}
```

> 对比原方案：移除 `@anthropic-ai/sdk` 和 `better-sqlite3`，改为 `openai`（千问兼容）和 `@supabase/supabase-js`。

---

## 验证步骤

1. 在 Supabase 控制台执行 `supabase/schema.sql` 建表
2. 将 Supabase URL 和 Service Key 填入 `.env`
3. 将千问 API Key 填入 `.env`
4. `npm install` — 安装依赖
5. `npm start` — 启动服务（默认端口 3000）
6. 打开 `http://localhost:3000` — 确认现有页面正常加载
7. 打开聊天窗口 → 输入「最近有什么时间可以预约」→ AI 用中文回复空档
8. 切换日语 → 输入「空いている時間は？」→ AI 用日语回复
9. 用 OpenClaw 或 curl 调用 `/api/availability/sync` 推送测试数据，确认空档更新
10. 填写预约表单 → 提交 → 页面显示成功提示（不刷新）
11. 在 Supabase 控制台 Table Editor 确认预约记录已写入
