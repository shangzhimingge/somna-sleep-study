const byId = (id) => document.getElementById(id);
const chart = byId("chart");
const context = chart.getContext("2d");
const note = byId("chart-note");
const reportButtons = [...document.querySelectorAll("[data-record]")];
const review = byId("review");
const checkpoint = byId("final-checkpoint");
const storyKey = "somna-b041-completed-v2";
const clock = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function restoreCompletion() {
  try {
    const saved = Number(window.sessionStorage.getItem(storyKey));
    return saved > 0 && Number.isFinite(new Date(saved).getTime()) ? saved : 0;
  } catch {
    return 0;
  }
}

let completedAt = restoreCompletion();
let reviewStartedAt = null;
let pauseStartedAt = null;
let lastPauseSeconds = 0;
let totalForeground = 0;
let foregroundStartedAt = document.hidden ? null : performance.now();
let lastScrollY = Math.max(0, window.scrollY);
let direction = "向下查阅";
let pendingScroll = false;

const records = {
  start: { position: 0, text: "23:48　检测到一位使用者入睡。" },
  anomaly: { position: 149 / 456, text: "02:17　信号质量偏低。该时段未纳入晨间摘要。" },
  end: { position: 1, text: "07:24　监测结束，已生成晨间摘要。" },
};
const revisedRecords = {
  start: "23:48　检测到一位使用者入睡。另一位已在等待。",
  anomaly: "02:17　已按原记录保留第二组呼吸。两份样本禁止合并。",
  end: "07:24　结案后仍有一位使用者在读取。已将档案交还给当前阅览端。",
};
const levels = [
  [0, 0], [.035, 1], [.085, 2], [.16, 1], [.205, 0], [.24, 1],
  [.29, 2], [.326, 0], [.34, 1], [.40, 2], [.47, 1], [.535, 0],
  [.56, 1], [.605, 2], [.66, 1], [.74, 2], [.79, 1], [.86, 0],
  [.895, 1], [.958, 0], [1, 0],
];
let selected = "start";

function paintChart() {
  if (!context) return;
  const { width, height } = chart.getBoundingClientRect();
  if (width === 0 || height === 0) return;
  const density = Math.min(window.devicePixelRatio || 1, 3);
  chart.width = Math.round(width * density);
  chart.height = Math.round(height * density);
  context.setTransform(density, 0, 0, density, 0, 0);

  const x = (position) => 5 + position * (width - 10);
  const y = (level) => 12 + level * ((height - 24) / 2);
  context.strokeStyle = "#e8dfe5";
  context.lineWidth = 1;
  for (const level of [0, 1, 2]) {
    context.beginPath();
    context.moveTo(x(0), y(level));
    context.lineTo(x(1), y(level));
    context.stroke();
  }

  context.beginPath();
  context.moveTo(x(0), y(levels[0][1]));
  for (let index = 1; index < levels.length; index += 1) {
    const [position, level] = levels[index];
    context.lineTo(x(position), y(levels[index - 1][1]));
    context.lineTo(x(position), y(level));
  }
  context.strokeStyle = "#8e6f93";
  context.lineWidth = 2;
  context.lineJoin = "round";
  context.stroke();

  context.setLineDash([3, 3]);
  for (const [key, record] of Object.entries(records)) {
    const active = key === selected;
    if (!active && key !== "anomaly") continue;
    const marker = x(record.position);
    context.strokeStyle = key === "anomaly" ? "#ac6a76" : "#90718c";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(marker, 3);
    context.lineTo(marker, height - 3);
    context.stroke();
    if (active) {
      context.fillStyle = context.strokeStyle;
      context.beginPath();
      context.arc(marker, y(0), 3.5, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.setLineDash([]);
}

function selectRecord(key) {
  selected = key;
  for (const button of reportButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.record === key));
  }
  note.textContent = completedAt ? revisedRecords[key] : records[key].text;
  note.classList.toggle("anomaly", key === "anomaly");
  paintChart();
}

for (const button of reportButtons) {
  button.addEventListener("click", () => selectRecord(button.dataset.record));
}

if (typeof ResizeObserver === "function") {
  new ResizeObserver(paintChart).observe(chart);
} else {
  window.addEventListener("resize", paintChart);
}
paintChart();

function writeTime(element, milliseconds) {
  const date = new Date(milliseconds);
  const display = clock.format(date);
  if (element.textContent !== display) {
    element.textContent = display;
    element.dateTime = date.toISOString();
  }
}

function durationLabel(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  return minutes + ":" + String(totalSeconds % 60).padStart(2, "0");
}

function writeText(id, value) {
  const element = byId(id);
  if (element.textContent !== value) element.textContent = value;
}

function updateLiveDetails() {
  if (document.hidden) return;
  const now = performance.now();
  const liveForeground = totalForeground + (foregroundStartedAt === null ? 0 : now - foregroundStartedAt);
  writeTime(byId("reader-time"), Date.now());
  writeText("reader-duration", durationLabel(liveForeground));
  writeText("reader-direction", direction);

  let state = "等待关联";
  let message = "等待阅读端连接。";
  if (completedAt) {
    state = "归档已写回";
    message = direction === "向上回看"
      ? "已记录回看。首页正在使用新的校准结果。"
      : "本页已接管校时。晨间摘要已更新。";
  } else if (reviewStartedAt !== null) {
    const elapsed = Math.floor((liveForeground - reviewStartedAt) / 1000);
    state = "阅读端已连接";
    if (lastPauseSeconds > 0) {
      message = `你离开页面约 ${lastPauseSeconds} 秒。另一组记录在这段时间里始终处于前台。`;
    } else if (elapsed >= 14) {
      message = "两条记录都在使用此时钟。其中一条早于你打开这页。";
    } else if (elapsed >= 6) {
      message = "检测到上次阅览仍未结束。两条记录暂时并行保存。";
    } else {
      message = "校时完成。正在查找上一次校验。";
    }
  }
  writeText("review-state", state);
  writeText("review-log", message);
}

function applyConclusion() {
  document.body.classList.add("returning");
  document.title = "眠相 Somna — 上次阅览尚未结束";
  byId("hero-description").replaceChildren(
    "在你睡着的时候，眠相替你留意。", document.createElement("br"),
    "你回来的时候，另一份报告已经在等你。",
  );
  const replacements = {
    "hero-line": "从头开始。",
    "hero-status": "复核已写回",
    "nav-report": "查看复核",
    "routine-copy": "设备已完成这张床的校准。下一次记录会从你刚才离开的地方继续。",
    "routine-last": "晨间摘要已覆盖。旧摘要仍由系统保留。",
    "report-copy": "这份晨间报告在你读到最后一条记录时重新生成。点击原来的时间点，核对现在归在它们下面的话。",
    "report-status": "阅览后重算",
    "report-subject": "B-041 / 来源已合并",
    "calibration-result": "通过。已按当前记录保留一位。",
    "calibration-note": "原始记录曾标注两位。此处的差异已按阅览端说明修正。",
    "appendix-label": "已撤回的附注 / B-041",
    "appendix-note": "原报告中的「使用者」指住在这个房间的人。该定义已被新记录替换。",
    "archive-note": "此画面已被读取。它仍在等你第二次经过。",
    "review-note": "终止归档后，系统把当前阅览端列为唯一有效来源。",
    "match-result": "第二段已移交给当前阅览端",
  };
  for (const [id, value] of Object.entries(replacements)) {
    byId(id).textContent = value;
  }
  writeTime(byId("hero-time"), completedAt);
  writeTime(byId("match-time"), completedAt);
  byId("reset").hidden = false;
  selectRecord(selected);
}

function finishStory() {
  if (completedAt) return;
  completedAt = Date.now();
  try {
    window.sessionStorage.setItem(storyKey, String(completedAt));
  } catch {
    // The current page still retains its ending when storage is unavailable.
  }
  applyConclusion();
  updateLiveDetails();
}

function checkScroll() {
  pendingScroll = false;
  const scrollY = Math.max(0, window.scrollY);
  const delta = scrollY - lastScrollY;
  if (Math.abs(delta) > 5) {
    direction = delta < 0 ? "向上回看" : "向下查阅";
    lastScrollY = scrollY;
  }
  const reviewBounds = review.getBoundingClientRect();
  if (reviewStartedAt === null && reviewBounds.top < window.innerHeight * .74 && reviewBounds.bottom > 0) {
    const now = performance.now();
    reviewStartedAt = totalForeground + (foregroundStartedAt === null ? 0 : now - foregroundStartedAt);
  }
  const bounds = checkpoint.getBoundingClientRect();
  if (bounds.top < window.innerHeight * .85 && bounds.bottom > 0) finishStory();
  updateLiveDetails();
}

function scheduleScrollCheck() {
  if (pendingScroll) return;
  pendingScroll = true;
  window.requestAnimationFrame(checkScroll);
}

document.addEventListener("visibilitychange", () => {
  const now = performance.now();
  if (document.hidden) {
    if (foregroundStartedAt !== null) totalForeground += now - foregroundStartedAt;
    foregroundStartedAt = null;
    pauseStartedAt = reviewStartedAt === null ? null : now;
  } else {
    foregroundStartedAt = now;
    if (pauseStartedAt !== null) lastPauseSeconds = Math.floor((now - pauseStartedAt) / 1000);
    pauseStartedAt = null;
    scheduleScrollCheck();
  }
});

byId("return").addEventListener("click", () => {
  finishStory();
  window.history.replaceState(null, "", "#home");
  document.querySelector(".brand").focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
});

byId("reset").addEventListener("click", () => {
  try {
    window.sessionStorage.removeItem(storyKey);
  } catch {
    // Reloading also clears the in-memory copy.
  }
  window.history.replaceState(null, "", "#home");
  window.scrollTo({ top: 0, behavior: "instant" });
  window.location.reload();
});

if (completedAt) applyConclusion();
window.addEventListener("scroll", scheduleScrollCheck, { passive: true });
window.addEventListener("resize", scheduleScrollCheck);
window.addEventListener("pageshow", scheduleScrollCheck);
checkScroll();
window.setInterval(updateLiveDetails, 1000);
