// 中文 → 日文 自动翻译（复用现有千问 / 阿里云 DashScope，OpenAI 兼容接口）
// 仅供后台 /admin.html 编辑时把中文字段一键翻成日文，店主再微调；不影响 AI 客服。
const OpenAI = require('openai');

const qwen = new OpenAI({
  apiKey: process.env.QWEN_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
});

// text：纯文本（标题/作者/简介等）；markdown：正文（需保留 Markdown 结构与图片/链接）
async function translateToJa(text, { format = 'text' } = {}) {
  const sys = '你是 SHUKR 美容沙龙官网的专业中→日译者。把用户给的简体中文翻成自然、地道、适合美容沙龙官网语气的日文。'
    + '要求：只输出译文本身，不要任何解释、不要加引号或代码块；保留品牌名/专有名词（SHUKR、Hot Pepper 等）原样；人名按日文惯用写法。'
    + (format === 'markdown'
        ? '这是 Markdown 正文：保留原有的 Markdown 结构（标题、列表、加粗等）、链接与图片语法 ![](url)，其中的网址、文件名一律原样保留不翻译，只翻译可读文字。'
        : '');

  const r = await qwen.chat.completions.create({
    model: 'qwen-plus', // 翻译用 plus 足够且更省；如需更高质量可换 qwen-max
    temperature: 0.3,
    max_tokens: 2048,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: text }
    ]
  });

  return (r.choices?.[0]?.message?.content || '').trim();
}

module.exports = { translateToJa };
