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

function renderClock() {
  const el = document.getElementById("clock");
  const d = new Date();
  el.textContent = pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
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
  updateBlockStates();
}

renderSchedule();
tick();
setInterval(tick, 1000);
