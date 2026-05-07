// 表单提交后给店主发邮件通知（Resend API）
//
// 没有 RESEND_API_KEY 时静默跳过，错误只打 warn —— 不影响主请求
// Resend 默认发件人 onboarding@resend.dev 只能发到已验证邮箱

const RESEND_FROM = 'SHUKR Notify <onboarding@resend.dev>';
const DEFAULT_TO = 'liuyiosaka@gmail.com';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function notifyOwner({ subject, lines }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[notifier] RESEND_API_KEY 未设置，跳过邮件');
    return;
  }
  const to = process.env.NOTIFY_EMAIL || DEFAULT_TO;
  const text = lines.join('\n');
  const html = lines.map((l) => `<p style="margin:4px 0;">${escapeHtml(l)}</p>`).join('');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html, text }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[notifier] Resend ${res.status}: ${body}`);
    }
  } catch (err) {
    console.warn('[notifier] 发送失败:', err.message);
  }
}

module.exports = { notifyOwner };
