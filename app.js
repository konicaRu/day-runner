const STORAGE_KEY = "day-runner-state";
const DAY_END_MIN = 18 * 60;

const PRESETS = {
  classic: { work: 25, break: 5, label: "25 / 5" },
  long:    { work: 50, break: 10, label: "50 / 10" },
};
const LONG_BREAK_MIN = 15;
const SPRINTS_TO_LONG = 4;

function parseHM(hm) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function defaultState() {
  return { date: todayKey(), items: {}, timer: { presetKey: "classic", sprints: 0 } };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (parsed.date !== todayKey()) return defaultState();
    return {
      date: parsed.date,
      items: parsed.items || {},
      timer: parsed.timer || { presetKey: "classic", sprints: 0 },
    };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

let state = loadState();

function renderClock() {
  const el = document.getElementById("clock");
  const d = new Date();
  el.textContent = pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
}

function renderCountdown() {
  const el = document.getElementById("countdown");
  const d = new Date();
  const secNow = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  const secEnd = DAY_END_MIN * 60;
  const diff = secEnd - secNow;
  if (diff <= 0) {
    el.classList.add("is-over");
    el.textContent = "00:00:00";
    return;
  }
  el.classList.remove("is-over");
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  el.textContent = pad2(h) + ":" + pad2(m) + ":" + pad2(s);
}

const TYPE_LABEL = {
  plan: "План",
  focus: "Фокус",
  rest: "Отдых",
  study: "Учёба",
};

function renderSchedule() {
  const root = document.getElementById("schedule");
  root.innerHTML = "";
  SCHEDULE.forEach((block, idx) => {
    const article = document.createElement("article");
    article.className = "block";
    article.dataset.start = block.start;
    article.dataset.end = block.end;
    article.dataset.blockIdx = idx;
    if (block.type) article.dataset.type = block.type;
    article.style.animationDelay = (idx * 40) + "ms";

    const head = document.createElement("div");
    head.className = "block-head";

    const time = document.createElement("span");
    time.className = "block-time";
    time.textContent = block.start + "–" + block.end;

    const title = document.createElement("h2");
    title.className = "block-title";
    title.textContent = block.title;

    head.append(time, title);

    if (block.type) {
      const tag = document.createElement("span");
      tag.className = "block-tag tag-" + block.type;
      tag.textContent = TYPE_LABEL[block.type] || block.type;
      head.append(tag);
    }
    article.append(head);

    if (block.items && block.items.length) {
      const ul = document.createElement("ul");
      ul.className = "block-items";
      for (const item of block.items) {
        const li = document.createElement("li");
        const label = document.createElement("label");
        label.className = "check";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.id = item.id;
        cb.dataset.itemId = item.id;
        cb.dataset.blockIdx = idx;
        cb.checked = !!state.items[item.id];
        cb.addEventListener("change", onCheckboxChange);
        const box = document.createElement("span");
        box.className = "check-box";
        const text = document.createElement("span");
        text.className = "check-text";
        text.textContent = item.text;
        label.append(cb, box, text);
        li.append(label);
        ul.append(li);
      }
      article.append(ul);

      const footer = document.createElement("div");
      footer.className = "block-footer";
      const count = document.createElement("span");
      count.className = "block-count";
      const bar = document.createElement("div");
      bar.className = "block-bar";
      const fill = document.createElement("div");
      fill.className = "block-bar-fill";
      bar.append(fill);
      footer.append(count, bar);
      article.append(footer);

      updateBlockProgress(article, block);
    }

    root.append(article);
  });
}

function updateBlockProgress(article, block) {
  if (!block.items || !block.items.length) return;
  const total = block.items.length;
  const done = block.items.reduce((n, it) => n + (state.items[it.id] ? 1 : 0), 0);
  const count = article.querySelector(".block-count");
  const fill = article.querySelector(".block-bar-fill");
  if (count) count.textContent = done + "/" + total;
  if (fill) fill.style.width = (total ? (done / total) * 100 : 0) + "%";
  article.classList.toggle("is-complete", done === total && total > 0);
}

function onCheckboxChange(e) {
  const id = e.target.dataset.itemId;
  if (e.target.checked) state.items[id] = true;
  else delete state.items[id];
  state.date = todayKey();
  saveState(state);
  const idx = Number(e.target.dataset.blockIdx);
  const article = document.querySelector('.block[data-block-idx="' + idx + '"]');
  if (article) updateBlockProgress(article, SCHEDULE[idx]);
}

function maybeRollOverDay() {
  if (state.date !== todayKey()) {
    state = defaultState();
    saveState(state);
    document.querySelectorAll('.block-items input[type="checkbox"]').forEach((cb) => {
      cb.checked = false;
    });
    document.querySelectorAll(".block").forEach((el) => {
      const idx = Number(el.dataset.blockIdx);
      if (!Number.isNaN(idx)) updateBlockProgress(el, SCHEDULE[idx]);
    });
    resetTimer({ keepPreset: true, mode: "work" });
  }
}

/* ----------------- Pomodoro ----------------- */

let timer = {
  presetKey: state.timer.presetKey || "classic",
  mode: "work", // "work" | "break" | "longBreak"
  secLeft: PRESETS[state.timer.presetKey || "classic"].work * 60,
  running: false,
  sprints: state.timer.sprints || 0,
};

function modeDurationSec(mode) {
  const p = PRESETS[timer.presetKey];
  if (mode === "work") return p.work * 60;
  if (mode === "longBreak") return LONG_BREAK_MIN * 60;
  return p.break * 60;
}

function modeLabel(mode) {
  if (mode === "work") return "Фокус";
  if (mode === "longBreak") return "Длинный перерыв";
  return "Перерыв";
}

function persistTimer() {
  state.timer = { presetKey: timer.presetKey, sprints: timer.sprints };
  state.date = todayKey();
  saveState(state);
}

function advanceTimer() {
  if (timer.mode === "work") {
    timer.sprints += 1;
    persistTimer();
    if (timer.sprints % SPRINTS_TO_LONG === 0) timer.mode = "longBreak";
    else timer.mode = "break";
  } else {
    timer.mode = "work";
  }
  timer.secLeft = modeDurationSec(timer.mode);
}

function startPauseTimer() {
  timer.running = !timer.running;
  renderTimer();
}

function skipTimer() {
  advanceTimer();
  renderTimer();
}

function resetTimer(opts = {}) {
  timer.running = false;
  if (!opts.keepPreset && opts.presetKey) timer.presetKey = opts.presetKey;
  timer.mode = opts.mode || "work";
  if (opts.resetSprints) timer.sprints = 0;
  timer.secLeft = modeDurationSec(timer.mode);
  persistTimer();
  renderTimer();
}

function togglePreset() {
  const next = timer.presetKey === "classic" ? "long" : "classic";
  timer.presetKey = next;
  timer.running = false;
  timer.mode = "work";
  timer.secLeft = modeDurationSec("work");
  persistTimer();
  renderTimer();
}

function tickTimer() {
  if (!timer.running) return;
  timer.secLeft -= 1;
  if (timer.secLeft <= 0) {
    advanceTimer();
  }
}

function renderTimer() {
  const timeEl = document.getElementById("pomoTime");
  const modeEl = document.getElementById("pomoMode");
  const sprintsEl = document.getElementById("pomoSprints");
  const startBtn = document.getElementById("pomoStart");
  const presetBtn = document.getElementById("pomoPreset");
  const pomo = document.getElementById("pomodoro");

  const mm = Math.floor(timer.secLeft / 60);
  const ss = timer.secLeft % 60;
  timeEl.textContent = pad2(mm) + ":" + pad2(ss);

  modeEl.textContent = modeLabel(timer.mode);
  modeEl.className = "pomo-mode pomo-mode-" + (timer.mode === "work" ? "work" : "break");

  const inCycle = (timer.sprints % SPRINTS_TO_LONG) + (timer.mode === "work" ? 1 : 0);
  const shown = Math.min(inCycle === 0 ? SPRINTS_TO_LONG : inCycle, SPRINTS_TO_LONG);
  sprintsEl.textContent = "Спринт " + shown + " / " + SPRINTS_TO_LONG + " · всего " + timer.sprints;

  startBtn.textContent = timer.running ? "Пауза" : "Старт";
  presetBtn.textContent = PRESETS[timer.presetKey].label;

  pomo.dataset.mode = timer.mode;
  pomo.classList.toggle("is-running", timer.running);

  document.title = (timer.running ? "▶ " : "") + pad2(mm) + ":" + pad2(ss) + " · " + modeLabel(timer.mode);
}

function bindTimerUI() {
  document.getElementById("pomoStart").addEventListener("click", startPauseTimer);
  document.getElementById("pomoSkip").addEventListener("click", skipTimer);
  document.getElementById("pomoReset").addEventListener("click", () => resetTimer({ keepPreset: true, mode: timer.mode }));
  document.getElementById("pomoPreset").addEventListener("click", togglePreset);
}

/* -------------------------------------------- */

function updateBlockStates() {
  const now = nowMinutes();
  const blocks = document.querySelectorAll(".block");
  blocks.forEach((el) => {
    const s = parseHM(el.dataset.start);
    const e = parseHM(el.dataset.end);
    el.classList.remove("is-current", "is-past");
    if (now >= e) el.classList.add("is-past");
    else if (now >= s && now < e) el.classList.add("is-current");
  });
}

function tick() {
  renderClock();
  renderCountdown();
  tickTimer();
  renderTimer();
  updateBlockStates();
  maybeRollOverDay();
}

renderSchedule();
bindTimerUI();
renderTimer();
tick();
setInterval(tick, 1000);
