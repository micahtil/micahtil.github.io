import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanAuthReturn, readAuthSession, slackLoginOptions } from '../src/auth.js';

const callback = 'https://micahtil.github.io/october-club/?code=one-time-code';
function auth({ session = null, initError = null, sessionError = null } = {}) {
  return { initialize: async () => ({ error: initError }), getSession: async () => ({ data: { session }, error: sessionError }) };
}
test('Slack authorization selects the club workspace and returns to the app subpath', () => {
  assert.deepEqual(slackLoginOptions(callback), { provider: 'slack_oidc', options: {
    redirectTo: 'https://micahtil.github.io/october-club/', queryParams: { team: 'T05TWBA93LL' },
  } });
});
test('successful callback and returning sessions are restored without exchanging the code twice', async () => {
  const session = { user: { id: 'test-member' } };
  assert.equal(await readAuthSession(auth({ session }), callback), session);
  assert.equal(await readAuthSession(auth({ session }), 'https://example.test/'), session);
  assert.equal(await readAuthSession(auth(), 'https://example.test/'), null);
});
test('wrong-browser and expired callbacks show recovery guidance instead of silently signing out', async () => {
  await assert.rejects(readAuthSession(auth(), callback), /browser where you started/);
  await assert.rejects(readAuthSession(auth({ initError: new Error('expired code') }), callback), /browser where you started/);
  await assert.rejects(readAuthSession(auth({ sessionError: new Error('offline') }), 'https://example.test/'), /connection/);
});
test('provider cancellation and errors show safe messages without reflecting callback content', async () => {
  await assert.rejects(readAuthSession(auth(), 'https://example.test/#error=access_denied'), /cancelled or denied/);
  await assert.rejects(readAuthSession(auth(), 'https://example.test/?error=server_error&error_description=private-value'), error => !error.message.includes('private-value') && error.message.includes('try Sign in'));
});
test('callback cleanup removes codes and tokens without losing unrelated navigation', () => {
  assert.equal(cleanAuthReturn(callback + '&view=guide'), 'https://micahtil.github.io/october-club/?view=guide');
  assert.equal(cleanAuthReturn('https://example.test/?error=x#error_code=y&access_token=secret&refresh_token=secret'), 'https://example.test/');
  assert.equal(cleanAuthReturn('https://example.test/#guide'), 'https://example.test/#guide');
});
