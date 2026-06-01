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
