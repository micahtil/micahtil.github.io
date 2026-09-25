import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { parseCommand } from '../supabase/functions/_shared/command.js';

let db, today, yesterday, tomorrow, owner, friend;
const ownerAuth = '10000000-0000-0000-0000-000000000001';
const friendAuth = '10000000-0000-0000-0000-000000000002';
const outsiderAuth = '10000000-0000-0000-0000-000000000003';
async function asUser(id, fn) {
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
async function mutate(id, action, payload, key = crypto.randomUUID()) {
  return asUser(id, async () => (await db.query('select public.club_mutate($1,$2::jsonb,$3) result', [action, JSON.stringify(payload), key])).rows[0].result);
}
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.identities (user_id uuid, provider text, identity_data jsonb);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;`);
  await db.exec(await readFile(new URL('../supabase/migrations/202609240001_club.sql', import.meta.url), 'utf8'));
  const dates = (await db.query("select (now() at time zone 'America/New_York')::date::text today, ((now() at time zone 'America/New_York')::date - 1)::text yesterday, ((now() at time zone 'America/New_York')::date + 1)::text tomorrow")).rows[0];
  ({ today, yesterday, tomorrow } = dates);
  await db.query("insert into club_private.challenge(slack_team_id,starts_on,ends_on,closes_on) values ('TTEST', $1::date - 10, $1::date + 10, $1::date + 14)", [today]);
  owner = (await db.query("insert into club_private.members(slack_user_id,display_name,role) values('UOWNER','Owner','owner') returning id")).rows[0].id;
  friend = (await db.query("insert into club_private.members(slack_user_id,display_name) values('UFRIEND','Friend') returning id")).rows[0].id;
  for (const [id, user, team] of [[ownerAuth, 'UOWNER', 'TTEST'], [friendAuth, 'UFRIEND', 'TTEST'], [outsiderAuth, 'UOWNER', 'TOTHER']]) {
    await db.query("insert into auth.identities values ($1,'slack_oidc',$2::jsonb)", [id, JSON.stringify({ sub: user, custom_claims: { 'https://slack.com/team_id': team } })]);
  }
});
after(async () => { await db?.close(); });

test('anonymous and nonmembers cannot read the challenge', async () => {
  await db.exec('set role anon');
  try { await assert.rejects(db.query('select public.club_dashboard()'), /permission denied/); } finally { await db.exec('reset role'); }
  await assert.rejects(asUser(outsiderAuth, () => db.query('select public.club_dashboard()')), /not a member/);
});
test('members cannot directly read tables or impersonate Slack requests', async () => {
  await asUser(friendAuth, async () => {
    await assert.rejects(db.query('select * from club_private.entries'), /permission denied/);
    await assert.rejects(db.query("select public.club_slack_command('TTEST','UOWNER','total','{}','x')"), /permission denied/);
  });
});
test('entry ownership comes from authentication; group members can see dollars', async () => {
  const added = await mutate(ownerAuth, 'add', { member_id: friend, amount_cents: 1250, category_id: 'coffee', date: yesterday });
  const entry = (await db.query('select member_id,amount_cents from club_private.entries where id=$1', [added.entry_id])).rows[0];
  assert.equal(entry.member_id, owner); assert.equal(entry.amount_cents, 1250);
  const dashboard = await asUser(friendAuth, async () => (await db.query('select public.club_dashboard() result')).rows[0].result);
  assert.deepEqual(dashboard.categories.map(({ id, name }) => ({ id, name })), [{ id: 'coffee', name: 'Coffee shop' }]);
  assert.equal(dashboard.entries.find(e => e.id === added.entry_id).amount_cents, 1250);
  await assert.rejects(mutate(friendAuth, 'undo', { entry_id: added.entry_id }), /No matching/);
});
test('retried adds and undo operations are idempotent', async () => {
  const payload = { amount_cents: 500, category_id: 'coffee', date: today };
  const one = await mutate(ownerAuth, 'add', payload, 'same-add');
  const two = await mutate(ownerAuth, 'add', payload, 'same-add');
  assert.equal(one.entry_id, two.entry_id);
  await assert.rejects(mutate(ownerAuth, 'add', { ...payload, amount_cents: 900 }, 'same-add'), /different operation/);
  const undo1 = await mutate(ownerAuth, 'undo', {}, 'same-undo');
  const undo2 = await mutate(ownerAuth, 'undo', {}, 'same-undo');
  assert.deepEqual(undo1, undo2); assert.equal(undo1.entry_id, one.entry_id);
});
test('fractional cents, future dates and unknown categories cannot enter the ledger', async () => {
  await assert.rejects(mutate(ownerAuth, 'add', { amount_cents: 1.5, category_id: 'coffee', date: today }), /Invalid dollar/);
  await assert.rejects(mutate(ownerAuth, 'add', { amount_cents: 100, category_id: 'coffee', date: tomorrow }), /no later than today/);
  for (const category_id of ['nope', 'dining', 'shopping']) await assert.rejects(mutate(ownerAuth, 'add', { amount_cents: 100, category_id, date: today }), /Unknown category/);
});
test('refunds subtract from the total and changes invalidate earlier reviews', async () => {
  await mutate(ownerAuth, 'done', { date: today });
  await mutate(ownerAuth, 'add', { amount_cents: -250, category_id: 'coffee', date: yesterday });
  const result = await mutate(ownerAuth, 'total', {});
  assert.equal(result.total_cents, 1000);
  assert.equal((await db.query('select reviewed_through from club_private.members where id=$1', [owner])).rows[0].reviewed_through, null);
});
test('only the organizer may invite; unknown actions fail', async () => {
  await assert.rejects(mutate(friendAuth, 'invite', { slack_user_id: 'UNEW' }), /Only the organizer/);
  await mutate(ownerAuth, 'invite', { slack_user_id: 'UNEW' });
  assert.equal((await db.query("select count(*)::int n from club_private.members where slack_user_id='UNEW'")).rows[0].n, 1);
  await assert.rejects(mutate(ownerAuth, 'set_owner', {}), /Unknown action/);
});
test('budget edits are atomic and cannot alter another member', async () => {
  await mutate(ownerAuth, 'budgets', { rows: [{ category_id: 'coffee', amount_cents: 6000 }] });
  await assert.rejects(mutate(ownerAuth, 'budgets', { rows: [{ category_id: 'missing', amount_cents: 100 }] }), /foreign key/);
  assert.equal((await db.query('select amount_cents from club_private.budgets where member_id=$1', [owner])).rows[0].amount_cents, 6000);
});
test('server-only Slack endpoint checks workspace and membership', async () => {
  await db.exec('set role service_role');
  try {
    await assert.rejects(db.query("select public.club_slack_command('TWRONG','UOWNER','total','{}','x')"), /Wrong Slack/);
    await assert.rejects(db.query("select public.club_slack_command('TTEST','USTRANGER','total','{}','x')"), /organizer/);
    const result = (await db.query("select public.club_slack_command('TTEST','UOWNER','total','{}','ok') result")).rows[0].result;
    assert.equal(result.total_cents, 1000);
    for (const text of ['5.50', 'refund 1.25 ' + yesterday]) {
      const command = parseCommand(text);
      const added = (await db.query('select public.club_slack_command($1,$2,$3,$4::jsonb,$5) result', ['TTEST', 'UOWNER', command.action, JSON.stringify(command), crypto.randomUUID()])).rows[0].result;
      await db.exec('reset role');
      const entry = (await db.query('select category_id,amount_cents,spent_on::text,source from club_private.entries where id=$1', [added.entry_id])).rows[0];
      assert.deepEqual(entry, { category_id: 'coffee', amount_cents: command.amount_cents, spent_on: command.date || today, source: 'slack' });
      await db.exec('set role service_role');
      await db.query('select public.club_slack_command($1,$2,$3,$4::jsonb,$5)', ['TTEST', 'UOWNER', 'undo', JSON.stringify({ entry_id: added.entry_id }), crypto.randomUUID()]);
    }
  } finally { await db.exec('reset role'); }
});
test('reconciliation deadline is enforced on the server', async () => {
  await db.query('update club_private.challenge set starts_on=$1::date-20,ends_on=$1::date-1,closes_on=$1::date', [today]);
  await assert.rejects(mutate(ownerAuth, 'add', { amount_cents: 100, category_id: 'coffee', date: yesterday }), /close after/);
  await assert.rejects(mutate(ownerAuth, 'undo', {}), /close after/);
});
