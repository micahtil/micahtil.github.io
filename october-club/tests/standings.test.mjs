import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../supabase/functions/_shared/command.js';
import { formatStandings } from '../supabase/functions/_shared/standings.js';

const snapshot = { today: '2026-10-05', ends_on: '2026-10-31', members: [
  { display_name: 'Alex', total_cents: 625, entry_count: 2, reviewed_through: '2026-10-04' },
  { display_name: 'Blair', total_cents: 625, entry_count: 1, reviewed_through: '2026-10-05' },
  { display_name: 'Casey', total_cents: 0, entry_count: 0, reviewed_through: null },
  { display_name: 'Devon', total_cents: 900, entry_count: 3, reviewed_through: '2026-10-05' },
] };

test('standings command accepts only the documented no-argument form', () => {
  assert.deepEqual(parseCommand(' standings '), { action: 'standings' });
  assert.throws(() => parseCommand('standings extra'), /Use \/spend standings/);
});

test('overview includes all spending, review status and entry counts, while ties skip ranks', () => {
  const text = formatStandings(snapshot);
  assert.match(text, /Group total: \$21.50 · 4 members/);
  assert.match(text, /Unconfirmed · Casey — \$0.00 · 0 entries · not yet reviewed/);
  assert.match(text, /#1 · Alex — \$6.25 · 2 entries · reviewed through 2026-10-04/);
  assert.match(text, /#1 · Blair/);
  assert.match(text, /#3 · Devon/);
  assert.ok(text.indexOf('Casey') < text.indexOf('Alex'));
});

test('final standings require review through challenge end, and refunds can make totals negative', () => {
  const members = snapshot.members.map(member => ({ ...member }));
  members[1].reviewed_through = '2026-10-31';
  members[1].total_cents = -100;
  const text = formatStandings({ ...snapshot, today: '2026-11-03', members });
  assert.match(text, /final standings/);
  assert.match(text, /#1 · Blair — -\$1.00/);
  assert.match(text, /Unconfirmed · Alex/);
});

test('large groups are explicitly shortened and names cannot inject extra lines', () => {
  const members = Array.from({ length: 100 }, (_, i) => ({ ...snapshot.members[0], display_name: ('Name\n' + i).padEnd(40, 'x') }));
  const text = formatStandings({ ...snapshot, members });
  assert.match(text, /Showing 20 of 100 members/);
  assert.match(text, /Group total: \$625.00 · 100 members/);
  assert.ok(text.length < 4000);
  assert.ok(!text.includes('Name\n'));
});
