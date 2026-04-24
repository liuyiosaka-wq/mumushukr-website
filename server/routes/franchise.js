const express = require('express');
const router = express.Router();
const supabase = require('../db');

router.post('/', async (req, res) => {
  const { name, phone, email, area, experience, budget, notes, lang = 'ja' } = req.body;
  const isZh = lang === 'zh';

  const missing = [];
  if (!name?.trim()) missing.push('name');
  if (!phone?.trim()) missing.push('phone');
  if (!email?.trim()) missing.push('email');

  if (missing.length > 0) {
    return res.status(400).json({
      error: 'validation_error',
      message: isZh
        ? `以下字段为必填：${missing.join('、')}`
        : `必須項目が未入力です：${missing.join('、')}`,
      fields: missing
    });
  }

  try {
    const { data, error } = await supabase
      .from('franchise_inquiries')
      .insert({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        area: area?.trim() || null,
        experience: experience || null,
        budget: budget || null,
        notes: notes?.trim() || null,
        lang
      })
      .select('id')
      .single();

    if (error) throw error;

    res.status(201).json({
      id: data.id,
      message: isZh
        ? '咨询已提交，我们将在 2 个工作日内与您联系。'
        : 'お問い合わせを承りました。2営業日以内にご連絡いたします。'
    });
  } catch (err) {
    console.error('保存加盟咨询失败:', err.message);
    res.status(500).json({
      error: 'database_error',
      message: isZh
        ? '提交失败，请通过邮件 fc@mumushukr.com 联系我们。'
        : '送信に失敗しました。fc@mumushukr.com までご連絡ください。'
    });
  }
});

module.exports = router;
