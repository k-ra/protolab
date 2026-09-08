/* Spread — a two-page planner on a desk.
   Everything lives in localStorage; no build step, no dependencies. */
(() => {
'use strict';

const STORAGE_KEY = 'spread-planner.v1';
const DAY_START = 8;      // 8:00
const DAY_END = 24;       // 24:00 (midnight)
const SNAP = 0.25;        // 15 minutes
const GRID_H = 660;       // target grid height in px; hour rows stretch to fill it
const GAP_H = 26;         // height of a collapsed (hidden) span

const PALETTE = ['yellow', 'peach', 'pink', 'lilac', 'blue', 'sky', 'mint', 'green', 'grey', 'none'];
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/* ---------- tiny helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const snap = t => Math.round(t / SNAP) * SNAP;
const pad = n => String(n).padStart(2, '0');
// 12-hour clock: 8 … 12, 1 … 12. 24 is midnight.
const h12 = t => ((Math.floor(t) + 11) % 12) + 1;
const mins = t => Math.round((t - Math.floor(t)) * 60);
const ampm = t => (t % 24) < 12 ? 'am' : 'pm';
const fmtTime = t => `${h12(t)}:${pad(mins(t))}`;                  // 12:30
const fmtHour = t => `${h12(t)}${mins(t) ? ':' + pad(mins(t)) : ''} ${ampm(t)}`;  // 12:30 pm
const fmtHourBare = t => `${h12(t)}${mins(t) ? ':' + pad(mins(t)) : ''}`;              // 12:30
const fmtRange = (a, b) => `${ampm(a) === ampm(b) ? fmtHourBare(a) : fmtHour(a)} – ${fmtHour(b)}`;

const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const todayKey = () => keyOf(new Date());

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else n.setAttribute(k, v);
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
}

/* ---------- state ---------- */
function defaultState() {
  return {
    settings: { view: 'all', workStart: 9, workEnd: 18, color: 'yellow' },
    days: {},
    desk: { items: [{ id: uid(), type: 'sticky', x: null, y: null, rot: -2, color: 'yellow', text: '' }] },
  };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && s.settings && s.days && s.desk) return s;
  } catch (_) { /* fall through */ }
  return defaultState();
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function dayData(k) {
  const d = (state.days[k] ||= { title: '', blocks: [], todos: [], notes: '' });
  // older versions kept notes as positioned scraps; fold them into plain text
  if (Array.isArray(d.notes)) d.notes = d.notes.map(n => n.text).filter(Boolean).join('\n');
  return d;
}

let state = load();
let cursor = todayKey();          // left page of the current spread
const fresh = new Set();          // ids of just-drawn blocks; they vanish if left untitled

/* ---------- time layout (work / off / all hours) ---------- */
// Returns the vertical layout of the grid: visible segments and collapsed gaps.
function layout() {
  const { view, workStart: ws, workEnd: we } = state.settings;
  let parts;
  if (view === 'work') parts = [['gap', DAY_START, ws], ['seg', ws, we], ['gap', we, DAY_END]];
  else if (view === 'off') parts = [['seg', DAY_START, ws], ['gap', ws, we], ['seg', we, DAY_END]];
  else parts = [['seg', DAY_START, DAY_END]];
  parts = parts.filter(p => p[2] > p[1]);

  const visible = parts.filter(p => p[0] === 'seg').reduce((s, p) => s + p[2] - p[1], 0);
  const gaps = parts.filter(p => p[0] === 'gap').length;
  const pph = clamp((GRID_H - gaps * GAP_H) / visible, 36, 96);  // px per hour

  let y = 0;
  const items = parts.map(([type, from, to]) => {
    const h = type === 'seg' ? (to - from) * pph : GAP_H;
    const it = { type, from, to, y, h };
    y += h;
    return it;
  });
  return { items, pph, height: y };
}
function timeToY(t, L) {
  for (const it of L.items) {
    if (t >= it.from && t <= it.to) return it.y + (t - it.from) / (it.to - it.from) * it.h;
  }
  return t < L.items[0].from ? 0 : L.height;
}
function yToTime(y, L) {
  for (const it of L.items) {
    if (y >= it.y && y <= it.y + it.h) {
      if (it.type === 'gap') return (y - it.y) < it.h / 2 ? it.from : it.to;
      return it.from + (y - it.y) / L.pph;
    }
  }
  return y < 0 ? DAY_START : DAY_END;
}
const hiddenIn = (b, L) => L.items.some(it => it.type === 'gap' && b.start >= it.from && b.end <= it.to);

function positionBlock(node, start, end, L) {
  const top = timeToY(start, L);
  const h = Math.max(timeToY(end, L) - top, 14);
  node.style.top = `${top}px`;
  node.style.height = `${h}px`;
  node.classList.toggle('compact', h < 30);
}

// Overlapping blocks share the width, Google-Calendar style.
function lanes(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const res = {};
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    const ends = [];
    for (const b of cluster) {
      let i = ends.findIndex(e => e <= b.start);
      if (i < 0) { i = ends.length; ends.push(0); }
      ends[i] = b.end;
      res[b.id] = { lane: i };
    }
    for (const b of cluster) res[b.id].count = ends.length;
    cluster = [];
  };
  for (const b of sorted) {
    if (cluster.length && b.start >= clusterEnd) flush();
    cluster.push(b);
    clusterEnd = cluster.length === 1 ? b.end : Math.max(clusterEnd, b.end);
  }
  flush();
  return res;
}

/* ---------- pointer tracking (drag vs click) ---------- */
function trackPointer(e, capEl, { move, end, click }) {
  const sx = e.clientX, sy = e.clientY;
  let moved = false;
  try { capEl.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  const onMove = ev => {
    if (!moved) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      document.body.classList.add('dragging');
      getSelection()?.removeAllRanges();
    }
    move(ev);
  };
  const onUp = ev => {
    capEl.removeEventListener('pointermove', onMove);
    capEl.removeEventListener('pointerup', onUp);
    capEl.removeEventListener('pointercancel', onUp);
    document.body.classList.remove('dragging');
    if (moved) end(ev); else click?.(ev);
  };
  capEl.addEventListener('pointermove', onMove);
  capEl.addEventListener('pointerup', onUp);
  capEl.addEventListener('pointercancel', onUp);
}

/* ---------- editable text ---------- */
function bindEditable(node, commit, { multiline = false, onEnter, onEmptyBackspace, onBlur } = {}) {
  node.contentEditable = 'plaintext-only';
  if (node.contentEditable !== 'plaintext-only') node.contentEditable = 'true';
  const text = () => node.innerText.replace(/\n$/, '');
  node.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); node.blur(); }
    else if (e.key === 'Enter' && !e.shiftKey && (onEnter || !multiline)) {
      e.preventDefault();
      if (onEnter) onEnter(); else node.blur();
    }
    else if (e.key === 'Backspace' && onEmptyBackspace && text() === '') {
      e.preventDefault(); onEmptyBackspace();
    }
  });
  node.addEventListener('input', () => commit(text()));
  node.addEventListener('blur', () => { commit(text()); onBlur?.(); });
}
function focusEditable(node, ev) {
  node.focus();
  const sel = getSelection();
  let range = null;
  if (ev && document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(ev.clientX, ev.clientY);
    if (p && node.contains(p.offsetNode)) {
      range = document.createRange(); range.setStart(p.offsetNode, p.offset); range.collapse(true);
    }
  } else if (ev && document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(ev.clientX, ev.clientY);
    if (r && node.contains(r.startContainer)) range = r;
  }
  if (!range) { range = document.createRange(); range.selectNodeContents(node); range.collapse(false); }
  sel.removeAllRanges(); sel.addRange(range);
}

/* ---------- colour popover ---------- */
const popover = $('#popover');
let closePopover = () => {};
function openPalette(anchor, current, onPick) {
  popover.innerHTML = '';
  for (const c of PALETTE) {
    const b = el('button', { class: `sw hl-${c}${c === current ? ' on' : ''}`, title: c });
    b.onclick = () => { closePopover(); onPick(c); };
    popover.append(b);
  }
  const r = anchor.getBoundingClientRect();
  popover.classList.add('open');
  const pw = popover.offsetWidth;
  popover.style.left = `${clamp(r.left + r.width / 2 - pw / 2, 8, innerWidth - pw - 8)}px`;
  popover.style.top = `${r.bottom + 6}px`;
  const onDoc = ev => { if (!popover.contains(ev.target)) closePopover(); };
  closePopover = () => {
    popover.classList.remove('open');
    document.removeEventListener('pointerdown', onDoc, true);
    closePopover = () => {};
  };
  setTimeout(() => document.addEventListener('pointerdown', onDoc, true));
}
function swatchButton(current, onPick) {
  const b = el('button', { class: 'swatch-btn', title: 'highlight' });
  b.addEventListener('pointerdown', e => e.stopPropagation());
  b.onclick = e => { e.stopPropagation(); openPalette(b, current, onPick); };
  return b;
}
function delButton(onDel) {
  const b = el('button', { class: 'del', title: 'remove' }, '×');
  b.addEventListener('pointerdown', e => e.stopPropagation());
  b.onclick = e => { e.stopPropagation(); onDel(); };
  return b;
}

/* ---------- render: toolbar ---------- */
const viewSel = $('#view'), wsSel = $('#ws'), weSel = $('#we'), paletteEl = $('#palette');

function renderToolbar() {
  const s = state.settings;
  viewSel.value = s.view;
  wsSel.innerHTML = ''; weSel.innerHTML = '';
  for (let h = DAY_START; h < DAY_END; h++) wsSel.append(el('option', { value: h }, fmtHour(h)));
  for (let h = DAY_START + 1; h <= DAY_END; h++) weSel.append(el('option', { value: h }, fmtHour(h)));
  wsSel.value = s.workStart; weSel.value = s.workEnd;
  $('.hours').style.opacity = s.view === 'all' ? .5 : 1;

  paletteEl.innerHTML = '';
  for (const c of PALETTE) {
    const b = el('button', { class: `sw hl-${c}${c === s.color ? ' on' : ''}`, title: c });
    b.onclick = () => { s.color = c; save(); renderToolbar(); };
    paletteEl.append(b);
  }

  const a = fromKey(cursor), b = fromKey(addDays(cursor, 1));
  const mo = d => MONTHS[d.getMonth()].slice(0, 3);
  $('#range').textContent = a.getMonth() === b.getMonth()
    ? `${mo(a)} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`
    : `${mo(a)} ${a.getDate()} – ${mo(b)} ${b.getDate()}, ${b.getFullYear()}`;
}

viewSel.onchange = () => { state.settings.view = viewSel.value; save(); render(); };
wsSel.onchange = () => {
  const s = state.settings;
  s.workStart = Number(wsSel.value);
  if (s.workEnd <= s.workStart) s.workEnd = s.workStart + 1;
  save(); render();
};
weSel.onchange = () => {
  const s = state.settings;
  s.workEnd = Number(weSel.value);
  if (s.workStart >= s.workEnd) s.workStart = s.workEnd - 1;
  save(); render();
};
$('#prev').onclick = () => { cursor = addDays(cursor, -2); render(); };
$('#next').onclick = () => { cursor = addDays(cursor, 2); render(); };
$('#today').onclick = () => { cursor = todayKey(); render(); };
$('#addSticky').onclick = () => {
  const n = state.desk.items.filter(i => i.type === 'sticky').length;
  const p = defaultStickyPos();
  state.desk.items.push({
    id: uid(), type: 'sticky', x: p.x + (n % 3) * 18, y: p.y + n * 40,
    rot: (n % 2 ? 1.5 : -2) + (Math.random() - .5), color: state.settings.color, text: '',
  });
  save(); renderDesk();
  const last = $('#stationery .sticky:last-child .sticky-text');
  last && focusEditable(last);
};
document.addEventListener('keydown', e => {
  if (e.target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === 'ArrowLeft') $('#prev').click();
  if (e.key === 'ArrowRight') $('#next').click();
});

/* ---------- render: a page (one day) ---------- */
function renderPage(pageEl, key) {
  const d = dayData(key);
  const date = fromKey(key);
  pageEl.innerHTML = '';
  pageEl.dataset.key = key;

  // head
  const title = el('div', { class: 'page-title', 'data-placeholder': 'title' });
  title.textContent = d.title;
  bindEditable(title, v => { d.title = v; save(); });
  pageEl.append(el('div', { class: `page-head${key === todayKey() ? ' today' : ''}` },
    el('div', { class: 'day-num' }, String(date.getDate())),
    el('div', {},
      el('div', { class: 'dow' }, DOW[date.getDay()]),
      el('div', { class: 'month' }, `${MONTHS[date.getMonth()]} ${date.getFullYear()}`)),
    title));

  // body
  const timeline = el('div', { class: 'timeline' });
  renderTimeline(timeline, key);

  const side = el('div', { class: 'side' });
  const todo = el('div', { class: 'todo-section' }, el('h3', {}, el('span', {}, 'todo')));
  renderTodos(todo, key);
  const notes = el('div', { class: 'notes' }, el('h3', {}, el('span', {}, 'notes')));
  renderNotes(notes, key);
  side.append(todo, notes);
  if (pageEl.dataset.side === 'right') renderMiniCal(side, key);

  pageEl.append(el('div', { class: 'page-body' }, timeline, side));
}

/* ---------- timeline ---------- */
function renderTimeline(container, key) {
  const d = dayData(key);
  const L = layout();
  const grid = el('div', { class: 'grid', 'data-day': key, style: `height:${L.height}px` });

  for (const it of L.items) {
    if (it.type === 'gap') {
      const n = d.blocks.filter(b => hiddenIn(b, L) && b.start >= it.from && b.end <= it.to).length;
      grid.append(el('div', {
        class: 'gap', style: `top:${it.y}px;height:${it.h}px`, title: 'show all hours',
      }, `${fmtRange(it.from, it.to)}${n ? ` · ${n} hidden` : ''}`));
      continue;
    }
    for (let h = Math.ceil(it.from); h <= it.to; h++) {
      const y = timeToY(h, L);
      const line = el('div', { class: 'hour', style: `top:${y}px` });
      const marker = h === DAY_START || h % 12 === 0;
      line.append(el('span', { class: 'hour-label' }, marker ? fmtHour(h) : fmtHourBare(h)));
      grid.append(line);
      if (L.pph >= 52 && h + .5 < it.to) {
        grid.append(el('div', { class: 'hour half', style: `top:${timeToY(h + .5, L)}px` }));
      }
    }
  }

  const blocksLayer = el('div', { class: 'blocks' });
  const ln = lanes(d.blocks);
  for (const b of d.blocks) {
    if (hiddenIn(b, L)) continue;
    const { lane, count } = ln[b.id];
    const node = el('div', { class: `block hl-${b.color}`, 'data-id': b.id });
    node.style.left = `calc(${lane * 100 / count}% + 3px)`;
    node.style.width = `calc(${100 / count}% - 7px)`;
    positionBlock(node, b.start, b.end, L);

    const t = el('div', { class: 'block-title', 'data-placeholder': '…' });
    t.textContent = b.title;
    bindEditable(t, v => { b.title = v; save(); }, {
      onBlur() {
        if (fresh.has(b.id)) {
          fresh.delete(b.id);
          if (!b.title.trim()) { d.blocks = d.blocks.filter(x => x !== b); save(); render(); }
        }
      },
    });
    node.append(
      el('div', { class: 'block-time' }, `${fmtTime(b.start)} – ${fmtTime(b.end)}`),
      t,
      swatchButton(b.color, c => { b.color = c; save(); render(); }),
      delButton(() => { d.blocks = d.blocks.filter(x => x !== b); save(); render(); }),
      el('div', { class: 'block-resize' }),
    );
    blocksLayer.append(node);
  }
  grid.append(blocksLayer);
  grid.addEventListener('pointerdown', e => onGridPointerDown(e, key));
  container.append(grid);
}

function onGridPointerDown(e, key) {
  if (e.button !== 0) return;
  const grid = e.currentTarget;
  const d = dayData(key);
  const L = layout();
  const blockEl = e.target.closest('.block');

  if (blockEl) {
    const b = d.blocks.find(x => x.id === blockEl.dataset.id);
    if (!b) return;
    const title = blockEl.querySelector('.block-title');
    if (document.activeElement === title) return;   // editing text: native behaviour
    e.preventDefault();
    const resize = !!e.target.closest('.block-resize');
    const grabOffset = e.clientY - blockEl.getBoundingClientRect().top;
    const dur = b.end - b.start;
    let cur = { day: key, start: b.start, end: b.end };
    let curGrid = grid;
    trackPointer(e, blockEl, {
      move(ev) {
        if (resize) {
          const y = ev.clientY - curGrid.getBoundingClientRect().top;
          cur.end = clamp(snap(yToTime(y, L)), b.start + SNAP, DAY_END);
        } else {
          const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.grid');
          if (over && over !== curGrid) {
            curGrid = over; cur.day = over.dataset.day;
            over.querySelector('.blocks').append(blockEl);
          }
          const y = ev.clientY - grabOffset - curGrid.getBoundingClientRect().top;
          cur.start = clamp(snap(yToTime(y, L)), DAY_START, DAY_END - dur);
          cur.end = cur.start + dur;
        }
        positionBlock(blockEl, cur.start, cur.end, L);
        blockEl.querySelector('.block-time').textContent = `${fmtTime(cur.start)} – ${fmtTime(cur.end)}`;
      },
      end() {
        d.blocks = d.blocks.filter(x => x !== b);
        b.start = cur.start; b.end = cur.end;
        dayData(cur.day).blocks.push(b);
        save(); render();
      },
      click(ev) { focusEditable(title, ev); },
    });
    return;
  }

  if (e.target.closest('.gap')) { state.settings.view = 'all'; save(); render(); return; }
  if (e.target.closest('.hour-label')) return;

  // empty grid: drag to draw a block (or click for a 30-minute one)
  e.preventDefault();
  const rect = grid.getBoundingClientRect();
  const anchor = clamp(snap(yToTime(e.clientY - rect.top, L)), DAY_START, DAY_END - SNAP);
  let ghost = null;
  let cur = { start: anchor, end: anchor + SNAP };
  trackPointer(e, grid, {
    move(ev) {
      if (!ghost) {
        ghost = el('div', { class: `block ghost hl-${state.settings.color}` });
        grid.querySelector('.blocks').append(ghost);
      }
      const t = clamp(snap(yToTime(ev.clientY - rect.top, L)), DAY_START, DAY_END);
      cur = t >= anchor ? { start: anchor, end: Math.max(t, anchor + SNAP) } : { start: t, end: anchor };
      positionBlock(ghost, cur.start, cur.end, L);
    },
    end() { addBlock(key, cur.start, cur.end); },
    click() { addBlock(key, anchor, Math.min(anchor + .5, DAY_END)); },
  });
}
function addBlock(key, start, end) {
  const b = { id: uid(), start, end, title: '', color: state.settings.color };
  dayData(key).blocks.push(b);
  fresh.add(b.id);
  save(); render();
  const t = $(`.block[data-id="${b.id}"] .block-title`);
  t && focusEditable(t);
}

/* ---------- todos ---------- */
function renderTodos(container, key) {
  const d = dayData(key);
  const ul = el('ul', { class: 'todos' });
  const focusTodo = (id, atEnd) => {
    const t = $(`.page[data-key="${key}"] .todo[data-id="${id}"] .todo-text`);
    t && focusEditable(t);
  };
  d.todos.forEach((t, i) => {
    const li = el('li', { class: `todo${t.done ? ' done' : ''}`, 'data-id': t.id });
    const chk = el('button', { class: 'check', title: 'done' }, t.done ? '×' : '');
    chk.onclick = () => { t.done = !t.done; save(); render(); };
    const txt = el('span', { class: `todo-text hl-${t.color}`, 'data-placeholder': '…' });
    txt.textContent = t.text;
    bindEditable(txt, v => { t.text = v; save(); }, {
      onEnter() {
        const n = { id: uid(), text: '', done: false, color: 'none' };
        d.todos.splice(i + 1, 0, n); save(); render(); focusTodo(n.id);
      },
      onEmptyBackspace() {
        d.todos.splice(i, 1); save(); render();
        const prev = d.todos[i - 1]; prev && focusTodo(prev.id);
      },
    });
    li.append(chk, txt,
      swatchButton(t.color, c => { t.color = c; save(); render(); }),
      delButton(() => { d.todos.splice(i, 1); save(); render(); }));
    ul.append(li);
  });
  const add = el('button', { class: 'add' }, '+ add');
  add.onclick = () => {
    const n = { id: uid(), text: '', done: false, color: 'none' };
    d.todos.push(n); save(); render(); focusTodo(n.id);
  };
  container.append(ul, add);
}

/* ---------- notes: plain text, like a notes app ---------- */
function renderNotes(container, key) {
  const d = dayData(key);
  const txt = el('div', { class: 'notes-text', 'data-placeholder': 'notes' });
  txt.textContent = d.notes;
  bindEditable(txt, v => { d.notes = v; save(); }, { multiline: true });
  container.append(txt);
}

/* ---------- mini month ---------- */
function renderMiniCal(container, key) {
  const d = fromKey(key), y = d.getFullYear(), m = d.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const grid = el('div', { class: 'mc-grid' });
  for (const c of 'SMTWTFS') grid.append(el('span', { class: 'mc-h' }, c));
  for (let i = 0; i < first; i++) grid.append(el('span'));
  for (let i = 1; i <= days; i++) {
    const k = keyOf(new Date(y, m, i));
    const on = k === cursor || k === addDays(cursor, 1);
    const b = el('button', { class: `mc-d${on ? ' on' : ''}${k === todayKey() ? ' today' : ''}` }, String(i));
    b.onclick = () => { cursor = k; render(); };
    grid.append(b);
  }
  container.append(el('div', { class: 'minical' },
    el('div', { class: 'mc-title' }, `${MONTHS[m]} ${y}`), grid));
}

/* ---------- desk stationery ---------- */
const scene = $('#scene'), book = $('#book'), stationery = $('#stationery');

function defaultStickyPos() {
  const br = book.getBoundingClientRect(), sr = scene.getBoundingClientRect();
  return { x: Math.min(br.right - sr.left + 32, sr.width - 200), y: 28 };
}

function renderDesk() {
  stationery.innerHTML = '';
  for (const it of state.desk.items) {
    if (it.type !== 'sticky') continue;
    if (it.x == null) { const p = defaultStickyPos(); it.x = p.x; it.y = p.y; save(); }
    const node = el('div', {
      class: `sticky hl-${it.color}`, 'data-id': it.id,
      style: `left:${it.x}px;top:${it.y}px;--rot:${it.rot}deg`,
    });
    const txt = el('div', { class: 'sticky-text', 'data-placeholder': 'note to self' });
    txt.textContent = it.text;
    bindEditable(txt, v => { it.text = v; save(); }, { multiline: true });
    node.append(txt,
      swatchButton(it.color, c => { it.color = c; save(); renderDesk(); }),
      delButton(() => { state.desk.items = state.desk.items.filter(x => x !== it); save(); renderDesk(); }));

    node.addEventListener('pointerdown', e => {
      if (e.button !== 0 || document.activeElement === txt) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y;
      let cur = { x: ox, y: oy };
      trackPointer(e, node, {
        move(ev) {
          const sr = scene.getBoundingClientRect();
          cur.x = clamp(ox + ev.clientX - sx, 0, sr.width - 60);
          cur.y = clamp(oy + ev.clientY - sy, 0, sr.height - 60);
          node.style.left = `${cur.x}px`; node.style.top = `${cur.y}px`;
        },
        end() { it.x = cur.x; it.y = cur.y; save(); },
        click(ev) { focusEditable(txt, ev); },
      });
    });
    stationery.append(node);
  }
}

/* ---------- render all ---------- */
function render() {
  closePopover();
  renderToolbar();
  renderPage($('.page[data-side="left"]'), cursor);
  renderPage($('.page[data-side="right"]'), addDays(cursor, 1));
  renderDesk();
}

render();
})();
