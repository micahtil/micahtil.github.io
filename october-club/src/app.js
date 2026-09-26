import './style.css';
import { createClient } from '@supabase/supabase-js';
import { money, toCents, escapeHtml as esc, shortDate, datesBetween, leaderboard, totalsFor, COLORS } from './model.js';
import { createDemo } from './demo.js';
import { chartMarkup } from './chart.js';
import { usageGuideView } from './guide.js';
import { slackLoginOptions, readAuthSession, cleanAuthReturn } from './auth.js';
import { parseCommand, HELP } from '../supabase/functions/_shared/command.js';

const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const client = url && key ? createClient(url, key, { auth: { storageKey: 'october-club-auth', flowType: 'pkce' } }) : null;
const app = document.querySelector('#app');
let authBusy = false, authInitializing = true;
let data = null, demo = false, tab = 'race', category = 'all', selectedDate = '', authError = '', loading = false, noticeTimer, refreshTimer, authGeneration = 0;
const maxDate = () => data.today < data.challenge.ends_on ? data.today : data.challenge.ends_on;
const open = () => data.today >= data.challenge.starts_on && data.today < data.challenge.closes_on;
const color = id => COLORS[data.members.findIndex(m => m.id === id) % COLORS.length];
const total = id => totalsFor(data.members, data.entries).find(m => m.id === id)?.total || 0;
const categoryName = id => data.categories.find(c => c.id === id)?.name || id;

function notify(message) { clearTimeout(noticeTimer); document.querySelector('#notice').textContent = message; noticeTimer = setTimeout(() => { document.querySelector('#notice').textContent = ''; }, 6000); }
function header() { return `${demo ? '<div class="demo-strip"><strong>Interactive preview</strong> · Fictional spending. Changes reset when you leave.<button data-action="exit">Exit preview</button></div>' : ''}<header class="topbar"><div class="shell"><a class="brand" href="./"><span class="brand-mark"></span>october club</a><div class="row"><span class="pill">The race to spend less.</span>${data ? `<button class="button ghost" data-action="${demo ? 'exit' : 'signout'}">${demo ? 'Exit preview' : 'Sign out'}</button>` : ''}</div></div></header>`; }
function authView() {
  return `${header()}<main class="shell auth-layout"><section class="auth-copy"><div class="eyebrow">The October spending challenge</div><h1>The lowest<br>spender wins.</h1><p>Imagine the savings if you cut out all the simple pleasures that make our Sisyphean nightmare of an existence tolerable</p><span class="auth-stamp">01 — 31 October, 2026</span></section><section class="card auth-card"><h2>Your circle. One starting line.</h2><p class="muted">${client ? 'Use your Slack account to enter the private challenge.' : 'Explore the race while the club’s Slack connection is being set up.'}</p>${client ? '<button class="button full" data-action="login">Sign in with Slack</button><p class="small muted">On your phone, finish sign-in in the same browser where you started. If Slack opens its app, return to that browser tab. If needed, start Sign in with Slack again here.</p><hr>' : ''}<button class="button outline full" data-action="demo">Explore the preview ↗</button>${authError ? `<p class="error" role="alert">${esc(authError)}</p><button class="button ghost" data-action="signout">Sign out and try another account</button>` : ''}<p class="fine-print">Challenge members can see everyone’s coffee shop dollar totals and spending over time. Access is limited to the people your organizer invites.</p></section></main>`;
}
function leaderboardView() {
  const rows = leaderboard(data.members, data.entries, category);
  const isFinal = data.today > data.challenge.ends_on;
  const finalists = rows.filter(m => m.reviewed_through === data.challenge.ends_on);
  return `<div class="table-scroll"><table><thead><tr><th>Member</th><th>Cumulative spent</th><th>Entries</th><th>Reviewed through</th><th>${isFinal ? 'Final rank' : 'Reported rank'}</th></tr></thead><tbody>${rows.map(m => { const rank = isFinal ? m.reviewed_through === data.challenge.ends_on ? finalists.filter(r => r.total < m.total).length + 1 : null : m.rank; return `<tr class="${m.id === data.me.id ? 'you-row' : ''}"><td><span class="avatar" style="color:${color(m.id)}">${esc(m.display_name.slice(0, 1))}</span>${esc(m.display_name)}${m.id === data.me.id ? ' <span class="muted small">(you)</span>' : ''}</td><td class="pct">${money(m.total)}</td><td>${data.entries.filter(e => e.member_id === m.id && !e.voided && (category === 'all' || e.category_id === category)).length}</td><td>${shortDate(m.reviewed_through)}${m.reviewed_through && m.reviewed_through < maxDate() ? ' <span class="muted small">· update due</span>' : ''}</td><td>${rank ? '#' + rank : '<span class="muted">Unconfirmed</span>'}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function raceView() {
  const mine = totalsFor(data.members, data.entries, category).find(m => m.id === data.me.id)?.total || 0;
  const rows = leaderboard(data.members, data.entries, category);
  const eligible = rows.filter(m => m.reviewed_through);
  const selected = 'Coffee shop';
  return `<div class="dashboard"><section><div class="summary"><div><div class="eyebrow">Your October spending</div><div class="summary-number">${money(mine)}</div><p class="small muted">${data.entries.filter(e => e.member_id === data.me.id && !e.voided).length} purchases & refunds logged</p></div><div class="summary-divider"><div class="eyebrow">Lowest reported total</div><div class="summary-number">${eligible.length ? money(eligible[0].total) : '—'}</div><p class="small muted">${eligible.length ? esc(eligible.filter(m => m.total === eligible[0].total).map(m => m.display_name).join(' & ')) : 'Waiting for the first review'}</p></div></div>
  <section class="card chart-card"><div class="row between wrap"><div><h2>The spending race</h2><p class="small muted">Cumulative dollars · lower is better</p></div><span class="pill">Coffee shop</span></div><div id="chart">${chartMarkup(data, category, selectedDate)}</div></section></section>
  <aside><section class="card aside-card"><div class="week-label">LOG IT BEFORE YOU FORGET</div><h2>Another coffee?</h2><p class="small muted">Drop an amount into Slack. Your line on the chart updates with every purchase.</p><code class="command-example">/spend 6.50</code><button class="button full" data-tab="add">＋ Add spending</button><button class="button ghost full" data-tab="slack">See Slack commands</button></section><section class="card"><h3>Keep the race honest</h3><p class="small muted">Zero logged dollars can mean no spending—or missing entries. Mark a date reviewed after checking all your purchases.</p><div class="detail-row"><span>You’ve reviewed through</span><strong>${shortDate(data.me.reviewed_through)}</strong></div><button class="button outline full" data-tab="review">Review my entries</button></section></aside></div>
  <div class="row between section-heading wrap"><h2>The standings</h2><span class="small muted">${esc(selected)} · lowest total first</span></div><section class="card table-card">${leaderboardView()}</section><p class="note">Ranks use reported dollars. Compare review dates before calling a winner. Final standings require everyone to review through October 31.</p>`;
}
function addView() {
  if (!open()) return `<section class="card form-layout"><h2>${data.today < data.challenge.starts_on ? 'The race starts October 1' : 'This challenge has closed'}</h2><p class="muted">Purchases must fall within October. Final corrections are accepted through November 2.</p></section>`;
  return `<section class="card form-layout"><h2>Add spending</h2><p class="small muted">Add a coffee shop purchase or an unlogged daily subtotal. This amount is added to your balance; it does not replace it.</p><form id="entry-form"><div class="field"><label for="amount">Amount in dollars</label><div class="input-money"><span>$</span><input id="amount" name="amount" inputmode="decimal" placeholder="0.00" required></div></div><div class="field"><label for="spent-on">Purchase date</label><input id="spent-on" name="date" type="date" min="${data.challenge.starts_on}" max="${maxDate()}" value="${maxDate()}" required></div><label class="checkbox"><input type="checkbox" name="refund"> This is a refund (subtract from spending)</label><p class="small muted">Dollar amounts are visible to your challenge members. No receipt or merchant details are needed.</p><div class="form-error" role="alert"></div><button class="button" type="submit">Add to my spending</button></form></section>`;
}
function entriesView(onlyMine = false) {
  const entries = data.entries.filter(e => !e.voided && (!onlyMine || e.member_id === data.me.id)).sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at));
  return `<div class="table-scroll"><table><thead><tr><th>Date</th>${onlyMine ? '' : '<th>Member</th>'}<th>Amount</th><th>Added from</th><th></th></tr></thead><tbody>${entries.map(e => `<tr><td>${shortDate(e.spent_on)}</td>${onlyMine ? '' : `<td>${esc(data.members.find(m => m.id === e.member_id)?.display_name)}</td>`}<td>${money(e.amount_cents)}</td><td>${esc(e.source)}</td><td>${e.member_id === data.me.id && open() ? `<button class="button ghost small" data-undo="${esc(e.id)}">Undo</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5">No spending logged yet.</td></tr>'}</tbody></table></div>`;
}
function reviewView() { return `<section class="card form-layout"><h2>All caught up?</h2><p class="small muted">Check your bank app, receipts or notes. Once every coffee shop purchase is logged, confirm the date you’ve reviewed through.</p><form id="review-form"><div class="field"><label for="review-date">All my spending is logged through</label><input id="review-date" name="date" type="date" min="${data.challenge.starts_on}" max="${maxDate()}" value="${maxDate()}" required ${!open() ? 'disabled' : ''}></div><div class="form-error" role="alert"></div><button class="button" type="submit" ${!open() ? 'disabled' : ''}>Confirm reviewed</button></form></section><div class="section-heading"><h2>Your entries</h2></div><section class="card table-card">${entriesView(true)}</section>`; }
function slackView() {
  const examples = [['/spend 12.50', 'Add $12.50 to today’s coffee shop spending.'], ['/spend 5.50 2026-10-05', 'Add a purchase you forgot, on its actual date.'], ['/spend refund 5', 'Subtract a refund from today’s coffee shop spending.'], ['/spend undo', 'Undo your most recently added active entry.'], ['/spend total', 'Check your October total.'], ['/spend done 2026-10-14', 'Confirm all spending through October 14 is logged.']];
  return `<section class="card form-layout"><h2>Log it in Slack</h2><p class="small muted">Commands work anywhere in your workspace. Confirmations are visible only to you; the spending joins the shared race.</p>${examples.map(([cmd, detail]) => `<div class="command-row"><code>${esc(cmd)}</code><p class="small muted">${detail}</p></div>`).join('')}<p class="note">One currency: USD. Every entry counts toward Coffee shop. No category is needed. No notes or receipts required.</p>${demo ? '<hr><h3>Try a command in the preview</h3><form id="command-form"><label for="command-input">Command</label><input id="command-input" name="command" value="/spend 12.50" required><div class="form-error" role="alert"></div><button class="button" type="submit" style="margin-top:14px">Run preview command</button></form>' : ''}</section>`;
}
function rulesView() { return `<section class="card form-layout"><h2>Same rules. Same starting line.</h2>${[
  ['Lowest cumulative dollars wins', 'The race compares actual dollars spent at coffee shops. Personal budgets are optional guides and do not change the ranking.'],
  ['Count purchases once', 'Include your own share of tax, tips and delivery fees. Log the purchase date in the challenge timezone. Add purchases or unlogged daily subtotals, never your running balance.'],
  ['Coffee shop purchases only', data.categories.map(c => `${c.name}: ${c.description}`).join(' ')],
  ['Review regularly', 'Missing entries are not savings. Confirm when you have checked all spending through a date, including no-spend days. Unreviewed members are not ranked.'],
  ['Finish together', 'Purchases run October 1–31. Reconcile by November 2. Only members reviewed through October 31 receive a final rank; equal dollar totals tie.'],
  ['Shared within your circle', 'Members can see each other’s dollar totals, dates and entries. Only you can change your own spending. The operator and database provider also have access. No bank connections or credentials are collected.'],
].map(([title, copy], i) => `<div class="rule"><span class="num">0${i + 1}</span><div><h3>${esc(title)}</h3><p class="small muted">${esc(copy)}</p></div></div>`).join('')}</section>`; }
function accountView() { return `<section class="card form-layout"><h2>Your profile</h2><form id="profile-form"><div class="field"><label for="display-name">Name on the leaderboard</label><input id="display-name" name="name" value="${esc(data.me.display_name)}" maxlength="40" required></div><div class="form-error" role="alert"></div><button class="button" type="submit">Save name</button></form><div class="section-heading"><h2>Your data</h2></div><button class="button outline" data-action="export">Export my entries</button></section><section class="card form-layout"><h2>Optional coffee shop budget</h2><p class="small muted">Use limits as a personal reference. The race is always scored in actual dollars.</p><form id="budget-form">${data.categories.map(c => `<div class="field"><label for="limit-${esc(c.id)}">${esc(c.name)}</label><input id="limit-${esc(c.id)}" name="${esc(c.id)}" inputmode="decimal" value="${data.budgets.find(b => b.category_id === c.id)?.amount_cents / 100 || ''}" placeholder="No limit"></div>`).join('')}<div class="form-error" role="alert"></div><button class="button" type="submit">Save my budgets</button></form></section>${data.me.role === 'owner' ? `<section class="card form-layout"><h2>Invite friends</h2><p class="small muted">As organizer, use <code>/spend invite @person</code> in Slack to allow a friend into this challenge. They can then sign in here with Slack. This does not send a message to them.</p></section>` : ''}`; }
function render() {
  if (!data) { app.innerHTML = authView(); return; }
  const views = { race: raceView, add: addView, review: reviewView, entries: () => `<section class="card table-card"><div class="table-title"><h2>The group’s spending log</h2></div>${entriesView()}</section>`, guide: () => usageGuideView(data.me.role === 'owner'), slack: slackView, rules: rulesView, account: accountView };
  app.innerHTML = `${header()}<main class="shell"><div class="intro row between"><div><div class="eyebrow muted">October 1–31, 2026 · ${esc(data.challenge.currency)}</div><h1 style="margin-top:10px">The race to spend less.</h1><p class="muted">Imagine the savings if you cut out all the simple pleasures that make our Sisyphean nightmare of an existence tolerable</p></div><button class="button" data-tab="add">＋ Add spending</button></div><nav class="tabs" aria-label="Challenge">${[['race', 'The race'], ['entries', 'Spending log'], ['guide', 'How to use'], ['slack', 'Slack commands'], ['rules', 'Ground rules'], ['account', 'Account']].map(([id, title]) => `<button class="tab" data-tab="${id}" ${tab === id ? 'aria-current="page"' : ''}>${title}</button>`).join('')}</nav><div id="view">${(views[tab] || raceView)()}</div><footer class="footer row between wrap"><span>October Club · A little less, together.</span><button class="button ghost small" data-action="refresh">Refresh totals</button></footer></main>`;
}
async function syncAuth() {
  if (!client || demo || data || authBusy) return;
  const generation = authGeneration;
  const returnUrl = location.href;
  authBusy = true;
  try {
    const session = await readAuthSession(client.auth, returnUrl);
    if (generation !== authGeneration || demo) return;
    if (session) { authError = ''; await load(); }
  } catch (error) {
    if (generation === authGeneration && !demo) { data = null; authError = error.message; }
  } finally {
    authInitializing = false;
    authBusy = false;
    if (location.href === returnUrl) {
      const cleanUrl = cleanAuthReturn(returnUrl);
      if (cleanUrl !== returnUrl) history.replaceState(history.state, '', cleanUrl);
    }
    if (generation === authGeneration && !demo && !data) render();
  }
}
async function rpc(name, args = {}) { const { data: result, error } = await client.rpc(name, args); if (error) throw new Error(error.message || 'Something went wrong. Please try again.'); return result; }
async function load() { const generation = authGeneration; if (!demo) { const response = await rpc('club_dashboard'); if (generation !== authGeneration) return; data = response; } selectedDate ||= maxDate(); render(); }
function startDemo() { authGeneration++; demo = true; data = createDemo(); selectedDate = '2026-10-14'; tab = 'race'; category = 'all'; render(); }
async function signOut() { if (client && !demo) { const { error } = await client.auth.signOut(); if (error) throw error; } authGeneration++; demo = false; data = null; authError = ''; render(); }
async function mutate(action, payload, requestId = crypto.randomUUID()) {
  if (!demo) { const result = await rpc('club_mutate', { p_action: action, p_data: payload, p_request_id: requestId }); await load(); return result; }
  if (!open() && ['add', 'undo', 'done'].includes(action)) throw new Error('Spending entries are not open.');
  if (action === 'add') {
    const date = payload.date || maxDate();
    if (date < data.challenge.starts_on || date > maxDate()) throw new Error('Choose a date in October no later than today.');
    if (!data.categories.some(c => c.id === payload.category_id)) throw new Error('Unknown category. This challenge tracks Coffee shop.');
    data.entries.push({ id: crypto.randomUUID(), member_id: data.me.id, spent_on: date, category_id: payload.category_id, amount_cents: payload.amount_cents, source: payload.source || 'web', created_at: data.today + 'T' + new Date().toISOString().split('T')[1] });
    selectedDate = maxDate();
    if (data.me.reviewed_through && date <= data.me.reviewed_through) data.me.reviewed_through = null;
  } else if (action === 'undo') {
    const entries = data.entries.filter(e => !e.voided && e.member_id === data.me.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const entry = payload.entry_id ? entries.find(e => e.id === payload.entry_id) : entries[0];
    if (!entry) throw new Error('No matching active entry to undo.'); entry.voided = true; data.me.reviewed_through = null;
  } else if (action === 'done') {
    const date = payload.date || maxDate();
    if (date < data.challenge.starts_on || date > maxDate()) throw new Error('Choose a date in October no later than today.');
    data.me.reviewed_through = date;
  } else if (action === 'name') { data.me.display_name = payload.name; }
  else if (action === 'budgets') data.budgets = payload.rows;
  render(); return { message: 'Saved. Your spending race is up to date.' };
}
app.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.tab) { tab = button.dataset.tab; render(); return; }
  try {
    if (button.dataset.undo) { await mutate('undo', { entry_id: button.dataset.undo }); notify('Entry undone. Review your spending again when you’re ready.'); return; }
    switch (button.dataset.action) {
      case 'demo': startDemo(); break;
      case 'exit': authGeneration++; demo = false; data = null; render(); if (client) { const { data: s } = await client.auth.getSession(); if (s.session) await load(); } break;
      case 'signout': await signOut(); break;
      case 'login': { button.disabled = true; authError = ''; const { error } = await client.auth.signInWithOAuth(slackLoginOptions(location.href)); if (error) throw error; break; }
      case 'refresh': button.disabled = true; await load(); notify('Spending totals refreshed.'); break;
      case 'export': { const blob = new Blob([JSON.stringify({ challenge: data.challenge, profile: data.me, budgets: data.budgets, entries: data.entries.filter(e => e.member_id === data.me.id) }, null, 2)], { type: 'application/json' }); const href = URL.createObjectURL(blob), a = document.createElement('a'); a.href = href; a.download = 'october-club-my-spending.json'; a.click(); setTimeout(() => URL.revokeObjectURL(href), 1000); break; }
    }
  } catch (error) { notify(error.message); button.disabled = false; }
});
app.addEventListener('change', event => { if (event.target.id === 'category-filter') { category = event.target.value; render(); } });
app.addEventListener('input', event => {
  if (event.target.id === 'chart-date') {
    selectedDate = datesBetween(data.challenge.starts_on, maxDate())[Number(event.target.value)];
    const fresh = document.createElement('div'); fresh.innerHTML = chartMarkup(data, category, selectedDate);
    document.querySelector('.chart-wrap').replaceWith(fresh.querySelector('.chart-wrap'));
    document.querySelector('.chart-legend').replaceWith(fresh.querySelector('.chart-legend'));
    document.querySelector('.chart-scrub label').textContent = fresh.querySelector('.chart-scrub label').textContent;
  }
});
app.addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target, fields = new FormData(form), button = form.querySelector('[type=submit]'), errorEl = form.querySelector('.form-error');
  if (button) button.disabled = true; if (errorEl) errorEl.textContent = '';
  try {
    let result;
    if (form.id === 'entry-form') {
      const payload = { amount_cents: toCents(fields.get('amount')) * (fields.has('refund') ? -1 : 1), category_id: 'coffee', date: fields.get('date') };
      const fingerprint = JSON.stringify(payload);
      if (form.dataset.fingerprint !== fingerprint) { form.dataset.fingerprint = fingerprint; form.dataset.requestId = crypto.randomUUID(); }
      result = await mutate('add', payload, form.dataset.requestId); tab = 'race'; await load();
    }
    if (form.id === 'review-form') result = await mutate('done', { date: fields.get('date') });
    if (form.id === 'profile-form') { const name = String(fields.get('name')).trim(); if (!name || name.length > 40) throw new Error('Use a name from 1 to 40 characters.'); result = await mutate('name', { name }); }
    if (form.id === 'budget-form') { const rows = data.categories.flatMap(c => { const v = String(fields.get(c.id)).trim(); return v ? [{ category_id: c.id, amount_cents: toCents(v) }] : []; }); result = await mutate('budgets', { rows }); }
    if (form.id === 'command-form') {
      const command = parseCommand(String(fields.get('command')).replace(/^\/spend\s*/, ''));
      if (command.action === 'help') { notify(HELP); return; }
      if (command.action === 'total') { notify(`Your October total is ${money(total(data.me.id))}.`); return; }
      if (command.action === 'invite') throw new Error('Member invitations are available when the real Slack app is connected.');
      result = await mutate(command.action, { ...command, source: 'slack' });
    }
    notify(result?.message || 'Saved.');
  } catch (error) { if (errorEl) { errorEl.className = 'form-error error'; errorEl.textContent = error.message; } else notify(error.message); }
  finally { if (button) button.disabled = false; }
});
render();
if (client) {
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' && !demo) { if (!authInitializing) authGeneration++; data = null; render(); }
    if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session && !demo && !data) setTimeout(syncAuth, 0);
  });
  void syncAuth();
  window.addEventListener('pageshow', syncAuth);
  window.addEventListener('focus', syncAuth);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncAuth(); });
  refreshTimer = setInterval(async () => { if (data && !demo && !loading && tab === 'race' && document.visibilityState === 'visible' && document.activeElement?.id !== 'chart-date') { loading = true; try { await load(); } catch { notify('Could not refresh. Showing the last loaded totals.'); } finally { loading = false; } } }, 30000);
}
