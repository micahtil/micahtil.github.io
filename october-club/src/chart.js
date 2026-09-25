import { cumulativeSeries, money, shortDate, escapeHtml as esc } from './model.js';
export function chartMarkup(data, category, selectedDate) {
  const start = data.challenge.starts_on;
  const end = data.today < data.challenge.ends_on ? data.today : data.challenge.ends_on;
  if (end < start) return '<div class="empty"><h3>The race starts October 1.</h3><p class="muted">Everyone starts at $0. Log spending as the month unfolds.</p></div>';
  const series = cumulativeSeries(data.members, data.entries, start, end, category);
  const values = series.flatMap(s => s.points.map(p => p.total));
  const yMax = Math.max(10000, Math.ceil(Math.max(0, ...values) / 10000) * 10000);
  const yMin = Math.min(0, Math.floor(Math.min(0, ...values) / 10000) * 10000);
  const compact = typeof window !== 'undefined' && window.innerWidth < 740;
  const width = compact ? 400 : 850;
  const x0 = compact ? 52 : 66, x1 = width - (compact ? 22 : 35), y0 = 20, y1 = 245;
  const count = series[0]?.points.length || 1;
  const x = i => x0 + (x1 - x0) * i / Math.max(1, count - 1);
  const y = value => y1 - (value - yMin) / (yMax - yMin) * (y1 - y0);
  const grid = Array.from({ length: 5 }, (_, i) => { const value = yMin + (yMax - yMin) * i / 4; return `<line x1="${x0}" x2="${x1}" y1="${y(value)}" y2="${y(value)}" stroke="#e2e9e1" stroke-dasharray="3 4"/><text x="${x0 - 12}" y="${y(value) + 4}" text-anchor="end">${money(value).replace('.00', '')}</text>`; }).join('');
  const labels = [...new Set([0, Math.floor((count - 1) / 3), Math.floor((count - 1) * 2 / 3), count - 1])].map(i => `<text x="${x(i)}" y="275" text-anchor="middle">${shortDate(series[0]?.points[i]?.date)}</text>`).join('');
  const selectedIndex = Math.max(0, Math.min(count - 1, series[0]?.points.findIndex(p => p.date === selectedDate) ?? 0));
  const lines = series.map(s => {
    const points = s.points.map((p, i) => `${i ? `H ${x(i)} V` : `M ${x(i)}`} ${y(p.total)}`).join(' ');
    return `<path d="${points}" stroke="${s.color}" stroke-width="2.7" fill="none"/><circle cx="${x(selectedIndex)}" cy="${y(s.points[selectedIndex]?.total || 0)}" r="4.2" fill="${s.color}" stroke="white" stroke-width="2"/>`;
  }).join('');
  return `<div class="chart-wrap"><svg viewBox="0 0 ${width} 290" role="img" aria-label="Cumulative dollars spent by each member. Lower spending leads the race. Use the date slider for exact amounts.">${grid}${labels}<line x1="${x(selectedIndex)}" x2="${x(selectedIndex)}" y1="${y0}" y2="${y1}" stroke="#a9b7a6"/>${lines}</svg></div><div class="chart-scrub"><label for="chart-date">${shortDate(series[0]?.points[selectedIndex]?.date)} totals</label><input id="chart-date" type="range" min="0" max="${Math.max(0, count - 1)}" value="${selectedIndex}" aria-label="Explore spending by date" ${count === 1 ? 'disabled' : ''}></div><div class="chart-legend">${series.map(s => `<div><span class="legend-line" style="background:${s.color}"></span><span>${esc(s.display_name)}</span><strong>${money(s.points[selectedIndex]?.total || 0)}</strong></div>`).join('')}</div>`;
}
