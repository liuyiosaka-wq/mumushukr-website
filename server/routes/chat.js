const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const supabase = require('../db');
const { buildSystemPrompt } = require('../prompts/system');

const qwen = new OpenAI({
  apiKey: process.env.QWEN_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
});

router.post('/', async (req, res) => {
  const { lang = 'ja', messages = [] } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages_required' });
  }

  // 从 Supabase 读取最新空档数据
  let availabilityData = null;
  try {
    const { data } = await supabase
      .from('availability_cache')
      .select('data')
      .order('scraped_at', { ascending: false })
      .limit(1)
      .single();
    if (data) availabilityData = data.data;
  } catch {
    // 无空档数据时降级处理，不中断请求
  }

  const systemPrompt = buildSystemPrompt(lang, availabilityData);

  try {
    const response = await qwen.chat.completions.create({
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-10)
      ],
      max_tokens: 512
    });

    const reply = response.choices[0].message.content;
    res.json({ reply });
  } catch (err) {
    console.error('千问 API 错误:', err.message);
    res.status(500).json({
      error: 'service_unavailable',
      reply: lang === 'zh'
        ? '抱歉，AI客服暂时无法响应，请通过LINE或微信联系我们。'
        : '申し訳ございません。しばらくお待ちいただくか、LINE・WeChatよりお問い合わせください。'
    });
  }
});

module.exports = router;
