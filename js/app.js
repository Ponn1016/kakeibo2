/* 家計簿 PWA - 画面の制御 */
(function () {
  'use strict';

  const L = window.KakeiboLogic;
  const STORAGE_KEY = 'kakeibo2:v1';
  const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

  // ---------- データ ----------

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function defaultState() {
    return {
      version: 1,
      settings: { savingsGoal: 0, basis: 'accrual' },
      cards: [
        { id: 'cardA', name: 'カードA', closingDay: 15, paymentMonthOffset: 1, paymentDay: 10, holidayAdjust: 'next', monthlyLimit: 0 },
        { id: 'cardB', name: 'カードB', closingDay: 31, paymentMonthOffset: 1, paymentDay: 27, holidayAdjust: 'next', monthlyLimit: 0 }
      ],
      incomes: [{ id: 'salary', name: '給料', amount: 0, day: 25, holidayAdjust: 'prev' }],
      incomeOverrides: {},
      categories: {
        expense: ['🍙 食費', '🍽 外食', '🧴 日用品', '🚃 交通費', '👕 衣服', '🎮 趣味', '🍻 交際費', '💊 医療', '🏠 住居', '💡 光熱費', '📱 通信', '📦 その他'],
        income: ['✨ 臨時収入', '🎁 賞与', '💰 給料', '📦 その他']
      },
      transactions: []
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const data = JSON.parse(raw);
      const base = defaultState();
      return {
        ...base,
        ...data,
        settings: { ...base.settings, ...(data.settings || {}) },
        categories: { ...base.categories, ...(data.categories || {}) }
      };
    } catch (e) {
      console.error(e);
      return defaultState();
    }
  }

  let state = load();

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

  function yen(n) {
    const v = Math.round(Number(n) || 0);
    return (v < 0 ? '-¥' : '¥') + Math.abs(v).toLocaleString('ja-JP');
  }

  function mdw(s) {
    return L.formatMD(s) + '(' + WEEK[L.weekday(s)] + ')';
  }

  function activeCards() {
    return state.cards.filter((c) => !c.archived);
  }

  function methodName(id) {
    if (id === 'cash') return '現金';
    const c = state.cards.find((x) => x.id === id);
    return c ? c.name : '不明';
  }

  function splitCategory(label) {
    const m = String(label).match(/^(\S+)\s+(.+)$/);
    if (m && !/^[\w一-龯ぁ-んァ-ン]/.test(m[1])) return { em: m[1], name: m[2] };
    return { em: '・', name: label };
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // ---------- 画面切り替え ----------

  const TITLES = { home: '家計簿', input: '記録する', calendar: 'カレンダー', settings: '設定' };
  let currentView = 'home';

  function show(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== 'view-' + view));
    document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $('#title').textContent = TITLES[view];
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    if (currentView === 'home') renderHome();
    if (currentView === 'input') renderInput();
    if (currentView === 'calendar') renderCalendar();
    if (currentView === 'settings') renderSettings();
  }

  document.querySelectorAll('.tabbar button').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.view === 'input' && currentView !== 'input') resetForm();
      show(b.dataset.view);
    })
  );

  // ---------- ホーム ----------

  function renderHome() {
    const t = L.today();
    const mk = L.monthKey(t);
    const s = L.monthSummary(state, mk, t);
    const [y, m] = mk.split('-').map(Number);
    const usedRatio = s.budget > 0 ? Math.min(1, Math.max(0, s.spent / s.budget)) : 0;
    const sug = L.suggestPayment(state, t, 0);
    const nextInc = L.nextIncomeDate(state.incomes, L.addDays(t, 1));

    const recent = state.transactions
      .slice()
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
      .slice(0, 5);

    const noIncome = s.income === 0;

    $('#view-home').innerHTML = `
      <div class="card hero">
        <h3>${m}月の可処分(残り)</h3>
        <div class="big yen ${s.remaining < 0 ? 'minus' : ''}">${yen(s.remaining)}</div>
        <div class="bar" aria-hidden="true"><span style="width:${(usedRatio * 100).toFixed(1)}%"></span></div>
        <div class="hero-row">
          <div><div class="label">1日あたりの目安</div><div class="val yen">${yen(s.perDay)}</div><div class="label">残り${s.daysLeft}日</div></div>
          <div><div class="label">今日あと使える</div><div class="val yen">${yen(s.todayAllowance)}</div><div class="label">今日の目安から</div></div>
        </div>
      </div>
      ${noIncome ? `<div class="card"><p class="small" style="margin:0">定期収入の金額が未設定です。<button type="button" class="btn small" data-go="settings">設定で給料を登録</button></p></div>` : ''}

      <div class="card">
        <h3>今月の内訳(${s.basis === 'cash' ? '引落月で計上' : '使った月で計上'})</h3>
        <div class="rows">
          <div>収入</div><div class="yen income">${yen(s.income)}</div>
          ${s.recurring.map((r) => `<div class="sub">${esc(r.name)}(${mdw(r.date)})</div><div class="sub yen">${yen(r.amount)}</div>`).join('')}
          ${s.extraIncome ? `<div class="sub">都度収入</div><div class="sub yen">${yen(s.extraIncome)}</div>` : ''}
          ${s.savings ? `<div>貯金目標</div><div class="yen">-${yen(s.savings)}</div>` : ''}
          <div>支出</div><div class="yen expense">-${yen(s.spent)}</div>
          <div class="sub">現金</div><div class="sub yen">${yen(s.cashSpent)}</div>
          ${s.basis === 'cash'
            ? `<div class="sub">カード引落</div><div class="sub yen">${yen(s.cardWithdrawn)}</div>`
            : `<div class="sub">カード利用</div><div class="sub yen">${yen(s.cardUsed)}</div>`}
          <div class="total">可処分(残り)</div><div class="total yen">${yen(s.remaining)}</div>
        </div>
      </div>

      <div class="card">
        <h3>今日の支払いなら</h3>
        ${renderSuggestion(sug)}
      </div>

      <div class="card">
        <h3>今月の引落・入金予定</h3>
        <ul class="list">
          ${scheduleItems(s, t) || '<li class="muted small">予定はありません</li>'}
        </ul>
        ${nextInc ? `<p class="small muted" style="margin:6px 0 0">次の${esc(nextInc.name)}:${mdw(nextInc.date)}(${L.diffDays(t, nextInc.date)}日後)</p>` : ''}
      </div>

      <div class="card">
        <h3>最近の記録</h3>
        <ul class="list">
          ${recent.map(txItem).join('') || '<li class="muted small">まだ記録がありません</li>'}
        </ul>
      </div>
    `;
  }

  function renderSuggestion(sug) {
    const best = sug.best;
    const others = sug.ranked.slice(1);
    return `
      <div class="suggest-best">${esc(best.name)}</div>
      <p class="small" style="margin:2px 0 6px">${esc(sug.reason)}</p>
      ${best.notes.map((n) => `<span class="tag good">${esc(n)}</span>`).join('')}
      <ul class="list" style="margin-top:6px">
        ${others
          .map(
            (o) => `<li><div class="grow"><div>${esc(o.name)}</div>
              ${o.notes.map((n) => `<span class="tag warn">${esc(n)}</span>`).join('')}</div>
              <div class="small muted">${o.method === 'cash' ? 'その場で支払い' : '引落 ' + mdw(o.withdrawalDate)}</div></li>`
          )
          .join('')}
      </ul>`;
  }

  function scheduleItems(s, t) {
    const items = [];
    s.withdrawals.forEach((w) =>
      items.push({ date: w.date, html: `💳 ${esc(w.name)} 引落`, amount: `<span class="expense">-${yen(w.amount)}</span>` })
    );
    s.recurring.forEach((r) =>
      items.push({ date: r.date, html: `💰 ${esc(r.name)}`, amount: `<span class="income">${yen(r.amount)}</span>` })
    );
    return items
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(
        (i) => `<li class="${i.date < t ? 'muted' : ''}"><div class="small" style="width:64px">${mdw(i.date)}</div>
          <div class="grow">${i.html}${i.date < t ? ' <span class="tag">済</span>' : ''}</div><div class="yen">${i.amount}</div></li>`
      )
      .join('');
  }

  function txItem(tx) {
    const c = splitCategory(tx.category);
    const sub = [mdw(tx.date)];
    if (tx.type === 'expense') {
      sub.push(methodName(tx.method));
      const card = state.cards.find((x) => x.id === tx.method);
      if (card) sub.push('引落 ' + L.formatMD(L.withdrawalDateFor(card, tx.date)));
    }
    return `<li class="tap" data-edit="${esc(tx.id)}">
      <div style="font-size:20px">${esc(c.em)}</div>
      <div class="grow"><div class="title">${esc(tx.memo || c.name)}</div><div class="small muted">${esc(sub.join(' · '))}</div></div>
      <div class="yen ${tx.type}">${tx.type === 'expense' ? '-' : '+'}${yen(tx.amount)}</div>
    </li>`;
  }

  // 一覧の記録をタップしたら編集
  document.addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) {
      startEdit(ed.dataset.edit);
      return;
    }
    const go = e.target.closest('[data-go]');
    if (go) show(go.dataset.go);
  });

  // ---------- 入力 ----------

  const form = { editingId: null, type: 'expense', date: L.today(), amount: '', category: null, method: 'cash', memo: '' };
  let methodTouched = false;
  let returnView = 'home'; // 編集を終えたときに戻る画面

  function resetForm(date) {
    form.editingId = null;
    form.type = 'expense';
    form.date = date || L.today();
    form.amount = '';
    form.category = null;
    form.method = defaultMethod();
    form.memo = '';
    methodTouched = false;
    $('#memo').value = '';
  }

  function defaultMethod() {
    const sug = L.suggestPayment(state, form.date, Number(form.amount) || 0);
    return sug.best.method;
  }

  function startEdit(id) {
    const tx = state.transactions.find((t) => t.id === id);
    if (!tx) return;
    returnView = currentView === 'input' ? 'home' : currentView;
    form.editingId = tx.id;
    form.type = tx.type;
    form.date = tx.date;
    form.amount = String(tx.amount);
    form.category = tx.category;
    form.method = tx.method || 'cash';
    form.memo = tx.memo || '';
    methodTouched = true;
    $('#memo').value = form.memo;
    show('input');
  }

  function renderInput() {
    document.querySelectorAll('#type-seg .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.type === form.type));
    $('#date-text').textContent = form.date.replace(/-/g, '/') + '(' + WEEK[L.weekday(form.date)] + ')' + (form.date === L.today() ? ' 今日' : '');
    $('#date-input').value = form.date;
    renderAmount();

    const cats = state.categories[form.type];
    if (!form.category || !cats.includes(form.category)) {
      if (!(form.editingId && form.category)) form.category = cats[0];
    }
    const catList = cats.includes(form.category) ? cats : cats.concat([form.category]);
    $('#categories').innerHTML = catList
      .map((label) => {
        const c = splitCategory(label);
        return `<button type="button" class="cat ${label === form.category ? 'active' : ''}" data-cat="${esc(label)}"><span class="em">${esc(c.em)}</span>${esc(c.name)}</button>`;
      })
      .join('');

    $('#method-block').hidden = form.type !== 'expense';
    if (form.type === 'expense') renderMethods();

    $('#edit-actions').hidden = !form.editingId;
    $('#save-btn').textContent = form.editingId ? '更新' : '保存';
  }

  function renderAmount() {
    const el = $('#amount-display');
    el.textContent = yen(Number(form.amount) || 0);
    el.className = 'amount ' + form.type;
  }

  function renderMethods() {
    const sug = L.suggestPayment(state, form.date, Number(form.amount) || 0);
    if (!methodTouched) form.method = sug.best.method;
    const methods = [{ id: 'cash', name: '現金', wd: 'その場で支払い' }].concat(
      activeCards().map((c) => ({ id: c.id, name: c.name, wd: '引落 ' + mdw(L.withdrawalDateFor(c, form.date)) }))
    );
    // 編集中の記録が削除済みカードの場合も表示する
    if (!methods.some((m) => m.id === form.method)) {
      const c = state.cards.find((x) => x.id === form.method);
      if (c) methods.push({ id: c.id, name: c.name, wd: '引落 ' + mdw(L.withdrawalDateFor(c, form.date)) });
    }
    $('#methods').innerHTML = methods
      .map(
        (m) => `<button type="button" class="method ${m.id === form.method ? 'active' : ''}" data-method="${esc(m.id)}">
          ${m.id === sug.best.method ? '<span class="star">おすすめ</span>' : ''}
          <span class="name">${esc(m.name)}</span><span class="wd">${esc(m.wd)}</span></button>`
      )
      .join('');
    $('#suggest-hint').textContent = '💡 ' + sug.reason;
  }

  $('#type-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b || b.dataset.type === form.type) return;
    form.type = b.dataset.type;
    form.category = null;
    renderInput();
  });

  function setDate(d) {
    if (!d) return;
    form.date = d;
    renderInput();
  }
  $('#date-prev').addEventListener('click', () => setDate(L.addDays(form.date, -1)));
  $('#date-next').addEventListener('click', () => setDate(L.addDays(form.date, 1)));
  $('#date-input').addEventListener('change', (e) => setDate(e.target.value));

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

  $('#memo').addEventListener('input', (e) => (form.memo = e.target.value));

  $('#keypad').addEventListener('click', (e) => {
    const b = e.target.closest('[data-key]');
    if (!b) return;
    const k = b.dataset.key;
    if (k === 'save') return saveForm();
    if (k === 'back') form.amount = form.amount.slice(0, -1);
    else if (k === 'clear') form.amount = '';
    else if (form.amount.length < 9) form.amount = (form.amount + k).replace(/^0+/, '');
    renderAmount();
    // 金額が変わると上限判定が変わるので提案を更新
    if (form.type === 'expense') renderMethods();
  });

  function saveForm() {
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      toast('金額を入力してください');
      return;
    }
    const data = {
      type: form.type,
      date: form.date,
      amount,
      category: form.category,
      method: form.type === 'expense' ? form.method : 'cash',
      memo: form.memo.trim()
    };
    if (form.editingId) {
      const tx = state.transactions.find((t) => t.id === form.editingId);
      Object.assign(tx, data);
      toast('更新しました');
    } else {
      state.transactions.push({ id: uid(), createdAt: new Date().toISOString(), ...data });
      let msg = '保存しました';
      if (data.type === 'expense' && data.method !== 'cash') {
        const card = state.cards.find((c) => c.id === data.method);
        msg += '(引落 ' + mdw(L.withdrawalDateFor(card, data.date)) + ')';
      }
      toast(msg);
    }
    save();
    const wasEditing = !!form.editingId;
    const keepDate = form.date;
    resetForm(keepDate);
    if (wasEditing) show(returnView);
    else renderInput();
  }

  $('#delete-btn').addEventListener('click', () => {
    if (!form.editingId || !confirm('この記録を削除しますか?')) return;
    state.transactions = state.transactions.filter((t) => t.id !== form.editingId);
    save();
    toast('削除しました');
    resetForm();
    show(returnView);
  });
  $('#cancel-edit-btn').addEventListener('click', () => {
    resetForm();
    show(returnView);
  });

  // ---------- カレンダー ----------

  let calMonth = L.monthKey(L.today());
  let calSelected = L.today();

  function renderCalendar() {
    const [y, m] = calMonth.split('-').map(Number);
    $('#cal-title').textContent = y + '年' + m + '月';
    const days = L.dailyTotals(state, calMonth);
    const s = L.monthSummary(state, calMonth, L.today());
    const expense = state.transactions
      .filter((t) => t.type === 'expense' && L.monthKey(t.date) === calMonth)
      .reduce((a, t) => a + Number(t.amount), 0);

    $('#cal-summary').innerHTML = `
      <div><div class="label">収入</div><div class="val yen income">${yen(s.income)}</div></div>
      <div><div class="label">支出</div><div class="val yen expense">${yen(expense)}</div></div>
      <div><div class="label">カード引落</div><div class="val yen">${yen(s.cardWithdrawn)}</div></div>`;

    const first = new Date(y, m - 1, 1).getDay();
    const n = L.daysInMonth(y, m);
    const t = L.today();
    let html = '';
    for (let i = 0; i < first; i++) html += '<div class="cal-day blank"></div>';
    for (let d = 1; d <= n; d++) {
      const ds = L.ymd(y, m, d);
      const info = days[ds];
      const w = L.weekday(ds);
      const cls = ['cal-day'];
      if (w === 0) cls.push('sun');
      if (w === 6) cls.push('sat');
      if (L.holidayName(ds)) cls.push('holiday');
      if (ds === t) cls.push('today');
      if (ds === calSelected) cls.push('selected');
      let body = '';
      if (info) {
        if (info.expense) body += `<span class="e">${compact(info.expense)}</span>`;
        if (info.income) body += `<span class="i">+${compact(info.income)}</span>`;
        if (info.withdrawals.length) body += `<span class="w">💳${compact(info.withdrawals.reduce((a, x) => a + x.amount, 0))}</span>`;
      }
      html += `<button type="button" class="${cls.join(' ')}" data-day="${ds}"><span class="num">${d}</span>${body}</button>`;
    }
    $('#cal-grid').innerHTML = html;
    renderDayDetail(days[calSelected], calSelected);
  }

  function compact(n) {
    return n >= 100000 ? Math.round(n / 1000).toLocaleString('ja-JP') + 'k' : n.toLocaleString('ja-JP');
  }

  function renderDayDetail(info, ds) {
    const el = $('#cal-detail');
    if (L.monthKey(ds) !== calMonth) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const hol = L.holidayName(ds);
    const items = [];
    if (info) {
      info.incomes.forEach((r) =>
        items.push(`<li class="tap" data-override="${esc(r.periodKey)}" data-amount="${r.amount}" data-name="${esc(r.name)}">
          <div style="font-size:20px">💰</div><div class="grow"><div>${esc(r.name)}(定期)</div><div class="small muted">タップで今月の金額を変更</div></div>
          <div class="yen income">+${yen(r.amount)}</div></li>`)
      );
      info.withdrawals.forEach((w) =>
        items.push(`<li><div style="font-size:20px">💳</div><div class="grow"><div>${esc(w.name)} 引落</div><div class="small muted">${w.count}件の利用分</div></div>
          <div class="yen expense">-${yen(w.amount)}</div></li>`)
      );
      info.txs
        .slice()
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .forEach((tx) => items.push(txItem(tx)));
    }
    el.innerHTML = `
      <div class="detail-head"><h3>${mdw(ds)}${hol ? ' ' + esc(hol) : ''}</h3>
        <button type="button" class="btn small primary" id="cal-add">+ この日に記録</button></div>
      <ul class="list">${items.join('') || '<li class="muted small">記録はありません</li>'}</ul>`;
  }

  $('#cal-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (!b) return;
    calSelected = b.dataset.day;
    renderCalendar();
  });

  $('#cal-detail').addEventListener('click', (e) => {
    if (e.target.closest('#cal-add')) {
      resetForm(calSelected);
      returnView = 'calendar';
      show('input');
      return;
    }
    const ov = e.target.closest('[data-override]');
    if (ov) {
      const v = prompt(ov.dataset.name + 'の今月の金額', ov.dataset.amount);
      if (v === null) return;
      const n = Number(String(v).replace(/[,¥\s]/g, ''));
      if (!Number.isFinite(n) || n < 0) return toast('数値を入力してください');
      state.incomeOverrides[ov.dataset.override] = n;
      save();
      renderCalendar();
      toast('今月の金額を変更しました');
    }
  });

  function shiftMonth(delta) {
    const [y, m] = calMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    calMonth = d.getFullYear() + '-' + L.pad(d.getMonth() + 1);
    calSelected = calMonth === L.monthKey(L.today()) ? L.today() : calMonth + '-01';
    renderCalendar();
  }
  $('#cal-prev').addEventListener('click', () => shiftMonth(-1));
  $('#cal-next').addEventListener('click', () => shiftMonth(1));

  // ---------- 設定 ----------

  function dayOptions(selected, lastLabel) {
    let html = '';
    for (let d = 1; d <= 31; d++) {
      const label = d === 31 ? lastLabel || '末日' : d + '日';
      html += `<option value="${d}" ${Number(selected) === d ? 'selected' : ''}>${label}</option>`;
    }
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
    const wd = L.withdrawalDateFor(c, t);
    return `今日使うと ${mdw(L.closingDateFor(c, t))} 締め → ${mdw(wd)} 引落`;
  }

  function renderSettings() {
    const st = state.settings;
    $('#view-settings').innerHTML = `
      <div class="card">
        <h3>カード</h3>
        ${activeCards()
          .map(
            (c) => `<div class="sub-card" data-card="${esc(c.id)}">
            <div class="form-grid">
              <label class="full">名前<input data-f="name" value="${esc(c.name)}" maxlength="20"></label>
              <label>締め日<select data-f="closingDay">${dayOptions(c.closingDay, '末日')}</select></label>
              <label>支払月<select data-f="paymentMonthOffset">
                <option value="1" ${Number(c.paymentMonthOffset) === 1 ? 'selected' : ''}>翌月</option>
                <option value="2" ${Number(c.paymentMonthOffset) === 2 ? 'selected' : ''}>翌々月</option></select></label>
              <label>支払日<select data-f="paymentDay">${dayOptions(c.paymentDay, '末日')}</select></label>
              <label>休日の場合<select data-f="holidayAdjust">${adjustOptions(c.holidayAdjust)}</select></label>
              <label class="full">1回の締めあたりの利用上限(0=なし)<input data-f="monthlyLimit" type="number" inputmode="numeric" min="0" value="${Number(c.monthlyLimit) || 0}"></label>
            </div>
            <div class="preview">${cardPreview(c)}</div>
            <div class="row-actions"><button type="button" class="btn small danger" data-del-card="${esc(c.id)}">削除</button></div>
          </div>`
          )
          .join('')}
        <button type="button" class="btn" id="add-card">+ カードを追加</button>
      </div>

      <div class="card">
        <h3>定期収入</h3>
        ${state.incomes
          .map(
            (inc) => `<div class="sub-card" data-income="${esc(inc.id)}">
            <div class="form-grid">
              <label>名前<input data-f="name" value="${esc(inc.name)}" maxlength="20"></label>
              <label>金額<input data-f="amount" type="number" inputmode="numeric" min="0" value="${Number(inc.amount) || 0}"></label>
              <label>毎月<select data-f="day">${dayOptions(inc.day, '末日')}</select></label>
              <label>休日の場合<select data-f="holidayAdjust">${adjustOptions(inc.holidayAdjust)}</select></label>
            </div>
            <div class="preview">今月は ${mdw(L.recurringIncomeDate(inc, ...L.monthKey(L.today()).split('-').map(Number)))} に入金</div>
            <div class="row-actions"><button type="button" class="btn small danger" data-del-income="${esc(inc.id)}">削除</button></div>
          </div>`
          )
          .join('')}
        <button type="button" class="btn" id="add-income">+ 定期収入を追加</button>
        <p class="small muted">月によって金額が違うときは、カレンダーで入金日をタップするとその月だけ変更できます。ボーナスなど不定期の収入は「入力 → 収入」から記録してください。</p>
      </div>

      <div class="card">
        <h3>可処分の計算</h3>
        <div class="stack">
          <label>毎月の貯金目標(可処分から先に除く)<input id="set-savings" type="number" inputmode="numeric" min="0" value="${Number(st.savingsGoal) || 0}"></label>
          <label>カード払いの計上月<select id="set-basis">
            <option value="accrual" ${st.basis !== 'cash' ? 'selected' : ''}>使った月に計上(使いすぎ防止向き)</option>
            <option value="cash" ${st.basis === 'cash' ? 'selected' : ''}>引き落とされる月に計上(口座残高向き)</option>
          </select></label>
        </div>
      </div>

      <div class="card">
        <h3>カテゴリ(1行に1つ。先頭に絵文字+空白を付けるとアイコンになります)</h3>
        <div class="stack">
          <label>支出<textarea id="set-cat-expense" rows="6">${esc(state.categories.expense.join('\n'))}</textarea></label>
          <label>収入<textarea id="set-cat-income" rows="3">${esc(state.categories.income.join('\n'))}</textarea></label>
        </div>
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
      <p class="small muted" style="text-align:center">記録 ${state.transactions.length}件</p>
    `;
  }

  const settingsEl = $('#view-settings');

  settingsEl.addEventListener('change', (e) => {
    const f = e.target.dataset.f;
    const cardEl = e.target.closest('[data-card]');
    const incEl = e.target.closest('[data-income]');
    const numeric = ['closingDay', 'paymentMonthOffset', 'paymentDay', 'monthlyLimit', 'amount', 'day'];
    const val = numeric.includes(f) ? Math.max(0, Number(e.target.value) || 0) : e.target.value.trim();

    if (cardEl && f) {
      const c = state.cards.find((x) => x.id === cardEl.dataset.card);
      c[f] = f === 'name' ? val || 'カード' : val;
      cardEl.querySelector('.preview').textContent = cardPreview(c);
    } else if (incEl && f) {
      const inc = state.incomes.find((x) => x.id === incEl.dataset.income);
      inc[f] = f === 'name' ? val || '収入' : val;
    } else if (e.target.id === 'set-savings') {
      state.settings.savingsGoal = Math.max(0, Number(e.target.value) || 0);
    } else if (e.target.id === 'set-basis') {
      state.settings.basis = e.target.value;
    } else if (e.target.id === 'set-cat-expense' || e.target.id === 'set-cat-income') {
      const type = e.target.id === 'set-cat-expense' ? 'expense' : 'income';
      const list = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!list.length) return toast('カテゴリを1つ以上入れてください');
      state.categories[type] = list;
    } else if (e.target.id === 'import-file') {
      importFile(e.target.files[0]);
      return;
    } else {
      return;
    }
    save();
    if (incEl) renderSettings();
    toast('設定を保存しました');
  });

  settingsEl.addEventListener('click', (e) => {
    const t = e.target;
    if (t.id === 'add-card') {
      const n = state.cards.length;
      state.cards.push({
        id: uid(),
        name: 'カード' + String.fromCharCode(65 + n),
        closingDay: 31,
        paymentMonthOffset: 1,
        paymentDay: 27,
        holidayAdjust: 'next',
        monthlyLimit: 0
      });
    } else if (t.dataset.delCard) {
      const id = t.dataset.delCard;
      const used = state.transactions.some((x) => x.method === id);
      if (!confirm(used ? 'このカードの記録は残したまま、選択肢から外します。よろしいですか?' : 'このカードを削除しますか?')) return;
      if (used) state.cards.find((c) => c.id === id).archived = true;
      else state.cards = state.cards.filter((c) => c.id !== id);
    } else if (t.id === 'add-income') {
      state.incomes.push({ id: uid(), name: '定期収入', amount: 0, day: 25, holidayAdjust: 'prev' });
    } else if (t.dataset.delIncome) {
      if (!confirm('この定期収入を削除しますか?(過去の月の可処分からも消えます)')) return;
      state.incomes = state.incomes.filter((x) => x.id !== t.dataset.delIncome);
    } else if (t.id === 'export-btn') {
      exportData();
      return;
    } else if (t.id === 'import-btn') {
      $('#import-file').click();
      return;
    } else if (t.id === 'reset-btn') {
      if (!confirm('すべての記録と設定を削除します。元に戻せません。よろしいですか?')) return;
      state = defaultState();
    } else {
      return;
    }
    save();
    renderSettings();
  });

  function exportData() {
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
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.transactions) || !Array.isArray(data.cards)) throw new Error('形式が違います');
        if (!confirm('今のデータを読み込んだデータで置き換えます。よろしいですか?')) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        state = load();
        toast('読み込みました');
        renderSettings();
      } catch (err) {
        toast('読み込めませんでした:' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // ---------- 起動 ----------

  // 日付が変わったら(アプリを開きっぱなしでも)表示を更新
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render();
  });

  resetForm();
  show('home');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
