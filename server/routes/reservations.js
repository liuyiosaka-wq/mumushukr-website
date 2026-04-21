const express = require('express');
const router = express.Router();
const supabase = require('../db');

const SERVICE_MAP = {
  // 日文选项
  'カット': 'cut',
  'カラー': 'color',
  'パーマ': 'perm',
  'トリートメント': 'treatment',
  // 中文选项
  '剪发': 'cut',
  '染发': 'color',
  '烫发': 'perm',
  '护理': 'treatment',
  '护发护理': 'treatment',
  // 英文直传
  'cut': 'cut',
  'color': 'color',
  'perm': 'perm',
  'treatment': 'treatment'
};

const STYLIST_MAP = {
  '勝木 由奈 / Katuki Yuna': 'yuna',
  '于 常校 / Yu Changxiao': 'yu',
  '指名なし': null,
  '不指定': null,
  'yuna': 'yuna',
  'yu': 'yu'
};

const SERVICE_LABEL = {
  zh: { cut: '剪发', color: '染发', perm: '烫发', treatment: '护发护理' },
  ja: { cut: 'カット', color: 'カラー', perm: 'パーマ', treatment: 'トリートメント' }
};

const STYLIST_LABEL = {
  yuna: '勝木 由奈',
  yu: '于 常校',
  null: ''
};

// POST /api/reservations
router.post('/', async (req, res) => {
  const { name, phone, email, date, time, service, stylist, notes, lang = 'ja' } = req.body;
  const isZh = lang === 'zh';

  // 基础校验
  const missing = [];
  if (!name?.trim()) missing.push('name');
  if (!phone?.trim()) missing.push('phone');
  if (!date) missing.push('date');
  if (!time) missing.push('time');
  if (!service) missing.push('service');

  if (missing.length > 0) {
    return res.status(400).json({
      error: 'validation_error',
      message: isZh
        ? `以下字段为必填：${missing.join('、')}`
        : `必須項目が未入力です：${missing.join('、')}`,
      fields: missing
    });
  }

  const normalizedService = SERVICE_MAP[service] || null;
  if (!normalizedService) {
    return res.status(400).json({
      error: 'invalid_service',
      message: isZh ? '请选择有效的服务项目。' : '有効なメニューを選択してください。'
    });
  }

  const normalizedStylist = stylist !== undefined
    ? (STYLIST_MAP[stylist] !== undefined ? STYLIST_MAP[stylist] : null)
    : null;

  try {
    const { data, error } = await supabase
      .from('reservations')
      .insert({
        name: name.trim(),
        phone: phone.trim(),
        email: email?.trim() || null,
        date,
        time,
        service: normalizedService,
        stylist: normalizedStylist,
        notes: notes?.trim() || null,
        lang
      })
      .select('id, date, time, service, stylist')
      .single();

    if (error) throw error;

    const langKey = isZh ? 'zh' : 'ja';
    res.status(201).json({
      id: data.id,
      message: isZh
        ? '预约申请已提交，工作人员将尽快与您联系确认。'
        : 'ご予約を承りました。担当者よりご連絡いたします。',
      reservation: {
        date: data.date,
        time: data.time,
        service: SERVICE_LABEL[langKey][data.service] || data.service,
        stylist: STYLIST_LABEL[data.stylist] || (isZh ? '不指定' : '指名なし')
      }
    });
  } catch (err) {
    console.error('保存预约失败:', err.message);
    res.status(500).json({
      error: 'database_error',
      message: isZh
        ? '提交失败，请通过LINE或微信联系我们。'
        : '送信に失敗しました。LINE・WeChatよりお問い合わせください。'
    });
  }
});

module.exports = router;
