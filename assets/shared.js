// ═══ SHUKR SHARED SCRIPTS ═══

// Language (persisted across pages)
function setLang(lang) {
  localStorage.setItem('shukr-lang', lang);
  document.body.classList.toggle('zh', lang === 'zh');
  const btnZh = document.getElementById('btnZh');
  const btnJa = document.getElementById('btnJa');
  if (btnZh) btnZh.classList.toggle('active', lang === 'zh');
  if (btnJa) btnJa.classList.toggle('active', lang === 'ja');

  document.querySelectorAll('.ai-chat-tooltip.lang-ja').forEach(el => el.style.display = lang === 'zh' ? 'none' : '');
  document.querySelectorAll('.ai-chat-tooltip.lang-cn').forEach(el => el.style.display = lang === 'zh' ? '' : 'none');
  const ci = document.getElementById('chatInput');
  const cic = document.getElementById('chatInputCn');
  if (ci) ci.style.display = lang === 'zh' ? 'none' : '';
  if (cic) cic.style.display = lang === 'zh' ? '' : 'none';

  // price tab labels
  document.querySelectorAll('.price-tab.lang-ja').forEach(b => b.style.display = lang === 'zh' ? 'none' : '');
  document.querySelectorAll('.price-tab.lang-cn').forEach(b => b.style.display = lang === 'zh' ? '' : 'none');
}

// Nav scroll shadow
window.addEventListener('scroll', () => {
  const n = document.getElementById('mainNav');
  if (n) n.classList.toggle('scrolled', window.scrollY > 40);
});

// ═══ AI 客服聊天 ═══

let chatOpen = false;
let chatHistory = []; // 对话历史（页面刷新后重置）

function toggleChat() {
  chatOpen = !chatOpen;
  const modal = document.getElementById('chatModal');
  if (!modal) return;
  if (chatOpen) {
    modal.style.display = 'flex';
    setTimeout(() => { modal.style.opacity = '1'; modal.style.transform = 'scale(1) translateY(0)'; }, 10);
  } else {
    modal.style.opacity = '0';
    modal.style.transform = 'scale(0.9) translateY(20px)';
    setTimeout(() => { modal.style.display = 'none'; }, 300);
  }
}

// 把 AI 回复里的 URL 渲染为可点击链接，同时保留换行
// 先 HTML 转义防 XSS，再用正则把 http(s) URL 包成 <a target="_blank">
function renderReply(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const linkified = escaped.replace(
    /(https?:\/\/[^\s<]+[^\s<.,;:!?)】」'"])/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return linkified.replace(/\n/g, '<br>');
}

async function sendChat() {
  const isZh = document.body.classList.contains('zh');
  const inputEl = document.getElementById(isZh ? 'chatInputCn' : 'chatInput');
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';

  const msgs = document.getElementById('chatMessages');

  // 用户气泡
  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble user';
  userBubble.textContent = text;
  msgs.appendChild(userBubble);
  msgs.scrollTop = msgs.scrollHeight;

  // 加载气泡
  const loadBubble = document.createElement('div');
  loadBubble.className = 'chat-bubble bot';
  loadBubble.textContent = isZh ? '思考中…' : '考え中…';
  msgs.appendChild(loadBubble);
  msgs.scrollTop = msgs.scrollHeight;

  // 记录用户消息到历史
  chatHistory.push({ role: 'user', content: text });

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lang: isZh ? 'zh' : 'ja',
        messages: chatHistory.slice(-10) // 最多发送最近10条
      })
    });

    if (!res.ok) throw new Error('api_error');
    const data = await res.json();
    const reply = data.reply;

    loadBubble.innerHTML = renderReply(reply);
    chatHistory.push({ role: 'assistant', content: reply });
  } catch (e) {
    loadBubble.textContent = isZh
      ? '抱歉，AI客服暂时无法响应，请通过 Hot Pepper、微信或电话联系我们。'
      : '申し訳ございません。Hot Pepper・WeChat・お電話よりお問い合わせください。';
    chatHistory.pop(); // 失败时移除，方便用户重试
  }

  msgs.scrollTop = msgs.scrollHeight;
}

// ═══ 预约表单提交 ═══

async function submitReservation(event) {
  event.preventDefault();
  const isZh = document.body.classList.contains('zh');
  const form = event.target;

  // 通过 name 属性收集表单数据
  const fd = new FormData(form);
  const payload = {
    name:    (fd.get('name') || '').trim(),
    phone:   (fd.get('phone') || '').trim(),
    email:   (fd.get('email') || '').trim(),
    date:    fd.get('date') || '',
    time:    fd.get('time') || '',
    service: fd.get('service') || '',
    stylist: fd.get('stylist') || '',
    notes:   (fd.get('notes') || '').trim(),
    lang:    isZh ? 'zh' : 'ja'
  };

  // 前端基础校验
  if (!payload.name || !payload.phone || !payload.date || !payload.time || !payload.service) {
    const msg = isZh
      ? '请填写姓名、电话、希望日期、时间及服务项目。'
      : 'お名前・電話番号・ご希望日時・メニューをご入力ください。';
    alert(msg);
    return;
  }

  // 禁用提交按钮
  const btn = form.querySelector('button[type="submit"]:not([style*="display: none"]), .rsv-submit:not([style*="display: none"])');
  if (btn) { btn.disabled = true; btn.textContent = isZh ? '提交中…' : '送信中…'; }

  try {
    const res = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (res.ok) {
      // 显示成功提示（替换表单内容）
      form.innerHTML = `
        <div style="text-align:center;padding:48px 20px;">
          <div style="font-size:36px;margin-bottom:20px;">✓</div>
          <p style="font-family:'Noto Serif JP',serif;font-size:18px;letter-spacing:0.15em;margin-bottom:16px;">
            ${isZh ? '预约申请已提交' : 'ご予約を承りました'}
          </p>
          <p style="font-family:'Noto Sans JP',sans-serif;font-size:13px;color:var(--fg-muted);letter-spacing:0.08em;line-height:2.2;">
            ${isZh
              ? `希望日期：${data.reservation.date} ${data.reservation.time}<br>
                 服务项目：${data.reservation.service}<br>
                 造型师：${data.reservation.stylist || '不指定'}<br><br>
                 工作人员将尽快与您联系确认。`
              : `ご希望日時：${data.reservation.date} ${data.reservation.time}<br>
                 メニュー：${data.reservation.service}<br>
                 スタイリスト：${data.reservation.stylist || '指名なし'}<br><br>
                 担当者よりご連絡いたします。`}
          </p>
        </div>`;
    } else {
      throw new Error(data.message || 'error');
    }
  } catch (e) {
    alert(isZh
      ? (e.message || '提交失败，请通过LINE或微信联系我们。')
      : (e.message || 'エラーが発生しました。LINE・WeChatよりお問い合わせください。'));
    if (btn) { btn.disabled = false; btn.textContent = isZh ? '提交预约' : '予約を送信'; }
  }
}

// ═══ 移动端汉堡菜单 ═══

function initMobileMenu() {
  const nav = document.getElementById('mainNav');
  if (!nav) return;
  const navRight = nav.querySelector('.nav-right');
  const navLinks = nav.querySelector('.nav-links');
  if (!navRight || !navLinks) return;

  // 汉堡按钮
  const burger = document.createElement('button');
  burger.className = 'nav-hamburger';
  burger.setAttribute('aria-label', 'Menu');
  burger.innerHTML = '<span></span><span></span><span></span>';
  navRight.appendChild(burger);

  // 遮罩
  const overlay = document.createElement('div');
  overlay.className = 'mobile-menu-overlay';
  document.body.appendChild(overlay);

  // 抽屉（复制导航项）
  const drawer = document.createElement('div');
  drawer.className = 'mobile-menu';
  const linksClone = navLinks.cloneNode(true);
  linksClone.classList.remove('nav-links');
  drawer.appendChild(linksClone);

  // 语言切换
  const isZh = document.body.classList.contains('zh');
  const langDiv = document.createElement('div');
  langDiv.className = 'lang-switch';
  langDiv.innerHTML = `
    <button class="lang-btn ${isZh ? 'active' : ''}" onclick="setLang('zh')">中文</button>
    <button class="lang-btn ${isZh ? '' : 'active'}" onclick="setLang('ja')">日本語</button>
  `;
  drawer.appendChild(langDiv);

  // 预约按钮
  const reserveBtn = document.createElement('a');
  reserveBtn.href = 'reserve.html';
  reserveBtn.className = 'btn-reserve lang-ja';
  reserveBtn.textContent = '予約する';
  const reserveBtnCn = document.createElement('a');
  reserveBtnCn.href = 'reserve.html';
  reserveBtnCn.className = 'btn-reserve lang-cn';
  reserveBtnCn.textContent = '立即预约';
  drawer.appendChild(reserveBtn);
  drawer.appendChild(reserveBtnCn);

  document.body.appendChild(drawer);

  const close = () => { burger.classList.remove('open'); drawer.classList.remove('open'); overlay.classList.remove('open'); };
  const open = () => { burger.classList.add('open'); drawer.classList.add('open'); overlay.classList.add('open'); };
  burger.addEventListener('click', () => {
    drawer.classList.contains('open') ? close() : open();
  });
  overlay.addEventListener('click', close);
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
}

// ═══ AI 客服提示气泡 ═══

function initChatTooltip() {
  const btn = document.querySelector('.ai-chat-btn');
  if (!btn) return;
  if (sessionStorage.getItem('shukr-chat-tooltip-dismissed') === '1') return;

  const tip = document.createElement('div');
  tip.className = 'ai-chat-tooltip';
  tip.innerHTML = `
    <button class="ai-chat-tooltip-close" aria-label="close">×</button>
    <span class="lang-ja">ご質問があればお気軽にどうぞ！</span>
    <span class="lang-cn">有任何问题欢迎咨询我们的 AI 助理</span>
  `;
  document.body.appendChild(tip);

  const fadeOut = () => {
    tip.classList.remove('show');
    setTimeout(() => tip.remove(), 500);
  };
  const dismiss = () => {
    sessionStorage.setItem('shukr-chat-tooltip-dismissed', '1');
    fadeOut();
  };
  tip.querySelector('.ai-chat-tooltip-close').addEventListener('click', (e) => { e.stopPropagation(); dismiss(); });
  tip.addEventListener('click', () => { dismiss(); toggleChat(); });

  setTimeout(() => tip.classList.add('show'), 3500);
  setTimeout(fadeOut, 12000);
}

// ═══ 初始化 ═══

document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('shukr-lang') || 'ja';
  setLang(saved);
  initMobileMenu();
  initChatTooltip();
});
