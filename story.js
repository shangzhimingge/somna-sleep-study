const chart = document.querySelector("#chart");
const context = chart.getContext("2d");
const note = document.querySelector("#chart-note");
const reportButtons = [...document.querySelectorAll("[data-record]")];

const records = {
  start: { position: 0, text: "23:48　检测到一位使用者入睡。" },
  anomaly: { position: 149 / 456, text: "02:17　检测到第二组呼吸。已从结算中排除。" },
  end: { position: 1, text: "07:24　监测结束。使用者未离床。" },
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
  note.textContent = records[key].text;
  note.classList.toggle("anomaly", key === "anomaly");
  paintChart();
}

for (const button of reportButtons) {
  button.addEventListener("click", () => selectRecord(button.dataset.record));
}

new ResizeObserver(paintChart).observe(chart);
paintChart();

document.querySelector("#return").addEventListener("click", () => {
  document.body.classList.add("returning");
  document.querySelector("#hero-description").replaceChildren(
    "在你睡着的时候，眠相替你留意。", document.createElement("br"),
    "我们还在等你睡着。",
  );
  const monitoring = document.querySelector(".hero-image figcaption");
  monitoring.querySelector("span:nth-child(2)").textContent = "等待入睡";
  const time = monitoring.querySelector("time");
  time.dateTime = "03:14";
  time.textContent = "03:14";
  history.replaceState(null, "", "#home");
  document.querySelector(".brand").focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
});
