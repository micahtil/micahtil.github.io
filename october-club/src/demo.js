export function createDemo() {
  const categories = [
    { id: 'coffee', name: 'Coffee shop', description: 'Purchases at coffee shops, including tax and tips.' },
  ];
  const members = [
    { id: 'you', slack_user_id: 'UDEMO', display_name: 'You', role: 'owner', reviewed_through: '2026-10-14' },
    { id: 'alex', slack_user_id: 'UALEX', display_name: 'Alex', role: 'member', reviewed_through: '2026-10-14' },
    { id: 'jordan', slack_user_id: 'UJORDAN', display_name: 'Jordan', role: 'member', reviewed_through: '2026-10-14' },
    { id: 'sam', slack_user_id: 'USAM', display_name: 'Sam', role: 'member', reviewed_through: '2026-10-12' },
  ];
  const spending = [[550, 650, 0, 625, 900, 0, 450, 500, 0, 700, 600, 450, 800, 0], [700, 850, 550, 0, 950, 550, 0, 700, 800, 0, 1200, 0, 650, 600], [650, 0, 800, 1100, 750, 0, 1200, 600, 0, 800, 1500, 700, 0, 450], [550, 400, 0, 700, 500, 900, 0, 600, 800, 600, 0, 750, 0, 0]];
  const entries = [];
  spending.forEach((amounts, m) => amounts.forEach((amount, d) => { if (amount) entries.push({ id: `demo-${m}-${d}`, member_id: members[m].id, category_id: 'coffee', amount_cents: amount, spent_on: `2026-10-${String(d + 1).padStart(2, '0')}`, source: d % 3 ? 'slack' : 'web', created_at: `2026-10-${String(d + 1).padStart(2, '0')}T18:00:00Z` }); }));
  return { today: '2026-10-15', challenge: { title: 'October Club', starts_on: '2026-10-01', ends_on: '2026-10-31', closes_on: '2026-11-03', timezone: 'America/New_York', currency: 'USD' }, me: members[0], categories, members, entries, budgets: [] };
}
