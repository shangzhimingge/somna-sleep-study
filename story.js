const byId = (id) => document.getElementById(id);
const chart = byId("chart");
const context = chart.getContext("2d");
const note = byId("chart-note");
const reportButtons = [...document.querySelectorAll("[data-record]")];
const comparison = byId("comparison-chart");
const comparisonContext = comparison.getContext("2d");
const nightButtons = [...document.querySelectorAll("[data-night]")];
const versionButtons = [...document.querySelectorAll("[data-version]")];
const heroPhoto = byId("hero-photo");
const review = byId("review");
const endpoint = byId("endpoint");
const checkpoint = byId("final-checkpoint");
const storyKey = "somna-b041-completed-v4";
const clock = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

const lighting = [
  { from: 20, src: "assets/night.webp", label: "夜间监测", alt: "夜色中的卧室，窗边是微弱的蓝光，床头灯亮着" },
  { from: 17, src: "assets/hero.webp", label: "睡前校准", alt: "暮色透过落地窗，照在铺着深蓝色床品的卧室里" },
  { from: 8, src: "assets/day.webp", label: "日间待机", alt: "白天的卧室，淡蓝色天空和山景映在落地窗外" },
  { from: 5, src: "assets/dawn.webp", label: "晨间回顾", alt: "清晨的卧室，落地窗外的山间还带着一层薄雾" },
];
let requestedPhoto = heroPhoto.getAttribute("src");

function updateHero(localDate) {
  writeTime(byId("hero-time"), localDate.getTime());
  const hour = localDate.getHours();
  const scene = lighting.find(({ from }) => hour >= from) || lighting[0];
  writeText("hero-status", completedAt ? "复核已写回" : scene.label);
  if (scene.src === requestedPhoto) return;

  requestedPhoto = scene.src;
  if (heroPhoto.getAttribute("src") === scene.src) return;
  const nextPhoto = new Image();
  nextPhoto.onload = () => {
    if (requestedPhoto !== scene.src) return;
    heroPhoto.src = scene.src;
    heroPhoto.alt = scene.alt;
  };
  nextPhoto.src = scene.src;
}

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
let endpointReached = false;
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
  start: "23:48　入睡点已保留。使用者已重新关联。",
  anomaly: "02:17　两条信号已归于同一位使用者。原始分轨仍可查看。",
  end: "07:24　已生成历史摘要。当前使用者记录仍在更新。",
};
const levels = [
  [0, 0], [.035, 1], [.085, 2], [.16, 1], [.205, 0], [.24, 1],
  [.29, 2], [.326, 0], [.34, 1], [.40, 2], [.47, 1], [.535, 0],
  [.56, 1], [.605, 2], [.66, 1], [.74, 2], [.79, 1], [.86, 0],
  [.895, 1], [.958, 0], [1, 0],
];
const nights = [
  { delay: 1.8, note: "第一晚 · 第二组信号平均落后 1.8 秒。" },
  { delay: .9, note: "第二晚 · 用户翻身后，第二组信号的延迟缩短到 0.9 秒。" },
  { delay: -.24, note: "第三晚 · 两次吸气几乎重合。这次，第二组信号提前了约 0.2 秒。" },
  { delay: 0, note: "第四晚 · 两条曲线完全重合。设备已找不到分开保存这两条记录的依据。" },
];
const versions = {
  published: { count: "1 人", source: "床边监测器", method: "晨间定时发布", note: "已发布版本会保留归并后的人数。" },
  original: { count: "1 人 · 2 条信号", source: "床面 / 床面以下", method: "保留两个原始通道", note: "两个通道的位置信息分别保留。" },
  merge: { count: "0 人 → 1 人", source: "床位为空 · 信号保留", method: "按最后一位使用者恢复", note: "归并规则：至少保留一位使用者。" },
};
const resumedVersion = {
  count: "1 人",
  source: "当前页面",
  method: "继续写入",
  note: "此版本已覆盖上一次发布的晨间摘要。",
};
let selected = "start";
let nightIndex = 0;
let version = "published";

function sizeCanvas(canvas, context) {
  if (!context) return;
  const { width, height } = canvas.getBoundingClientRect();
  if (width === 0 || height === 0) return;
  const density = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(width * density);
  canvas.height = Math.round(height * density);
  context.setTransform(density, 0, 0, density, 0, 0);
  return { width, height };
}

function paintChart() {
  const dimensions = sizeCanvas(chart, context);
  if (!dimensions) return;
  const { width, height } = dimensions;

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

function paintComparison() {
  const ctx = comparisonContext;
  const dimensions = sizeCanvas(comparison, ctx);
  if (!dimensions) return;
  const { width, height } = dimensions;
  const mid = height / 2;
  const inset = 2;
  ctx.strokeStyle = "#625165";
  ctx.lineWidth = 1;
  for (const level of [.23, .5, .77]) {
    ctx.beginPath();
    ctx.moveTo(inset, height * level);
    ctx.lineTo(width - inset, height * level);
    ctx.stroke();
  }

  const wave = (delay, color, dashes) => {
    ctx.beginPath();
    const steps = Math.max(1, Math.floor(width - 2 * inset));
    for (let n = 0; n <= steps; n++) {
      const time = n / steps * 22 - delay;
      const phase = time * 1.63 + .14 * Math.sin(time * .68);
      const signal = Math.sin(phase) + .18 * Math.sin(2 * phase + .8);
      const y = mid - mid * .52 * signal;
      if (n === 0) ctx.moveTo(inset, y);
      else ctx.lineTo(inset + n, y);
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.setLineDash(dashes);
    ctx.stroke();
  };
  wave(0, "#dda6b2", []);
  wave(nights[nightIndex].delay, "#a5a3b7", [4, 5]);
  ctx.setLineDash([]);
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

function selectNight(index) {
  nightIndex = index;
  for (const button of nightButtons) {
    button.setAttribute("aria-pressed", String(Number(button.dataset.night) === index));
  }
  const selectedNote = completedAt && index === 3
    ? "第四晚 · 已保留两条原始曲线。记录来源已更新为当前会话。"
    : nights[index].note;
  writeText("comparison-note", selectedNote);
  paintComparison();
}

for (const button of nightButtons) {
  button.addEventListener("click", () => selectNight(Number(button.dataset.night)));
}

function selectVersion(key) {
  version = key;
  for (const button of versionButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.version === key));
  }
  const item = completedAt && key === "published" ? resumedVersion : versions[key];
  writeText("version-count", item.count);
  writeText("version-source", item.source);
  writeText("version-method", item.method);
  writeText("version-note", item.note);
}

for (const button of versionButtons) {
  button.addEventListener("click", () => selectVersion(button.dataset.version));
}

function paintCharts() {
  paintChart();
  paintComparison();
}

if (typeof ResizeObserver === "function") {
  const resizeObserver = new ResizeObserver(paintCharts);
  resizeObserver.observe(chart);
  resizeObserver.observe(comparison);
} else {
  window.addEventListener("resize", paintCharts);
}
paintCharts();

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

function updateEndpoint(localTime) {
  const viewing = document.hidden ? "后台" : "前台";
  writeText("mirror-reader-direction", direction);
  writeText("mirror-reader-focus", viewing);
  if (!document.hidden) writeTime(byId("mirror-reader-time"), localTime);

  if (endpointReached || completedAt) {
    writeText("mirror-room-direction", direction);
    writeText("mirror-room-focus", viewing);
    if (!document.hidden) writeTime(byId("mirror-room-time"), localTime);
    writeText("mirror-note", completedAt
      ? "已核验。当前会话是唯一仍在写入的来源。"
      : "两个来源状态一致。设备仍处于离线状态。");
  }
}

function updateLiveDetails() {
  if (document.hidden) return;
  const now = performance.now();
  const liveForeground = totalForeground + (foregroundStartedAt === null ? 0 : now - foregroundStartedAt);
  const localDate = new Date();
  updateHero(localDate);
  const localTime = localDate.getTime();
  writeTime(byId("reader-time"), localTime);
  updateEndpoint(localTime);
  writeText("reader-duration", durationLabel(liveForeground));
  writeText("reader-direction", direction);

  let state = "等待关联";
  let message = "等待阅读端连接。";
  if (completedAt) {
    state = "来源已关联";
    message = direction === "向上回看"
      ? "已同步向上回看。已发布的晨间摘要发生变更。"
      : "当前阅览端正在写入。两端的时钟保持一致。";
  } else if (reviewStartedAt !== null) {
    const elapsed = Math.floor((liveForeground - reviewStartedAt) / 1000);
    state = "阅读端已连接";
    if (lastPauseSeconds > 0) {
      message = `页面曾离开前台约 ${lastPauseSeconds} 秒。另一端的写入次数仍在增加。`;
    } else if (elapsed >= 14) {
      message = "来源重复：一份记录早于当前会话开始，却在使用当前会话的时间。";
    } else if (elapsed >= 6) {
      message = "检测到重复来源。正在按当前连接核验。";
    } else {
      message = "校时完成。正在查找上一次校验。";
    }
  }
  writeText("review-state", state);
  writeText("review-log", message);
}

function applyConclusion() {
  document.body.classList.add("returning");
  document.title = "眠相 Somna — 监测中";
  byId("hero-description").replaceChildren(
    "在你睡着的时候，眠相替你留意。", document.createElement("br"),
    "当前使用者已关联。晨间摘要会在这里更新。",
  );
  const replacements = {
    "hero-line": "从头开始。",
    "nav-report": "查看复核",
    "routine-copy": "本次校准已完成。监测来源已从床边监测器迁移至当前页面。",
    "routine-last": "摘要已写回。当前使用者记录仍在更新。",
    "report-copy": "晨间摘要已重新生成。切换原来的时间点，可以核对更新后的来源。",
    "report-status": "阅览后重算",
    "report-subject": "B-041 / 当前页面",
    "help-clock": "首页与新的报告共用本地时钟。页面再次打开时，会继续使用当前时钟。",
    "calibration-result": "通过。沿用关联后的使用者人数。",
    "calibration-note": "标记已移入当前报告。旧报告的原始分轨仍然保留。",
    "ticket-state": "已自动重开",
    "ticket-footer": "工单在当前页面重新打开。原提交者已从这份工单移除。",
    "appendix-label": "已重算的附注 / B-041",
    "appendix-note": "床位人数为 0。报告人数为 1。已沿用报告人数。",
    "archive-note": "原附件仍然冻结 · 当前页面持续更新",
    "continuity-record": "已改由当前页面写入",
    "retention-mode": "持续写入",
    "retention-note": "恢复范围已更新：本次访问被恢复为一位使用者。",
    "review-note": "当前阅览端已关联为有效来源。",
    "final-result": "归并完成。原使用者已从本次监测移除。",
  };
  for (const [id, value] of Object.entries(replacements)) {
    byId(id).textContent = value;
  }
  writeTime(byId("match-time"), completedAt);
  byId("reset").hidden = false;
  selectRecord(selected);
  selectNight(nightIndex);
  selectVersion(version);
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
  const endpointBounds = endpoint.getBoundingClientRect();
  if (endpointBounds.top < window.innerHeight * .72 && endpointBounds.bottom > 0) endpointReached = true;
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
    updateEndpoint(Date.now());
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
