const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { notifyOwner } = require('../notifier');

// 应聘 / 推荐字段标签（用于邮件展示）
const APPLY_LABELS = {
  zh: { name: '姓名', age: '年龄', contact: '联系方式', experience: '从业年限', position: '应聘职位', specialties: '擅长', languages: '语言', portfolio: '作品集', message: '留言' },
  ja: { name: '氏名', age: '年齢', contact: '連絡先', experience: '経験年数', position: '応募ポジション', specialties: '得意', languages: '言語', portfolio: 'ポートフォリオ', message: 'メッセージ' },
};
const REFER_LABELS = {
  zh: { referrer_name: '推荐人姓名', referrer_contact: '推荐人联系方式', relation: '关系', candidate_name: '被推荐人姓名', candidate_contact: '被推荐人联系方式', candidate_shop: '所在店铺', candidate_portfolio: '作品集', reason: '推荐理由' },
  ja: { referrer_name: '紹介者氏名', referrer_contact: '紹介者連絡先', relation: '関係', candidate_name: '候補者氏名', candidate_contact: '候補者連絡先', candidate_shop: '所属店舗', candidate_portfolio: 'ポートフォリオ', reason: '推薦理由' },
};

router.post('/', async (req, res) => {
  const { kind, lang = 'ja', ...rest } = req.body || {};
  const isZh = lang === 'zh';

  if (kind !== 'apply' && kind !== 'refer') {
    return res.status(400).json({
      error: 'invalid_kind',
      message: isZh ? 'kind 字段必须为 apply 或 refer。' : 'kind は apply / refer のいずれかにしてください。',
    });
  }

  // 必填校验
  const requiredApply = ['name', 'contact'];
  const requiredRefer = ['referrer_name', 'referrer_contact', 'candidate_name'];
  const required = kind === 'apply' ? requiredApply : requiredRefer;
  const missing = required.filter((f) => !rest[f] || (typeof rest[f] === 'string' && !rest[f].trim()));
  if (missing.length > 0) {
    return res.status(400).json({
      error: 'validation_error',
      message: isZh
        ? `以下字段为必填：${missing.join('、')}`
        : `必須項目が未入力です：${missing.join('、')}`,
      fields: missing,
    });
  }

  // 写库
  try {
    const { data, error } = await supabase
      .from('recruit_submissions')
      .insert({ kind, payload: rest, lang })
      .select('id')
      .single();
    if (error) throw error;

    // 邮件通知（异常吞掉，不影响主流程）
    const labels = (kind === 'apply' ? APPLY_LABELS : REFER_LABELS)[isZh ? 'zh' : 'ja'];
    const lines = Object.entries(rest)
      .filter(([_, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
      .map(([k, v]) => {
        const label = labels[k] || k;
        const value = Array.isArray(v) ? v.join(', ') : v;
        return `${label}：${value}`;
      });

    const titleName = kind === 'apply' ? rest.name : rest.referrer_name;
    const subjectKind = kind === 'apply'
      ? (isZh ? '新应聘' : '新規応募')
      : (isZh ? '新推荐' : '新規紹介');
    const subject = `【SHUKR】${subjectKind}：${titleName}`;
    notifyOwner({ subject, lines: [`类型：${kind}`, ...lines] });

    res.status(201).json({
      id: data.id,
      message: isZh
        ? '已收到您的资料，工作人员将尽快与您联系。'
        : '送信を承りました。担当者よりご連絡いたします。',
    });
  } catch (err) {
    console.error('保存招聘表单失败:', err.message);
    res.status(500).json({
      error: 'database_error',
      message: isZh
        ? '提交失败，请稍后重试或邮件联系 hr@mumushukr.com。'
        : '送信に失敗しました。しばらくしてから再度お試しください。',
    });
  }
});

module.exports = router;
