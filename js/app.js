(function () {
  'use strict';

  // ---------- Помощники ----------
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const view = $('#view');
  const dlg = $('#dlg');

  const SEASON = {};
  SEASONS.forEach((s) => { SEASON[s.id] = s; });
  const SIDX = { sp: 0, su: 1, fa: 2, wi: 3 };
  const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const CROP = {};
  CROPS.forEach((c) => { CROP[c.id] = c; });
  const VILL = {};
  VILLAGERS.forEach((v) => { VILL[v.id] = v; });
  const PLACE = {};
  MAP_PLACES.forEach((p) => { PLACE[p.id] = p; });

  const SPEEDS = [
    { v: 0, t: 'Без удобрения' },
    { v: 0.1, t: 'Speed-Gro (−10%)' },
    { v: 0.25, t: 'Deluxe Speed-Gro (−25%)' },
    { v: 0.33, t: 'Hyper Speed-Gro (−33%)' }
  ];

  function seasonTags(list) {
    if (list.length === 4) return '<span class="tag all">Круглый год</span>';
    return list.map((id) => '<span class="tag ' + id + '">' + SEASON[id].ru + '</span>').join('');
  }
  function absToSD(abs) {
    return { si: Math.floor((abs - 1) / 28), day: ((abs - 1) % 28) + 1 };
  }
  function fmtAbs(abs) {
    const d = absToSD(abs);
    return SEASONS[d.si].ru + ' ' + d.day;
  }
  function fmtSD(season, day) { return SEASON[season].ru + ' ' + day; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function fmtNum(n) { return n.toLocaleString('ru-RU'); }

  // ---------- Хранилище ----------
  const KEY = 'sv-cheatsheet-v1';
  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY));
      if (o && Array.isArray(o.plans) && Array.isArray(o.notes)) return o;
    } catch (e) { /* нет данных */ }
    return { plans: [], notes: [] };
  }
  let store = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* хранилище недоступно */ }
  }

  // ---------- Диалог ----------
  function openDlg(title, html, mount) {
    dlg.innerHTML =
      '<div class="dlg-head"><h2>' + esc(title) + '</h2>' +
      '<button class="dlg-close" type="button" aria-label="Закрыть">✕</button></div>' +
      '<div class="dlg-body">' + html + '</div>';
    $('.dlg-close', dlg).addEventListener('click', () => dlg.close());
    if (mount) mount(dlg);
    if (!dlg.open) dlg.showModal();
  }
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  // ---------- Рост культур ----------
  function planInfo(p) {
    const c = CROP[p.crop];
    const si = SIDX[p.season];
    const start = si * 28 + p.day;
    const pct = Math.min(0.5, (p.speed || 0) + (p.agri ? 0.1 : 0));
    const days = Math.max(1, Math.ceil(c.grow * (1 - pct)));
    let lastAbs = 112;
    if (!p.indoor) {
      let k = si;
      while (k < 3 && c.seasons.indexOf(SEASONS[k + 1].id) !== -1) k++;
      lastAbs = (k + 1) * 28;
    }
    const inSeason = p.indoor || c.seasons.indexOf(p.season) !== -1;
    const hv = [];
    let t = start + days;
    while (t <= lastAbs) {
      hv.push(t);
      if (!c.regrow) break;
      t += c.regrow;
    }
    return { c: c, start: start, days: days, hv: hv, lastAbs: lastAbs, inSeason: inSeason, pct: pct };
  }

  function goldPerDay(c) {
    let harv = 1;
    if (c.regrow > 0) harv = 1 + Math.floor((28 - c.grow) / c.regrow);
    if (harv < 1) harv = 1;
    const total = c.grow + (harv - 1) * c.regrow;
    return (harv * c.qty * c.sell - (c.seed || 0)) / total;
  }

  // ---------- Форма посадки ----------
  function plantFormHTML() {
    return '<form class="form" id="plant-form">' +
      '<div class="two">' +
      '<label class="field">Сезон<select name="season">' +
      SEASONS.map((s) => '<option value="' + s.id + '">' + s.ru + '</option>').join('') + '</select></label>' +
      '<label class="field">День<input type="number" name="day" min="1" max="28" required></label>' +
      '</div>' +
      '<label class="field">Культура<select name="crop"></select></label>' +
      '<div class="two">' +
      '<label class="field">Растений<input type="number" name="qty" min="1" max="999" value="1"></label>' +
      '<label class="field">Удобрение<select name="speed">' +
      SPEEDS.map((s) => '<option value="' + s.v + '">' + s.t + '</option>').join('') + '</select></label>' +
      '</div>' +
      '<label class="field inline"><input type="checkbox" name="agri"> Профессия «Земледелец» (−10% к росту)</label>' +
      '<label class="field inline"><input type="checkbox" name="indoor"> Теплица, горшок или Остров Имбиря</label>' +
      '<p class="hint" id="plant-hint"></p>' +
      '<button class="btn" type="submit">Добавить в календарь</button>' +
      '</form>';
  }

  function bindPlantForm(form, o, onDone) {
    const f = form.elements;
    f.season.value = o.season;
    f.day.value = o.day;

    function fillCrops(selected) {
      const season = f.season.value;
      const all = f.indoor.checked;
      const list = CROPS.filter((c) => all || c.seasons.indexOf(season) !== -1);
      f.crop.innerHTML = list.map((c) => '<option value="' + c.id + '">' + c.emoji + ' ' + esc(c.ru) + '</option>').join('');
      if (selected && list.some((c) => c.id === selected)) f.crop.value = selected;
    }
    function current() {
      return {
        crop: f.crop.value, season: f.season.value, day: Math.min(28, Math.max(1, parseInt(f.day.value, 10) || 1)),
        qty: Math.max(1, parseInt(f.qty.value, 10) || 1), speed: parseFloat(f.speed.value) || 0,
        agri: f.agri.checked, indoor: f.indoor.checked
      };
    }
    function preview() {
      const hint = $('#plant-hint', form);
      if (!f.crop.value) { hint.textContent = ''; hint.className = 'hint'; return; }
      const p = current();
      const info = planInfo(p);
      const approx = info.pct > 0 ? '≈ ' : '';
      if (!info.hv.length) {
        hint.className = 'hint bad';
        hint.textContent = 'Не успеет вырасти: до конца сезона ' + (info.lastAbs - info.start) + ' дн., нужно ' + info.days + '. Растение засохнет.';
        return;
      }
      hint.className = 'hint';
      let t = 'Первый урожай: ' + approx + fmtAbs(info.hv[0]) + ' (через ' + info.days + ' дн.).';
      if (info.c.regrow) t += ' Дальше каждые ' + info.c.regrow + ' дн., всего сборов: ' + info.hv.length + '.';
      hint.textContent = t;
    }

    fillCrops(o.crop);
    f.season.addEventListener('change', () => { fillCrops(f.crop.value); preview(); });
    f.indoor.addEventListener('change', () => { fillCrops(f.crop.value); preview(); });
    ['crop', 'day', 'qty', 'speed', 'agri'].forEach((n) => f[n].addEventListener('input', preview));
    preview();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!f.crop.value) return;
      const p = current();
      p.id = uid();
      store.plans.push(p);
      save();
      if (onDone) onDone(p);
    });
  }

  function openPlantDialog(o, onDone) {
    openDlg('Посадка в календаре', plantFormHTML(), (d) => bindPlantForm($('#plant-form', d), o, onDone));
  }

  // ---------- Календарь ----------
  let calSeason = 'sp';

  function eventsFor(season, day) {
    const si = SIDX[season];
    const abs = si * 28 + day;
    const out = { bd: [], fs: [], pl: [], hv: [], nt: [] };
    VILLAGERS.forEach((v) => { if (v.season === season && v.day === day) out.bd.push(v); });
    FESTIVALS.forEach((f) => { if (f.season === season && f.days.indexOf(day) !== -1) out.fs.push(f); });
    store.plans.forEach((p) => {
      if (p.season === season && p.day === day) out.pl.push(p);
      const info = planInfo(p);
      if (info.hv.indexOf(abs) !== -1) out.hv.push({ p: p, info: info });
    });
    store.notes.forEach((n) => { if (n.season === season && n.day === day) out.nt.push(n); });
    return out;
  }

  function renderCalendar() {
    const s = SEASON[calSeason];
    let cells = '';
    DOW.forEach((d) => { cells += '<div class="dow">' + d + '</div>'; });
    for (let d = 1; d <= 28; d++) {
      const ev = eventsFor(calSeason, d);
      const chips = [];
      ev.fs.forEach((f) => chips.push('<span class="ev fs">🎪<span class="t"> ' + esc(f.ru) + '</span></span>'));
      ev.bd.forEach((v) => chips.push('<span class="ev bd">🎂<span class="t"> ' + esc(v.ru) + '</span></span>'));
      ev.hv.forEach((h) => chips.push('<span class="ev hv">' + h.info.c.emoji + '<span class="t"> Урожай: ' + esc(h.info.c.ru) + '</span></span>'));
      ev.pl.forEach((p) => chips.push('<span class="ev pl">🌱<span class="t"> ' + esc(CROP[p.crop].ru) + '</span></span>'));
      ev.nt.forEach((n) => chips.push('<span class="ev nt">📝<span class="t"> ' + esc(n.text) + '</span></span>'));
      const shown = chips.slice(0, 3).join('');
      const more = chips.length > 3 ? '<span class="more">ещё ' + (chips.length - 3) + '</span>' : '';
      cells += '<button type="button" class="day ' + calSeason + '" data-day="' + d + '" aria-label="' + s.ru + ' ' + d + '">' +
        '<span class="d">' + d + '</span>' + shown + more + '</button>';
    }

    view.innerHTML =
      '<h1>Календарь</h1>' +
      '<p class="lead">Дни рождения и праздники уже на месте. Нажмите на день, чтобы посадить культуру, и календарь покажет, когда созреет урожай. Записи хранятся в вашем браузере.</p>' +
      '<div class="cal-head"><div class="season-tabs chips" role="group" aria-label="Сезон">' +
      SEASONS.map((x) => '<button type="button" class="chip ' + x.id + '" data-season="' + x.id + '" aria-pressed="' + (x.id === calSeason) + '">' + x.emoji + ' ' + x.ru + '</button>').join('') +
      '</div><button type="button" class="btn" id="add-plant">Посадить культуру</button></div>' +
      '<div class="board"><div class="board-title">' + s.emoji + ' ' + s.ru + '</div><div class="grid">' + cells + '</div></div>' +
      '<div class="legend"><span class="ev bd">🎂 День рождения</span><span class="ev fs">🎪 Праздник</span><span class="ev pl">🌱 Посадка</span><span class="ev hv">🧺 Урожай</span><span class="ev nt">📝 Заметка</span></div>' +
      '<section class="plans panel" aria-labelledby="plans-h"><h2 id="plans-h" style="margin-top:0">Мои посадки</h2><div id="plans"></div>' +
      '<div class="backup"><button type="button" class="btn ghost small" id="exp">Сохранить в файл</button>' +
      '<button type="button" class="btn ghost small" id="imp">Загрузить из файла</button>' +
      '<button type="button" class="btn danger small" id="clr">Очистить всё</button>' +
      '<input type="file" id="imp-file" accept="application/json" hidden></div></section>';

    view.querySelectorAll('[data-season]').forEach((b) => b.addEventListener('click', () => { calSeason = b.dataset.season; renderCalendar(); }));
    view.querySelectorAll('.day').forEach((b) => b.addEventListener('click', () => openDay(parseInt(b.dataset.day, 10))));
    $('#add-plant').addEventListener('click', () => openPlantDialog({ season: calSeason, day: 1 }, afterPlant));
    renderPlans();
    bindBackup();
  }

  function afterPlant(p) {
    calSeason = p.season;
    if (dlg.open) dlg.close();
    if (location.hash !== '#calendar') location.hash = '#calendar'; else renderCalendar();
  }

  function renderPlans() {
    const box = $('#plans');
    if (!store.plans.length) {
      box.innerHTML = '<p class="muted">Посадок пока нет. Нажмите «Посадить культуру» или кнопку «В календарь» в разделе «Культуры».</p>';
      return;
    }
    const sorted = store.plans.slice().sort((a, b) => (SIDX[a.season] * 28 + a.day) - (SIDX[b.season] * 28 + b.day));
    box.innerHTML = sorted.map((p) => {
      const info = planInfo(p);
      const c = info.c;
      let sub;
      if (!info.hv.length) {
        sub = '<span class="bad">Не успеет вырасти до конца сезона и засохнет.</span>';
      } else {
        const list = info.hv.slice(0, 6).map(fmtAbs).join(', ') + (info.hv.length > 6 ? '…' : '');
        sub = 'Урожай: ' + list;
        if (!p.indoor && c.seasons.indexOf(p.season) === -1) sub += ' · не сезон';
      }
      const meta = [p.indoor ? 'теплица' : '', p.speed ? SPEEDS.filter((x) => x.v === p.speed)[0].t : '', p.agri ? 'Земледелец' : ''].filter(Boolean).join(', ');
      return '<div class="plan"><div><b>' + c.emoji + ' ' + esc(c.ru) + '</b> × ' + p.qty +
        ' · посадка ' + fmtSD(p.season, p.day) + (meta ? ' · ' + esc(meta) : '') +
        '<div class="sub">' + sub + '</div></div>' +
        '<button type="button" class="btn danger small" data-del="' + p.id + '">Убрать</button></div>';
    }).join('');
    box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      store.plans = store.plans.filter((p) => p.id !== b.dataset.del);
      save();
      renderCalendar();
    }));
  }

  function bindBackup() {
    $('#exp').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'stardew-calendar.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    const file = $('#imp-file');
    $('#imp').addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const fl = file.files[0];
      if (!fl) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const o = JSON.parse(r.result);
          if (!o || !Array.isArray(o.plans) || !Array.isArray(o.notes)) throw new Error('bad');
          if (!confirm('Заменить текущий календарь данными из файла?')) return;
          store = { plans: o.plans.filter((p) => CROP[p.crop] && SIDX[p.season] !== undefined), notes: o.notes };
          save();
          renderCalendar();
        } catch (e) {
          alert('Не удалось прочитать файл. Нужен файл, сохранённый этой страницей.');
        }
      };
      r.readAsText(fl);
    });
    $('#clr').addEventListener('click', () => {
      if (!confirm('Удалить все посадки и заметки?')) return;
      store = { plans: [], notes: [] };
      save();
      renderCalendar();
    });
  }

  function openDay(day) {
    const season = calSeason;
    const ev = eventsFor(season, day);
    let list = '';
    ev.fs.forEach((f) => { list += '<li><span>🎪 <b>' + esc(f.ru) + '</b> · ' + esc(f.time) + ', ' + esc(f.place) + '</span></li>'; });
    ev.bd.forEach((v) => { list += '<li><span>🎂 День рождения: <b>' + esc(v.ru) + '</b></span></li>'; });
    ev.hv.forEach((h) => { list += '<li><span>' + h.info.c.emoji + ' Урожай: <b>' + esc(h.info.c.ru) + '</b> × ' + (h.p.qty * h.info.c.qty) + '</span></li>'; });
    ev.pl.forEach((p) => { list += '<li><span>🌱 Посадка: <b>' + esc(CROP[p.crop].ru) + '</b> × ' + p.qty + '</span></li>'; });
    ev.nt.forEach((n) => { list += '<li><span>📝 ' + esc(n.text) + '</span><button type="button" class="btn danger small" data-del-note="' + n.id + '">Убрать</button></li>'; });

    const html =
      '<h3>События</h3>' + (list ? '<ul class="day-list">' + list + '</ul>' : '<p class="muted">В этот день пока ничего нет.</p>') +
      '<h3>Заметка</h3>' +
      '<form class="form" id="note-form"><label class="field">Текст<input type="text" name="text" maxlength="80" required placeholder="Например: полить розы"></label>' +
      '<button class="btn" type="submit">Добавить заметку</button></form>' +
      '<h3>Посадить культуру</h3>' + plantFormHTML();

    openDlg(s2(season, day), html, (d) => {
      d.querySelectorAll('[data-del-note]').forEach((b) => b.addEventListener('click', () => {
        store.notes = store.notes.filter((n) => n.id !== b.dataset.delNote);
        save();
        d.close();
        renderCalendar();
      }));
      $('#note-form', d).addEventListener('submit', (e) => {
        e.preventDefault();
        const text = e.target.elements.text.value.trim();
        if (!text) return;
        store.notes.push({ id: uid(), season: season, day: day, text: text });
        save();
        d.close();
        renderCalendar();
      });
      bindPlantForm($('#plant-form', d), { season: season, day: day }, (p) => {
        d.close();
        calSeason = p.season;
        renderCalendar();
      });
    });
  }
  function s2(season, day) { return SEASON[season].emoji + ' ' + fmtSD(season, day); }

  // ---------- Культуры ----------
  function renderCrops() {
    const st = { season: 'all', q: '', sort: 'name' };
    view.innerHTML =
      '<h1>Культуры</h1>' +
      '<p class="lead">Сроки роста, цены и где купить семена. «Золото в день» считается для посадки 1-го числа сезона: учтены повторные сборы и цена семян. Звёздочка означает, что семена в магазинах не продаются.</p>' +
      '<div class="tools"><input type="search" id="q" placeholder="Поиск по названию" aria-label="Поиск по названию">' +
      '<select id="sort" aria-label="Сортировка"><option value="name">По названию</option><option value="sell">Цена продажи ↓</option><option value="grow">Дни роста ↑</option><option value="gpd">Золото в день ↓</option></select></div>' +
      '<div class="chips" id="sf" role="group" aria-label="Сезон" style="margin-bottom:12px"></div>' +
      '<p class="count" id="cnt"></p>' +
      '<div class="table-wrap"><table><thead><tr><th>Культура</th><th>Сезон</th><th class="num">Рост, дн.</th><th class="num">Повтор, дн.</th><th class="num">Цена</th><th class="num">Семена</th><th class="num">Золото/день</th><th>Где купить</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>';

    const chips = [{ id: 'all', t: 'Все' }].concat(SEASONS.map((s) => ({ id: s.id, t: s.emoji + ' ' + s.ru })));
    function drawChips() {
      $('#sf').innerHTML = chips.map((c) => '<button type="button" class="chip ' + c.id + '" data-s="' + c.id + '" aria-pressed="' + (st.season === c.id) + '">' + c.t + '</button>').join('');
      $('#sf').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { st.season = b.dataset.s; drawChips(); draw(); }));
    }
    function draw() {
      const q = st.q.trim().toLowerCase();
      let list = CROPS.filter((c) => (st.season === 'all' || c.seasons.indexOf(st.season) !== -1) &&
        (!q || c.ru.toLowerCase().indexOf(q) !== -1 || c.en.toLowerCase().indexOf(q) !== -1));
      const cmp = {
        name: (a, b) => a.ru.localeCompare(b.ru, 'ru'),
        sell: (a, b) => b.sell - a.sell,
        grow: (a, b) => a.grow - b.grow,
        gpd: (a, b) => goldPerDay(b) - goldPerDay(a)
      }[st.sort];
      list = list.slice().sort(cmp);
      $('#cnt').textContent = 'Найдено: ' + list.length;
      $('#rows').innerHTML = list.map((c) => {
        const g = goldPerDay(c);
        return '<tr><td class="name"><b>' + c.emoji + ' ' + esc(c.ru) + '</b><span class="en">' + esc(c.en) + '</span>' +
          (c.note ? '<span class="en">' + esc(c.note) + '</span>' : '') + '</td>' +
          '<td>' + seasonTags(c.seasons) + '</td>' +
          '<td class="num">' + c.grow + '</td><td class="num">' + (c.regrow || '—') + '</td>' +
          '<td class="num">' + fmtNum(c.sell) + ' з.' + (c.qty > 1 ? '<span class="en">× ' + c.qty + ' за сбор</span>' : '') + '</td>' +
          '<td class="num">' + (c.seed === null ? '—' : fmtNum(c.seed) + ' з.') + '</td>' +
          '<td class="num">' + g.toFixed(1).replace('.', ',') + (c.seed === null ? '*' : '') + '</td>' +
          '<td>' + esc(c.source) + '</td>' +
          '<td><button type="button" class="btn small" data-add="' + c.id + '">В календарь</button></td></tr>';
      }).join('');
      $('#rows').querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
        const c = CROP[b.dataset.add];
        openPlantDialog({ season: c.seasons[0], day: 1, crop: c.id }, afterPlant);
      }));
    }
    $('#q').addEventListener('input', (e) => { st.q = e.target.value; draw(); });
    $('#sort').addEventListener('change', (e) => { st.sort = e.target.value; draw(); });
    drawChips();
    draw();
  }

  // ---------- Рыба ----------
  function renderFish() {
    const st = { season: 'all', kind: 'all', q: '', sort: 'name' };
    view.innerHTML =
      '<h1>Рыба</h1>' +
      '<p class="lead">Где и когда ловить. Цена — базовая, обычного качества. Магическая наживка позволяет поймать любую рыбу в любое время.</p>' +
      '<div class="tools"><input type="search" id="q" placeholder="Поиск по названию" aria-label="Поиск по названию">' +
      '<select id="kind" aria-label="Тип"><option value="all">Все виды</option>' +
      Object.keys(FISH_KINDS).map((k) => '<option value="' + k + '">' + FISH_KINDS[k] + '</option>').join('') + '</select>' +
      '<select id="sort" aria-label="Сортировка"><option value="name">По названию</option><option value="price">Цена ↓</option><option value="diff">Сложность ↓</option></select></div>' +
      '<div class="chips" id="sf" role="group" aria-label="Сезон" style="margin-bottom:12px"></div>' +
      '<p class="count" id="cnt"></p>' +
      '<div class="table-wrap"><table><thead><tr><th>Рыба</th><th>Где</th><th>Время</th><th>Сезон</th><th>Погода</th><th class="num">Цена</th><th class="num">Сложность</th></tr></thead><tbody id="rows"></tbody></table></div>';

    const chips = [{ id: 'all', t: 'Все' }].concat(SEASONS.map((s) => ({ id: s.id, t: s.emoji + ' ' + s.ru })));
    function drawChips() {
      $('#sf').innerHTML = chips.map((c) => '<button type="button" class="chip ' + c.id + '" data-s="' + c.id + '" aria-pressed="' + (st.season === c.id) + '">' + c.t + '</button>').join('');
      $('#sf').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { st.season = b.dataset.s; drawChips(); draw(); }));
    }
    function draw() {
      const q = st.q.trim().toLowerCase();
      let list = FISH.filter((f) => (st.season === 'all' || f.seasons.indexOf(st.season) !== -1) &&
        (st.kind === 'all' || f.kind === st.kind) &&
        (!q || f.ru.toLowerCase().indexOf(q) !== -1 || f.en.toLowerCase().indexOf(q) !== -1));
      const cmp = {
        name: (a, b) => a.ru.localeCompare(b.ru, 'ru'),
        price: (a, b) => b.price - a.price,
        diff: (a, b) => b.diff - a.diff
      }[st.sort];
      list = list.slice().sort(cmp);
      $('#cnt').textContent = 'Найдено: ' + list.length;
      $('#rows').innerHTML = list.map((f) =>
        '<tr><td class="name"><b>' + esc(f.ru) + '</b><span class="en">' + esc(f.en) + ' · ' + FISH_KINDS[f.kind] + '</span>' +
        (f.note ? '<span class="en">' + esc(f.note) + '</span>' : '') + '</td>' +
        '<td>' + esc(f.place) + '</td><td>' + esc(f.time || '—') + '</td><td>' + seasonTags(f.seasons) + '</td>' +
        '<td>' + esc(f.weather || '—') + '</td><td class="num">' + fmtNum(f.price) + ' з.</td>' +
        '<td class="num">' + (f.kind === 'pot' ? '—' : f.diff) + '</td></tr>').join('');
    }
    $('#q').addEventListener('input', (e) => { st.q = e.target.value; draw(); });
    $('#kind').addEventListener('change', (e) => { st.kind = e.target.value; draw(); });
    $('#sort').addEventListener('change', (e) => { st.sort = e.target.value; draw(); });
    drawChips();
    draw();
  }

  // ---------- Жители ----------
  let mapSel = null;

  function renderVillagers() {
    const st = { season: 'all', marry: false, q: '' };
    view.innerHTML =
      '<h1>Жители</h1>' +
      '<p class="lead">Дни рождения, где живут и что любят получать в подарок. Подарок на день рождения даёт в 8 раз больше очков дружбы.</p>' +
      '<div class="panel" style="margin-bottom:14px"><h3>Любят все</h3><p style="margin:4px 0">' +
      UNIVERSAL_LOVES.map((x) => '<span class="tag love">' + esc(x) + '</span>').join('') + '</p><p class="hint" style="margin:4px 0 0">' + esc(UNIVERSAL_NOTES) + '</p></div>' +
      '<div class="tools"><input type="search" id="q" placeholder="Поиск по имени" aria-label="Поиск по имени">' +
      '<button type="button" class="chip" id="mar" aria-pressed="false">Можно жениться или выйти замуж</button></div>' +
      '<div class="chips" id="sf" role="group" aria-label="Сезон дня рождения" style="margin-bottom:12px"></div>' +
      '<p class="count" id="cnt"></p><div class="cards" id="cards"></div>';

    const chips = [{ id: 'all', t: 'Все' }].concat(SEASONS.map((s) => ({ id: s.id, t: s.emoji + ' ' + s.ru })));
    function drawChips() {
      $('#sf').innerHTML = chips.map((c) => '<button type="button" class="chip ' + c.id + '" data-s="' + c.id + '" aria-pressed="' + (st.season === c.id) + '">' + c.t + '</button>').join('');
      $('#sf').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { st.season = b.dataset.s; drawChips(); draw(); }));
    }
    function draw() {
      const q = st.q.trim().toLowerCase();
      const list = VILLAGERS.filter((v) => (st.season === 'all' || v.season === st.season) && (!st.marry || v.marry) &&
        (!q || v.ru.toLowerCase().indexOf(q) !== -1 || v.en.toLowerCase().indexOf(q) !== -1))
        .sort((a, b) => a.ru.localeCompare(b.ru, 'ru'));
      $('#cnt').textContent = 'Найдено: ' + list.length;
      $('#cards').innerHTML = list.map((v) =>
        '<article class="card"><div class="row"><h3>' + esc(v.ru) + (v.marry ? ' <span class="heart" title="Можно жениться или выйти замуж">♥</span>' : '') + '</h3>' +
        '<span class="bday">🎂 ' + fmtSD(v.season, v.day) + '</span></div>' +
        '<div class="meta">' + esc(v.en) + ' · ' + esc(PLACE[v.home].ru) + '</div>' +
        '<ul>' + v.loves.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul>' +
        '<p style="margin:8px 0 0"><button type="button" class="btn ghost small" data-map="' + v.home + '">Показать на карте</button></p></article>').join('');
      $('#cards').querySelectorAll('[data-map]').forEach((b) => b.addEventListener('click', () => {
        mapSel = b.dataset.map;
        location.hash = '#map';
      }));
    }
    $('#q').addEventListener('input', (e) => { st.q = e.target.value; draw(); });
    $('#mar').addEventListener('click', (e) => {
      st.marry = !st.marry;
      e.currentTarget.setAttribute('aria-pressed', String(st.marry));
      draw();
    });
    drawChips();
    draw();
  }

  // ---------- Праздники ----------
  function renderFestivals() {
    let html = '<h1>Праздники</h1><p class="lead">Все праздники года. В дни, когда магазины закрыты, заранее соберите подарки и выполните дела на ферме.</p>';
    SEASONS.forEach((s) => {
      const list = FESTIVALS.filter((f) => f.season === s.id);
      html += '<section class="fest-season panel"><h2 style="margin-top:0">' + s.emoji + ' ' + s.ru + '</h2>' +
        list.map((f) => {
          const days = f.days.length > 1 ? f.days[0] + '–' + f.days[f.days.length - 1] : String(f.days[0]);
          return '<div class="fest"><div class="when">' + s.ru + ' ' + days + '</div><div><b>' + esc(f.ru) + '</b> <span class="muted">' + esc(f.en) + '</span>' +
            '<p>' + esc(f.time) + ' · ' + esc(f.place) + (f.note ? '. ' + esc(f.note) : '') + '</p></div></div>';
        }).join('') + '</section>';
    });
    html += '<p class="hint" style="margin-top:14px">Бродячая тележка стоит в лесу по пятницам и воскресеньям.</p>';
    view.innerHTML = html;
  }

  // ---------- Карта ----------
  const PIN_ICON = { farm: '🌾', house: '🏠', shop: '🏪', tent: '⛺', cave: '⛏️', sewer: '🕳️', desert: '🌵', island: '🏝️' };

  function renderMap() {
    view.innerHTML =
      '<h1>Карта жителей</h1>' +
      '<p class="lead">Схема Пеликан-Тауна без масштаба: показано, где кто живёт. Нажмите на значок, чтобы увидеть жителей.</p>' +
      '<div class="map-wrap"><div class="map" id="map" role="group" aria-label="Схема города"></div><aside class="panel side" id="side" aria-live="polite"></aside></div>';

    function draw() {
      $('#map').innerHTML = MAP_PLACES.map((p) =>
        '<button type="button" class="pin" style="left:' + p.x + '%;top:' + p.y + '%" data-p="' + p.id + '" aria-pressed="' + (mapSel === p.id) + '" aria-label="' + esc(p.ru) + '">' +
        PIN_ICON[p.type] + (p.who.length ? '<span class="n">' + p.who.length + '</span>' : '') + '</button>' +
        '<span class="pin-label" style="left:' + p.x + '%;top:' + p.y + '%">' + esc(p.ru) + '</span>').join('');
      $('#map').querySelectorAll('.pin').forEach((b) => b.addEventListener('click', () => {
        mapSel = mapSel === b.dataset.p ? null : b.dataset.p;
        draw();
      }));
      const side = $('#side');
      if (mapSel) {
        const p = PLACE[mapSel];
        side.innerHTML = '<h3>' + esc(p.ru) + '</h3>' + (p.who.length
          ? '<ul>' + p.who.map((id) => { const v = VILL[id]; return '<li><b>' + esc(v.ru) + '</b> <span class="muted">· 🎂 ' + fmtSD(v.season, v.day) + '</span></li>'; }).join('') + '</ul>'
          : '<p class="muted">Здесь никто не живёт. Это ваш дом.</p>') +
          '<p style="margin:10px 0 0"><button type="button" class="btn ghost small" id="all">Показать всех</button></p>';
        $('#all').addEventListener('click', () => { mapSel = null; draw(); });
      } else {
        side.innerHTML = '<h3>Кто где живёт</h3><ul>' + MAP_PLACES.filter((p) => p.who.length).map((p) =>
          '<li><b>' + esc(p.ru) + '</b><br><span class="muted">' + p.who.map((id) => VILL[id].ru).join(', ') + '</span></li>').join('') + '</ul>';
      }
    }
    draw();
  }

  // ---------- Маршрутизация ----------
  const ROUTES = {
    calendar: renderCalendar, crops: renderCrops, fish: renderFish,
    villagers: renderVillagers, map: renderMap, festivals: renderFestivals
  };
  function route() {
    const name = (location.hash || '#calendar').slice(1);
    const key = ROUTES[name] ? name : 'calendar';
    document.querySelectorAll('.tabs a').forEach((a) => {
      if (a.dataset.route === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (dlg.open) dlg.close();
    ROUTES[key]();
    window.scrollTo(0, 0);
    const active = $('.tabs a[aria-current="page"]');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  window.addEventListener('hashchange', route);
  route();
})();
