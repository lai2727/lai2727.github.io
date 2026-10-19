(function pageScript_() {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // 期限: ページを開いた日を基準に「あと◯日」へ書き換える
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  $$('[data-expires]').forEach((pill) => {
    const [y, m, d] = pill.dataset.expires.split('-').map(Number);
    const days = Math.round((new Date(y, m - 1, d) - today) / 86400000);
    let kind = 'until';
    let label = (y === today.getFullYear() ? '' : `${y}年`) + `${m}月${d}日まで`;
    if (days < 0) { kind = 'expired'; label = '期限切れ'; }
    else if (days === 0) { kind = 'soon'; label = '今日まで'; }
    else if (days <= 14) { kind = 'soon'; label = `あと${days}日`; }
    pill.className = 'pill pill-' + kind;
    pill.textContent = label;
    const card = pill.closest('.voucher');
    if (card) card.classList.toggle('is-expired', kind === 'expired');
  });

  // コピー
  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }
  function selectText(el) {
    try { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {}
  }
  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  function copyText(text, onDone, onFail) {
    const fallback = () => (legacyCopy(text) ? onDone() : onFail());
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(onDone, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const card = btn.closest('.voucher');
    const codeEl = card && card.querySelector('.v-code');
    const stamp = card && card.querySelector('.stamp');
    const label = btn.querySelector('.lbl') || btn;
    copyText(btn.dataset.copy, () => {
      btn.classList.add('is-done');
      label.textContent = 'コピー済み';
      if (stamp) { stamp.classList.remove('on'); void stamp.offsetWidth; stamp.classList.add('on'); }
      toast(`${btn.dataset.service || ''}のコードをコピーしました`);
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { btn.classList.remove('is-done'); label.textContent = 'コピー'; }, 1900);
    }, () => {
      if (codeEl) selectText(codeEl);
      toast('コードを選択しました。長押しか Ctrl+C でコピーしてください');
    });
  });

  // 一覧ページ: 検索とカテゴリの絞り込み
  const q = $('#q');
  if (!q) return;
  const finder = $('#finder');
  const nomatch = $('#nomatch');
  const cards = $$('[data-search]');
  const chips = $$('.chip[data-cat]');
  let cat = 'all';

  // 「PayPay クーポン」「メルカリの招待コード」のような入力から、サービス名の部分だけを残す
  const STOP = ['友だち紹介', '友達紹介', '紹介コード', '招待コード', 'クーポンコード', 'キャンペーン', 'クーポン', '新規登録', 'もらえる', 'やり方', '使い方',
    '紹介', '招待', 'コード', '登録', '特典', '入会', 'とは'].sort((a, b) => b.length - a.length);
  const norm = (s) => String(s).normalize('NFKC').toLowerCase();
  function tokens(input) {
    return norm(input).split(/[\s、,・/]+/).map((t) => {
      let x = t;
      for (let again = true; again && x;) {
        again = false;
        for (const w of STOP) {
          if (x.length > w.length && x.endsWith(w)) { x = x.slice(0, -w.length); again = true; break; }
        }
        if (x.length > 1 && x.endsWith('の')) { x = x.slice(0, -1); again = true; }
      }
      return STOP.includes(x) ? '' : x;
    }).filter(Boolean);
  }

  function apply() {
    const words = tokens(q.value);
    let shown = 0;
    cards.forEach((card) => {
      const okCat = cat === 'all' || card.dataset.cat === cat;
      const okText = words.every((w) => card.dataset.search.includes(w));
      card.hidden = !(okCat && okText);
      if (!card.hidden) shown++;
    });
    if (nomatch) {
      nomatch.hidden = shown > 0 || !cards.length;
      if (!nomatch.hidden) {
        nomatch.replaceChildren();
        if (q.value.trim()) {
          const b = document.createElement('b');
          b.textContent = `「${q.value.trim()}」`;
          nomatch.append(b, 'に一致する紹介コードはありません。');
        } else {
          nomatch.textContent = 'このカテゴリの紹介コードはありません。';
        }
      }
    }
  }
  chips.forEach((chip) => chip.addEventListener('click', () => {
    cat = chip.dataset.cat;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    apply();
  }));
  q.addEventListener('input', apply);
  q.addEventListener('keydown', (e) => { if (e.key === 'Escape' && q.value) { q.value = ''; apply(); } });

  // ?q=paypay のようなリンクで開いたときは、最初から検索しておく
  try {
    const initial = new URLSearchParams(location.search).get('q');
    if (initial) { q.value = initial; apply(); }
  } catch (e) {}

  // 検索欄が上に貼り付いたら、境目に線を出す
  if (finder) {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { finder.classList.toggle('is-stuck', finder.getBoundingClientRect().top <= 0); ticking = false; });
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
