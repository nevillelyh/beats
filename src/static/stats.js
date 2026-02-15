const WEEKS = 53;

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfWeekSunday(date) {
  const out = new Date(date);
  out.setHours(12, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

function toLevel(count, maxCount) {
  if (count <= 0) {
    return 0;
  }
  if (maxCount <= 1) {
    return 4;
  }
  const ratio = count / maxCount;
  if (ratio <= 0.25) {
    return 1;
  }
  if (ratio <= 0.5) {
    return 2;
  }
  if (ratio <= 0.75) {
    return 3;
  }
  return 4;
}

function renderWeekdayAxis(axis) {
  axis.textContent = "";
  const labels = ["", "Mon", "", "Wed", "", "Fri", ""];
  for (const label of labels) {
    const cell = document.createElement("span");
    cell.textContent = label;
    axis.appendChild(cell);
  }
}

function renderMonthAxis(axis, startWeek, weeks) {
  axis.textContent = "";
  axis.style.setProperty("--weeks", String(weeks));

  let lastLabeledMonth = -1;
  let lastLabeledWeek = -10;
  for (let week = 0; week < weeks; week += 1) {
    const weekStart = new Date(startWeek);
    weekStart.setDate(startWeek.getDate() + week * 7);

    let monthForWeek = null;
    for (let day = 0; day < 7; day += 1) {
      const current = new Date(weekStart);
      current.setDate(weekStart.getDate() + day);
      if (current.getDate() === 1) {
        monthForWeek = current.getMonth();
        break;
      }
    }

    if (week === 0) {
      monthForWeek = weekStart.getMonth();
    }

    if (monthForWeek === null || monthForWeek === lastLabeledMonth || week - lastLabeledWeek < 2) {
      continue;
    }

    const labelDate = new Date(weekStart);
    labelDate.setMonth(monthForWeek, 1);
    const label = document.createElement("span");
    label.textContent = labelDate.toLocaleDateString("en-US", { month: "short" });
    label.style.gridColumn = String(week + 1);
    axis.appendChild(label);

    lastLabeledMonth = monthForWeek;
    lastLabeledWeek = week;
  }
}

async function loadStats() {
  const summary = document.querySelector("#statsSummary");
  const grid = document.querySelector("#statsGrid");
  const monthAxis = document.querySelector("#statsMonthAxis");
  const weekdayAxis = document.querySelector("#statsWeekdayAxis");
  if (!summary || !grid || !monthAxis || !weekdayAxis) {
    return;
  }

  try {
    const response = await fetch("/api/stats", {
      headers: {
        "X-Local-Date": formatDate(new Date()),
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `Request failed: ${response.status}`);
    }

    const rows = payload.data || [];
    const countByDate = new Map(rows.map((row) => [row.date, row.session_count]));
    const maxCount = rows.reduce((max, row) => Math.max(max, row.session_count), 0);
    const weeks = WEEKS;

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const endWeek = startOfWeekSunday(today);
    const startWeek = new Date(endWeek);
    startWeek.setDate(startWeek.getDate() - (weeks - 1) * 7);

    renderWeekdayAxis(weekdayAxis);
    renderMonthAxis(monthAxis, startWeek, weeks);

    let total = 0;
    let activeDays = 0;
    grid.textContent = "";

    for (let week = 0; week < weeks; week += 1) {
      for (let day = 0; day < 7; day += 1) {
        const current = new Date(startWeek);
        current.setDate(startWeek.getDate() + week * 7 + day);
        const key = formatDate(current);
        const isFuture = current > today;
        const count = isFuture ? 0 : Number(countByDate.get(key) || 0);
        const level = isFuture ? 0 : toLevel(count, maxCount);

        if (!isFuture) {
          total += count;
          if (count > 0) {
            activeDays += 1;
          }
        }

        const cell = document.createElement("div");
        cell.className = `pixel level-${level}`;
        cell.title = `${key}: ${count} session${count === 1 ? "" : "s"}`;
        if (isFuture) {
          cell.style.opacity = "0.35";
        }
        grid.appendChild(cell);
      }
    }

    summary.textContent = `${total} sessions over ${activeDays} active days in the last ${weeks} weeks`;
  } catch (err) {
    summary.textContent = err instanceof Error ? err.message : "Failed to load stats";
  }
}

loadStats();
