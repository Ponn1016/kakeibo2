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

test('今月の可処分と1日の目安', () => {
  const s = state({
    transactions: [
      { id: 1, type: 'expense', date: '2026-10-01', amount: 30000, method: 'cash' },
      { id: 2, type: 'expense', date: '2026-10-20', amount: 20000, method: 'a' },
      { id: 3, type: 'expense', date: '2026-09-10', amount: 10000, method: 'a' }, // 10/13 引落
      { id: 4, type: 'income', date: '2026-10-05', amount: 5000, method: 'cash' }
    ]
  });
  const acc = L.monthSummary(s, '2026-10', '2026-10-23');
  assert.equal(acc.income, 255000);
  assert.equal(acc.budget, 205000);
  assert.equal(acc.spent, 50000);
  assert.equal(acc.remaining, 155000);
  assert.equal(acc.daysLeft, 9);
  assert.equal(acc.perDay, Math.floor(155000 / 9));
  assert.equal(acc.cardWithdrawn, 10000);

  s.settings.basis = 'cash';
  const cash = L.monthSummary(s, '2026-10', '2026-10-23');
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
