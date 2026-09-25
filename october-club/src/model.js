export const COLORS = ['#216b59', '#d77a35', '#7772bf', '#358aa1', '#bf5275', '#728a29', '#99523c', '#347ba3'];
export const money = (cents, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(cents / 100);
export function toCents(value) {
  const text = String(value).trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) throw new Error('Use a positive dollar amount with up to two decimal places.');
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (cents <= 0 || cents > 100000000) throw new Error('Enter more than $0 and no more than $1,000,000.');
  return cents;
}
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function shortDate(date) { return date ? new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'Not reviewed'; }
export function datesBetween(start, end) {
  const dates = [];
  for (let time = Date.parse(start); time <= Date.parse(end); time += 86400000) dates.push(new Date(time).toISOString().slice(0, 10));
  return dates;
}
export function totalsFor(members, entries, category = 'all', cutoff = '9999-12-31') {
  return members.map(m => ({ ...m, total: entries.filter(e => e.member_id === m.id && !e.voided && e.spent_on <= cutoff && (category === 'all' || e.category_id === category)).reduce((sum, e) => sum + e.amount_cents, 0) }));
}
export function cumulativeSeries(members, entries, start, end, category = 'all') {
  const dates = datesBetween(start, end);
  return members.map((member, i) => {
    let total = 0;
    const daily = new Map();
    for (const e of entries) if (e.member_id === member.id && !e.voided && e.spent_on >= start && e.spent_on <= end && (category === 'all' || e.category_id === category)) daily.set(e.spent_on, (daily.get(e.spent_on) || 0) + e.amount_cents);
    return { ...member, color: COLORS[i % COLORS.length], points: dates.map(date => ({ date, total: total += daily.get(date) || 0 })) };
  });
}
export function leaderboard(members, entries, category = 'all') {
  const rows = totalsFor(members, entries, category).sort((a, b) => a.total - b.total || a.display_name.localeCompare(b.display_name));
  return rows.map(row => ({ ...row, rank: row.reviewed_through ? rows.filter(r => r.reviewed_through && r.total < row.total).length + 1 : null }));
}
