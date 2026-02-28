const HEATMAP_DEFAULT_WEEKS = 53;
const BARS_HEIGHT = 180;
const BARS_RANGE_OPTIONS = [
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1Y" },
  { value: "2Y", label: "2Y" },
  { value: "YTD", label: "YTD" },
  { value: "ALL", label: "All Time" },
];

function isMobileViewport() {
  return window.matchMedia("(max-width: 480px)").matches;
}

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
  const labels = isMobileViewport()
    ? ["", "M", "", "W", "", "F", ""]
    : ["", "Mon", "", "Wed", "", "Fri", ""];
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

function getCalendarYearBounds(year) {
  return {
    startDate: new Date(year, 0, 1, 12, 0, 0, 0),
    endDate: new Date(year, 11, 31, 12, 0, 0, 0),
  };
}

function getHeatmapRange(rangeValue) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (rangeValue === "rolling") {
    const endWeek = startOfWeekSunday(today);
    const startWeek = new Date(endWeek);
    startWeek.setDate(startWeek.getDate() - (HEATMAP_DEFAULT_WEEKS - 1) * 7);
    const endDate = new Date(startWeek);
    endDate.setDate(startWeek.getDate() + (HEATMAP_DEFAULT_WEEKS * 7) - 1);
    return {
      kind: "rolling",
      year: null,
      startDate: startWeek,
      endDate,
      startWeek,
      weeks: HEATMAP_DEFAULT_WEEKS,
      today,
    };
  }

  const year = Number(rangeValue);
  if (!Number.isInteger(year)) {
    throw new Error("Invalid heatmap range");
  }
  const bounds = getCalendarYearBounds(year);
  const startWeek = startOfWeekSunday(bounds.startDate);
  const endWeek = startOfWeekSunday(bounds.endDate);
  const weeks = Math.round((endWeek.getTime() - startWeek.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return {
    kind: "year",
    year,
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    startWeek,
    weeks,
    today,
  };
}

function buildRangeOptions(rows) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const currentYear = today.getFullYear();
  const firstDate = rows.length ? rows.reduce((min, row) => (row.date < min ? row.date : min), rows[0].date) : null;
  const firstYear = firstDate ? Number(firstDate.slice(0, 4)) : currentYear;
  const options = [{ value: "rolling", label: "1Y" }];
  for (let year = currentYear; year >= firstYear; year -= 1) {
    options.push({ value: String(year), label: String(year) });
  }
  return options;
}

function renderRangeButtons(container, options, selectedValue, onSelect) {
  container.textContent = "";
  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn btn-small${option.value === selectedValue ? " btn-primary" : ""}`;
    button.textContent = option.label;
    button.setAttribute("aria-pressed", option.value === selectedValue ? "true" : "false");
    button.addEventListener("click", () => onSelect(option.value));
    container.appendChild(button);
  }
}

function renderHeatmap({
  statsCard,
  statsBarsWrap,
  grid,
  monthAxis,
  weekdayAxis,
  summary,
  statsWrap,
  rows,
  rangeValue,
}) {
  const countByDate = new Map(rows.map((row) => [row.date, row.session_count]));
  const maxCount = rows.reduce((max, row) => Math.max(max, row.session_count), 0);
  const range = getHeatmapRange(rangeValue);

  statsCard.style.setProperty("--weeks", String(range.weeks));
  if (statsBarsWrap) {
    statsBarsWrap.style.setProperty("--weeks", String(range.weeks));
  }
  grid.style.setProperty("--weeks", String(range.weeks));
  renderWeekdayAxis(weekdayAxis);
  renderMonthAxis(monthAxis, range.startWeek, range.weeks);

  let total = 0;
  let activeDays = 0;
  grid.textContent = "";

  for (let week = 0; week < range.weeks; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const current = new Date(range.startWeek);
      current.setDate(range.startWeek.getDate() + week * 7 + day);
      const key = formatDate(current);
      const isOutsideYear = range.kind === "year" && (current < range.startDate || current > range.endDate);
      const isFutureRolling = range.kind === "rolling" && current > range.today;
      const excluded = isOutsideYear || isFutureRolling;
      const count = excluded ? 0 : Number(countByDate.get(key) || 0);
      const level = excluded ? 0 : toLevel(count, maxCount);

      total += count;
      if (count > 0) {
        activeDays += 1;
      }

      const cell = document.createElement("div");
      cell.className = `pixel level-${level}`;
      cell.title = `${key}: ${count} session${count === 1 ? "" : "s"}`;
      if (excluded) {
        cell.style.opacity = "0.35";
      }
      grid.appendChild(cell);
    }
  }

  if (range.kind === "rolling") {
    summary.textContent = `${total} sessions over ${activeDays} active days in the last ${HEATMAP_DEFAULT_WEEKS} weeks`;
  } else {
    summary.textContent = `${total} sessions over ${activeDays} active days in ${range.year}`;
  }

  if (isMobileViewport() && range.kind === "rolling") {
    requestAnimationFrame(() => {
      statsWrap.scrollLeft = Math.max(0, statsWrap.scrollWidth - statsWrap.clientWidth);
    });
  } else {
    statsWrap.scrollLeft = 0;
  }
}

function shortDateLabel(date) {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return `${month}/${day}`;
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

function buildBarsDateWindow(rangeValue, earliestDate) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  let start = new Date(today);
  switch (rangeValue) {
    case "3M":
      start.setDate(today.getDate() - 89);
      break;
    case "6M":
      start.setDate(today.getDate() - 179);
      break;
    case "1Y":
      start.setDate(today.getDate() - 364);
      break;
    case "2Y":
      start.setDate(today.getDate() - 729);
      break;
    case "YTD":
      start = new Date(today.getFullYear(), 0, 1, 12, 0, 0, 0);
      break;
    case "ALL":
      if (earliestDate) {
        const [y, m, d] = earliestDate.split("-").map(Number);
        start = new Date(y, m - 1, d, 12, 0, 0, 0);
      }
      break;
    case "1M":
    default:
      start.setDate(today.getDate() - 29);
      break;
  }
  const totalDays = Math.max(
    1,
    Math.round((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1,
  );
  return buildDateWindow(totalDays);
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
    ...rows.map((r) => (
      r.first_sessions
      + r.progression_sessions
      + r.first_completion_sessions
      + r.completion_sessions
    )),
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
    stack.title = `${row.date}: first ${row.first_sessions}, progression ${row.progression_sessions}, completion ${row.completion_sessions}, first+completion ${row.first_completion_sessions}`;

    const segments = [
      ["bar-seg-first", row.first_sessions],
      ["bar-seg-progression", row.progression_sessions],
      ["bar-seg-completion", row.completion_sessions],
      ["bar-seg-first-completion", row.first_completion_sessions],
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
    label.textContent = shouldShowLabel(index, rows.length) ? shortDateLabel(row.date) : "";

    col.appendChild(stack);
    col.appendChild(label);
    grid.appendChild(col);
  });

  target.appendChild(grid);
}

function renderProgressBars(target, yAxis, rows) {
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
      seg.className = "bar-seg-progress";
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

function renderHistogramBars(target, yAxis, rows, options = {}) {
  const {
    barClass = "bar-seg-hist",
    formatBucket = (bucket) => String(bucket),
    titlePrefix = "",
    palette = [],
  } = options;

  target.textContent = "";
  if (!rows.length) {
    target.innerHTML = `<div class="muted">No data yet.</div>`;
    yAxis.textContent = "";
    return;
  }

  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  const scale = BARS_HEIGHT / maxCount;
  renderYAxis(yAxis, maxCount, { targetTicks: 4, minStep: 1 });

  const grid = document.createElement("div");
  grid.className = "bars-grid";
  grid.style.setProperty("--bars-count", String(rows.length));

  const pickColor = (index) => {
    if (palette.length > 0) {
      return palette[index % palette.length];
    }
    const ratio = rows.length <= 1 ? 0.5 : index / (rows.length - 1);
    const hue = 200 + Math.round(ratio * 50);
    return `hsl(${hue} 72% 56%)`;
  };

  rows.forEach((row, index) => {
    const col = document.createElement("div");
    col.className = "bar-col";

    const stack = document.createElement("div");
    stack.className = "bar-stack";
    stack.style.height = `${BARS_HEIGHT}px`;
    stack.title = `${titlePrefix}${formatBucket(row.bucket)}: ${row.count}`;

    if (row.count > 0) {
      const seg = document.createElement("div");
      seg.className = barClass;
      seg.style.height = `${Math.round(row.count * scale)}px`;
      seg.style.backgroundColor = pickColor(index);
      stack.appendChild(seg);
    }

    const label = document.createElement("div");
    label.className = "bar-day";
    label.textContent = shouldShowLabel(index, rows.length) ? formatBucket(row.bucket) : "";

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
    label.textContent = shouldShowLabel(index, rows.length) ? shortDateLabel(row.date) : "";

    col.appendChild(stack);
    col.appendChild(label);
    grid.appendChild(col);
  });

  target.appendChild(grid);
}

async function loadStats() {
  const summary = document.querySelector("#statsSummary");
  const pageError = document.querySelector("#statsPageError");
  const statsCard = document.querySelector(".stats-card");
  const statsBarsWrap = document.querySelector(".stats-bars-wrap");
  const grid = document.querySelector("#statsGrid");
  const statsWrap = document.querySelector(".stats-wrap");
  const rangeButtons = document.querySelector("#statsRangeButtons");
  const monthAxis = document.querySelector("#statsMonthAxis");
  const weekdayAxis = document.querySelector("#statsWeekdayAxis");
  const sessionsBars = document.querySelector("#sessionsBars");
  const sessionsYAxis = document.querySelector("#sessionsYAxis");
  const rpmBars = document.querySelector("#rpmBars");
  const rpmYAxis = document.querySelector("#rpmYAxis");
  const rpmLegend = document.querySelector("#rpmLegend");
  const sessionsRangeButtons = document.querySelector("#sessionsRangeButtons");
  const rpmRangeButtons = document.querySelector("#rpmRangeButtons");
  const progressBars = document.querySelector("#progressBars");
  const progressYAxis = document.querySelector("#progressYAxis");
  const histDeltasBars = document.querySelector("#histDeltasBars");
  const histDeltasYAxis = document.querySelector("#histDeltasYAxis");
  const histSessionsBars = document.querySelector("#histSessionsBars");
  const histSessionsYAxis = document.querySelector("#histSessionsYAxis");
  const histDaysBars = document.querySelector("#histDaysBars");
  const histDaysYAxis = document.querySelector("#histDaysYAxis");
  const hasHeatmap = Boolean(
    summary
      && statsCard
      && grid
      && statsWrap
      && rangeButtons
      && monthAxis
      && weekdayAxis,
  );
  const hasSessionBars = Boolean(
    sessionsBars
      && sessionsYAxis
      && rpmBars
      && rpmYAxis
      && rpmLegend
      && sessionsRangeButtons
      && rpmRangeButtons,
  );
  const hasProgress = Boolean(progressBars && progressYAxis);
  const hasHistograms = Boolean(
    histDeltasBars
      && histDeltasYAxis
      && histSessionsBars
      && histSessionsYAxis
      && histDaysBars
      && histDaysYAxis,
  );
  if (!hasHeatmap && !hasSessionBars && !hasProgress && !hasHistograms) {
    return;
  }

  async function fetchJson(path, headers) {
    const response = await fetch(path, { headers });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `Request failed: ${response.status}`);
    }
    return payload;
  }

  try {
    const headers = {
      "X-Local-Date": formatDate(new Date()),
    };
    const [summaryPayload, barsPayload, progressPayload, histPayload] = await Promise.all([
      hasHeatmap ? fetchJson("/api/stats", headers) : Promise.resolve(null),
      hasSessionBars ? fetchJson("/api/stats/bars", headers) : Promise.resolve(null),
      hasProgress ? fetchJson("/api/stats/progress", headers) : Promise.resolve(null),
      hasHistograms ? fetchJson("/api/stats/histograms", headers) : Promise.resolve(null),
    ]);

    if (hasHeatmap) {
      const rows = summaryPayload?.data || [];
      const rangeOptions = buildRangeOptions(rows);
      let activeRangeValue = "rolling";
      const renderActiveRange = () => {
        renderHeatmap({
          statsCard,
          statsBarsWrap,
          grid,
          monthAxis,
          weekdayAxis,
          summary,
          statsWrap,
          rows,
          rangeValue: activeRangeValue,
        });
        renderRangeButtons(rangeButtons, rangeOptions, activeRangeValue, (nextValue) => {
          if (nextValue === activeRangeValue) {
            return;
          }
          activeRangeValue = nextValue;
          renderActiveRange();
        });
      };
      renderActiveRange();
    }

    if (hasSessionBars) {
      const sessionByDate = new Map((barsPayload?.data?.sessions || []).map((row) => [row.date, row]));
      const rpmByDate = new Map((barsPayload?.data?.rpms || []).map((row) => [row.date, row]));
      const earliestSessionDate = [...sessionByDate.keys(), ...rpmByDate.keys()].sort()[0] || null;

      function fillDateWindow(map, dates, defaultFn) {
        return dates.map((date) => map.get(date) ?? defaultFn(date));
      }

      let activeBarsRange = "1M";
      const renderBarsRange = () => {
        const windowDates = buildBarsDateWindow(activeBarsRange, earliestSessionDate);
        const sessionRows = fillDateWindow(sessionByDate, windowDates, (date) => ({
          date,
          first_sessions: 0,
          completion_sessions: 0,
          progression_sessions: 0,
          first_completion_sessions: 0,
        }));
        const rpmRows = fillDateWindow(rpmByDate, windowDates, (date) => ({
          date,
          first_sessions: 0,
          delta_bins: [],
        }));
        renderSessionsBars(sessionsBars, sessionsYAxis, sessionRows);
        renderRpmBars(rpmBars, rpmYAxis, rpmLegend, rpmRows);
        const setActiveBarsRange = (nextValue) => {
          if (nextValue === activeBarsRange) {
            return;
          }
          activeBarsRange = nextValue;
          renderBarsRange();
        };
        renderRangeButtons(sessionsRangeButtons, BARS_RANGE_OPTIONS, activeBarsRange, setActiveBarsRange);
        renderRangeButtons(rpmRangeButtons, BARS_RANGE_OPTIONS, activeBarsRange, setActiveBarsRange);
      };
      renderBarsRange();
    }

    if (hasProgress) {
      renderProgressBars(progressBars, progressYAxis, progressPayload?.data || []);
    }
    if (hasHistograms) {
      renderHistogramBars(histDeltasBars, histDeltasYAxis, histPayload?.data?.session_deltas || [], {
        barClass: "bar-seg-hist-delta",
        formatBucket: (bucket) => `+${bucket}`,
        titlePrefix: "Delta ",
        palette: ["#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af"],
      });
      renderHistogramBars(histSessionsBars, histSessionsYAxis, histPayload?.data?.sessions_to_complete || [], {
        barClass: "bar-seg-hist-sessions",
        formatBucket: (bucket) => `${bucket}`,
        titlePrefix: "Sessions ",
        palette: ["#34d399", "#10b981", "#059669", "#047857", "#065f46"],
      });
      renderHistogramBars(histDaysBars, histDaysYAxis, histPayload?.data?.days_to_complete || [], {
        barClass: "bar-seg-hist-days",
        formatBucket: (bucket) => `${bucket}`,
        titlePrefix: "Days ",
        palette: ["#f59e0b", "#f97316", "#ea580c", "#c2410c", "#9a3412"],
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load stats";
    if (summary) {
      summary.textContent = message;
    }
    if (pageError) {
      pageError.textContent = message;
    }
    const errorPairs = [];
    if (sessionsBars && sessionsYAxis) errorPairs.push([sessionsBars, sessionsYAxis]);
    if (rpmBars && rpmYAxis) errorPairs.push([rpmBars, rpmYAxis]);
    if (progressBars && progressYAxis) errorPairs.push([progressBars, progressYAxis]);
    if (histDeltasBars && histDeltasYAxis) errorPairs.push([histDeltasBars, histDeltasYAxis]);
    if (histSessionsBars && histSessionsYAxis) errorPairs.push([histSessionsBars, histSessionsYAxis]);
    if (histDaysBars && histDaysYAxis) errorPairs.push([histDaysBars, histDaysYAxis]);
    for (const [bars, axis] of errorPairs) {
      bars.innerHTML = `<div class="muted">Failed to load chart data.</div>`;
      axis.textContent = "";
    }
    if (rpmLegend) {
      rpmLegend.textContent = "";
    }
  }
}

loadStats();
