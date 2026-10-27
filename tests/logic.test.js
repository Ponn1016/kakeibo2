// 実行: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');

test('祝日', () => {
  assert.equal(L.holidayName('2026-01-12'), '成人の日');
  assert.equal(L.holidayName('2026-03-20'), '春分の日');
  assert.equal(L.holidayName('2026-09-23'), '秋分の日');
  assert.equal(L.holidayName('2026-09-22'), '国民の休日');
  assert.equal(L.holidayName('2026-05-06'), '振替休日');
  assert.equal(L.holidayName('2026-11-24'), null);
  assert.equal(L.holidayName('2027-11-23'), '勤労感謝の日');
});

test('銀行営業日の調整', () => {
  assert.equal(L.adjustBusinessDay('2026-10-10', 'next'), '2026-10-13'); // 土→(月祝)→火
  assert.equal(L.adjustBusinessDay('2026-10-10', 'prev'), '2026-10-09');
  assert.equal(L.adjustBusinessDay('2026-12-31', 'next'), '2027-01-04');
  assert.equal(L.adjustBusinessDay('2026-10-10', 'none'), '2026-10-10');
});

const cardA = { id: 'a', name: 'カードA', closingDay: 15, paymentMonthOffset: 1, paymentDay: 10, holidayAdjust: 'next' };
const cardB = { id: 'b', name: 'カードB', closingDay: 31, paymentMonthOffset: 1, paymentDay: 27, holidayAdjust: 'next' };

test('締め日と引落日', () => {
  assert.equal(L.closingDateFor(cardA, '2026-10-15'), '2026-10-15');
  assert.equal(L.closingDateFor(cardA, '2026-10-16'), '2026-11-15');
  assert.equal(L.withdrawalDateFor(cardA, '2026-10-15'), '2026-11-10');
  assert.equal(L.withdrawalDateFor(cardA, '2026-10-16'), '2026-12-10');
  assert.equal(L.withdrawalDateFor(cardA, '2026-12-20'), '2027-02-10');
  // 末日締め・翌月27日払い(2026-11-27 は金曜)
  assert.equal(L.closingDateFor(cardB, '2026-02-28'), '2026-02-28');
  assert.equal(L.withdrawalDateFor(cardB, '2026-10-31'), '2026-11-27');
  // 2026-12-27 は日曜 → 28日(月)
  assert.equal(L.withdrawalDateFor(cardB, '2026-11-05'), '2026-12-28');
  // 翌々月払い
  assert.equal(L.withdrawalDateFor({ ...cardA, paymentMonthOffset: 2 }, '2026-11-20'), '2027-02-10');
});

// 5日締め・当月26日払い
const cardB2 = { id: 'b2', name: 'カードB', closingDay: 5, paymentMonthOffset: 0, paymentDay: 26, holidayAdjust: 'next' };

test('当月払いのカード', () => {
  assert.equal(L.closingDateFor(cardB2, '2026-10-05'), '2026-10-05');
  assert.equal(L.withdrawalDateFor(cardB2, '2026-10-05'), '2026-10-26'); // 月曜
  assert.equal(L.closingDateFor(cardB2, '2026-10-06'), '2026-11-05');
  assert.equal(L.withdrawalDateFor(cardB2, '2026-10-23'), '2026-11-26'); // 木曜
  assert.equal(L.withdrawalDateFor(cardB2, '2026-12-20'), '2027-01-26');
  // 2026-12-26 は土曜 → 28日(月)
  assert.equal(L.withdrawalDateFor(cardB2, '2026-11-30'), '2026-12-28');
  // 年をまたぐ締め
  assert.equal(L.withdrawalDateFor(cardB2, '2027-01-03'), '2027-01-26');
});

const salary = { id: 's', name: '給料', amount: 250000, day: 25, holidayAdjust: 'prev' };

test('定期収入は休日なら前営業日', () => {
  // 2026-10-25 は日曜 → 23日(金)
  assert.equal(L.recurringIncomeDate(salary, 2026, 10), '2026-10-23');
  const r = L.recurringIncomesInMonth([salary], { 's:2026-10': 300000 }, '2026-10');
  assert.equal(r.length, 1);
  assert.equal(r[0].amount, 300000);
  assert.equal(L.nextIncomeDate([salary], '2026-10-24').date, '2026-11-25');
});

function state(extra) {
  return {
    settings: { savingsGoal: 50000, basis: 'accrual' },
    cards: [cardA, cardB],
    incomes: [salary],
    incomeOverrides: {},
    transactions: [],
    ...extra
  };
}

test('今月の可処分(先月からの繰越を含む)', () => {
  const s = state({
    transactions: [
      { id: 1, type: 'expense', date: '2026-10-01', amount: 30000, method: 'cash' },
      { id: 2, type: 'expense', date: '2026-10-20', amount: 20000, method: 'a' },
      { id: 3, type: 'expense', date: '2026-09-10', amount: 10000, method: 'a' }, // 10/13 引落
      { id: 4, type: 'income', date: '2026-10-05', amount: 5000, method: 'cash' }
    ]
  });
  const acc = L.monthSummary(s, '2026-10', '2026-10-23');
  // 9月:給料 250,000 − カード 10,000 = 240,000 を繰り越す
  assert.equal(acc.carry, 240000);
  assert.equal(acc.income, 255000);
  assert.equal(acc.budget, 240000 + 255000 - 50000);
  assert.equal(acc.spent, 50000);
  assert.equal(acc.remaining, 445000 - 50000);
  assert.equal(acc.cardWithdrawn, 10000);

  // 引落月で計上:9月はカードの引落がないので 250,000 を繰り越し、10月に引落 10,000 を数える
  s.settings.basis = 'cash';
  const cash = L.monthSummary(s, '2026-10', '2026-10-23');
  assert.equal(cash.carry, 250000);
  assert.equal(cash.spent, 40000);
});

test('支払手段の提案は引落が遅いカードを優先', () => {
  // 10/16: カードA は締め翌日で 12/10 引落、カードB は 11/27 引落
  const r = L.suggestPayment(state(), '2026-10-16', 1000);
  assert.equal(r.best.method, 'a');
  assert.equal(r.best.withdrawalDate, '2026-12-10');
});

test('上限超過のカードは避け、可処分超過なら現金', () => {
  const s = state({ cards: [{ ...cardA, monthlyLimit: 5000 }, cardB] });
  assert.equal(L.suggestPayment(s, '2026-10-16', 6000).best.method, 'b');
  assert.equal(L.suggestPayment(s, '2026-10-16', 999999).best.method, 'cash');
});

test('ペース判定', () => {
  const s = state({ transactions: [{ id: 1, type: 'expense', date: '2026-10-05', amount: 10000, method: 'cash' }] });
  // 予算 = 給料 250,000 − 貯金目標 50,000
  const r = L.monthSummary(s, '2026-10', '2026-10-10');
  assert.equal(r.budget, 200000);
  assert.equal(r.expectedSpent, Math.round((200000 * 10) / 31));
  assert.equal(r.paceDiff, r.expectedSpent - 10000);
});

test('金額0の定期収入は数えない', () => {
  const r = L.recurringIncomesInMonth([{ ...salary, amount: 0 }], {}, '2026-10');
  assert.equal(r.length, 0);
  assert.equal(L.nextIncomeDate([{ ...salary, amount: 0 }], '2026-10-01'), null);
});

test('時給×時間(分単位、時給ごとに1円単位で四捨五入)', () => {
  assert.equal(L.hourlyAmount({ rate: 1830, minutes: 7 * 60 + 30 }), 13725);
  assert.equal(L.hourlyAmount({ rate: 1530, minutes: 7 }), 179); // 178.5 → 179
  assert.equal(L.hourlyAmount({ rate: 1280, minutes: 1 }), 21); // 21.33… → 21
  assert.equal(L.hourlyAmount({ rate: 1380, minutes: 20 }), 460);
  assert.equal(L.hourlyTotal([{ rate: 1530, minutes: 7 }, { rate: 1280, minutes: 1 }]), 179 + 21);
  // 以前の記録(小数の時間)もそのまま計算できる
  assert.equal(L.workMinutes({ rate: 1830, hours: 7.5 }), 450);
  assert.equal(L.hourlyTotal([{ rate: 1830, hours: 5 }, { rate: 1280, hours: 2.5 }]), 9150 + 3200);
  assert.equal(L.hourlyTotal([]), 0);
});

test('チャージは収入にも支出にも数えず、残高だけ増やす', () => {
  const s = state({
    transactions: [
      { id: 1, type: 'charge', date: '2026-10-10', amount: 1000, method: 'paypay' },
      { id: 2, type: 'expense', date: '2026-10-10', amount: 500, method: 'paypay' }
    ]
  });
  const sum = L.monthSummary(s, '2026-10', '2026-10-10');
  assert.equal(sum.spent, 500);
  assert.equal(sum.income, 250000);
  const day = L.dailyTotals(s, '2026-10')['2026-10-10'];
  assert.equal(day.income, 0);
  assert.equal(day.expense, 500);
  assert.equal(L.walletBalance(s, { id: 'paypay' }), 500);
  assert.equal(L.walletBalance(s, { id: 'paypay', balanceAdjust: 300 }), 800);
});

test('使い始めの残高と未払いカード代を記録して繰り越す、貯蓄は使えるお金に入れない', () => {
  const s = state({
    settings: { savingsGoal: 10000, basis: 'accrual', savingsAdjust: 300000 },
    incomes: [],
    transactions: [
      { id: 1, type: 'income', date: '2026-10-25', amount: 200000, category: 'inc-other', method: 'cash', memo: '開始時の残高' },
      { id: 2, type: 'expense', date: '2026-10-25', amount: 50000, method: 'cash', memo: '未払いのカード代' },
      { id: 3, type: 'income', date: '2026-10-26', amount: 10000, category: 'salary', method: 'cash' },
      { id: 4, type: 'expense', date: '2026-10-27', amount: 5000, method: 'a' },
      { id: 5, type: 'income', date: '2026-10-27', amount: 3000, category: 'savings', method: 'cash' } // B銀行への入金
    ]
  });
  const oct = L.monthSummary(s, '2026-10', '2026-10-27');
  assert.equal(oct.carry, 0);
  assert.equal(oct.income, 210000);
  assert.equal(oct.remaining, 210000 - 55000 - 10000);

  const nov = L.monthSummary(s, '2026-11', '2026-11-01');
  assert.equal(nov.carry, 155000);
  assert.equal(nov.remaining, 155000 - 10000); // 残しておく額は積み上がらない

  assert.equal(L.savingsBalance(s), 303000);
  assert.equal(L.dailyTotals(s, '2026-10')['2026-10-27'].income, 0);
});
test('メイン口座の見通し', () => {
  const s = state({
    settings: { savingsGoal: 10000, bank: { balance: 200000, asOf: '2026-10-27', updatedAt: '2026-10-27T09:00:00.000Z' } },
    transactions: [
      { id: 1, type: 'expense', date: '2026-10-01', amount: 30000, method: 'a' }, // 締め 10/15 → 11/10 引落
      { id: 2, type: 'expense', date: '2026-10-20', amount: 8000, method: 'a' }, // 締め 11/15 → 12/10 引落
      { id: 3, type: 'expense', date: '2026-09-01', amount: 5000, method: 'a' }, // 10/13 引落(残高に反映済み)
      { id: 4, type: 'expense', date: '2026-10-25', amount: 2000, method: 'cash' }, // 現金は関係なし
      { id: 5, type: 'charge', date: '2026-10-27', amount: 1000, method: 'paypay', createdAt: '2026-10-27T08:00:00.000Z' }, // 残高を入れる前
      { id: 6, type: 'charge', date: '2026-10-27', amount: 3000, method: 'paypay', createdAt: '2026-10-27T10:00:00.000Z' } // 残高を入れた後
    ]
  });
  const b = L.bankOutlook(s);
  assert.equal(b.pendingWithdrawals, 38000);
  assert.equal(b.chargesSince, 3000);
  assert.equal(b.available, 200000 - 38000 - 3000 - 10000);
  assert.deepEqual(b.withdrawals.map((w) => [w.date, w.amount, w.balanceAfter]), [
    ['2026-11-10', 30000, 167000],
    ['2026-12-10', 8000, 159000]
  ]);
  // 残高を入れた日と同じ日の引落は、まだ落ちていないものとして引く
  s.settings.bank.asOf = '2026-11-10';
  assert.equal(L.bankOutlook(s).pendingWithdrawals, 38000);
  s.settings.bank.asOf = '2026-11-11';
  assert.equal(L.bankOutlook(s).pendingWithdrawals, 8000);
  // 残高が未入力なら null
  assert.equal(L.bankOutlook(state()), null);
});
