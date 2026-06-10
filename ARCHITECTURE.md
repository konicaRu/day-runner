# ARCHITECTURE — структура day-runner

Static-only приложение. Никакой сборки, никакой серверной части.

## Дерево файлов

```
day-runner/
├── index.html         Разметка + подключение шрифтов и скриптов
├── styles.css         Все стили (CSS-переменные + компоненты + адаптив)
├── schedule.js        Данные расписания (правится руками)
├── app.js             Логика: часы, рендер, чекбоксы, таймер, сигналы, сохранение
├── .nojekyll          Чтобы Pages не пропускал файлы с `_` через Jekyll
├── README.md          Как запустить локально + как править расписание
├── MEMORY.md          Контекст проекта для будущих сессий
└── ARCHITECTURE.md    Этот файл
```

## Поток данных

```
                   schedule.js (const SCHEDULE)
                          │
                          ▼
    index.html  ──load──▶ app.js  ──render──▶ DOM
                          │  ▲
                          ▼  │
                   localStorage (state, sound prefs)

   Web Audio API ◀── bleep() ─── tickTimer / checkBlockChange
   Notification API ◀── notify() ──┘
```

## index.html — разметка

Минимальный HTML5:
- `<head>` подключает Google Fonts (preconnect + Manrope/JetBrains Mono) и `styles.css?v=N`.
- `<header class="topbar">` — две строки:
  - `topbar-main`: `<h1>Пульт дня</h1>` + `#date` слева, `#countdown` + `#clock` справа.
  - `topbar-now`: `#nowBlock` (пилюля с названием текущего блока) + `#nowMeta` (до смены) + справа (`margin-left: auto`) виджет счётчика резюме `#resumeWidget`: кнопки `−`/`+`, пилюля `#resumeCount` («Резюме N/цель», клик открывает поповер `#resumePop` с целью, мини-графиком, таблицей по дням и итогами).
- `<main>`:
  - `<section class="pomodoro" id="pomodoro">` — карточка-герой с SVG-кольцом, центром-таймером и двумя рядами кнопок (управление и звук).
  - `<section id="schedule" class="schedule">` — пустой контейнер, наполняется из `app.js`.
- `<script src="schedule.js?v=N">` затем `<script src="app.js?v=N">`. **Порядок важен** — `app.js` использует глобальную `SCHEDULE`.

## schedule.js — данные

Один глобальный массив `SCHEDULE`. Каждый элемент:

```js
{
  start: "13:30",   // строка "HH:MM"
  end:   "15:30",   // строка "HH:MM"
  title: "Хард-скилл",
  type:  "study",   // "plan" | "focus" | "rest" | "study" — для цвета тега
  items: [
    { id: "hard-sql",  text: "Учим SQL" },
    // ...
  ],
}
```

**ID пунктов стабильные** — по ним хранятся галочки в `localStorage`. Менять `id` = терять состояние.

## styles.css — структура

Файл логически делится на:

1. **`:root` — дизайн-токены.** Цвета (`--bg`, `--surface`, `--border`, `--text*`, `--accent*`, `--tag-*-bg/fg`), радиусы, тени, шрифты, ширина контейнера, единая `--transition`.
2. **Базовые сбросы** (`*`, `html, body`).
3. **`.topbar`** + `topbar-row` + `topbar-main` / `topbar-now` — липкая шапка с blur-фоном, пилюлями.
4. **`.countdown`** — пилюля до 18:00 (через `::before` подставляет «до 18:00 »).
5. **`.pomodoro`** — карточка-герой:
   - `.pomo-head` — режим + спринты сверху.
   - `.pomo-ring-wrap` + SVG `.pomo-ring` с `.pomo-ring-track` (фоновое кольцо) и `.pomo-ring-fill` (прогресс). Цвет `.pomo-ring-fill` зависит от `data-mode` на родителе.
   - `.pomo-ring-center` — абсолютно отцентрованный блок с `.pomo-time` и `.pomo-time-meta`.
   - `.pomo-controls` (Старт/Пропуск/Сброс/Пресет) и `.pomo-sound` (Звук/Селект/Загрузить/Тест/Уведомления). Кнопки `.pomo-btn` с модификаторами `.pomo-btn-primary` / `.pomo-btn-ghost` / `.is-off`.
6. **`.block`** — карточка блока расписания: `.block-head` (время + заголовок + цветной тег `.block-tag.tag-*`), `.block-items` со связкой `.check` + `.check-box` + `.check-text` (кастомный чекбокс), `.block-footer` с `.block-count` и `.block-bar`/`.block-bar-fill`. Состояния: `.is-current`, `.is-past`, `.is-complete`.
7. **`@keyframes cardIn`** + анимация появления карточек (применяется к `.pomodoro` и `.block` с `animation-delay` из JS).
8. **Адаптив:** `@media (max-width: 720px)` и `(max-width: 420px)` — уменьшаются кольцо, шрифты, паддинги.

## app.js — модули

Один файл, разбит секциями. Сверху вниз:

### 1. Константы
- `STORAGE_KEY = "day-runner-state"`
- `DAY_END_MIN = 18 * 60`
- `SOUND_*_KEY` — ключи `localStorage` для звуковых настроек.
- `PRESETS = { classic: {work:25, break:5}, long: {work:50, break:10} }`
- `LONG_BREAK_MIN = 15`, `SPRINTS_TO_LONG = 4`
- `SOUND_FILE_MAX_BYTES = 1_000_000`
- `RING_RADIUS = 104`, `RING_CIRC = 2π * RING_RADIUS`

### 2. Утилиты
- `parseHM(hm)` → минуты от 0:00 (для строк `"HH:MM"`).
- `nowMinutes()` → минуты от текущей полуночи.
- `pad2(n)` → `"05"` / `"42"`.
- `todayKey()` → `"YYYY-MM-DD"` (локальное время).
- `formatHumanDuration(sec)` → `"1ч 6м"` / `"23м"` / `"45с"`.

### 3. Хранилище (`localStorage`)
- `defaultState()` — пустой объект `{date, items, timer}`.
- `loadState()` — читает и валидирует дату; если день сменился — возвращает `defaultState()`.
- `saveState(state)` — `JSON.stringify` + `setItem`, всё в `try/catch`.

Глобал: `let state = loadState()` при загрузке.

### 4. Шапка и часы
- `renderClock()` — обновляет `#clock`.
- `renderCountdown()` — обратный отсчёт до `DAY_END_MIN`, ставит `.is-over` если время вышло.
- `renderHeader()` — дата (через `Intl.DateTimeFormat('ru-RU', ...)`) + «сейчас по плану» с цветной пилюлей по `data-type` и человеческим отсчётом до смены блока.

### 4.5 Счётчик резюме

Хранится в `localStorage` отдельным ключом `day-runner-resumes` = `{ goal, days: { "YYYY-MM-DD": n } }`. **Не сбрасывается в новый день** — наоборот, копится история по датам.

- `loadResumes()` / `saveResumes()` — чтение/запись с валидацией.
- `resumesToday()` — счётчик за сегодня (`days[todayKey()] || 0`).
- `dateKeyOffset(offset)` — ключ даты со сдвигом в днях (для сумм за 7 дней и графика).
- `formatDayShort(key)` — `"ср, 10 июн."` через `Intl`.
- `addResume(delta)` — инкремент/декремент за сегодня (не ниже 0), bump-анимация пилюли при «+».
- `renderResumeCounter()` — текст пилюли `N/goal` + класс `.is-goal` (зелёная при достижении цели). Дёргается в `tick()` (дёшево, заодно обрабатывает смену дня).
- `renderResumePop()` — мини-график за 14 дней (столбики, сегодня — акцент, дни с целью — зелёные), таблица «дата → число → ✓», суммы за 7 дней и за всё время.
- `toggleResumePop(force)` / `onResumeGoalChange(e)` / `bindResumeUI()` — открытие/закрытие (клик по пилюле, Esc, клик мимо), изменение цели (1–99).

Плавающее окно (Document Picture-in-Picture, Chrome/Edge 116+):

- `pipSupported()` — проверка `"documentPictureInPicture" in window`; если нет — кнопка `#resumePip` скрывается.
- `openResumePipWindow()` — `requestWindow({width, height})`, инжектит `PIP_CSS` и разметку (число `#pipNum`, кнопки `#pipMinus`/`#pipPlus`), вешает обработчики на тот же `addResume()` — окно и страница живут в одном JS-контексте, синхронизация бесплатная. `pagehide` обнуляет `pipWin`.
- `toggleResumePipWindow()` — тумблер по кнопке `#resumePip` (класс `.is-on` пока окно открыто).
- `renderResumeCounter()` обновляет и пилюлю на странице, и `#pipNum` в PiP-окне (плюс класс `is-goal` на его `<body>`).
- Окно закрывается вместе со вкладкой day-runner — вкладка должна оставаться открытой (можно в фоне).

Автозапись `STATS.md` в репозиторий (GitHub Contents API):

- Токен (fine-grained PAT, Contents: write на этот репо) пользователь вставляет в поле в поповере; хранится в `localStorage` (`day-runner-gh-token`), **в код и репо не попадает**.
- `buildStatsMarkdown()` — markdown-таблица «дата → количество» по всем дням + строка «Итого».
- `syncStatsNow()` — GET (узнать `sha` файла, 404 = создаём) → PUT с base64-контентом. Каждый PUT = коммит в `main` (и пересборка Pages — поэтому пишем не на каждый клик).
- `scheduleStatsSync()` — дебаунс: вызывается из `addResume()`, реальный синк через 2 минуты после последнего клика.
- `GH_SYNCED_KEY` — снапшот `days` на момент последнего удачного синка; при загрузке страницы, если данные отличаются, досинхронизация через 8 секунд (закрыл вкладку до таймера — ничего не теряется).
- Кнопка «Синк» — немедленная запись. Статус/ошибки — строкой под полем (`#ghSyncStatus`).

### 5. Сигналы (звук + уведомления)
- `ensureAudio()` — ленивая инициализация `AudioContext`.
- `playTone(freq, offset, dur, gain, type)` — один осциллятор с экспоненциальным гейном.
- `playPreset(name)` — switch по 5 встроенным пресетам (`bleep` / `chime` / `ding` / `triple` / `low`), каждый — комбинация `playTone`.
- `playCustom()` — `new Audio(dataURL)` для загруженного файла.
- `bleep()` — главный вход: проверяет `soundOn`, вызывает либо `playCustom`, либо `playPreset`.
- `notify(title, body)` — `new Notification(...)` если разрешено; всё в `try/catch`.
- `toggleSound`, `requestNotify`, `updateSoundBtn`, `updateNotifyBtn`, `updateSoundFileLabel`, `onSoundPresetChange`, `onSoundFile`, `onSoundTest`, `bindSignalsUI`.

### 6. Pomodoro

Глобальное состояние в памяти:

```js
timer = {
  presetKey: "classic" | "long",
  mode: "work" | "break" | "longBreak",
  secLeft: number,
  running: boolean,
  sprints: number,
}
```

При загрузке `presetKey` и `sprints` восстанавливаются из `state.timer`. `mode` всегда стартует с `"work"`, `secLeft` = полная длительность фокуса (это намеренное упрощение: не персистим текущее `secLeft`, чтобы не делать вычисление дельты при ребуте; см. также пункт «Что осталось» в `MEMORY.md`).

Функции:
- `modeDurationSec(mode)` — длительность текущего режима в секундах.
- `modeLabel(mode)` — «Фокус» / «Перерыв» / «Длинный перерыв».
- `persistTimer()` — пишет `presetKey` и `sprints` в `state.timer` → `saveState`.
- `advanceTimer()` — переход work→(break|longBreak)→work с инкрементом спринтов.
- `startPauseTimer`, `skipTimer`, `resetTimer(opts)`, `togglePreset`.
- `tickTimer()` — `secLeft--`, при нуле `advanceTimer()` + `bleep()` + `notify(...)`.
- `renderTimer()` — обновляет цифры, режим, спринты, заголовок вкладки, длину `stroke-dashoffset` SVG-кольца, классы `.is-running` и `data-mode` на карточке.
- `bindTimerUI()` — навешивает обработчики на кнопки.

### 7. Расписание
- `currentBlockIdx()` — индекс текущего блока по `nowMinutes()` или `-1`.
- `lastBlockIdx` — кеш для детекции смены блока.
- `checkBlockChange()` — если индекс сменился, `bleep()` + `notify("Время сменить блок", ...)`.
- `renderSchedule()` — главный рендер: создаёт `<article class="block">` для каждого блока с временем, заголовком, цветным тегом, чекбоксами, прогресс-баром. На каждый чекбокс вешает `onCheckboxChange`.
- `onCheckboxChange(e)` — пишет/удаляет `state.items[id]`, сохраняет, обновляет прогресс карточки.
- `updateBlockProgress(article, block)` — `N/M` + ширина `.block-bar-fill` + класс `.is-complete`.
- `updateBlockStates()` — каждую секунду тасует `.is-current` / `.is-past` по времени.
- `maybeRollOverDay()` — если `state.date !== todayKey()`, сбрасывает state и таймер (без сноса дизайна).
- `TYPE_LABEL` — карта `type → русский лейбл` для тегов.

### 8. Главный цикл
```js
function tick() {
  renderClock();
  renderCountdown();
  renderHeader();
  tickTimer();
  renderTimer();
  updateBlockStates();      // внутри вызывает checkBlockChange
  maybeRollOverDay();
}
renderSchedule();
bindTimerUI();
bindSignalsUI();
renderTimer();
tick();
setInterval(tick, 1000);    // один тикер на всё
```

Один `setInterval` на 1 секунду тянет всё приложение — таймер, часы, отсчёты, проверку дня, проверку смены блока. Простота важнее точности (для секундного шага этого хватает).

## Деплой

GitHub Pages из ветки `main`, папка `/` (root). Включается один раз через Settings → Pages в браузере.

Воркфлоу: `git add . && git commit -m "..." && git push` — Pages пересобирает ~30–60 секунд. Если поменялся CSS/JS, **обязательно бампнуть `?v=N` во всех трёх ссылках в `index.html`**, иначе у пользователя останется кешированная версия.
