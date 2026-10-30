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
  // ポイント = 金額 × 還元率。pointUnit があると、その金額ごとに付く(Suica は 50円ごと、JAL は 100円ごと)
  function txPoints(tx) {
    if (tx.type !== 'expense' || !(Number(tx.pointRate) > 0)) return 0;
    const unit = Number(tx.pointUnit) || 0;
    const base = unit > 0 ? Math.floor(Number(tx.amount) / unit) * unit : Number(tx.amount);
    // 小数の誤差で 1P 少なくならないように丸めてから切り捨てる
    return Math.floor(Math.round(base * Number(tx.pointRate) * 1e6) / 1e8);
  }

  // ---------- 三井住友NL(Vポイント):基本 0.5% + 7%対象店の加算 6.5% + Vクーポン ----------
  /*
   * 200円ごとに、基本 1P(0.5%)、7%対象店なら加算 13P(6.5%)、Vクーポンならその率の分。
   * 合計 20%(200円で 40P)を超える分は付かない。
   * 計算のまとまりは settings.nlPointMode:'monthly'(月合計、初期値)/ 'perTx'(1回ごと)。
   * 7%対象はスマホのタッチ決済・モバイルオーダーだけ(実カードのタッチ・iD・差し込みは対象外)。
   * 公式の明文ではなく明細から確かめた計算なので、切り替えられるようにしている。
   */
  const SMBC_UNIT = 200;
  const SMBC_BASE = 1;
  const SMBC_BONUS7 = 13;
  const SMBC_CAP = 40;

  // Vクーポン(キャンペーン)。with7:7%と併用できるか、monthly:月ごとに獲得し直す
  const CAMPAIGNS = [
    { id: 'mcd-mo', name: 'マクドナルド モバイルオーダー', short: 'マック MO', rate: 5, with7: true, from: '2026-10-01', to: '2026-11-30', monthly: true },
    { id: 'mcd-delivery', name: 'マックデリバリー', short: 'マックデリバリー', rate: 10, with7: false, from: '2026-10-01', to: '2026-11-30', monthly: true }
  ];

  function campaignsOf(state) {
    return (state && state.campaigns) || CAMPAIGNS;
  }

  function activeCampaigns(state, date) {
    return campaignsOf(state).filter((c) => date >= c.from && date <= c.to);
  }

  function isSmbcCard(state, method) {
    const c = findCard(state, method);
    return !!(c && c.pointScheme === 'smbc');
  }

  // その記録に効く Vクーポン(期間外なら無し)と、7%対象かどうか(7%と併用できないクーポンなら対象外)
  function smbcTxInfo(state, tx) {
    const c = tx.coupon ? campaignsOf(state).find((x) => x.id === tx.coupon) : null;
    const coupon = c && tx.date >= c.from && tx.date <= c.to ? c : null;
    const tagged = !!tx.nl7 && !(coupon && !coupon.with7);
    return { coupon, tagged };
  }

  // 200円あたりのクーポンのポイント。合計 20% を超える分は付かない
  function couponPerUnit(coupon, tagged) {
    const per = Math.round(coupon.rate * (SMBC_UNIT / 100));
    return Math.max(0, Math.min(per, SMBC_CAP - SMBC_BASE - (tagged ? SMBC_BONUS7 : 0)));
  }

  function smbcPoints(state, list, mode) {
    const units = (amt) => Math.floor(amt / SMBC_UNIT);
    const sum = (arr) => arr.reduce((s, t) => s + Number(t.amount), 0);
    const info = list.map((t) => ({ t, ...smbcTxInfo(state, t) }));
    const tagged = info.filter((x) => x.tagged).map((x) => x.t);
    const r = {
      amount: sum(list),
      count: list.length,
      taggedAmount: sum(tagged),
      taggedCount: tagged.length,
      couponAmount: sum(info.filter((x) => x.coupon).map((x) => x.t)),
      base: 0,
      bonus7: 0,
      coupon: 0
    };
    if (mode === 'perTx') {
      info.forEach(({ t, tagged: tg, coupon }) => {
        const u = units(Number(t.amount));
        r.base += u * SMBC_BASE;
        if (tg) r.bonus7 += u * SMBC_BONUS7;
        if (coupon) r.coupon += u * couponPerUnit(coupon, tg);
      });
    } else {
      r.base = units(r.amount) * SMBC_BASE;
      r.bonus7 = units(r.taggedAmount) * SMBC_BONUS7;
      // クーポンは、同じクーポン・同じ 7% 対象どうしでまとめる
      const groups = {};
      info.filter((x) => x.coupon).forEach((x) => {
        const k = x.coupon.id + '|' + x.tagged;
        (groups[k] = groups[k] || { coupon: x.coupon, tagged: x.tagged, amount: 0 }).amount += Number(x.t.amount);
      });
      Object.values(groups).forEach((g) => (r.coupon += units(g.amount) * couponPerUnit(g.coupon, g.tagged)));
    }
    r.points = r.base + r.bonus7 + r.coupon;
    return r;
  }

  function smbcMode(state) {
    return ((state.settings || {}).nlPointMode) === 'perTx' ? 'perTx' : 'monthly';
  }

  // NL の月(mk)のポイント(使った日の月でまとめる)
  function smbcMonthPoints(state, mk, mode) {
    const list = (state.transactions || []).filter((t) => t.type === 'expense' && isSmbcCard(state, t.method) && monthKey(t.date) === mk);
    return smbcPoints(state, list, mode || smbcMode(state));
  }

  // 1回分の目安(入力画面・カレンダー用。月合計のときは月の端数で前後する)
  function smbcTxPoints(state, tx) {
    return smbcPoints(state, [tx], 'perTx').points;
  }

  /*
   * 照合用:月ごとの 7% 加算分とクーポン分の見込み。
   * Vpass の「コンビニ・飲食店＿スマホのタッチ」の行と比べる。加算分の付与は利用月から原則 3ヵ月以内なので、
   * その月の 3ヵ月後の月末(due)までは付与待ちの可能性がある
   */
  function smbcBonusByMonth(state, todayDate) {
    const now = todayDate || today();
    const months = new Set();
    (state.transactions || []).forEach((t) => {
      if (t.type !== 'expense' || !isSmbcCard(state, t.method)) return;
      const info = smbcTxInfo(state, t);
      if (info.tagged || info.coupon) months.add(monthKey(t.date));
    });
    return [...months]
      .sort()
      .reverse()
      .map((mk) => {
        const r = smbcMonthPoints(state, mk);
        const [y, m] = mk.split('-').map(Number);
        const due = ymd(y, m + 3, daysInMonth(new Date(y, m + 2, 1).getFullYear(), new Date(y, m + 2, 1).getMonth() + 1));
        return { month: mk, taggedAmount: r.taggedAmount, taggedCount: r.taggedCount, bonus7: r.bonus7, coupon: r.coupon, due, pending: now <= due };
      });
  }

  // 月初の「Vクーポン再獲得」:今月有効で月ごとに獲得し直すクーポンのうち、今月まだ「獲得した」にしていないもの
  function couponReminders(state, todayDate) {
    const now = todayDate || today();
    const ack = ((state.settings || {}).couponAck || {})[monthKey(now)] || [];
    return activeCampaigns(state, now).filter((c) => c.monthly && !ack.includes(c.id));
  }

  // 月(mk)のポイントと、これまでの合計。NL は月ごとの計算、ほかは記録ごと(率 × 単位)
  function pointsSummary(state, mk) {
    const all = state.transactions || [];
    const generic = all.filter((t) => !isSmbcCard(state, t.method) && txPoints(t) > 0);
    const inMonth = generic.filter((t) => monthKey(t.date) === mk);
    const byMethod = Object.values(
      inMonth.reduce((m, t) => {
        const x = m[t.method] || (m[t.method] = { method: t.method, points: 0, count: 0, amount: 0 });
        x.points += txPoints(t);
        x.count += 1;
        x.amount += Number(t.amount);
        return m;
      }, {})
    );
    const smbcTxs = all.filter((t) => t.type === 'expense' && isSmbcCard(state, t.method));
    const nl = smbcMonthPoints(state, mk);
    // 支払方法ごと(JAL のマイル・Vポイント・JRE POINT などポイントの種類が違うので分けて見せる)
    if (nl.count) {
      const method = smbcTxs.find((t) => monthKey(t.date) === mk).method;
      byMethod.push({ method, points: nl.points, count: nl.count, amount: nl.amount, smbc: nl });
    }
    const nlMonths = [...new Set(smbcTxs.map((t) => monthKey(t.date)))];
    return {
      month: inMonth.reduce((s, t) => s + txPoints(t), 0) + nl.points,
      monthCount: inMonth.length + nl.count,
      monthAmount: inMonth.reduce((s, t) => s + Number(t.amount), 0) + nl.amount,
      byMethod,
      total: generic.reduce((s, t) => s + txPoints(t), 0) + nlMonths.reduce((s, m) => s + smbcMonthPoints(state, m).points, 0)
    };
  }

  // ---------- お店ごとの還元ランキング ----------
  /*
   * pay:'smbc'(三井住友NL)/'jal'(JALカード)/'wesmo'(Wesmo!)/'icoca'(ICOCA)
   * smbc7:NL の 7%対象店か。rules:その支払方法の率(期間・月の指定があれば、その間だけ)
   */
  const WESMO_OSHITOKU = { pay: 'wesmo', rate: 4, to: '2026-12-29', note: '推しトク(〜2026/12/29)' };
  const JAL_TOKUYAKU_REAL = { pay: 'jal', rate: 2, note: '特約店。実カード(Apple Pay不可)' };
  const STORES = [
    { id: 'seven', name: 'セブン-イレブン', smbc7: true },
    { id: 'lawson', name: 'ローソン', smbc7: true },
    { id: 'famima', name: 'ファミリーマート', smbc7: true, rules: [{ pay: 'jal', rate: 2, to: '2025-10-31', note: '特約店(2025/10/31で終了)' }] },
    { id: 'mcd', name: 'マクドナルド', smbc7: true, campaigns: ['mcd-mo', 'mcd-delivery'] },
    { id: 'kfc', name: 'ケンタッキー', smbc7: true, rules: [WESMO_OSHITOKU] },
    { id: 'matsuya', name: '松屋', rules: [WESMO_OSHITOKU] },
    { id: 'yamada', name: 'ヤマダデンキ', rules: [WESMO_OSHITOKU] },
    { id: 'joshin', name: 'Joshin', rules: [{ pay: 'wesmo', rate: 4, from: '2026-11-01', to: '2026-11-30', note: '推しトク(11月のみ)' }] },
    { id: 'matsukiyo', name: 'マツモトキヨシ', rules: [JAL_TOKUYAKU_REAL] },
    { id: 'cocokara', name: 'ココカラファイン', rules: [JAL_TOKUYAKU_REAL] }
  ];

  function storeRule(store, pay, date) {
    return (store.rules || []).find((r) => r.pay === pay && (!r.from || date >= r.from) && (!r.to || date <= r.to)) || null;
  }

  // お店(storeId)で日付 date に払うときの、支払方法ごとの還元率(%)を高い順に
  function storeRanking(state, storeId, date) {
    const store = STORES.find((x) => x.id === storeId);
    if (!store) return [];
    const smbc = (state.cards || []).find((c) => c.pointScheme === 'smbc' && !c.archived);
    const jal = (state.cards || []).find((c) => c.brand === 'jal' && !c.archived);
    const list = [];
    if (smbc) {
      const base = (SMBC_BASE / SMBC_UNIT) * 100;
      const with7 = base + (store.smbc7 ? (SMBC_BONUS7 / SMBC_UNIT) * 100 : 0);
      list.push({ pay: 'smbc', method: smbc.id, name: smbc.name, rate: with7, nl7: !!store.smbc7, note: store.smbc7 ? '7%対象(スマホのタッチ決済・モバイルオーダー)' : '' });
      activeCampaigns(state, date)
        .filter((c) => (store.campaigns || []).includes(c.id))
        .forEach((c) => {
          const tagged = !!store.smbc7 && c.with7;
          const rate = base + (tagged ? (SMBC_BONUS7 / SMBC_UNIT) * 100 : 0) + (couponPerUnit(c, tagged) / SMBC_UNIT) * 100;
          list.push({ pay: 'smbc', method: smbc.id, name: smbc.name, rate, nl7: tagged, coupon: c.id, note: c.name + ' Vクーポン +' + c.rate + '%' + (c.with7 ? '' : '(7%対象外)') });
        });
    }
    if (jal) {
      const r = storeRule(store, 'jal', date);
      list.push({ pay: 'jal', method: jal.id, name: jal.name, rate: r ? r.rate : Number(jal.pointRate) || 1, note: r ? r.note : '' });
    }
    // Wesmo!・ICOCA は、同じ名前の電子マネーを登録していればそれを選べるようにする
    const wallet = (re) => (state.wallets || []).find((x) => !x.archived && re.test(x.name || ''));
    const wesmo = wallet(/wesmo/i);
    const icoca = wallet(/icoca/i);
    const w = storeRule(store, 'wesmo', date);
    if (w) list.push({ pay: 'wesmo', method: wesmo ? wesmo.id : null, name: wesmo ? wesmo.name : 'Wesmo!', rate: w.rate, note: w.note });
    list.push({ pay: 'icoca', method: icoca ? icoca.id : null, name: icoca ? icoca.name : 'ICOCA', rate: 0, note: '関東では買い物も乗車も0%(WESTERポイントは Wesmo! で)' });
    return list.sort((a, b) => b.rate - a.rate);
  }

  /*
   * メイン口座の見通し。settings.bank = { balance, asOf(残高を入れた日), updatedAt(入れた時刻) }
   * 出せるお金 = 残高 − 残高を入れた日以降のカード引落 − 残高を入れた後に記録したチャージ − 最低限残しておく額
   * 残高を入れた日と同じ日の引落は、まだ落ちていないものとして引く(少なめに見積もる)
   */
  // 給料がメイン口座に振り込まれる日(settings.payday、初期値は毎月25日・休日なら前営業日)
  function paydayOf(state, y, m) {
    const p = (state.settings || {}).payday || {};
    return recurringIncomeDate({ day: Number(p.day) || 25, holidayAdjust: p.holidayAdjust || 'prev' }, y, m);
  }

  // 指定日より後の最初の給料日と、指定日以前の最後の給料日
  function paydaysAround(state, date) {
    const { y, m } = parse(date);
    let prev = null;
    for (let i = -2; i <= 2; i++) {
      const base = new Date(y, m - 1 + i, 1);
      const d = paydayOf(state, base.getFullYear(), base.getMonth() + 1);
      if (d > date) return { prev, next: d };
      prev = d;
    }
    return { prev, next: null };
  }

  /*
   * メイン口座から出せるお金(次の給料日までの資金繰り)。
   * 出せるお金 = 残高 − 次の給料日の前日までのカード引落 − 残高を入れた後のチャージ・ATM 引き出し − 最低限残しておく額
   * 次の給料日以降の引落は、その給料で払う前提で引かない(一覧には出す)
   */
  function bankOutlook(state, todayDate) {
    const bank = (state.settings || {}).bank;
    if (!bank || !bank.asOf) return null;
    const balance = Number(bank.balance) || 0;
    const reserve = Number((state.settings || {}).savingsGoal) || 0;
    const now = todayDate || today();
    const { prev, next: payday } = paydaysAround(state, now);

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
    const all = Object.values(map).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    const before = all.filter((w) => w.date < payday);
    const later = all.filter((w) => w.date >= payday);
    const pendingWithdrawals = before.reduce((s, w) => s + w.amount, 0);

    // 口座から出たお金:チャージ(PayPay など)と、口座から直接の支出(ATM での引き出しなど。method 'bank')
    const chargesSince = (state.transactions || [])
      .filter((t) => (t.type === 'charge' || (t.type === 'expense' && t.method === 'bank')) && (!bank.updatedAt || String(t.createdAt) > bank.updatedAt))
      .reduce((s, t) => s + Number(t.amount), 0);

    // 給料日までの引落日ごとの残高の推移
    let running = balance - chargesSince;
    const timeline = before.map((w) => {
      running -= w.amount;
      return { ...w, balanceAfter: running };
    });

    return {
      balance,
      asOf: bank.asOf,
      payday,
      // 残高を入れた後に給料日が来ている(残高が古い)
      stale: !!prev && bank.asOf < prev,
      withdrawals: timeline,
      laterWithdrawals: later,
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
    paydaysAround,
    txPoints,
    pointsSummary,
    CAMPAIGNS,
    STORES,
    activeCampaigns,
    isSmbcCard,
    smbcTxInfo,
    smbcMonthPoints,
    smbcTxPoints,
    smbcBonusByMonth,
    couponReminders,
    storeRanking,
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
