function dateKeyToDayNumber(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / (24 * 60 * 60 * 1000));
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function calculateStreaks(rows, today = new Date()) {
  const activeDays = [...new Set(
    rows
      .filter((row) => row.session_count > 0)
      .map((row) => dateKeyToDayNumber(row.date)),
  )].sort((a, b) => a - b);

  let longest = 0;
  let run = 0;
  let previous = null;
  for (const day of activeDays) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  const activeDaySet = new Set(activeDays);
  const todayDay = dateKeyToDayNumber(formatDate(today));
  let current = 0;
  let cursor = activeDaySet.has(todayDay) ? todayDay : todayDay - 1;
  while (activeDaySet.has(cursor)) {
    current += 1;
    cursor -= 1;
  }

  return { current, longest };
}
