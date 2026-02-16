const WEEKS = 53;
const BARS_HEIGHT = 180;
const BAR_DAYS = 50;

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

function shortDay(date) {
  return date.slice(8);
}

function shouldShowLabel(index, total) {
  if (total <= 12) {
    return true;
  }
  const step = Math.ceil(total / 10);
  return index % step === 0 || index === total - 1;
}

function buildDateWindow(totalDays) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const dates = [];
  for (let i = totalDays - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(formatDate(d));
  }
  return dates;
}

function chooseNiceStep(maxValue, targetTicks, minStep = 1) {
  if (maxValue <= 0) {
    return minStep;
  }
  const raw = Math.max(maxValue / targetTicks, minStep);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const multipliers = [1, 2, 5, 10];
  for (const m of multipliers) {
    const step = m * magnitude;
    if (step >= raw && step >= minStep) {
      return step;
    }
  }
  return Math.max(10 * magnitude, minStep);
}

function renderYAxis(axis, maxValue, options = {}) {
  const {
    suffix = "",
    targetTicks = 4,
    minStep = 1,
  } = options;
  axis.textContent = "";
  const step = chooseNiceStep(maxValue, targetTicks, minStep);
  const top = Math.max(step, Math.ceil(maxValue / step) * step);
  for (let value = top; value >= 0; value -= step) {
    const label = document.createElement("span");
    label.textContent = `${Math.round(value)}${suffix}`;
    axis.appendChild(label);
  }
}

function renderSessionsBars(target, yAxis, rows) {
  target.textContent = "";
  if (!rows.length) {
    target.innerHTML = `<div class="muted">No session data yet.</div>`;
    yAxis.textContent = "";
    return;
  }

  const maxTotal = Math.max(
    1,
    ...rows.map((r) => r.first_sessions + r.completion_sessions + r.progression_sessions),
  );
  const scale = BARS_HEIGHT / maxTotal;
  renderYAxis(yAxis, maxTotal, { targetTicks: 4, minStep: 1 });

  const grid = document.createElement("div");
  grid.className = "bars-grid";
  grid.style.setProperty("--bars-count", String(rows.length));

  rows.forEach((row, index) => {
    const col = document.createElement("div");
    col.className = "bar-col";

    const stack = document.createElement("div");
    stack.className = "bar-stack";
    stack.style.height = `${BARS_HEIGHT}px`;
    stack.title = `${row.date}: first ${row.first_sessions}, completion ${row.completion_sessions}, progression ${row.progression_sessions}`;

    const segments = [
      ["bar-seg-first", row.first_sessions],
      ["bar-seg-progression", row.progression_sessions],
      ["bar-seg-completion", row.completion_sessions],
    ];
    for (const [cls, count] of segments) {
      if (count <= 0) {
        continue;
      }
      const seg = document.createElement("div");
      seg.className = cls;
      seg.style.height = `${Math.round(count * scale)}px`;
      stack.appendChild(seg);
    }

    const label = document.createElement("div");
    label.className = "bar-day";
    label.textContent = shouldShowLabel(index, rows.length) ? shortDay(row.date) : "";

    col.appendChild(stack);
    col.appendChild(label);
    grid.appendChild(col);
  });

  target.appendChild(grid);
}

function renderDistributionBars(target, yAxis, rows) {
  target.textContent = "";
  if (!rows.length) {
    target.innerHTML = `<div class="muted">No lick data yet.</div>`;
    yAxis.textContent = "";
    return;
  }

  const maxCount = Math.max(1, ...rows.map((r) => r.lick_count));
  const scale = BARS_HEIGHT / maxCount;
  renderYAxis(yAxis, maxCount, { targetTicks: 4, minStep: 1 });

  const grid = document.createElement("div");
  grid.className = "bars-grid";
  grid.style.setProperty("--bars-count", String(rows.length));

  const colorForBucket = (bucketPct) => {
    const hue = 18 + Math.round((bucketPct / 100) * 108);
    return `hsl(${hue} 78% 54%)`;
  };

  rows.forEach((row) => {
    const col = document.createElement("div");
    col.className = "bar-col";

    const stack = document.createElement("div");
    stack.className = "bar-stack";
    stack.style.height = `${BARS_HEIGHT}px`;
    stack.title = `${row.bucket_pct}%: ${row.lick_count} lick${row.lick_count === 1 ? "" : "s"}`;

    if (row.lick_count > 0) {
      const seg = document.createElement("div");
      seg.className = "bar-seg-distribution";
      seg.style.height = `${Math.round(row.lick_count * scale)}px`;
      seg.style.backgroundColor = colorForBucket(row.bucket_pct);
      stack.appendChild(seg);
    }

    const label = document.createElement("div");
    label.className = "bar-day";
    label.textContent = `${row.bucket_pct}%`;

    col.appendChild(stack);
    col.appendChild(label);
    grid.appendChild(col);
  });

  target.appendChild(grid);
}

function colorForDeltaBin(deltaBin, maxDeltaBin) {
  if (maxDeltaBin <= 5) {
    return "hsl(214 82% 60%)";
  }
  const ratio = (deltaBin - 5) / (maxDeltaBin - 5);
  const lightness = 72 - ratio * 34;
  return `hsl(214 82% ${Math.round(lightness)}%)`;
}

function renderRpmBars(target, yAxis, legend, rows) {
  target.textContent = "";
  legend.textContent = "";
  if (!rows.length) {
    target.innerHTML = `<div class="muted">No RPM delta data yet.</div>`;
    yAxis.textContent = "";
    return;
  }

  const allBins = [...new Set(rows.flatMap((row) => row.delta_bins.map((part) => part.delta_bin)))].sort((a, b) => a - b);
  const maxDeltaBin = allBins.length ? allBins[allBins.length - 1] : 5;
  const maxTotal = Math.max(
    1,
    ...rows.map((row) => (
      (row.first_sessions * 5)
      + row.delta_bins.reduce((sum, part) => sum + (part.session_count * part.delta_bin), 0)
    )),
  );
  const scale = BARS_HEIGHT / maxTotal;
  renderYAxis(yAxis, maxTotal, { targetTicks: 4, minStep: 1 });

  const legendFirst = document.createElement("span");
  legendFirst.className = "legend-item";
  legendFirst.innerHTML = `<span class="legend-swatch bar-seg-rpm-first"></span>First`;
  legend.appendChild(legendFirst);
  for (const bin of allBins) {
    const item = document.createElement("span");
    item.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.backgroundColor = colorForDeltaBin(bin, maxDeltaBin);
    const text = document.createTextNode(`+${bin}`);
    item.appendChild(swatch);
    item.appendChild(text);
    legend.appendChild(item);
  }
  if (allBins.length) {
    const unit = document.createElement("span");
    unit.className = "legend-item legend-unit";
    unit.textContent = "RPM";
    legend.appendChild(unit);
  }

  const grid = document.createElement("div");
  grid.className = "bars-grid";
  grid.style.setProperty("--bars-count", String(rows.length));

  rows.forEach((row, index) => {
    const col = document.createElement("div");
    col.className = "bar-col";

    const stack = document.createElement("div");
    stack.className = "bar-stack";
    stack.style.height = `${BARS_HEIGHT}px`;
    const firstTotal = row.first_sessions * 5;
    const deltaText = row.delta_bins
      .map((part) => `+${part.delta_bin} x${part.session_count} = ${part.delta_bin * part.session_count}`)
      .join(", ");
    stack.title = `${row.date}: first +5 x${row.first_sessions} = ${firstTotal}${deltaText ? `, ${deltaText}` : ""}`;

    if (row.first_sessions > 0) {
      const firstSeg = document.createElement("div");
      firstSeg.className = "bar-seg-rpm-first";
      firstSeg.style.height = `${Math.round(firstTotal * scale)}px`;
      stack.appendChild(firstSeg);
    }

    for (const part of row.delta_bins) {
      if (part.session_count <= 0) {
        continue;
      }
      const seg = document.createElement("div");
      seg.className = "bar-seg-rpm-delta";
      seg.style.height = `${Math.round(part.session_count * part.delta_bin * scale)}px`;
      seg.style.backgroundColor = colorForDeltaBin(part.delta_bin, maxDeltaBin);
      stack.appendChild(seg);
    }

    const label = document.createElement("div");
    label.className = "bar-day";
    label.textContent = shouldShowLabel(index, rows.length) ? shortDay(row.date) : "";

    col.appendChild(stack);
    col.appendChild(label);
    grid.appendChild(col);
  });

  target.appendChild(grid);
}

async function loadStats() {
  const summary = document.querySelector("#statsSummary");
  const grid = document.querySelector("#statsGrid");
  const monthAxis = document.querySelector("#statsMonthAxis");
  const weekdayAxis = document.querySelector("#statsWeekdayAxis");
  const sessionsBars = document.querySelector("#sessionsBars");
  const sessionsYAxis = document.querySelector("#sessionsYAxis");
  const rpmBars = document.querySelector("#rpmBars");
  const rpmYAxis = document.querySelector("#rpmYAxis");
  const rpmLegend = document.querySelector("#rpmLegend");
  const distributionBars = document.querySelector("#distributionBars");
  const distributionYAxis = document.querySelector("#distributionYAxis");
  if (
    !summary
    || !grid
    || !monthAxis
    || !weekdayAxis
    || !sessionsBars
    || !sessionsYAxis
    || !rpmBars
    || !rpmYAxis
    || !rpmLegend
    || !distributionBars
    || !distributionYAxis
  ) {
    return;
  }

  try {
    const headers = {
      "X-Local-Date": formatDate(new Date()),
    };
    const [summaryResponse, barsResponse, distributionResponse] = await Promise.all([
      fetch("/api/stats", { headers }),
      fetch("/api/stats/bars", { headers }),
      fetch("/api/stats/distribution", { headers }),
    ]);
    const summaryPayload = await summaryResponse.json();
    if (!summaryResponse.ok) {
      throw new Error(summaryPayload.error || `Request failed: ${summaryResponse.status}`);
    }
    const barsPayload = await barsResponse.json();
    if (!barsResponse.ok) {
      throw new Error(barsPayload.error || `Request failed: ${barsResponse.status}`);
    }
    const distributionPayload = await distributionResponse.json();
    if (!distributionResponse.ok) {
      throw new Error(distributionPayload.error || `Request failed: ${distributionResponse.status}`);
    }

    const rows = summaryPayload.data || [];
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

    const sessionByDate = new Map((barsPayload.data?.sessions || []).map((row) => [row.date, row]));
    const rpmByDate = new Map((barsPayload.data?.rpms || []).map((row) => [row.date, row]));
    const windowDates = buildDateWindow(BAR_DAYS);

    const sessionRows = windowDates.map((date) => {
      const row = sessionByDate.get(date);
      if (row) {
        return row;
      }
      return {
        date,
        first_sessions: 0,
        completion_sessions: 0,
        progression_sessions: 0,
      };
    });

    const rpmRows = windowDates.map((date) => {
      const row = rpmByDate.get(date);
      if (row) {
        return row;
      }
      return {
        date,
        first_sessions: 0,
        delta_bins: [],
      };
    });

    renderSessionsBars(sessionsBars, sessionsYAxis, sessionRows);
    renderRpmBars(rpmBars, rpmYAxis, rpmLegend, rpmRows);
    renderDistributionBars(distributionBars, distributionYAxis, distributionPayload.data || []);
  } catch (err) {
    summary.textContent = err instanceof Error ? err.message : "Failed to load stats";
    sessionsBars.innerHTML = `<div class="muted">Failed to load chart data.</div>`;
    sessionsYAxis.textContent = "";
    rpmBars.innerHTML = `<div class="muted">Failed to load chart data.</div>`;
    rpmYAxis.textContent = "";
    rpmLegend.textContent = "";
    distributionBars.innerHTML = `<div class="muted">Failed to load chart data.</div>`;
    distributionYAxis.textContent = "";
  }
}

loadStats();
