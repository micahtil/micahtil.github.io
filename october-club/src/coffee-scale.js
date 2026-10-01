// Static URLs let Vite include the portraits when building for a Pages subpath.
export const COFFEE_SCALE = [
  ['Zen', new URL('../assets/carl-coffee-scale/carl-coffee-01-zen.png', import.meta.url).href],
  ['Calm', new URL('../assets/carl-coffee-scale/carl-coffee-02-calm.png', import.meta.url).href],
  ['Awake', new URL('../assets/carl-coffee-scale/carl-coffee-03-awake.png', import.meta.url).href],
  ['Alert', new URL('../assets/carl-coffee-scale/carl-coffee-04-alert.png', import.meta.url).href],
  ['Wired', new URL('../assets/carl-coffee-scale/carl-coffee-05-wired.png', import.meta.url).href],
  ['Jittery', new URL('../assets/carl-coffee-scale/carl-coffee-06-jittery.png', import.meta.url).href],
  ['Overtired', new URL('../assets/carl-coffee-scale/carl-coffee-07-overtired.png', import.meta.url).href],
  ['Frazzled', new URL('../assets/carl-coffee-scale/carl-coffee-08-frazzled.png', import.meta.url).href],
  ['Maximum coffee', new URL('../assets/carl-coffee-scale/carl-coffee-09-maximum-coffee.png', import.meta.url).href],
].map(([name, src], index) => ({ name, src, level: index + 1 }));

export function withCoffeeLevels(rows, challenge, today) {
  // Use the server's challenge-local date, include today, and freeze after the challenge ends.
  // One day before the start prevents division by zero; refunds can stay negative.
  const end = today < challenge.ends_on ? today : challenge.ends_on;
  const days = Math.max(1, Math.round((Date.parse(end) - Date.parse(challenge.starts_on)) / 86400000) + 1);
  const totals = [...new Set(rows.map(row => row.total))].sort((a, b) => a - b);
  const levels = new Map();
  const threshold = 300 * days;

  for (const [group, min, max] of [
    [totals.filter(total => total <= threshold), 1, 5],
    [totals.filter(total => total > threshold), 6, 9],
  ]) {
    let previous = min - 1;
    group.forEach((total, index) => {
      const average = Math.max(0, total / days);
      // $0–$3/day spans levels 1–5. Above $3 starts at 6, reaching 9 at $6/day.
      const preferred = average <= 300 ? 1 + Math.floor(average / 75) : Math.min(9, 6 + Math.floor((average - 300) / 100));
      // Reserve room for higher totals so all four members can have distinct
      // levels, even when their averages fall in the same severity bucket.
      const level = group.length <= max - min + 1
        ? Math.max(previous + 1, Math.min(preferred, max - (group.length - index - 1)))
        : min + Math.floor(index * (max - min) / (group.length - 1));
      levels.set(total, level);
      previous = level;
    });
  }
  return rows.map(row => ({ ...row, coffeeLevel: levels.get(row.total), dailyAverageCents: row.total / days }));
}
