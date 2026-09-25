export const HELP = 'Try /spend 12.50 · /spend 5.50 2026-10-05 · /spend refund 5 · /spend undo · /spend total · /spend done 2026-10-14. All purchases count toward Coffee shop. No category is needed. Amounts add to your total; do not submit your cumulative balance.';
export function parseCommand(text) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (!parts.length || parts[0] === 'help') return { action: 'help' };
  if (parts[0] === 'total' && parts.length === 1) return { action: 'total' };
  if (parts[0] === 'undo' && parts.length <= 2) {
    if (parts[1] && !/^[0-9a-f-]{36}$/i.test(parts[1])) throw new Error('Use /spend undo, or /spend undo followed by an entry ID.');
    return { action: 'undo', entry_id: parts[1] || null };
  }
  if (parts[0] === 'invite' && parts.length === 2) {
    const match = /^(?:<@)?([UW][A-Z0-9]{2,})(?:\|[^>]+)?>?$/.exec(parts[1]);
    if (!match) throw new Error('Use /spend invite @person, selecting a Slack member.');
    return { action: 'invite', slack_user_id: match[1] };
  }
  if (parts[0] === 'done' && parts.length <= 2) return { action: 'done', date: validDate(parts[1]) };
  const refund = parts[0] === 'refund';
  if (refund) parts.shift();
  if (parts.length < 1 || parts.length > 2) throw new Error(HELP);
  const amount = parts[0].replace(/^\$/, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(amount)) throw new Error('Use a positive dollar amount with no more than two decimal places. For refunds, use /spend refund 5.');
  const [whole, fraction = ''] = amount.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (cents <= 0 || cents > 100000000) throw new Error('Amount must be more than $0 and no more than $1,000,000.');
  return { action: 'add', amount_cents: refund ? -cents : cents, category_id: 'coffee', date: validDate(parts[1]) };
}
function validDate(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value) throw new Error('Use a real date in YYYY-MM-DD format.');
  return value;
}

export async function verifySlack(body, timestamp, signature, secret, now = Date.now()) {
  if (!secret || !/^\d+$/.test(timestamp || '') || Math.abs(now / 1000 - Number(timestamp)) > 300 || !/^v0=[a-f0-9]{64}$/.test(signature || '')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.slice(3).match(/../g), hex => parseInt(hex, 16));
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`v0:${timestamp}:${body}`));
}

export function safeResponseUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'hooks.slack.com' && !url.username && !url.password && !url.port && url.pathname.startsWith('/commands/'); } catch { return false; }
}
