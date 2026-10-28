/*
 * 家計簿の計算ロジック(DOM に依存しない純粋関数)
 * ブラウザでは window.KakeiboLogic、Node では module.exports として使う。
 */
(function (root) {
  'use strict';

  // ---------- 日付ユーティリティ ----------
  // 日付は常に "YYYY-MM-DD" 文字列で扱い、タイムゾーンのずれを避ける。

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function ymd(y, m, d) {
    // m は 1-12。範囲外の値は Date で正規化する。
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  }

  function parse(s) {
    const [y, m, d] = s.split('-').map(Number);
    return { y, m, d };
  }

  function toDate(s) {
    const { y, m, d } = parse(s);
    return new Date(y, m - 1, d);
  }

  function today() {
    const t = new Date();
    return ymd(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }

  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate();
  }

  function addDays(s, n) {
    const { y, m, d } = parse(s);
    return ymd(y, m, d + n);
  }

  function diffDays(a, b) {
    // b - a(日数)
    return Math.round((toDate(b) - toDate(a)) / 86400000);
  }

  function weekday(s) {
    return toDate(s).getDay();
  }

  function monthKey(s) {
    return s.slice(0, 7);
  }

  // 月の「日」を指定して日付を作る。31 や 99 は月末として扱う。
  function dayOfMonth(y, m, day) {
    const last = daysInMonth(y, m);
    return ymd(y, m, Math.min(day, last));
  }

  // ---------- 日本の祝日 ----------

  function nthMonday(y, m, n) {
    const first = new Date(y, m - 1, 1).getDay();
    const offset = (8 - first) % 7; // 最初の月曜日までの日数
    return 1 + offset + (n - 1) * 7;
  }

  function vernalEquinox(y) {
    return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  }

  function autumnalEquinox(y) {
    return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  }

  const holidayCache = {};

  function holidaysOfYear(y) {
    if (holidayCache[y]) return holidayCache[y];
    const list = {};
    const add = (m, d, name) => {
      list[ymd(y, m, d)] = name;
    };
    add(1, 1, '元日');
    add(1, nthMonday(y, 1, 2), '成人の日');
    add(2, 11, '建国記念の日');
    if (y >= 2020) add(2, 23, '天皇誕生日');
    add(3, vernalEquinox(y), '春分の日');
    add(4, 29, '昭和の日');
    add(5, 3, '憲法記念日');
    add(5, 4, 'みどりの日');
    add(5, 5, 'こどもの日');
    add(7, nthMonday(y, 7, 3), '海の日');
    add(8, 11, '山の日');
    add(9, nthMonday(y, 9, 3), '敬老の日');
    add(9, autumnalEquinox(y), '秋分の日');
    add(10, nthMonday(y, 10, 2), 'スポーツの日');
    add(11, 3, '文化の日');
    add(11, 23, '勤労感謝の日');

    // 国民の休日(祝日に挟まれた平日)
    Object.keys(list).forEach((d) => {
      const next2 = addDays(d, 2);
      const mid = addDays(d, 1);
      if (list[next2] && !list[mid] && weekday(mid) !== 0) list[mid] = '国民の休日';
    });

    // 振替休日(日曜の祝日の後、最初の祝日でない日)
    Object.keys(list)
      .sort()
      .forEach((d) => {
        if (weekday(d) !== 0) return;
        let s = addDays(d, 1);
        while (list[s]) s = addDays(s, 1);
        list[s] = '振替休日';
      });

    holidayCache[y] = list;
    return list;
  }

  function holidayName(s) {
    return holidaysOfYear(parse(s).y)[s] || null;
  }

  // 銀行の営業日か(土日・祝日・年末年始 12/31〜1/3 は休み)
  function isBankBusinessDay(s) {
    const w = weekday(s);
    if (w === 0 || w === 6) return false;
    if (holidayName(s)) return false;
    const md = s.slice(5);
    if (md === '12-31' || md === '01-02' || md === '01-03') return false;
    return true;
  }

  // 休日だった場合の調整。mode: 'next' | 'prev' | 'none'
  function adjustBusinessDay(s, mode) {
    if (mode === 'none') return s;
    const step = mode === 'prev' ? -1 : 1;
    let d = s;
    while (!isBankBusinessDay(d)) d = addDays(d, step);
    return d;
  }

  // ---------- カードの引落日 ----------

  /*
   * card = {
   *   closingDay: 1-31(31=末日),
   *   paymentMonthOffset: 0(当月) / 1(翌月) / 2(翌々月),
   *   paymentDay: 1-31(31=末日),
   *   holidayAdjust: 'next' | 'prev' | 'none'
   * }
   * 利用日が締め日以前ならその月の締め、締め日を過ぎていれば翌月の締めになる。
   */
  function closingDateFor(card, useDate) {
    const { y, m, d } = parse(useDate);
    const thisClose = dayOfMonth(y, m, card.closingDay);
    if (d <= parse(thisClose).d) return thisClose;
    const next = new Date(y, m, 1);
    return dayOfMonth(next.getFullYear(), next.getMonth() + 1, card.closingDay);
  }

  function withdrawalDateFor(card, useDate) {
    const close = parse(closingDateFor(card, useDate));
    const raw0 = Number(card.paymentMonthOffset);
    const offset = Number.isFinite(raw0) && raw0 >= 0 ? raw0 : 1;
    const base = new Date(close.y, close.m - 1 + offset, 1);
    const raw = dayOfMonth(base.getFullYear(), base.getMonth() + 1, Number(card.paymentDay));
    return adjustBusinessDay(raw, card.holidayAdjust || 'next');
  }

  // ---------- 定期収入 ----------

  /*
   * income = { id, name, amount, day, holidayAdjust: 'prev'|'next'|'none' }
   * overrides = { "<incomeId>:<YYYY-MM>": amount }(その月だけ金額を変更)
   */
  function recurringIncomeDate(income, y, m) {
    return adjustBusinessDay(dayOfMonth(y, m, Number(income.day)), income.holidayAdjust || 'prev');
  }

  // 指定した月(YYYY-MM)に入金される定期収入の一覧
  function recurringIncomesInMonth(incomes, overrides, mk) {
    const [y, m] = mk.split('-').map(Number);
    const result = [];
    (incomes || []).forEach((inc) => {
      // 前営業日調整で月をまたぐケースを拾うため、前後の月も見る
      [-1, 0, 1].forEach((delta) => {
        const base = new Date(y, m - 1 + delta, 1);
        const by = base.getFullYear();
        const bm = base.getMonth() + 1;
        const date = recurringIncomeDate(inc, by, bm);
        if (monthKey(date) !== mk) return;
        const key = inc.id + ':' + by + '-' + pad(bm);
        const amount =
          overrides && overrides[key] !== undefined ? Number(overrides[key]) : Number(inc.amount);
        // 金額 0 の定期収入は「使っていない」とみなす
        if (!(amount > 0)) return;
        result.push({
          kind: 'recurring',
          incomeId: inc.id,
          periodKey: key,
          name: inc.name,
          date,
          amount
        });
      });
    });
    return result.sort((a, b) => a.date.localeCompare(b.date));
  }

  // 指定日以降で最も近い定期収入日
  function nextIncomeDate(incomes, fromDate) {
    let best = null;
    const { y, m } = parse(fromDate);
    (incomes || []).forEach((inc) => {
      if (!(Number(inc.amount) > 0)) return;
      for (let i = 0; i < 3; i++) {
        const base = new Date(y, m - 1 + i, 1);
        const d = recurringIncomeDate(inc, base.getFullYear(), base.getMonth() + 1);
        if (d >= fromDate) {
          if (!best || d < best.date) best = { date: d, name: inc.name };
          break;
        }
      }
    });
    return best;
  }

  // ---------- 集計 ----------

  function findCard(state, id) {
    return (state.cards || []).find((c) => c.id === id) || null;
  }

  function isCard(state, method) {
    return method !== 'cash' && !!findCard(state, method);
  }

  // 取引ごとの「お金が出ていく日」(現金は利用日、カードは引落日)
  function cashOutDate(state, tx) {
    if (tx.type !== 'expense') return tx.date;
    const card = isCard(state, tx.method) ? findCard(state, tx.method) : null;
    return card ? withdrawalDateFor(card, tx.date) : tx.date;
  }

  // 指定月に引き落とされるカード利用額(カードごと)
  function cardWithdrawalsInMonth(state, mk) {
    const map = {};
    (state.transactions || []).forEach((tx) => {
      if (tx.type !== 'expense' || !isCard(state, tx.method)) return;
      const card = findCard(state, tx.method);
      const wd = withdrawalDateFor(card, tx.date);
      if (monthKey(wd) !== mk) return;
      const key = card.id + '|' + wd;
      if (!map[key]) map[key] = { cardId: card.id, name: card.name, date: wd, amount: 0, count: 0 };
      map[key].amount += Number(tx.amount);
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }

  function nextMonthKey(mk) {
    const [y, m] = mk.split('-').map(Number);
    return ymd(y, m + 1, 1).slice(0, 7);
  }

  // 貯蓄(B銀行など)への入金。使えるお金の収入には数えない
  function isSavings(t) {
    return t.type === 'income' && t.category === 'savings';
  }

  // 月の収入と支出
  function monthFlows(state, mk) {
    const basis = (state.settings || {}).basis || 'accrual';
    const txs = (state.transactions || []).filter((t) => monthKey(t.date) === mk);

    const recurring = recurringIncomesInMonth(state.incomes, state.incomeOverrides, mk);
    const recurringTotal = recurring.reduce((s, r) => s + r.amount, 0);
    const extraIncome = txs.filter((t) => t.type === 'income' && !isSavings(t)).reduce((s, t) => s + Number(t.amount), 0);

    const expensesInMonth = txs.filter((t) => t.type === 'expense' && !isPrepaidUse(state, t));
    const cashSpent = expensesInMonth.filter((t) => !isCard(state, t.method)).reduce((s, t) => s + Number(t.amount), 0);
    const cardUsed = expensesInMonth.filter((t) => isCard(state, t.method)).reduce((s, t) => s + Number(t.amount), 0);
    const withdrawals = cardWithdrawalsInMonth(state, mk);
    const cardWithdrawn = withdrawals.reduce((s, w) => s + w.amount, 0);

    return {
      basis,
      recurring,
      recurringTotal,
      extraIncome,
      income: recurringTotal + extraIncome,
      expensesInMonth,
      cashSpent,
      cardUsed,
      withdrawals,
      cardWithdrawn,
      spent: basis === 'cash' ? cashSpent + cardWithdrawn : cashSpent + cardUsed
    };
  }

  // 繰越 = 最初の記録の月から先月までの(収入 − 支出)の合計
  function carryOver(state, mk) {
    const dates = (state.transactions || []).map((t) => t.date).sort();
    if (!dates.length) return 0;
    let carry = 0;
    for (let cur = monthKey(dates[0]); cur < mk; cur = nextMonthKey(cur)) {
      const f = monthFlows(state, cur);
      carry += f.income - f.spent;
    }
    return carry;
  }

  // 貯蓄の合計 = 調整額(メニューで入れた残高に合わせる差分)+ 貯蓄への入金
  function savingsBalance(state) {
    const adjust = Number((state.settings || {}).savingsAdjust) || 0;
    return (state.transactions || []).filter(isSavings).reduce((s, t) => s + Number(t.amount), adjust);
  }

  /*
   * ポイント還元(7%還元など)。tx.pointRate(%)が付いた支出の 金額 × 率 の1ポイント未満切り捨て(目安)
   */
  function txPoints(tx) {
    if (tx.type !== 'expense' || !(Number(tx.pointRate) > 0)) return 0;
    return Math.floor((Number(tx.amount) * Number(tx.pointRate)) / 100);
  }

  // 月(mk)のポイントと、これまでの合計
  function pointsSummary(state, mk) {
    const txs = (state.transactions || []).filter((t) => txPoints(t) > 0);
    const inMonth = txs.filter((t) => monthKey(t.date) === mk);
    return {
      month: inMonth.reduce((s, t) => s + txPoints(t), 0),
      monthCount: inMonth.length,
      monthAmount: inMonth.reduce((s, t) => s + Number(t.amount), 0),
      total: txs.reduce((s, t) => s + txPoints(t), 0)
    };
  }

  /*
   * メイン口座の見通し。settings.bank = { balance, asOf(残高を入れた日), updatedAt(入れた時刻) }
   * 出せるお金 = 残高 − 残高を入れた日以降のカード引落 − 残高を入れた後に記録したチャージ − 最低限残しておく額
   * 残高を入れた日と同じ日の引落は、まだ落ちていないものとして引く(少なめに見積もる)
   */
  function bankOutlook(state) {
    const bank = (state.settings || {}).bank;
    if (!bank || !bank.asOf) return null;
    const balance = Number(bank.balance) || 0;
    const reserve = Number((state.settings || {}).savingsGoal) || 0;

    const map = {};
    (state.transactions || []).forEach((tx) => {
      if (tx.type !== 'expense' || !isCard(state, tx.method)) return;
      const card = findCard(state, tx.method);
      const wd = withdrawalDateFor(card, tx.date);
      if (wd < bank.asOf) return;
      const key = card.id + '|' + wd;
      if (!map[key]) map[key] = { date: wd, name: card.name, amount: 0 };
      map[key].amount += Number(tx.amount);
    });
    const withdrawals = Object.values(map).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    const pendingWithdrawals = withdrawals.reduce((s, w) => s + w.amount, 0);

    // 口座から出たお金:チャージ(PayPay など)と、口座から直接の支出(ATM での引き出しなど。method 'bank')
    const chargesSince = (state.transactions || [])
      .filter((t) => (t.type === 'charge' || (t.type === 'expense' && t.method === 'bank')) && (!bank.updatedAt || String(t.createdAt) > bank.updatedAt))
      .reduce((s, t) => s + Number(t.amount), 0);

    // 引落日ごとの残高の推移
    let running = balance - chargesSince;
    const timeline = withdrawals.map((w) => {
      running -= w.amount;
      return { ...w, balanceAfter: running };
    });

    return {
      balance,
      asOf: bank.asOf,
      withdrawals: timeline,
      pendingWithdrawals,
      chargesSince,
      reserve,
      available: balance - pendingWithdrawals - chargesSince - reserve
    };
  }

  /*
   * 月の「あと使えるお金」を計算する。
   * あと使えるお金 = 繰越 + その月の収入 − その月の支出 − 最低限残しておく額(settings.savingsGoal)
   * 貯蓄への入金は収入に数えない
   * basis = 'accrual'(カードは使った月に計上) / 'cash'(カードは引落月に計上)
   */
  function monthSummary(state, mk, todayStr) {
    const settings = state.settings || {};
    const f = monthFlows(state, mk);
    const { basis, recurring, recurringTotal, extraIncome, income, cashSpent, cardUsed, withdrawals, cardWithdrawn, spent } = f;
    const carry = carryOver(state, mk);
    const savings = Number(settings.savingsGoal) || 0;
    const budget = carry + income - savings;
    const remaining = budget - spent;

    // 月の残り日数(今日を含む)
    const [y, m] = mk.split('-').map(Number);
    const last = ymd(y, m, daysInMonth(y, m));
    const first = ymd(y, m, 1);
    let daysLeft;
    if (todayStr > last) daysLeft = 0;
    else if (todayStr < first) daysLeft = daysInMonth(y, m);
    else daysLeft = diffDays(todayStr, last) + 1;

    // ペース判定:月の経過日数に比例して使った場合の金額と比べる
    const dim = daysInMonth(y, m);
    const elapsed = dim - daysLeft + (daysLeft > 0 ? 1 : 0); // 今日を含む経過日数
    const expectedSpent = Math.round((Math.max(budget, 0) * Math.min(elapsed, dim)) / dim);
    const paceDiff = expectedSpent - spent; // プラスなら予定より使っていない

    return {
      basis,
      carry,
      income,
      recurring,
      recurringTotal,
      extraIncome,
      savings,
      budget,
      cashSpent,
      cardUsed,
      cardWithdrawn,
      withdrawals,
      spent,
      remaining,
      daysLeft,
      expectedSpent,
      paceDiff
    };
  }

  // カレンダー用の日別集計
  function dailyTotals(state, mk) {
    const days = {};
    const get = (d) => {
      if (!days[d]) days[d] = { expense: 0, income: 0, withdrawals: [], incomes: [], txs: [] };
      return days[d];
    };
    (state.transactions || []).forEach((t) => {
      if (monthKey(t.date) !== mk) return;
      const day = get(t.date);
      day.txs.push(t);
      if (t.type === 'expense' && !isPrepaidUse(state, t)) day.expense += Number(t.amount);
      else if (t.type === 'income' && !isSavings(t)) day.income += Number(t.amount);
      // type 'charge'(コード決済へのチャージ)は自分のお金の移動なので、収入にも支出にも数えない
    });
    recurringIncomesInMonth(state.incomes, state.incomeOverrides, mk).forEach((r) => {
      const day = get(r.date);
      day.incomes.push(r);
      day.income += r.amount;
    });
    cardWithdrawalsInMonth(state, mk).forEach((w) => get(w.date).withdrawals.push(w));
    return days;
  }

  // ---------- 支払手段の提案 ----------

  /*
   * 今日(useDate)使う場合、どの支払手段がよいかを順位付けする。
   * 基本は「引落が遅いほど手元資金に余裕ができる」ので引落日までの日数で評価し、
   * 月の利用上限を超える/超えそうなカードや、次の収入より前に引き落とされるカードは減点する。
   */
  function suggestPayment(state, useDate, amount) {
    const amt = Number(amount) || 0;
    const nextIncome = nextIncomeDate(state.incomes, useDate);
    const options = [];

    (state.cards || [])
      .filter((c) => !c.archived)
      .forEach((card) => {
        const wd = withdrawalDateFor(card, useDate);
        const days = diffDays(useDate, wd);
        const close = closingDateFor(card, useDate);
        const notes = [];
        let score = days;

        // 同じ締め期間内の利用額
        const usedInCycle = (state.transactions || [])
          .filter((t) => t.type === 'expense' && t.method === card.id)
          .filter((t) => closingDateFor(card, t.date) === close)
          .reduce((s, t) => s + Number(t.amount), 0);

        const limit = Number(card.monthlyLimit) || 0;
        if (limit > 0) {
          const after = usedInCycle + amt;
          if (after > limit) {
            score -= 1000;
            notes.push('今期の上限を超えます');
          } else if (after > limit * 0.8) {
            score -= 15;
            notes.push('今期の上限の8割を超えます');
          }
        }

        if (nextIncome && wd < nextIncome.date) {
          score -= 20;
          notes.push('次の' + nextIncome.name + 'より前に引落');
        }

        const daysToClose = diffDays(useDate, close);
        if (daysToClose === 0) notes.push('今日が締め日');
        else if (diffDays(closingDateFor(card, addDays(useDate, -1)), close) > 0)
          notes.push('締め日の翌日(引落が最も遅い)');

        options.push({
          method: card.id,
          name: card.name,
          withdrawalDate: wd,
          closingDate: close,
          daysUntilWithdrawal: days,
          usedInCycle,
          limit,
          score,
          notes
        });
      });

    options.sort((a, b) => b.score - a.score);

    // 可処分が残り少ない場合は使いすぎ防止のため現金を勧める
    const summary = monthSummary(state, monthKey(useDate), useDate);
    const tight = summary.remaining - amt < 0;
    const cash = {
      method: 'cash',
      name: '現金',
      withdrawalDate: useDate,
      daysUntilWithdrawal: 0,
      score: tight ? Infinity : -Infinity,
      notes: tight ? ['今月の可処分を超えるので現金で使いすぎ防止'] : []
    };

    const ranked = tight ? [cash].concat(options) : options.concat([cash]);
    const best = ranked[0];
    let reason;
    if (best.method === 'cash') {
      reason = '今月の可処分が残り少ないため、現金での支払いがおすすめです。';
    } else {
      reason =
        best.name +
        'なら引落は' +
        formatMD(best.withdrawalDate) +
        '(' +
        best.daysUntilWithdrawal +
        '日後)で、支払いを最も先にできます。';
    }
    return { best, ranked, reason, nextIncome };
  }

  /*
   * コード決済の残高 = 調整額 + チャージ − その決済での支払い
   * wallet = { id, balanceAdjust }。balanceAdjust は実際の残高に合わせるための差分
   */
  function walletBalance(state, wallet) {
    let bal = Number(wallet.balanceAdjust) || 0;
    (state.transactions || []).forEach((t) => {
      // 管理を始める前(wallet.since より前に記録したもの)は数えない
      if (wallet.since && String(t.createdAt) < wallet.since) return;
      // 支出扱いのチャージ・引き出しは、支出(chargeTo にコード決済などの id)として記録している
      if (t.type === 'expense' && t.chargeTo === wallet.id) bal += Number(t.amount);
      if (t.method !== wallet.id) return;
      if (t.type === 'charge') bal += Number(t.amount);
      else if (t.type === 'expense') bal -= Number(t.amount);
    });
    return bal;
  }

  /*
   * 入れた時点で支出として数える財布・電子マネーでの支払いか。
   *   wallet.chargeFrom = カードの id … カードからチャージ(Suica など)
   *   wallet.chargeFrom = 'bank'      … メイン口座から引き出し(現金。wallet.since を入れてから管理を始める)
   * チャージ・引き出しの時点で支出として数えているので、支払いは残高を減らすだけで支出には数えない
   */
  function isPrepaidUse(state, t) {
    if (t.type !== 'expense') return false;
    const w = (state.wallets || []).find((x) => x.id === t.method);
    if (!w || !w.chargeFrom) return false;
    if (w.chargeFrom === 'bank' && !w.since) return false;
    if (w.since && String(t.createdAt) < w.since) return false;
    return w.chargeFrom === 'bank' || isCard(state, w.chargeFrom);
  }

  /*
   * 時給×時間。row = { rate, minutes }(以前の記録は { rate, hours } の小数時間)
   * 時給ごとの金額を1円単位に四捨五入し、合計はその和にする(画面の小計と合計が一致するように)
   */
  function workMinutes(row) {
    if (row.minutes != null) return Number(row.minutes) || 0;
    return Math.round((Number(row.hours) || 0) * 60);
  }

  function hourlyAmount(row) {
    return Math.round((Number(row.rate) * workMinutes(row)) / 60);
  }

  function hourlyTotal(rows) {
    return (rows || []).reduce((s, r) => s + hourlyAmount(r), 0);
  }

  function formatMD(s) {
    const { m, d } = parse(s);
    return m + '/' + d;
  }

  const api = {
    pad,
    ymd,
    parse,
    today,
    daysInMonth,
    addDays,
    diffDays,
    weekday,
    monthKey,
    dayOfMonth,
    holidayName,
    isBankBusinessDay,
    adjustBusinessDay,
    closingDateFor,
    withdrawalDateFor,
    recurringIncomeDate,
    recurringIncomesInMonth,
    nextIncomeDate,
    cashOutDate,
    cardWithdrawalsInMonth,
    monthSummary,
    carryOver,
    savingsBalance,
    bankOutlook,
    txPoints,
    pointsSummary,
    isSavings,
    dailyTotals,
    suggestPayment,
    walletBalance,
    isPrepaidUse,
    workMinutes,
    hourlyAmount,
    hourlyTotal,
    formatMD
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KakeiboLogic = api;
})(typeof self !== 'undefined' ? self : this);
