import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { COFFEE_SCALE, withCoffeeLevels } from '../src/coffee-scale.js';
import { leaderboard } from '../src/model.js';

const challenge = { starts_on: '2026-10-01', ends_on: '2026-10-31' };
const decorate = (totals, today = '2026-10-01') => withCoffeeLevels(totals.map((total, id) => ({ id, total })), challenge, today);
const levels = (totals, today) => decorate(totals, today).map(row => row.coffeeLevel);

test('the nine ordered portraits all exist, including the maximum-coffee logo', async () => {
  assert.equal(COFFEE_SCALE.length, 9);
  assert.equal(COFFEE_SCALE[0].name, 'Zen');
  assert.equal(COFFEE_SCALE[8].name, 'Maximum coffee');
  await Promise.all(COFFEE_SCALE.map(portrait => access(new URL(portrait.src))));
});

test('daily severity moves above $3 into the worse half, even by one cent', () => {
  assert.deepEqual(levels([0, 150, 300, 301]), [1, 3, 5, 6]);
  assert.deepEqual(levels([301, 400, 500, 600]), [6, 7, 8, 9]);
  assert.deepEqual(levels([4200, 4201], '2026-10-14'), [5, 6]);
});

test('close and extreme totals retain strict order for four people', () => {
  for (const totals of [[0, 1, 2, 3], [297, 298, 299, 300], [301, 302, 303, 304], [10000, 20000, 30000, 40000], [-400, -300, -200, -100]]) {
    const result = levels(totals);
    assert.ok(result.every((value, index) => value >= 1 && value <= 9 && (!index || value > result[index - 1])));
    assert.ok(result.every((value, index) => totals[index] > 300 ? value >= 6 : value <= 5));
  }
});

test('ties share images regardless of row order and do not mutate rows', () => {
  assert.deepEqual(levels([600, 0, 600, 0]), [9, 1, 9, 1]);
  assert.deepEqual(levels([0, 0, 0, 0]), [1, 1, 1, 1]);
  assert.deepEqual(levels([]), []);
  const rows = [{ total: 100, rank: null }];
  withCoffeeLevels(rows, challenge, '2026-10-01');
  assert.deepEqual(rows, [{ total: 100, rank: null }]);
});

test('averages include the current day, handle pre-start, and freeze at month end', () => {
  assert.equal(decorate([600], '2026-10-02')[0].dailyAverageCents, 300);
  assert.equal(decorate([600], '2026-09-30')[0].dailyAverageCents, 600);
  assert.equal(decorate([9300], '2026-11-10')[0].dailyAverageCents, 300);
  assert.deepEqual(levels([9300], '2026-10-31'), levels([9300], '2026-11-10'));
});

test('portraits follow net spending and preserve review eligibility', () => {
  const members = [{ id: 'a', display_name: 'A' }, { id: 'b', display_name: 'B', reviewed_through: '2026-10-01' }];
  const entries = [
    { member_id: 'a', amount_cents: 600, spent_on: '2026-10-01' },
    { member_id: 'a', amount_cents: -500, spent_on: '2026-10-01' },
    { member_id: 'b', amount_cents: 1000, spent_on: '2026-10-01', voided: true },
  ];
  const rows = withCoffeeLevels(leaderboard(members, entries), challenge, '2026-10-01');
  assert.deepEqual(rows.map(row => [row.id, row.total, row.rank, row.coffeeLevel]), [['b', 0, 1, 1], ['a', 100, null, 2]]);
});
