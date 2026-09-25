import test from 'node:test';
import assert from 'node:assert/strict';
import { toCents, cumulativeSeries, leaderboard } from '../src/model.js';
import { parseCommand, verifySlack, safeResponseUrl } from '../supabase/functions/_shared/command.js';

test('dollars use integer cents without floating point drift', () => {
  assert.equal(toCents('12.50'), 1250); assert.equal(toCents('0.29'), 29);
  for (const bad of ['0', '-5', '1.234', '1e3', 'NaN', '', '1,000', '1000001']) assert.throws(() => toCents(bad));
});
test('Slack parses entries, backdates, refunds and member mentions', () => {
  assert.deepEqual(parseCommand('$12.50 2026-10-05'), { action: 'add', amount_cents: 1250, category_id: 'coffee', date: '2026-10-05' });
  assert.equal(parseCommand('refund 0.29').amount_cents, -29);
  assert.equal(parseCommand('invite <@U123ABC|Alex>').slack_user_id, 'U123ABC');
  assert.deepEqual(parseCommand('5.50'), { action: 'add', amount_cents: 550, category_id: 'coffee', date: null });
  assert.deepEqual(parseCommand('refund 5 2026-10-05'), { action: 'add', amount_cents: -500, category_id: 'coffee', date: '2026-10-05' });
  for (const bad of ['refund', '0', '1.234', '5 dining', '5 2026-10-05 extra']) assert.throws(() => parseCommand(bad));
  assert.deepEqual(parseCommand('undo'), { action: 'undo', entry_id: null });
  assert.throws(() => parseCommand('5 2026-02-30'));
  assert.throws(() => parseCommand('-5'));
  assert.throws(() => parseCommand('5 coffee accidental extra text'));
});
test('daily cumulative totals include carry-forward, refunds, backdates and voids', () => {
  const members = [{ id: 'a' }];
  const entries = [
    { member_id: 'a', category_id: 'coffee', spent_on: '2026-10-03', amount_cents: 200 },
    { member_id: 'a', category_id: 'coffee', spent_on: '2026-10-01', amount_cents: 500 },
    { member_id: 'a', category_id: 'coffee', spent_on: '2026-10-04', amount_cents: -100 },
    { member_id: 'a', category_id: 'coffee', spent_on: '2026-10-02', amount_cents: 999, voided: true },
    { member_id: 'a', category_id: 'shopping', spent_on: '2026-10-02', amount_cents: 1000 },
  ];
  assert.deepEqual(cumulativeSeries(members, entries, '2026-10-01', '2026-10-05', 'coffee')[0].points.map(p => p.total), [500, 500, 700, 600, 600]);
});
test('unreviewed zero is not a winning rank; ties share rank', () => {
  const rows = leaderboard([{ id: 'a', display_name: 'A', reviewed_through: '2026-10-05' }, { id: 'b', display_name: 'B' }, { id: 'c', display_name: 'C', reviewed_through: '2026-10-05' }], []);
  assert.equal(rows.find(r => r.id === 'b').rank, null);
  assert.equal(rows.find(r => r.id === 'a').rank, 1); assert.equal(rows.find(r => r.id === 'c').rank, 1);
});
test('Slack verifies raw-body HMAC and rejects tampering and replay', async () => {
  const body = 'text=12.50&user_id=UABC', timestamp = '1800000000', secret = 'test-only';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${timestamp}:${body}`)));
  const signature = 'v0=' + [...hash].map(b => b.toString(16).padStart(2, '0')).join('');
  assert.equal(await verifySlack(body, timestamp, signature, secret, 1800000000000), true);
  assert.equal(await verifySlack(body + 'x', timestamp, signature, secret, 1800000000000), false);
  assert.equal(await verifySlack(body, timestamp, signature, secret, 1800000301000), false);
  assert.equal(await verifySlack(body, timestamp, '', secret, 1800000000000), false);
  assert.equal(safeResponseUrl('https://hooks.slack.com/commands/test'), true);
  for (const u of ['http://hooks.slack.com/commands/x', 'https://hooks.slack.com.evil.test/commands/x', 'https://user@hooks.slack.com/commands/x', 'https://127.0.0.1/commands/x']) assert.equal(safeResponseUrl(u), false);
});
