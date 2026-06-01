const STORAGE_KEY = "day-runner-state";
const DAY_END_MIN = 18 * 60;

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

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { date: todayKey(), items: {} };
    const parsed = JSON.parse(raw);
    if (parsed.date !== todayKey()) return { date: todayKey(), items: {} };
    return { date: parsed.date, items: parsed.items || {} };
  } catch {
    return { date: todayKey(), items: {} };
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

function renderSchedule() {
  const root = document.getElementById("schedule");
  root.innerHTML = "";
  for (const block of SCHEDULE) {
    const article = document.createElement("article");
    article.className = "block";
    article.dataset.start = block.start;
    article.dataset.end = block.end;

    const head = document.createElement("div");
    head.className = "block-head";
    const time = document.createElement("span");
    time.className = "block-time";
    time.textContent = block.start + "–" + block.end;
    const title = document.createElement("span");
    title.className = "block-title";
    title.textContent = block.title;
    head.append(time, title);
    article.append(head);

    if (block.items && block.items.length) {
      const ul = document.createElement("ul");
      ul.className = "block-items";
      for (const item of block.items) {
        const li = document.createElement("li");
        const label = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.id = item.id;
        cb.dataset.itemId = item.id;
        cb.checked = !!state.items[item.id];
        cb.addEventListener("change", onCheckboxChange);
        const span = document.createElement("span");
        span.textContent = item.text;
        label.append(cb, span);
        li.append(label);
        ul.append(li);
      }
      article.append(ul);
    }

    root.append(article);
  }
}

function onCheckboxChange(e) {
  const id = e.target.dataset.itemId;
  if (e.target.checked) state.items[id] = true;
  else delete state.items[id];
  state.date = todayKey();
  saveState(state);
}

function maybeRollOverDay() {
  if (state.date !== todayKey()) {
    state = { date: todayKey(), items: {} };
    saveState(state);
    document.querySelectorAll('.block-items input[type="checkbox"]').forEach((cb) => {
      cb.checked = false;
    });
  }
}

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
  updateBlockStates();
  maybeRollOverDay();
}

renderSchedule();
tick();
setInterval(tick, 1000);
