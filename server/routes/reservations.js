const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { notifyOwner } = require('../notifier');

// 6 个细分服务项目（6 个 enum 值），DB CHECK 约束需移除（见 supabase/schema.sql 注释）
const SERVICE_MAP = {
  cut: 'cut',
  color: 'color',
  color_cut: 'color_cut',
  perm_men: 'perm_men',
  perm_women_long: 'perm_women_long',
  treatment: 'treatment',
  // 兼容旧名称
  perm: 'perm_men',
  カット: 'cut',
  カラー: 'color',
  パーマ: 'perm_men',
  トリートメント: 'treatment',
  剪发: 'cut',
  染发: 'color',
  烫发: 'perm_men',
  护理: 'treatment',
  护发护理: 'treatment',
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
  zh: {
    cut: '剪发',
    color: '单染',
    color_cut: '染剪',
    perm_men: '烫发-男士',
    perm_women_long: '烫发-女士长发',
    treatment: '护发护理',
  },
  ja: {
    cut: 'カット',
    color: 'カラーのみ',
    color_cut: 'カラー＋カット',
    perm_men: 'パーマ（メンズ）',
    perm_women_long: 'パーマ（ロング）',
    treatment: 'トリートメント',
  },
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
    const stylistDisp = STYLIST_LABEL[data.stylist] || (isZh ? '不指定' : '指名なし');
    notifyOwner({
      subject: `【SHUKR】新预约：${name.trim()}`,
      lines: [
        `姓名：${name.trim()}`,
        `电话：${phone.trim()}`,
        ...(email?.trim() ? [`邮箱：${email.trim()}`] : []),
        `日期：${data.date}`,
        `时间：${data.time}`,
        `服务：${SERVICE_LABEL.zh[data.service] || data.service}`,
        `造型师：${stylistDisp}`,
        ...(notes?.trim() ? [`备注：${notes.trim()}`] : []),
        `语言：${lang}`,
      ],
    });

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
