// Plain text: the Slack handler disables markup so member names cannot ping people.
export function formatStandings({ today, ends_on, members }) {
  const dollars = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  const final = today > ends_on;
  const eligible = member => final ? member.reviewed_through === ends_on : Boolean(member.reviewed_through);
  const rows = [...members].sort((a, b) => a.total_cents - b.total_cents || a.display_name.localeCompare(b.display_name));
  const ranked = rows.filter(eligible);
  const lines = rows.slice(0, 20).map(member => {
    const rank = eligible(member) ? '#' + (ranked.filter(other => other.total_cents < member.total_cents).length + 1) : 'Unconfirmed';
    const name = member.display_name.replace(/[\r\n\t\u0000-\u001f\u007f]/g, ' ').slice(0, 40);
    const review = member.reviewed_through ? 'reviewed through ' + member.reviewed_through : 'not yet reviewed';
    return `${rank} · ${name} — ${dollars(member.total_cents)} · ${member.entry_count} entries · ${review}`;
  });
  return [
    `October Club — ${final ? 'final' : 'reported'} standings`,
    `Coffee shop · USD · as of ${today} (New York)`,
    `Group total: ${dollars(rows.reduce((sum, member) => sum + member.total_cents, 0))} · ${rows.length} members`,
    '', ...lines,
    ...(rows.length > 20 ? [`Showing 20 of ${rows.length} members; see the website for everyone.`] : []),
    '',
    final ? 'Final ranks require review through ' + ends_on + '. Equal totals tie.' : 'Lowest spending wins. Ranks require a review; compare review dates for missing spending. Equal totals tie.',
    'https://micahtil.github.io/october-club/',
  ].join('\n');
}
