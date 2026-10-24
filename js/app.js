/* 家計簿 PWA - 画面の制御 */
(function () {
  'use strict';

  const L = window.KakeiboLogic;
  const I = window.KakeiboIcons;
  const STORAGE_KEY = 'kakeibo2:v2';
  const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

  // ---------- データ ----------

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function defaultCategories() {
    return {
      expense: [
        { id: 'food', name: '食費', icon: 'food', color: '#f29a38' },
        { id: 'daily', name: '日用品', icon: 'bottle', color: '#4cb86b' },
        { id: 'beauty', name: '美容', icon: 'lipstick', color: '#e86aa6' },
        { id: 'social', name: '交際費', icon: 'cheers', color: '#e2bd2a' },
        { id: 'fixed', name: '固定費', icon: 'house', color: '#49b5e6' },
        { id: 'other', name: 'その他', icon: 'box', color: '#a08fd0' }
      ],
      income: [
        { id: 'salary', name: '給与', icon: 'wallet', color: '#e2a72a' },
        { id: 'extra', name: '臨時収入', icon: 'sparkle', color: '#49b5e6' },
        { id: 'inc-other', name: 'その他', icon: 'coins', color: '#a08fd0' }
      ]
    };
  }

  function defaultState() {
    return {
      version: 2,
      settings: {
        savingsGoal: 0,
        basis: 'accrual',
        hourlyRates: [1830, 1530, 1380, 1280],
        incomeMode: 'hourly' // 収入の入力方法:'hourly'(時給×時間)/ 'amount'(金額)
      },
      cards: [
        { id: 'cardA', name: 'JALカード', closingDay: 15, paymentMonthOffset: 1, paymentDay: 10, holidayAdjust: 'next', monthlyLimit: 0 },
        { id: 'cardB', name: '三井住友NL', closingDay: 5, paymentMonthOffset: 0, paymentDay: 26, holidayAdjust: 'next', monthlyLimit: 0 }
      ],
      // コード決済・電子マネー。口座からチャージして使うので、使った日に支払ったものとして扱う
      wallets: [{ id: 'paypay', name: 'PayPay' }],
      // 毎月決まった額の収入。金額 0 のあいだは使わない
      incomes: [{ id: 'fixed-income', name: '固定収入', amount: 0, day: 25, holidayAdjust: 'prev' }],
      incomeOverrides: {},
      categories: defaultCategories(),
      transactions: []
    };
  }

  // 今日を基準にした、お試し用のサンプルデータ
  function demoState() {
    const s = defaultState();
    s.settings.savingsGoal = 20000;
    const t = L.today();
    const monthStart = t.slice(0, 8) + '01';
    const shift = [
      { rate: 1830, hours: 48 },
      { rate: 1530, hours: 20 },
      { rate: 1280, hours: 16 }
    ];
    const rows = [
      [monthStart, 'income', L.hourlyTotal(shift), 'salary', 'cash', '先月分', shift],
      [-15, 'income', 8000, 'extra', 'cash', 'フリマ'],
      [-20, 'expense', 4800, 'fixed', 'cardB', '電気'],
      [-19, 'expense', 3200, 'fixed', 'cardB', 'スマホ'],
      [-14, 'expense', 1065, 'food', 'cash', ''],
      [-12, 'expense', 1140, 'daily', 'cardB', '洗剤'],
      [-9, 'expense', 6300, 'social', 'cardB', '飲み会'],
      [-8, 'expense', 3300, 'other', 'cash', '交通費'],
      [-6, 'expense', 2400, 'beauty', 'cardA', ''],
      [-4, 'expense', 740, 'food', 'cash', ''],
      [-2, 'expense', 1000, 'social', 'cash', ''],
      [-1, 'expense', 750, 'food', 'cash', 'ランチ'],
      [-1, 'expense', 780, 'food', 'cardB', 'コンビニ'],
      [-3, 'expense', 1480, 'daily', 'paypay', 'ドラッグストア'],
      [-5, 'expense', 650, 'food', 'paypay', 'カフェ'],
      [-5, 'charge', 1000, null, 'paypay', ''],
      [-3, 'charge', 2000, null, 'paypay', '']
    ];
    s.transactions = rows.map(([d, type, amount, category, method, memo, hours], i) => ({
      id: 'demo' + i,
      createdAt: '2000-01-01T00:00:' + L.pad(i),
      date: typeof d === 'string' ? d : L.addDays(t, d),
      type,
      amount,
      category,
      method,
      memo,
      ...(hours ? { hours } : {})
    }));
    return s;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const data = JSON.parse(raw);
      const base = defaultState();
      const cats = data.categories || {};
      // 初期名のままのカードは実際のカード名にする
      const rename = { cardA: ['カードA', 'JALカード'], cardB: ['カードB', '三井住友NL'] };
      (data.cards || []).forEach((c) => {
        if (rename[c.id] && c.name === rename[c.id][0]) c.name = rename[c.id][1];
      });
      return {
        ...base,
        ...data,
        settings: { ...base.settings, ...(data.settings || {}) },
        categories: {
          expense: Array.isArray(cats.expense) && typeof cats.expense[0] === 'object' ? cats.expense : base.categories.expense,
          income: Array.isArray(cats.income) && typeof cats.income[0] === 'object' ? cats.income : base.categories.income
        }
      };
    } catch (e) {
      console.error(e);
      return defaultState();
    }
  }

  let state = load();
  // お試し版(window.KAKEIBO_DEMO)では、記録が空ならサンプルを入れた状態で開く
  if (window.KAKEIBO_DEMO && !state.transactions.length) state = demoState();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('保存に失敗しました');
    }
  }

  // ---------- 表示ユーティリティ ----------

  const $ = (sel) => document.querySelector(sel);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function num(n) {
    return Math.round(Number(n) || 0).toLocaleString('ja-JP');
  }

  // 1,234円 / -1,234円
  function en(n) {
    const v = Math.round(Number(n) || 0);
    return (v < 0 ? '-' : '') + num(Math.abs(v)) + '円';
  }

  function mdw(s) {
    return L.formatMD(s) + '(' + WEEK[L.weekday(s)] + ')';
  }

  function longDate(s) {
    const { y, m, d } = L.parse(s);
    return y + '年' + m + '月' + d + '日(' + WEEK[L.weekday(s)] + ')';
  }

  function activeCards() {
    return state.cards.filter((c) => !c.archived);
  }

  function findCard(id) {
    return state.cards.find((c) => c.id === id) || null;
  }

  function activeWallets() {
    return (state.wallets || []).filter((w) => !w.archived);
  }

  function findWallet(id) {
    return (state.wallets || []).find((w) => w.id === id) || null;
  }

  function methodName(id) {
    if (id === 'cash') return '現金';
    const c = findCard(id) || findWallet(id);
    return c ? c.name : '不明';
  }

  function findCategory(id) {
    return (
      state.categories.expense.find((c) => c.id === id) ||
      state.categories.income.find((c) => c.id === id) || { id, name: '未分類', icon: 'box', color: '#a59f93' }
    );
  }

  function catIcon(cat, size) {
    return I.category(cat.icon, cat.color, size);
  }

  // アプリ内の確認ダイアログ(withInput のときは金額を入力してもらう)
  function ask(message, opts) {
    const o = opts || {};
    const modal = $('#modal');
    const input = $('#modal-input');
    const ok = $('#modal-ok');
    $('#modal-msg').textContent = message;
    ok.textContent = o.okLabel || 'OK';
    ok.classList.toggle('danger-fill', !!o.danger);
    input.hidden = !o.withInput;
    input.value = o.value != null ? num(o.value) : '';
    modal.hidden = false;
    if (o.withInput) input.focus();
    else ok.focus();
    return new Promise((resolve) => {
      const done = (result) => {
        modal.hidden = true;
        ok.onclick = $('#modal-cancel').onclick = modal.onclick = input.onkeydown = null;
        resolve(result);
      };
      const accept = () => done(o.withInput ? Number(input.value.replace(/[^\d]/g, '')) : true);
      ok.onclick = accept;
      $('#modal-cancel').onclick = () => done(o.withInput ? null : false);
      modal.onclick = (e) => {
        if (e.target === modal) done(o.withInput ? null : false);
      };
      input.onkeydown = (e) => {
        if (e.key === 'Enter') accept();
      };
    });
  }

  $('#modal-input').addEventListener('input', (e) => {
    const d = e.target.value.replace(/[^\d]/g, '').slice(0, 9);
    e.target.value = d ? num(d) : '';
  });

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // ---------- 画面切り替え ----------

  const TABS = [
    ['home', 'home', 'ホーム'],
    ['input', 'pencil', '入力'],
    ['calendar', 'calendar', 'カレンダー'],
    ['report', 'pie', 'レポート'],
    ['menu', 'dots', 'メニュー']
  ];
  const TITLES = { home: 'ホーム', calendar: 'カレンダー', report: 'レポート', menu: 'メニュー' };

  TABS.forEach(([view, ic, label]) => {
    const b = document.querySelector('.tabbar [data-view="' + view + '"]');
    b.innerHTML = I.ui(ic, 26, 1.6) + '<span>' + label + '</span>';
    b.addEventListener('click', () => {
      if (view === 'input' && currentView !== 'input') resetForm();
      show(view);
    });
  });

  $('#date-prev').innerHTML = I.ui('chevL', 22, 1.6);
  $('#date-next').innerHTML = I.ui('chevR', 22, 1.6);
  $('#cal-prev').innerHTML = I.ui('chevL', 24, 1.6);
  $('#cal-next').innerHTML = I.ui('chevR', 24, 1.6);
  $('#delete-btn').innerHTML = I.ui('trash', 24, 1.6);

  let currentView = 'home';

  function show(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== 'view-' + view));
    document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $('#submit-bar').hidden = view !== 'input';
    document.body.classList.toggle('has-submit', view === 'input');
    renderAppbar();
    render();
    window.scrollTo(0, 0);
  }

  function renderAppbar() {
    const center = $('#appbar-center');
    const action = $('#appbar-action');
    action.hidden = true;
    if (currentView === 'input') {
      center.innerHTML = `<div class="seg" id="type-seg">
        <button type="button" data-type="expense" class="${form.type === 'expense' ? 'active' : ''}">支出</button>
        <button type="button" data-type="income" class="${form.type === 'income' ? 'active' : ''}">収入</button></div>`;
      action.hidden = false;
      action.innerHTML = I.ui('pencil', 24, 1.8);
      action.setAttribute('aria-label', 'カテゴリーを編集');
    } else {
      center.innerHTML = `<div class="appbar-title">${TITLES[currentView]}</div>`;
      if (currentView === 'calendar') {
        action.hidden = false;
        action.innerHTML = I.ui(searchOpen ? 'close' : 'search', 24, 2);
        action.setAttribute('aria-label', searchOpen ? '検索を閉じる' : '検索');
      }
    }
  }

  $('#appbar-action').addEventListener('click', () => {
    if (currentView === 'input') {
      catEditType = form.type;
      show('menu');
      const el = $('#cat-settings');
      if (el) el.scrollIntoView();
    } else if (currentView === 'calendar') {
      searchOpen = !searchOpen;
      if (!searchOpen) $('#search-input').value = '';
      renderAppbar();
      renderCalendar();
      if (searchOpen) $('#search-input').focus();
    }
  });

  $('#appbar-center').addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b || b.dataset.type === form.type) return;
    form.type = b.dataset.type;
    form.category = null;
    form.hours = {};
    renderAppbar();
    renderInput();
  });

  function render() {
    if (currentView === 'home') renderHome();
    if (currentView === 'input') renderInput();
    if (currentView === 'calendar') renderCalendar();
    if (currentView === 'report') renderReport();
    if (currentView === 'menu') renderMenu();
  }

  // 記録をタップしたら編集
  document.addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) return startEdit(ed.dataset.edit);
    const go = e.target.closest('[data-go]');
    if (go) show(go.dataset.go);
  });

  // ---------- ホーム ----------
  // 「今月あといくら使えるか」だけを大きく見せる

  function renderHome() {
    const t = L.today();
    const mk = L.monthKey(t);
    const s = L.monthSummary(state, mk, t);
    const m = Number(mk.slice(5));
    const el = $('#view-home');
    const demo = window.KAKEIBO_DEMO
      ? '<p class="demo-note">お試し版です。サンプルの記録が入っています。メニューの「全データ削除」で空にできます。</p>'
      : '';

    if (s.income <= 0) {
      el.innerHTML = `
        <section class="focus">
          <div class="focus-label">${m}月 あと使えるお金</div>
          <p class="focus-empty">今月の収入を記録すると、<br>あといくら使えるかがここに出ます。</p>
          <button type="button" class="btn primary" data-add-income>給与を記録する</button>
          ${s.spent ? `<p class="small muted">今月使ったお金:${en(s.spent)}</p>` : ''}
        </section>${demo}`;
      return;
    }

    const budget = Math.max(s.budget, 0);
    const usedPct = budget ? Math.min(100, (s.spent / budget) * 100) : 100;
    const expectedPct = budget ? Math.min(100, (s.expectedSpent / budget) * 100) : 0;
    let pace;
    if (s.remaining < 0) pace = { cls: 'bad', label: '予算オーバー', note: en(-s.remaining) + ' 使いすぎています' };
    else if (s.paceDiff >= 0) pace = { cls: 'good', label: 'ペース順調', note: '予定より ' + en(s.paceDiff) + ' 少なめ' };
    else pace = { cls: 'warn', label: '使いすぎ注意', note: '予定より ' + en(-s.paceDiff) + ' 多め' };

    el.innerHTML = `
      <section class="focus">
        <div class="focus-label">${m}月 あと使えるお金</div>
        <div class="focus-big ${s.remaining < 0 ? 'minus' : ''}">${s.remaining < 0 ? '-' : ''}${num(Math.abs(s.remaining))}<span>円</span></div>
        <div class="pace ${pace.cls}"><b>${pace.label}</b>${pace.note}</div>
        <div class="meter" role="img" aria-label="予算${en(budget)}のうち${en(s.spent)}使用">
          <span class="used ${pace.cls}" style="width:${usedPct.toFixed(1)}%"></span>
          <span class="expected" style="left:${expectedPct.toFixed(1)}%" title="今日までの目安"></span>
        </div>
        <div class="meter-labels"><span>使った ${en(s.spent)}</span><span>予算 ${en(budget)}</span></div>
      </section>
      <div class="tiles">
        <div class="tile"><div class="label">1日あたり</div><div class="val">${en(s.perDay)}</div><div class="note">月末まで残り${s.daysLeft}日</div></div>
        <div class="tile"><div class="label">今日あと</div><div class="val ${s.todayAllowance < 0 ? 'expense' : ''}">${en(s.todayAllowance)}</div><div class="note">今日使った ${en(s.spentToday)}</div></div>
      </div>
      <button type="button" class="link-row" data-go="report">内訳・引落予定を見る${I.ui('chevR', 18, 1.8)}</button>
      ${demo}`;
  }

  $('#view-home').addEventListener('click', (e) => {
    if (!e.target.closest('[data-add-income]')) return;
    resetForm();
    form.type = 'income';
    show('input');
  });

  function scheduleItems(s, t) {
    const items = [];
    s.withdrawals.forEach((w) => items.push({ date: w.date, label: esc(w.name) + ' 引落', amount: `<span class="expense">-${en(w.amount)}</span>` }));
    s.recurring.forEach((r) => items.push({ date: r.date, label: esc(r.name), amount: `<span class="income">${en(r.amount)}</span>` }));
    return items
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(
        (i) => `<li class="${i.date < t ? 'muted' : ''}"><div class="small" style="width:66px">${mdw(i.date)}</div>
          <div class="grow">${i.label}${i.date < t ? ' <span class="tag">済</span>' : ''}</div><div>${i.amount}</div></li>`
      )
      .join('');
  }

  function hoursText(hours) {
    return (hours || []).map((h) => num(h.rate) + '円×' + Math.round(h.hours * 100) / 100 + 'h').join(' + ');
  }

  // ---------- 入力 ----------

  // hours: 時給ごとの入力中の時間 { "1830": "7.5", ... }
  const form = { editingId: null, type: 'expense', date: L.today(), amount: '', category: null, method: 'cash', memo: '', hours: {}, incomeMode: 'hourly' };
  let methodTouched = false;
  let returnView = 'home'; // 編集を終えたときに戻る画面

  function resetForm(date) {
    form.editingId = null;
    form.type = 'expense';
    form.date = date || L.today();
    form.amount = '';
    form.category = null;
    form.memo = '';
    form.hours = {};
    form.incomeMode = state.settings.incomeMode || 'hourly';
    methodTouched = false;
  }

  function startEdit(id) {
    const tx = state.transactions.find((t) => t.id === id);
    if (!tx) return;
    returnView = currentView === 'input' ? 'home' : currentView;
    Object.assign(form, {
      editingId: tx.id,
      type: tx.type,
      date: tx.date,
      amount: String(tx.amount),
      category: tx.category,
      method: tx.method || 'cash',
      memo: tx.memo || '',
      hours: Object.fromEntries((tx.hours || []).map((h) => [String(h.rate), String(Math.round(h.hours * 100) / 100)])),
      incomeMode: tx.hours && tx.hours.length ? 'hourly' : 'amount'
    });
    methodTouched = true;
    show('input');
  }

  function renderInput() {
    $('#date-text').textContent = longDate(form.date);
    $('#date-input').value = form.date;
    $('#memo').value = form.memo;
    $('#amount').value = form.amount ? num(form.amount) : '';
    $('#amount-label').textContent = form.type === 'expense' ? '支出' : '収入';

    const cats = state.categories[form.type].filter((c) => !c.archived);
    if (!form.category || !state.categories[form.type].some((c) => c.id === form.category)) form.category = cats[0] && cats[0].id;
    const shown = cats.some((c) => c.id === form.category) ? cats : cats.concat([findCategory(form.category)]);
    $('#categories').innerHTML = shown
      .map((c) => `<button type="button" class="cat ${c.id === form.category ? 'active' : ''}" data-cat="${esc(c.id)}">${catIcon(c, 38)}<span>${esc(c.name)}</span></button>`)
      .join('');

    const isExpense = form.type === 'expense';
    $('#method-row').hidden = !isExpense;
    $('#suggest-hint').hidden = !isExpense;
    if (isExpense) renderMethods();
    else $('#wallet-info').hidden = true;

    const hourly = isHourly();
    $('#income-mode-row').hidden = isExpense;
    document.querySelectorAll('#income-mode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === form.incomeMode));
    $('#hourly-block').hidden = !hourly;
    $('#amount').readOnly = hourly;
    $('#amount').classList.toggle('computed', hourly);
    if (hourly) renderHourly();
    renderSubmit();
  }

  function isHourly() {
    return form.type === 'income' && form.incomeMode === 'hourly';
  }

  // 設定の時給 + 編集中の記録にだけある時給
  function hourlyRates() {
    const rates = (state.settings.hourlyRates || []).map(Number).filter((r) => r > 0);
    Object.keys(form.hours).forEach((r) => {
      if (!rates.includes(Number(r))) rates.push(Number(r));
    });
    return rates;
  }

  function hourlyRows() {
    return hourlyRates()
      .map((rate) => ({ rate, hours: L.parseHours(form.hours[rate]) }))
      .filter((r) => r.hours > 0);
  }

  function renderHourly() {
    const rates = hourlyRates();
    $('#hourly-block').innerHTML = rates.length
      ? rates
          .map(
            (rate) => `<div class="hourly-row">
              <span class="rate">${num(rate)}円</span><span class="x">×</span>
              <input type="text" class="pill hours-input" id="hours-${rate}" data-rate="${rate}" inputmode="decimal" placeholder="0" value="${esc(form.hours[rate] || '')}" autocomplete="off" aria-label="${num(rate)}円の時間">
              <span class="h">時間</span><span class="subtotal" data-subtotal="${rate}"></span></div>`
          )
          .join('') + '<p class="hint">7.5 や 7:30 のように入力できます。合計が収入の金額になります。</p>'
      : '<p class="hint">メニューで時給を登録してください。</p>';
    updateHourly();
  }

  function updateHourly() {
    hourlyRates().forEach((rate) => {
      const el = document.querySelector(`[data-subtotal="${rate}"]`);
      const h = L.parseHours(form.hours[rate]);
      if (el) el.textContent = h ? en(L.hourlyTotal([{ rate, hours: h }])) : '';
    });
    const total = L.hourlyTotal(hourlyRows());
    form.amount = total ? String(total) : '';
    $('#amount').value = total ? num(total) : '';
    renderSubmit();
  }

  $('#hourly-block').addEventListener('input', (e) => {
    const rate = e.target.dataset.rate;
    if (!rate) return;
    form.hours[rate] = e.target.value;
    updateHourly();
  });

  $('#income-mode').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b || b.dataset.mode === form.incomeMode) return;
    form.incomeMode = b.dataset.mode;
    state.settings.incomeMode = form.incomeMode;
    save();
    if (form.incomeMode === 'hourly') {
      // 時給で入力するときは給与を選ぶ
      if (state.categories.income.some((c) => c.id === 'salary' && !c.archived)) form.category = 'salary';
    } else {
      form.hours = {};
    }
    renderInput();
  });

  function renderSubmit() {
    const btn = $('#save-btn');
    btn.textContent = form.editingId ? '変更する' : form.type === 'expense' ? '支出を入力する' : '収入を入力する';
    const ws = walletShortfall();
    btn.classList.toggle('disabled', !Number(form.amount) || !!(ws && ws.short > 0));
    $('#delete-btn').hidden = !form.editingId;
  }

  function renderMethods() {
    const sug = L.suggestPayment(state, form.date, Number(form.amount) || 0);
    if (!methodTouched) form.method = sug.best.method;
    const wallets = activeWallets();
    const curWallet = findWallet(form.method);
    if (curWallet && !wallets.includes(curWallet)) wallets.push(curWallet);
    const methods = [{ id: 'cash', name: '現金', wd: 'その場で' }]
      .concat(wallets.map((w) => ({ id: w.id, name: w.name, wd: '残高 ' + en(L.walletBalance(state, w)) })))
      .concat(activeCards().map((c) => ({ id: c.id, name: c.name, wd: mdw(L.withdrawalDateFor(c, form.date)) + '引落' })));
    // 編集中の記録が削除済みカードの場合も表示する
    const cur = findCard(form.method);
    if (cur && !methods.some((m) => m.id === cur.id)) methods.push({ id: cur.id, name: cur.name, wd: mdw(L.withdrawalDateFor(cur, form.date)) + '引落' });
    $('#methods').innerHTML = methods
      .map(
        (m) => `<button type="button" class="method ${m.id === form.method ? 'active' : ''}" data-method="${esc(m.id)}">
          ${m.id === sug.best.method ? '<span class="star">おすすめ</span>' : ''}
          <span class="name">${esc(m.name)}</span><span class="wd">${esc(m.wd)}</span></button>`
      )
      .join('');
    $('#suggest-hint').textContent = sug.reason;
    renderWalletInfo();
  }

  // コード決済を選んだときの残高とチャージ
  // コード決済を選んでいるとき、その残高と不足額。選んでいなければ null
  function walletShortfall() {
    const w = form.type === 'expense' ? findWallet(form.method) : null;
    if (!w) return null;
    const bal = L.walletBalance(state, w);
    // 編集中は、この記録の分を残高に戻して比べる
    const editing = form.editingId && state.transactions.find((t) => t.id === form.editingId);
    const available = bal + (editing && editing.method === w.id && editing.type === 'expense' ? Number(editing.amount) : 0);
    const short = (Number(form.amount) || 0) - available;
    return { w, bal, short: Math.max(0, short), suggest: short > 0 ? Math.ceil(short / 1000) * 1000 : 1000 };
  }

  // コード決済を選んだときの残高とチャージ
  function renderWalletInfo() {
    const el = $('#wallet-info');
    const ws = walletShortfall();
    el.hidden = !ws;
    renderSubmit();
    if (!ws) return;
    el.innerHTML = `<span>${esc(ws.w.name)}残高 <b>${en(ws.bal)}</b>${ws.short ? ` <span class="short">${en(ws.short)} 足りません</span>` : ''}</span>
      <button type="button" class="btn small" data-charge-add>${I.ui('plus', 14, 2)}チャージを記録</button>`;
  }

  // チャージ額を聞いて記録する。記録したら true
  async function recordCharge(w, suggest, message) {
    const amount = await ask(`${message ? message + '\n' : ''}${w.name}にチャージした金額(${mdw(form.date)})\n口座からの移動なので、あと使えるお金は減りません。`, {
      withInput: true,
      value: suggest,
      okLabel: '記録する'
    });
    if (!amount) return false;
    state.transactions.push({ id: uid(), createdAt: new Date().toISOString(), type: 'charge', date: form.date, amount, method: w.id, memo: '' });
    save();
    toast(`チャージを記録しました(残高 ${en(L.walletBalance(state, w))})`);
    renderMethods();
    return true;
  }

  $('#wallet-info').addEventListener('click', (e) => {
    const ws = walletShortfall();
    if (e.target.closest('[data-charge-add]') && ws) recordCharge(ws.w, ws.suggest);
  });

  function setDate(d) {
    if (!d) return;
    form.date = d;
    renderInput();
  }
  $('#date-prev').addEventListener('click', () => setDate(L.addDays(form.date, -1)));
  $('#date-next').addEventListener('click', () => setDate(L.addDays(form.date, 1)));
  $('#date-input').addEventListener('change', (e) => setDate(e.target.value));

  $('#memo').addEventListener('input', (e) => (form.memo = e.target.value));

  $('#amount').addEventListener('input', (e) => {
    if (isHourly()) return;
    const digits = e.target.value.replace(/[^\d]/g, '').replace(/^0+/, '').slice(0, 9);
    form.amount = digits;
    e.target.value = digits ? num(digits) : '';
    renderSubmit();
    // 金額によって上限超過の判定が変わるので提案を更新
    if (form.type === 'expense') renderMethods();
  });
  $('#amount').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveForm();
  });

  $('#categories').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    form.category = b.dataset.cat;
    document.querySelectorAll('#categories .cat').forEach((x) => x.classList.toggle('active', x === b));
  });

  $('#methods').addEventListener('click', (e) => {
    const b = e.target.closest('[data-method]');
    if (!b) return;
    form.method = b.dataset.method;
    methodTouched = true;
    renderMethods();
  });

  $('#save-btn').addEventListener('click', saveForm);

  async function saveForm() {
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      toast(isHourly() ? '時間を入力してください' : '金額を入力してください');
      if (!isHourly()) $('#amount').focus();
      return;
    }
    // コード決済の残高が足りないときは、先にチャージを記録してもらう
    const ws = walletShortfall();
    if (ws && ws.short > 0) {
      const charged = await recordCharge(ws.w, ws.suggest, `${ws.w.name}の残高が ${en(ws.short)} 足りないため、このままでは記録できません。`);
      const again = walletShortfall();
      if (!charged || (again && again.short > 0)) {
        if (charged) toast(`まだ ${en(again.short)} 足りません`);
        return;
      }
    }
    const data = {
      type: form.type,
      date: form.date,
      amount,
      category: form.category,
      method: form.type === 'expense' ? form.method : 'cash',
      memo: form.memo.trim()
    };
    if (isHourly()) data.hours = hourlyRows();
    if (form.editingId) {
      const tx = state.transactions.find((t) => t.id === form.editingId);
      delete tx.hours;
      Object.assign(tx, data);
      save();
      toast('変更しました');
      resetForm();
      show(returnView);
      return;
    }
    state.transactions.push({ id: uid(), createdAt: new Date().toISOString(), ...data });
    save();
    const card = data.type === 'expense' ? findCard(data.method) : null;
    toast(card ? `記録しました(${mdw(L.withdrawalDateFor(card, data.date))} 引落)` : '記録しました');
    // 日付とカテゴリーはそのまま、続けて入力できるようにする
    form.amount = '';
    form.memo = '';
    form.hours = {};
    methodTouched = false;
    $('#amount').blur();
    renderInput();
  }

  $('#delete-btn').addEventListener('click', async () => {
    if (!form.editingId || !(await ask('この記録を削除しますか?', { okLabel: '削除する', danger: true }))) return;
    state.transactions = state.transactions.filter((t) => t.id !== form.editingId);
    save();
    toast('削除しました');
    resetForm();
    show(returnView);
  });

  // ---------- カレンダー ----------

  let calMonth = L.monthKey(L.today());
  let calSelected = L.today();
  let searchOpen = false;

  function shiftMonthKey(mk, delta) {
    const [y, m] = mk.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return d.getFullYear() + '-' + L.pad(d.getMonth() + 1);
  }

  function renderCalendar() {
    $('#search-box').hidden = !searchOpen;
    const q = searchOpen ? $('#search-input').value.trim() : '';
    $('#cal-body').hidden = !!q;
    if (q) return renderSearch(q);

    const [y, m] = calMonth.split('-').map(Number);
    const last = L.daysInMonth(y, m);
    $('#cal-title').innerHTML = `${y}年${m}月<small>(${m}月1日 – ${m}月${last}日)</small>`;

    const days = {
      ...L.dailyTotals(state, shiftMonthKey(calMonth, -1)),
      ...L.dailyTotals(state, shiftMonthKey(calMonth, 1)),
      ...L.dailyTotals(state, calMonth)
    };

    // 日曜始まりで、前後の月の日も埋める
    const firstDow = new Date(y, m - 1, 1).getDay();
    const start = L.addDays(L.ymd(y, m, 1), -firstDow);
    const cells = Math.ceil((firstDow + last) / 7) * 7;
    const t = L.today();
    let html = WEEK.map((w, i) => `<div class="cal-h ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('');
    for (let i = 0; i < cells; i++) {
      const ds = L.addDays(start, i);
      const info = days[ds];
      const w = L.weekday(ds);
      const cls = ['cal-d'];
      if (L.monthKey(ds) !== calMonth) cls.push('other');
      if (w === 0) cls.push('sun');
      if (w === 6) cls.push('sat');
      if (L.holidayName(ds)) cls.push('holiday');
      if (ds === t) cls.push('today');
      if (ds === calSelected) cls.push('selected');
      let body = '';
      let mark = '';
      if (info) {
        if (info.income) body += `<span class="amt i">${num(info.income)}</span>`;
        if (info.expense) body += `<span class="amt e">${num(info.expense)}</span>`;
        if (info.withdrawals.length) mark = `<span class="mark" title="カード引落">${I.category('card', '', 14)}</span>`;
      }
      html += `<button type="button" class="${cls.join(' ')}" data-day="${ds}"><span class="top"><span class="num">${L.parse(ds).d}</span>${mark}</span>${body}</button>`;
    }
    $('#cal').innerHTML = html;

    const s = L.monthSummary(state, calMonth, t);
    const expense = state.transactions
      .filter((x) => x.type === 'expense' && L.monthKey(x.date) === calMonth)
      .reduce((a, x) => a + Number(x.amount), 0);
    const net = s.income - expense;
    $('#cal-totals').innerHTML = `
      <div><div class="label">収入</div><div class="val income">${num(s.income)}<small>円</small></div></div>
      <div><div class="label">支出</div><div class="val expense">${num(expense)}<small>円</small></div></div>
      <div><div class="label">合計</div><div class="val ${net >= 0 ? 'income' : 'expense'}">${net >= 0 ? '+' : '-'}${num(Math.abs(net))}<small>円</small></div></div>`;

    // 明細一覧(新しい日付順)。選んだ日は記録がなくても表示する
    const dates = Object.keys(days).filter((d) => L.monthKey(d) === calMonth);
    if (L.monthKey(calSelected) === calMonth && !dates.includes(calSelected)) dates.push(calSelected);
    dates.sort().reverse();
    $('#cal-list').innerHTML = dates.map((d) => dayGroup(d, days[d])).join('');
  }

  function dayGroup(ds, info) {
    const selected = ds === calSelected;
    const items = [];
    let net = 0;
    let counted = 0; // 合計に含める行の数(引落・チャージは含めない)
    if (info) {
      info.incomes.forEach((r) => {
        net += r.amount;
        counted++;
        items.push(`<li class="tap" data-override="${esc(r.periodKey)}" data-amount="${r.amount}" data-name="${esc(r.name)}">
          <div class="ic-wrap">${I.category('wallet', '#e2a72a', 34)}</div>
          <div class="grow"><div class="name">${esc(r.name)}<small>(定期)</small></div><div class="sub">タップで今月の金額を変更</div></div>
          <div class="amount income">${en(r.amount)}</div><span class="go">${I.ui('chevR', 20, 1.6)}</span></li>`);
      });
      info.withdrawals.forEach((w) => {
        items.push(`<li><div class="ic-wrap">${I.category('card', '#a59f93', 34)}</div>
          <div class="grow"><div class="name">${esc(w.name)} 引落<small>(${w.count}件)</small></div><div class="sub">利用時に記録済み・合計には含みません</div></div>
          <div class="amount info">${en(w.amount)}</div></li>`);
      });
      info.txs
        .slice()
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .forEach((tx) => {
          if (tx.type === 'charge') return items.push(chargeRow(tx));
          net += tx.type === 'income' ? Number(tx.amount) : -Number(tx.amount);
          counted++;
          items.push(txRow(tx));
        });
    }
    return `<div class="day-group" data-group="${ds}">
      <div class="day-head ${selected ? 'selected' : ''}">
        <span>${longDate(ds)}${L.holidayName(ds) ? ' ' + esc(L.holidayName(ds)) : ''}${selected ? `<button type="button" class="add" data-add="${ds}">${I.ui('plus', 14, 2)}記録</button>` : ''}</span>
        <span>${counted ? en(net) : ''}</span>
      </div>
      <ul class="day-items">${items.join('') || '<li class="empty">記録はありません</li>'}</ul></div>`;
  }

  function txRow(tx, withDate) {
    const cat = findCategory(tx.category);
    const sub = [];
    if (withDate) sub.push(longDate(tx.date));
    const card = tx.type === 'expense' ? findCard(tx.method) : null;
    if (card) sub.push(card.name + '・' + mdw(L.withdrawalDateFor(card, tx.date)) + '引落');
    else if (tx.type === 'expense') sub.push(methodName(tx.method));
    if (tx.hours && tx.hours.length) sub.push(hoursText(tx.hours));
    return `<li class="tap" data-edit="${esc(tx.id)}">
      <div class="ic-wrap">${catIcon(cat, 34)}</div>
      <div class="grow"><div class="name">${esc(cat.name)}${tx.memo ? `<small>(${esc(tx.memo)})</small>` : ''}</div>
      <div class="sub">${esc(sub.join(' / '))}</div></div>
      <div class="amount ${tx.type === 'income' ? 'income' : ''}">${en(tx.amount)}</div><span class="go">${I.ui('chevR', 20, 1.6)}</span></li>`;
  }

  function chargeRow(tx) {
    return `<li class="tap" data-charge="${esc(tx.id)}"><div class="ic-wrap">${I.category('wallet', '#a59f93', 34)}</div>
      <div class="grow"><div class="name">${esc(methodName(tx.method))} チャージ</div><div class="sub">口座からの移動・合計には含みません</div></div>
      <div class="amount info">${en(tx.amount)}</div></li>`;
  }

  function renderSearch(q) {
    const ql = q.toLowerCase();
    const hits = state.transactions
      .filter((tx) => tx.type !== 'charge')
      .filter((tx) => (tx.memo || '').toLowerCase().includes(ql) || findCategory(tx.category).name.toLowerCase().includes(ql))
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    const total = hits.reduce((a, tx) => a + (tx.type === 'income' ? 1 : -1) * Number(tx.amount), 0);
    $('#cal-list').innerHTML = `<div class="day-head"><span>「${esc(q)}」${hits.length}件</span><span>${hits.length ? en(total) : ''}</span></div>
      <ul class="day-items">${hits.map((tx) => txRow(tx, true)).join('') || '<li class="empty">見つかりませんでした</li>'}</ul>`;
  }

  $('#search-input').addEventListener('input', renderCalendar);

  $('#cal').addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (!b) return;
    const ds = b.dataset.day;
    // 選択中の日をもう一度タップしたら、その日の記録を追加
    if (ds === calSelected && L.monthKey(ds) === calMonth) return addOn(ds);
    calSelected = ds;
    if (L.monthKey(ds) !== calMonth) calMonth = L.monthKey(ds);
    renderCalendar();
    const g = document.querySelector(`[data-group="${ds}"]`);
    if (g) g.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  function addOn(ds) {
    resetForm(ds);
    returnView = 'calendar';
    show('input');
  }

  $('#cal-list').addEventListener('click', async (e) => {
    const add = e.target.closest('[data-add]');
    if (add) return addOn(add.dataset.add);
    const ch = e.target.closest('[data-charge]');
    if (ch) {
      const tx = state.transactions.find((t) => t.id === ch.dataset.charge);
      if (!(await ask(`${methodName(tx.method)}へのチャージ ${en(tx.amount)} を削除しますか?`, { okLabel: '削除する', danger: true }))) return;
      state.transactions = state.transactions.filter((t) => t !== tx);
      save();
      renderCalendar();
      toast('削除しました');
      return;
    }
    const ov = e.target.closest('[data-override]');
    if (ov) {
      const n = await ask(ov.dataset.name + 'のこの月の金額', { withInput: true, value: ov.dataset.amount, okLabel: '変更する' });
      if (n === null) return;
      state.incomeOverrides[ov.dataset.override] = n;
      save();
      renderCalendar();
      toast('今月の金額を変更しました');
    }
  });

  function moveMonth(delta) {
    calMonth = shiftMonthKey(calMonth, delta);
    calSelected = calMonth === L.monthKey(L.today()) ? L.today() : calMonth + '-01';
    renderCalendar();
  }
  $('#cal-prev').addEventListener('click', () => moveMonth(-1));
  $('#cal-next').addEventListener('click', () => moveMonth(1));

  // ---------- レポート ----------

  let reportMonth = L.monthKey(L.today());

  function renderReport() {
    const [y, m] = reportMonth.split('-').map(Number);
    const txs = state.transactions.filter((t) => L.monthKey(t.date) === reportMonth);
    const exp = txs.filter((t) => t.type === 'expense');
    const total = exp.reduce((a, t) => a + Number(t.amount), 0);

    const byCat = {};
    exp.forEach((t) => (byCat[t.category] = (byCat[t.category] || 0) + Number(t.amount)));
    const catRows = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .map(([id, amt]) => {
        const c = findCategory(id);
        const pct = total ? (amt / total) * 100 : 0;
        return `<div class="bar-row">${catIcon(c, 28)}<div>${esc(c.name)}</div>
          <div class="amt">${en(amt)}<span class="pct">${pct.toFixed(0)}%</span></div>
          <div class="meter"><span style="width:${pct.toFixed(1)}%;background:${esc(c.color)}"></span></div></div>`;
      })
      .join('');

    const byMethod = {};
    exp.forEach((t) => {
      const key = findCard(t.method) || findWallet(t.method) ? t.method : 'cash';
      byMethod[key] = (byMethod[key] || 0) + Number(t.amount);
    });
    const methodRows = ['cash']
      .concat((state.wallets || []).map((w) => w.id))
      .concat(state.cards.map((c) => c.id))
      .filter((id) => byMethod[id])
      .map((id) => `<li><div class="grow">${esc(methodName(id))}</div><div>${en(byMethod[id])}</div></li>`)
      .join('');

    const s = L.monthSummary(state, reportMonth, L.today());

    $('#view-report').innerHTML = `
      <div class="month-row">
        <button type="button" class="chev" data-rmonth="-1" aria-label="前の月">${I.ui('chevL', 24, 1.6)}</button>
        <div class="pill month-pill">${y}年${m}月</div>
        <button type="button" class="chev" data-rmonth="1" aria-label="次の月">${I.ui('chevR', 24, 1.6)}</button>
      </div>
      <div class="totals" style="padding-top:0">
        <div><div class="label">収入</div><div class="val income">${num(s.income)}<small>円</small></div></div>
        <div><div class="label">支出</div><div class="val expense">${num(total)}<small>円</small></div></div>
        <div><div class="label">あと使える</div><div class="val">${num(s.remaining)}<small>円</small></div></div>
      </div>
      <div class="card">
        <h3>使えるお金の内訳(${s.basis === 'cash' ? 'カードは引落月で計上' : 'カードは使った月で計上'})</h3>
        <div class="rows">
          <div>収入</div><div class="income">${en(s.income)}</div>
          ${s.recurring.map((r) => `<div class="sub">${esc(r.name)} ${mdw(r.date)}</div><div class="sub">${en(r.amount)}</div>`).join('')}
          ${s.savings ? `<div>貯金目標</div><div>-${en(s.savings)}</div>` : ''}
          <div>支出</div><div class="expense">-${en(s.spent)}</div>
          <div class="sub">現金</div><div class="sub">${en(s.cashSpent)}</div>
          ${s.basis === 'cash'
            ? `<div class="sub">カード引落</div><div class="sub">${en(s.cardWithdrawn)}</div>`
            : `<div class="sub">カード利用</div><div class="sub">${en(s.cardUsed)}</div>`}
          <div class="total">あと使えるお金</div><div class="total">${en(s.remaining)}</div>
        </div>
      </div>
      <div class="card"><h3>カテゴリー別の支出</h3>${catRows || '<p class="small muted" style="margin:0">支出の記録がありません</p>'}</div>
      <div class="card"><h3>支払方法別</h3><ul class="list">${methodRows || '<li class="small muted">記録がありません</li>'}</ul>
        ${activeWallets().map((w) => `<p class="small muted" style="margin:8px 0 0">${esc(w.name)}の今の残高:${en(L.walletBalance(state, w))}</p>`).join('')}</div>
      <div class="card"><h3>この月の引落・入金予定</h3><ul class="list">${scheduleItems(s, L.today()) || '<li class="small muted">ありません</li>'}</ul></div>`;
  }

  $('#view-report').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rmonth]');
    if (!b) return;
    reportMonth = shiftMonthKey(reportMonth, Number(b.dataset.rmonth));
    renderReport();
  });

  // ---------- メニュー(設定) ----------

  let catEditType = 'expense';

  function dayOptions(selected) {
    let html = '';
    for (let d = 1; d <= 31; d++) html += `<option value="${d}" ${Number(selected) === d ? 'selected' : ''}>${d === 31 ? '末日' : d + '日'}</option>`;
    return html;
  }

  function adjustOptions(selected) {
    return [
      ['next', '休日なら翌営業日'],
      ['prev', '休日なら前営業日'],
      ['none', '調整しない']
    ]
      .map(([v, l]) => `<option value="${v}" ${selected === v ? 'selected' : ''}>${l}</option>`)
      .join('');
  }

  function cardPreview(c) {
    const t = L.today();
    return `今日使うと ${mdw(L.closingDateFor(c, t))} 締め → ${mdw(L.withdrawalDateFor(c, t))} 引落`;
  }

  function iconOptions(selected) {
    return Object.entries(I.CATEGORY)
      .map(([k, v]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(v.label)}</option>`)
      .join('');
  }

  function renderMenu() {
    const st = state.settings;
    const cats = state.categories[catEditType].filter((c) => !c.archived);
    const rates = st.hourlyRates || [];
    $('#view-menu').innerHTML = `
      <div class="card">
        <h3>アルバイトの時給</h3>
        ${rates
          .map(
            (r, i) => `<div class="rate-edit">
            <input type="number" id="rate-${i}" data-rate-idx="${i}" inputmode="numeric" min="0" value="${Number(r) || 0}" aria-label="時給${i + 1}">
            <span>円</span>
            <button type="button" class="mini-btn danger" data-del-rate="${i}" aria-label="この時給を削除">${I.ui('trash', 18, 1.6)}</button>
          </div>`
          )
          .join('')}
        <div class="btn-row" style="margin-top:10px"><button type="button" class="btn" id="add-rate">+ 時給を追加</button></div>
        <p class="small muted">「入力 → 収入 → 時給×時間」で、ここの時給ごとに時間を入れると合計が収入になります。</p>
      </div>

      <div class="card">
        <h3>コード決済・電子マネー</h3>
        ${activeWallets()
          .map(
            (w) => `<div class="sub-card">
            <div class="form-grid">
              <label>名前<input type="text" id="wallet-${esc(w.id)}" data-wallet="${esc(w.id)}" value="${esc(w.name)}" maxlength="12"></label>
              <label>今の残高<input type="number" id="wallet-bal-${esc(w.id)}" data-wallet-balance="${esc(w.id)}" inputmode="numeric" value="${L.walletBalance(state, w)}"></label>
            </div>
            <div class="row-actions"><button type="button" class="btn small danger" data-del-wallet="${esc(w.id)}">削除</button></div>
          </div>`
          )
          .join('')}
        <div class="btn-row" style="margin-top:10px"><button type="button" class="btn" id="add-wallet">+ 追加</button></div>
        <p class="small muted">お店で払ったときは、支払方法をこれにして支出を記録します。チャージは入力画面でこれを選ぶと出る「チャージを記録」から。チャージは口座からの移動なので、あと使えるお金は減りません。残高がアプリの表示とずれたら「今の残高」を実際の額に直してください。</p>
      </div>

      <div class="card">
        <h3>カード</h3>
        ${activeCards()
          .map(
            (c) => `<div class="sub-card" data-card="${esc(c.id)}">
            <div class="form-grid">
              <label class="full">名前<input type="text" data-f="name" value="${esc(c.name)}" maxlength="20"></label>
              <label>締め日<select data-f="closingDay">${dayOptions(c.closingDay)}</select></label>
              <label>支払月<select data-f="paymentMonthOffset">
                <option value="0" ${Number(c.paymentMonthOffset) === 0 ? 'selected' : ''}>当月(締めと同じ月)</option>
                <option value="1" ${Number(c.paymentMonthOffset) === 1 ? 'selected' : ''}>翌月</option>
                <option value="2" ${Number(c.paymentMonthOffset) === 2 ? 'selected' : ''}>翌々月</option></select></label>
              <label>支払日<select data-f="paymentDay">${dayOptions(c.paymentDay)}</select></label>
              <label>休日の場合<select data-f="holidayAdjust">${adjustOptions(c.holidayAdjust)}</select></label>
              <label class="full">1回の締めあたりの利用上限(0=なし)<input type="number" data-f="monthlyLimit" inputmode="numeric" min="0" value="${Number(c.monthlyLimit) || 0}"></label>
            </div>
            <div class="preview">${cardPreview(c)}</div>
            <div class="row-actions"><button type="button" class="btn small danger" data-del-card="${esc(c.id)}">削除</button></div>
          </div>`
          )
          .join('')}
        <button type="button" class="btn" id="add-card">+ カードを追加</button>
      </div>

      <div class="card">
        <h3>毎月決まった額の収入</h3>
        <p class="small muted" style="margin-top:0">固定給など、毎月同じ日に同じ額が入る収入があるときだけ使います。0円のあいだは計算に入りません。</p>
        ${state.incomes
          .map(
            (inc) => `<div class="sub-card" data-income="${esc(inc.id)}">
            <div class="form-grid">
              <label>名前<input type="text" data-f="name" value="${esc(inc.name)}" maxlength="20"></label>
              <label>金額<input type="number" data-f="amount" inputmode="numeric" min="0" value="${Number(inc.amount) || 0}"></label>
              <label>毎月<select data-f="day">${dayOptions(inc.day)}</select></label>
              <label>休日の場合<select data-f="holidayAdjust">${adjustOptions(inc.holidayAdjust)}</select></label>
            </div>
            <div class="preview">${Number(inc.amount) > 0 ? '今月は ' + mdw(L.recurringIncomeDate(inc, ...L.monthKey(L.today()).split('-').map(Number))) + ' に入金' : '0円なので使っていません'}</div>
            <div class="row-actions"><button type="button" class="btn small danger" data-del-income="${esc(inc.id)}">削除</button></div>
          </div>`
          )
          .join('')}
        <button type="button" class="btn" id="add-income">+ 追加</button>
        <p class="small muted">月によって金額が違うときは、カレンダーで入金日の「(定期)」をタップするとその月だけ変更できます。</p>
      </div>

      <div class="card">
        <h3>使えるお金の計算</h3>
        <div class="stack">
          <label>毎月の貯金目標(可処分から先に除く)<input type="number" id="set-savings" inputmode="numeric" min="0" value="${Number(st.savingsGoal) || 0}"></label>
          <label>カード払いの計上月<select id="set-basis">
            <option value="accrual" ${st.basis !== 'cash' ? 'selected' : ''}>使った月に計上(使いすぎ防止向き)</option>
            <option value="cash" ${st.basis === 'cash' ? 'selected' : ''}>引き落とされる月に計上(口座残高向き)</option>
          </select></label>
        </div>
      </div>

      <div class="card" id="cat-settings">
        <h3>カテゴリー</h3>
        <div class="seg cat-tabs" id="cat-type-seg">
          <button type="button" data-ctype="expense" class="${catEditType === 'expense' ? 'active' : ''}">支出</button>
          <button type="button" data-ctype="income" class="${catEditType === 'income' ? 'active' : ''}">収入</button>
        </div>
        ${cats
          .map(
            (c, i) => `<div class="cat-edit" data-cat-id="${esc(c.id)}">
            ${catIcon(c, 32)}
            <input type="text" data-cf="name" value="${esc(c.name)}" maxlength="12" aria-label="名前">
            <button type="button" class="mini-btn danger" data-cat-del aria-label="削除">${I.ui('trash', 18, 1.6)}</button>
            <div class="opts">
              <select data-cf="icon" aria-label="アイコン">${iconOptions(c.icon)}</select>
              <input type="color" data-cf="color" value="${esc(c.color)}" aria-label="色">
              <button type="button" class="mini-btn" data-cat-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="上へ">↑</button>
              <button type="button" class="mini-btn" data-cat-move="1" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="下へ">↓</button>
            </div>
          </div>`
          )
          .join('')}
        <div style="margin-top:10px"><button type="button" class="btn" id="add-cat">+ カテゴリーを追加</button></div>
      </div>

      <div class="card">
        <h3>データ</h3>
        <p class="small muted" style="margin-top:0">データはこの端末のブラウザ内だけに保存されます。機種変更やブラウザのデータ削除に備えて、ときどき書き出してください。</p>
        <div class="btn-row">
          <button type="button" class="btn" id="export-btn">書き出し(JSON)</button>
          <button type="button" class="btn" id="import-btn">読み込み</button>
          <button type="button" class="btn danger" id="reset-btn">全データ削除</button>
          <input type="file" id="import-file" accept="application/json,.json" hidden>
        </div>
      </div>
      <p class="small muted" style="text-align:center">記録 ${state.transactions.length}件</p>`;
  }

  const menuEl = $('#view-menu');

  menuEl.addEventListener('change', (e) => {
    const t = e.target;
    const f = t.dataset.f;
    const cardEl = t.closest('[data-card]');
    const incEl = t.closest('[data-income]');
    const catEl = t.closest('[data-cat-id]');
    const numeric = ['closingDay', 'paymentMonthOffset', 'paymentDay', 'monthlyLimit', 'amount', 'day'];
    const val = numeric.includes(f) ? Math.max(0, Number(t.value) || 0) : t.value.trim();
    let rerender = false;

    if (cardEl && f) {
      const c = findCard(cardEl.dataset.card);
      c[f] = f === 'name' ? val || 'カード' : val;
      cardEl.querySelector('.preview').textContent = cardPreview(c);
    } else if (incEl && f) {
      const inc = state.incomes.find((x) => x.id === incEl.dataset.income);
      inc[f] = f === 'name' ? val || '収入' : val;
      rerender = true;
    } else if (catEl && t.dataset.cf) {
      const c = state.categories[catEditType].find((x) => x.id === catEl.dataset.catId);
      c[t.dataset.cf] = t.dataset.cf === 'name' ? t.value.trim() || 'カテゴリー' : t.value;
      rerender = t.dataset.cf !== 'name';
    } else if (t.dataset.walletBalance) {
      const w = findWallet(t.dataset.walletBalance);
      w.balanceAdjust = (Number(w.balanceAdjust) || 0) + (Math.round(Number(t.value) || 0) - L.walletBalance(state, w));
    } else if (t.dataset.wallet) {
      findWallet(t.dataset.wallet).name = t.value.trim() || 'コード決済';
    } else if (t.dataset.rateIdx !== undefined) {
      state.settings.hourlyRates[Number(t.dataset.rateIdx)] = Math.max(0, Math.round(Number(t.value) || 0));
    } else if (t.id === 'set-savings') {
      state.settings.savingsGoal = Math.max(0, Number(t.value) || 0);
    } else if (t.id === 'set-basis') {
      state.settings.basis = t.value;
    } else if (t.id === 'import-file') {
      return importFile(t.files[0]);
    } else {
      return;
    }
    save();
    if (rerender) renderMenu();
    toast('保存しました');
  });

  menuEl.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const catEl = t.closest('[data-cat-id]');
    const list = state.categories[catEditType];

    if (t.dataset.ctype) {
      catEditType = t.dataset.ctype;
      renderMenu();
      return;
    } else if (t.id === 'add-card') {
      state.cards.push({
        id: uid(),
        name: 'カード' + String.fromCharCode(65 + state.cards.length),
        closingDay: 31,
        paymentMonthOffset: 1,
        paymentDay: 27,
        holidayAdjust: 'next',
        monthlyLimit: 0
      });
    } else if (t.dataset.delCard) {
      const id = t.dataset.delCard;
      const used = state.transactions.some((x) => x.method === id);
      if (!(await ask(used ? 'このカードの記録は残したまま、選択肢から外します。' : 'このカードを削除しますか?', { okLabel: '削除する', danger: true }))) return;
      if (used) findCard(id).archived = true;
      else state.cards = state.cards.filter((c) => c.id !== id);
    } else if (t.id === 'add-wallet') {
      state.wallets = (state.wallets || []).concat([{ id: uid(), name: 'コード決済' }]);
    } else if (t.dataset.delWallet) {
      const id = t.dataset.delWallet;
      const used = state.transactions.some((x) => x.method === id);
      if (!(await ask(used ? 'この支払方法の記録は残したまま、選択肢から外します。' : 'この支払方法を削除しますか?', { okLabel: '削除する', danger: true }))) return;
      if (used) findWallet(id).archived = true;
      else state.wallets = state.wallets.filter((w) => w.id !== id);
    } else if (t.id === 'add-rate') {
      state.settings.hourlyRates = (state.settings.hourlyRates || []).concat([0]);
    } else if (t.dataset.delRate !== undefined) {
      state.settings.hourlyRates.splice(Number(t.dataset.delRate), 1);
    } else if (t.id === 'add-income') {
      state.incomes.push({ id: uid(), name: '固定収入', amount: 0, day: 25, holidayAdjust: 'prev' });
    } else if (t.dataset.delIncome) {
      if (!(await ask('この定期収入を削除しますか?過去の月の収入からも消えます。', { okLabel: '削除する', danger: true }))) return;
      state.incomes = state.incomes.filter((x) => x.id !== t.dataset.delIncome);
    } else if (t.id === 'add-cat') {
      list.push({ id: uid(), name: '新しいカテゴリー', icon: 'box', color: '#a08fd0' });
    } else if (catEl && t.hasAttribute('data-cat-del')) {
      const id = catEl.dataset.catId;
      if (list.filter((c) => !c.archived).length <= 1) return toast('カテゴリーは1つ以上必要です');
      const used = state.transactions.some((x) => x.category === id);
      if (!(await ask(used ? 'このカテゴリーの記録は残したまま、選択肢から外します。' : 'このカテゴリーを削除しますか?', { okLabel: '削除する', danger: true }))) return;
      if (used) list.find((c) => c.id === id).archived = true;
      else state.categories[catEditType] = list.filter((c) => c.id !== id);
    } else if (catEl && t.dataset.catMove) {
      const visible = list.filter((c) => !c.archived);
      const i = visible.findIndex((c) => c.id === catEl.dataset.catId);
      const j = i + Number(t.dataset.catMove);
      if (j < 0 || j >= visible.length) return;
      [visible[i], visible[j]] = [visible[j], visible[i]];
      state.categories[catEditType] = visible.concat(list.filter((c) => c.archived));
    } else if (t.id === 'export-btn') {
      return exportData();
    } else if (t.id === 'import-btn') {
      return $('#import-file').click();
    } else if (t.id === 'reset-btn') {
      if (!(await ask('すべての記録と設定を削除します。元に戻せません。', { okLabel: 'すべて削除', danger: true }))) return;
      state = defaultState();
    } else {
      return;
    }
    save();
    renderMenu();
  });

  function exportData() {
    if (window.KAKEIBO_DEMO) return toast('お試し版では書き出しできません');
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kakeibo-' + L.today() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.transactions) || !Array.isArray(data.cards)) throw new Error('形式が違います');
        if (!(await ask('今のデータを、読み込んだデータで置き換えます。', { okLabel: '置き換える' }))) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        state = load();
        toast('読み込みました');
        renderMenu();
      } catch (err) {
        toast('読み込めませんでした:' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // ---------- 起動 ----------

  // 日付が変わったとき(開きっぱなしでも)表示を更新
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render();
  });

  resetForm();
  show('home');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
