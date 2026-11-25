const byId = (id) => document.getElementById(id);
const chart = byId("chart");
const context = chart.getContext("2d");
const note = byId("chart-note");
const reportButtons = [...document.querySelectorAll("[data-record]")];
const heroPhoto = byId("hero-photo");
const checkpoint = byId("final-checkpoint");
const storyKey = "somna-b041-session-v5";
const clock = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

const lighting = [
  { from: 20, src: "assets/night.webp", label: "夜间监测", alt: "夜色中的卧室，窗边是微弱的蓝光，床头灯亮着" },
  { from: 17, src: "assets/hero.webp", label: "睡前准备", alt: "暮色透过落地窗，照在铺着深蓝色床品的卧室里" },
  { from: 8, src: "assets/day.webp", label: "日间待机", alt: "白天的卧室，落地窗外是淡蓝色天空和山景" },
  { from: 5, src: "assets/dawn.webp", label: "晨间回顾", alt: "清晨的卧室，落地窗外的山间带着一层薄雾" },
];

const records = {
  start: { position: 0, time: "23:48", text: "检测到一位使用者入睡。", revised: "你打开了这页。旧报告的入睡时间已被替换。" },
  anomaly: { position: 149 / 456, time: "02:17", text: "有一段信号暂时无法判定，已另存为附注。", revised: "你开始向下翻。原来那段标记已被替换。" },
  end: { position: 1, time: "07:24", text: "监测结束，已生成晨间摘要。", revised: "你读到了页面末尾。报告仍在更新。" },
};
const levels = [
  [0, 0], [.035, 1], [.085, 2], [.16, 1], [.205, 0], [.24, 1],
  [.29, 2], [.326, 0], [.34, 1], [.40, 2], [.47, 1], [.535, 0],
  [.56, 1], [.605, 2], [.66, 1], [.74, 2], [.79, 1], [.86, 0],
  [.895, 1], [.958, 0], [1, 0],
];

function restoreSession() {
  try {
    const data = JSON.parse(window.sessionStorage.getItem(storyKey));
    const isTimestamp = (value) => Number.isFinite(value) && value > 0 && Number.isFinite(new Date(value).getTime());
    return data && [data.openedAt, data.firstScrollAt, data.completedAt].every(isTimestamp) ? data : null;
  } catch {
    return null;
  }
}

const restored = restoreSession();
const openedAt = restored?.openedAt ?? Date.now();
let firstScrollAt = restored?.firstScrollAt ?? 0;
let completedAt = restored?.completedAt ?? 0;
let requestedPhoto = heroPhoto.getAttribute("src");
let selected = "start";
let scrollPosition = Math.max(0, window.scrollY);
let direction = "向下阅读";
let scrollCheckPending = false;

function writeText(id, value) {
  const element = byId(id);
  if (element.textContent !== value) element.textContent = value;
}

function writeTime(id, value) {
  const date = new Date(value);
  const element = byId(id);
  const display = clock.format(date);
  if (element.textContent !== display) {
    element.textContent = display;
    element.dateTime = date.toISOString();
  }
}

function updateHero(localDate) {
  writeTime("hero-time", localDate.getTime());
  const scene = lighting.find(({ from }) => localDate.getHours() >= from) || lighting[0];
  writeText("hero-status", completedAt ? "本页正在记录" : scene.label);
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

function recordTimes() {
  return { start: openedAt, anomaly: firstScrollAt || completedAt, end: completedAt };
}

function selectRecord(key) {
  selected = key;
  for (const button of reportButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.record === key));
  }
  const record = records[key];
  const time = completedAt ? clock.format(recordTimes()[key]) : record.time;
  note.textContent = time + "　" + (completedAt ? record.revised : record.text);
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

function elapsedLabel(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

function updateClockAndStatus() {
  if (document.hidden) return;
  const localDate = new Date();
  const now = localDate.getTime();
  const duration = elapsedLabel(now - openedAt);
  updateHero(localDate);
  writeTime("reader-time", now);
  writeText("reader-duration", duration);
  writeText("reader-direction", direction);
  if (completedAt) writeText("report-duration", duration);
}

function rewritePage() {
  document.body.classList.add("returning");
  document.title = "眠相 Somna — 你的报告正在更新";
  byId("hero-description").replaceChildren(
    "床边设备已经关了。", document.createElement("br"),
    "只要你还在这页，记录就会继续。",
  );
  const replacements = {
    "hero-line": "回来再看。",
    "nav-report": "查看你的报告",
    "hero-action": "查看设备状态",
    "hero-demo": "看这次访问的报告",
    "benefit-device": "不用设备",
    "benefit-device-copy": "打开这页就会继续记录",
    "benefit-morning": "不用等醒来",
    "benefit-morning-copy": "你的摘要正在生成",
    "benefit-stop": "设备可以停",
    "benefit-stop-copy": "这页接着记录",
    "product-title": "设备已关闭。仍有一位使用者。",
    "product-detail": "上一位使用者来自这间卧室。现在，报告用的是本次打开页面的时间。",
    "product-caption": "设备已关闭",
    "product-place": "本次记录已转到当前页面。",
    "product-power": "设备停止供电。页面端仍有新的记录。",
    "routine-title": "这一次，你已经开始了。",
    "routine-copy": "晨间报告沿用了原来的曲线，把时间换成了你刚才的操作。",
    "routine-open-label": "你打开了这页",
    "routine-open-detail": "这一刻替换了旧报告里的开机时间。",
    "routine-start-label": "你第一次向下翻",
    "routine-start-detail": "原来的入睡点被记到了这里。",
    "routine-end-label": "你滑到了页面末尾",
    "routine-end-detail": "旧报告只有一位使用者，这份也是。",
    "report-title": "这次访问，已经写进报告。",
    "report-copy": "曲线还和昨晚一样。试试点记录里的时间，这次它们对应的是你刚才的操作。",
    "sample-label": "当前报告 B-041 · 这次访问",
    "report-status": "仍在记录",
    "report-subject": "当前页面 · 一位使用者",
    "report-duration-label": "这次页面停留",
    "report-start-label": "你打开此页",
    "report-start-time": clock.format(openedAt),
    "control-title": "按一下，设备就停。",
    "control-copy": "设备已按要求关闭。新的记录现在写在这份网页报告里。",
    "control-status": "由本页继续",
    "control-history": "本次访问已加入",
    "help-stop": "关机后，设备端停止采集。当前报告正在由这页继续写入。",
    "help-people": "每份报告只留一位使用者。当前这份报告保留了翻到结尾的那一位。",
    "help-clock": "首页显示现在的时间。报告里用的是你打开页面、向下翻和滑到底的时间。",
    "offer-title": "你的晨间报告已经在这里。",
    "offer-copy": "仍然是一晚、一位使用者、一份摘要。这次打开的是你刚才读到末尾的那一份。",
    "offer-action": "打开你的报告",
    "notes-footer": "卧室的三条原始记录已保留。本页正在接着最后一条写入。",
    "archive-note": "卧室画面停在这一帧",
    "session-note": "页面已关联。往回翻也会写入当前记录。",
    "final-result": "首页的晨间报告已更新。回去查看。",
  };
  for (const [id, value] of Object.entries(replacements)) writeText(id, value);
  const times = recordTimes();
  for (const button of reportButtons) button.textContent = clock.format(times[button.dataset.record]);
  writeTime("routine-open", openedAt);
  writeTime("routine-start", firstScrollAt || completedAt);
  writeTime("routine-end", completedAt);
  writeTime("match-time", completedAt);
  byId("power-faq").open = true;
  byId("reset").hidden = false;
  selectRecord(selected);
}

function finishStory() {
  if (completedAt) return;
  completedAt = Date.now();
  firstScrollAt ||= completedAt;
  try {
    window.sessionStorage.setItem(storyKey, JSON.stringify({ openedAt, firstScrollAt, completedAt }));
  } catch {
    // The ending is still available in this document when storage is disabled.
  }
  rewritePage();
  updateClockAndStatus();
}

function checkScroll() {
  scrollCheckPending = false;
  const nextPosition = Math.max(0, window.scrollY);
  const delta = nextPosition - scrollPosition;
  if (Math.abs(delta) > 5) {
    direction = delta > 0 ? "向下阅读" : "正在往回翻";
    if (delta > 0 && !firstScrollAt) firstScrollAt = Date.now();
    scrollPosition = nextPosition;
  }
  if (!completedAt) {
    const bounds = checkpoint.getBoundingClientRect();
    if (bounds.top < window.innerHeight * .85 && bounds.bottom > 0) finishStory();
  }
  updateClockAndStatus();
}

function scheduleScrollCheck() {
  if (scrollCheckPending) return;
  scrollCheckPending = true;
  window.requestAnimationFrame(checkScroll);
}

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
    // Reloading also clears the current document's state.
  }
  window.history.replaceState(null, "", "#home");
  window.scrollTo({ top: 0, behavior: "instant" });
  window.location.reload();
});

if (completedAt) rewritePage();
paintChart();
window.addEventListener("scroll", scheduleScrollCheck, { passive: true });
window.addEventListener("resize", scheduleScrollCheck);
window.addEventListener("pageshow", scheduleScrollCheck);
document.addEventListener("visibilitychange", scheduleScrollCheck);
checkScroll();
window.setInterval(updateClockAndStatus, 1000);
