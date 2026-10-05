import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { HELP, parseCommand, verifySlack, safeResponseUrl } from '../supabase/functions/_shared/command.js';
import { formatStandings } from '../supabase/functions/_shared/standings.js';

test('only successful standings are shared in the originating channel; other replies stay private', async () => {
  let handler, pending, rpcArgs;
  const replies = [];
  const env = { SLACK_SIGNING_SECRET: 'test-secret', SLACK_TEAM_ID: 'TTEST', SLACK_APP_ID: 'ATEST', SUPABASE_SERVICE_ROLE_KEY: 'test-only', SUPABASE_URL: 'https://example.test' };
  const source = (await readFile(new URL('../supabase/functions/slack-spend/index.ts', import.meta.url), 'utf8')).replace(/^import .*\r?\n/gm, '');
  const run = new Function('Deno', 'EdgeRuntime', 'createClient', 'HELP', 'parseCommand', 'verifySlack', 'safeResponseUrl', 'formatStandings', 'fetch', stripTypeScriptTypes(source));
  let rpcError = null;
  run({ env: { get: name => env[name] }, serve: callback => { handler = callback; } },
    { waitUntil: task => { pending = task; } },
    () => ({ rpc: async (name, args) => { rpcArgs = { name, ...args }; return { error: rpcError, data: { message: 'Your October total is $5.50.', today: '2026-10-05', ends_on: '2026-10-31', members: [{ display_name: '<!channel>', total_cents: 550, entry_count: 1, reviewed_through: null }] } }; } }),
    HELP, parseCommand, verifySlack, safeResponseUrl, formatStandings,
    async (url, options) => { assert.equal(url, 'https://hooks.slack.com/commands/test'); replies.push(JSON.parse(options.body)); return new Response('ok'); });
  let body = new URLSearchParams({ team_id: 'TTEST', api_app_id: 'ATEST', command: '/spend', response_url: 'https://hooks.slack.com/commands/test', trigger_id: 'test-trigger', user_id: 'UFRIEND', text: 'standings' }).toString();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SLACK_SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${timestamp}:${body}`));
  const headers = { 'content-type': 'application/x-www-form-urlencoded', 'x-slack-request-timestamp': timestamp, 'x-slack-signature': 'v0=' + Buffer.from(hash).toString('hex') };
  const request = () => new Request('https://example.test/slack-spend', { method: 'POST', headers, body });
  const acknowledgement = await (await handler(request())).json();
  assert.equal(acknowledgement.response_type, 'ephemeral');
  await pending;
  assert.equal(rpcArgs.p_action, 'standings'); assert.equal(rpcArgs.p_user_id, 'UFRIEND');
  assert.equal(replies[0].response_type, 'in_channel'); assert.equal(replies[0].mrkdwn, false);
  assert.match(replies[0].text, /Group total: \$5.50/);
  assert.ok(replies[0].text.includes('&lt;!channel&gt;'));
  assert.ok(!replies[0].text.includes('<!channel>'));
  rpcError = { message: 'Ask your organizer to invite you.' };
  await handler(request()); await pending;
  assert.equal(replies[1].text, rpcError.message);
  assert.equal(replies[1].response_type, 'ephemeral');
  rpcError = null;
  for (const text of ['total', '5.50', 'done', 'undo']) {
    const params = new URLSearchParams(body); params.set('text', text); body = params.toString();
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${timestamp}:${body}`));
    headers['x-slack-signature'] = 'v0=' + Buffer.from(signature).toString('hex');
    await handler(request()); await pending;
    assert.equal(replies.at(-1).response_type, 'ephemeral');
  }
  rpcArgs = null; headers['x-slack-signature'] = '';
  assert.equal((await handler(request())).status, 401); assert.equal(rpcArgs, null);
});
