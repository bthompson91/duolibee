// Check for the crossword direction indicator + intersection toggle + backspace.
// Loads only daily-crossword.js in a vm with a minimal DOM stub that can parse
// the grid HTML the crossword renders. Run: node tests/crossword-direction.test.cjs
// Exit 0 = pass, 1 = fail.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const REPO = '/home/hatch/workspace/duolibee';

// ---------- minimal DOM ----------
const VOID = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this._class = '';
    this.style = {};
    this.value = '';
    this.disabled = false;
    this.id = '';
    this.textContent = '';
    this.onclick = null; this.onfocus = null; this.oninput = null;
    this.onmousedown = null; this.onchange = null; this.onsubmit = null;
    this.classList = {
      add: (...cs) => { const s = new Set(this._class.split(/\s+/).filter(Boolean)); cs.forEach((c) => s.add(c)); this._class = [...s].join(' '); },
      remove: (...cs) => { const s = new Set(this._class.split(/\s+/).filter(Boolean)); cs.forEach((c) => s.delete(c)); this._class = [...s].join(' '); },
      contains: (c) => this._class.split(/\s+/).includes(c),
      toggle: (c, force) => { const has = this.classList.contains(c); const on = force === undefined ? !has : !!force; if (on) this.classList.add(c); else this.classList.remove(c); return on; },
    };
  }
  get className() { return this._class; }
  set className(v) { this._class = String(v); }
  set innerHTML(html) { this.children = parseHTML(html); this.children.forEach((c) => { c.parentNode = this; }); }
  get innerHTML() { return ''; }
  append(...xs) { xs.forEach((x) => { if (x) { x.parentNode = this; this.children.push(x); } }); return xs[0]; }
  appendChild(x) { x.parentNode = this; this.children.push(x); return x; }
  after(x) { if (!this.parentNode) return; const i = this.parentNode.children.indexOf(this); this.parentNode.children.splice(i + 1, 0, x); x.parentNode = this.parentNode; }
  insertAdjacentHTML(pos, html) { const els = parseHTML(html); els.forEach((e) => { e.parentNode = this; this.children.push(e); }); }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'class') this._class = String(v); if (k === 'id') this.id = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  addEventListener() {}
  removeEventListener() {}
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = (el) => { for (const ch of el.children) { if (matches(ch, sel)) out.push(ch); walk(ch); } };
    walk(this);
    return out;
  }
  focus() { document.activeElement = this; if (this.onfocus) this.onfocus(); }
  select() {}
  click() { if (this.onclick) this.onclick(); }
  remove() { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); } }
}

function matches(el, sel) {
  sel = sel.trim();
  // descendant combinator: approximate by matching the last compound selector
  const parts = sel.split(/\s+/);
  const last = parts[parts.length - 1];
  const attrParts = [];
  const attrRe = /\[([^\]=]+)(?:="([^"]*)")?\]/g;
  let am;
  while ((am = attrRe.exec(last))) attrParts.push([am[1], am[2]]);
  const base = last.replace(/\[([^\]=]+)(?:="([^"]*)")?\]/g, '').trim();
  if (base) {
    if (base.startsWith('#')) { if (el.id !== base.slice(1)) return false; }
    else if (base.startsWith('.')) {
      for (const c of base.slice(1).split('.')) { if (!el.classList.contains(c)) return false; }
    } else {
      const ps = base.split('.');
      if (el.tagName.toLowerCase() !== ps[0].toLowerCase()) return false;
      for (const c of ps.slice(1)) { if (!el.classList.contains(c)) return false; }
    }
  }
  for (const [name, val] of attrParts) {
    const actual = el.getAttribute(name);
    if (val === undefined) { if (actual === null) return false; }
    else if (actual !== val) return false;
  }
  return true;
}

function parseHTML(html) {
  const top = [];
  const stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g;
  let m;
  const push = (el) => {
    if (stack.length) { el.parentNode = stack[stack.length - 1]; stack[stack.length - 1].children.push(el); }
    else top.push(el);
  };
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) continue; // text node
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrStr = m[3] || '';
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].tagName.toLowerCase() === tag) { stack.length = i; break; } }
      continue;
    }
    const el = new El(tag);
    const attrRe = /([^\s=/>]+)(?:\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s>]+)))?/g;
    let a;
    while ((a = attrRe.exec(attrStr))) {
      const name = a[1];
      const val = a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : '';
      el.setAttribute(name, val);
      if (name === 'class') el._class = val;
      if (name === 'id') el.id = val;
      if (name === 'value') el.value = val;
      if (name === 'disabled') el.disabled = true;
      if (name.startsWith('data-')) el.dataset[name.slice(5)] = val;
    }
    push(el);
    if (!VOID.has(tag) && !/\/\s*$/.test(attrStr)) stack.push(el);
  }
  return top;
}

const appEl = new El('main'); appEl.id = 'app';
const bodyEl = new El('body'); bodyEl.append(appEl);
const headEl = new El('head');
const docEl = new El('html'); docEl.dataset = {};
const document = {
  activeElement: null,
  createElement: (tag) => new El(tag),
  getElementById: (id) => {
    const walk = (el) => { if (el.id === id) return el; for (const ch of el.children) { const f = walk(ch); if (f) return f; } return null; };
    return walk(bodyEl) || walk(headEl);
  },
  querySelector: (sel) => bodyEl.querySelector(sel),
  querySelectorAll: (sel) => bodyEl.querySelectorAll(sel),
  addEventListener: () => {},
  body: bodyEl,
  head: headEl,
  documentElement: docEl,
};

// ---------- globals the crossword needs ----------
function esc(v) { return String(v).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split(String.fromCharCode(39)).join('&#39;'); }
const LESSONS = [
  { id: 1, name: 'Test 1', items: [
    { t: 'tubig', e: 'water' }, { t: 'bata', e: 'child' }, { t: 'gatas', e: 'milk' },
    { t: 'aso', e: 'dog' }, { t: 'pusa', e: 'cat' }, { t: 'isda', e: 'fish' },
    { t: 'ibon', e: 'bird' }, { t: 'araw', e: 'sun' },
  ] },
  { id: 2, name: 'Test 2', items: [
    { t: 'bahay', e: 'house' }, { t: 'tao', e: 'person' }, { t: 'apoy', e: 'fire' },
    { t: 'gabi', e: 'night' }, { t: 'lupa', e: 'land' }, { t: 'sabi', e: 'said' },
    { t: 'lasa', e: 'taste' },
  ] },
];
const state = {};
const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  Math, JSON, Object, Array, Promise, Error, RegExp, Date,
  document, window: null, app: appEl,
  LESSONS, THEMES: LESSONS, state,
  save: () => {}, speak: () => {}, esc,
  go: function (name) { sandbox.view = name; },
  renderTabs: () => {}, renderHome: () => {},
  view: 'home',
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  addEventListener: () => {}, removeEventListener: () => {},
  scrollTo: () => {},
  MutationObserver: class { observe() {} disconnect() {} },
  alert: () => {}, confirm: () => true,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(fs.readFileSync(REPO + '/daily-crossword.js', 'utf8'), sandbox, { filename: 'daily-crossword.js' });
vm.runInContext("go('crossword')", sandbox);

const puzzle = sandbox.duolibeeCrossword.puzzle();
assert.ok(puzzle, 'a puzzle builds for today');
assert.ok(puzzle.words.length >= 4, 'at least 4 words, got ' + puzzle.words.length);
console.log('puzzle:', puzzle.words.length, 'words;', puzzle.words.map((w) => w.answer + '(' + (w.dir === 'h' ? 'A' : 'D') + w.num + ')').join(' '));

// coverage helper (mirrors the crossword's coordinates/covers)
function covers(w, r, c) {
  return [...w.answer].some((_, i) => (w.dir === 'h' ? w.r === r && w.c + i === c : w.c === c && w.r + i === r));
}
function wordsAt(r, c) { return puzzle.words.filter((w) => covers(w, r, c)); }
function cellAt(r, c) { return appEl.querySelector('.cw-cell[data-r="' + r + '"][data-c="' + c + '"]'); }

// find an intersection cell that is not the last letter of either word
let target = null;
for (const w of puzzle.words) {
  for (let i = 0; i < w.answer.length; i++) {
    const r = w.dir === 'h' ? w.r : w.r + i;
    const c = w.dir === 'h' ? w.c + i : w.c;
    const ws = wordsAt(r, c);
    if (ws.length < 2) continue;
    const h = ws.find((x) => x.dir === 'h'), v = ws.find((x) => x.dir === 'v');
    if (!h || !v) continue;
    const hLast = h.c + h.answer.length - 1 === c, vLast = v.r + v.answer.length - 1 === r;
    if (hLast || vLast) continue;
    target = { r, c, h, v };
    break;
  }
  if (target) break;
}
assert.ok(target, 'found an intersection cell with a next cell in both directions');
console.log('intersection at', target.r + ',' + target.c, 'across:', target.h.answer, 'down:', target.v.answer);

const cell = cellAt(target.r, target.c);
assert.ok(cell, 'intersection cell exists in the DOM');
assert.strictEqual(typeof cell.onmousedown, 'function', 'cell has a mousedown toggle handler');

// 1. Select the intersection cell -> direction shown (Across first), word highlighted
cell.focus();
let active = sandbox.duolibeeCrossword.active();
assert.ok(active, 'active word set on focus');
assert.strictEqual(active.dir, 'h', 'first focus on an intersection defaults to Across');
assert.strictEqual(active, target.h, 'active word is the Across word');
assert.ok(cell.classList.contains('cw-current'), 'focused cell is marked current');
assert.ok(cell.parentNode.classList.contains('cw-current'), 'cell box is marked current');
assert.ok(cell.parentNode.classList.contains('cw-dir-h'), 'box shows Across arrow (→)');
assert.ok(!cell.parentNode.classList.contains('cw-dir-v'), 'box does not show Down arrow');
for (let i = 0; i < target.h.answer.length; i++) {
  const el = cellAt(target.h.r, target.h.c + i);
  assert.ok(el.classList.contains('cw-active'), 'Across word cell ' + i + ' highlighted');
}
console.log('1. select intersection -> Across highlighted, → arrow on the cell: OK');

// 2. Tap the same cell again -> flips to Down, highlight + arrow follow
cell.onmousedown();
active = sandbox.duolibeeCrossword.active();
assert.strictEqual(active.dir, 'v', 're-tap flips to Down');
assert.strictEqual(active, target.v, 'active word is the Down word');
assert.ok(cell.classList.contains('cw-current'), 'focused cell stays current after flip');
assert.ok(cell.parentNode.classList.contains('cw-dir-v'), 'box now shows Down arrow (↓)');
assert.ok(!cell.parentNode.classList.contains('cw-dir-h'), 'box no longer shows Across arrow');
for (let i = 0; i < target.v.answer.length; i++) {
  const el = cellAt(target.v.r + i, target.v.c);
  assert.ok(el.classList.contains('cw-active'), 'Down word cell ' + i + ' highlighted');
}
// the Across word (other than the shared cell) is no longer highlighted
const acrossOther = cellAt(target.h.r, target.h.c + (target.c === target.h.c ? 1 : 0));
if (acrossOther !== cell) assert.ok(!acrossOther.classList.contains('cw-active'), 'old Across word no longer highlighted');
console.log('2. re-tap intersection -> Down highlighted, ↓ arrow on the cell: OK');

// 3. Typing follows the new (Down) direction
const downLetter = target.v.answer[target.r - target.v.r];
cell.value = downLetter;
cell.oninput();
const nextDown = cellAt(target.r + 1, target.c);
assert.strictEqual(document.activeElement, nextDown, 'typing advances down to the next cell of the Down word, not across');
assert.strictEqual(sandbox.duolibeeCrossword.active(), target.v, 'active word stays Down after typing');
assert.ok(nextDown.classList.contains('cw-current'), 'new current cell marked after typing');
assert.ok(nextDown.parentNode.classList.contains('cw-dir-v'), 'arrow still Down after typing');
console.log('3. typing in the Down direction advances down: OK');

// 4. A third tap on the same intersection flips back to Across
cell.focus();
cell.onmousedown();
active = sandbox.duolibeeCrossword.active();
assert.strictEqual(active.dir, 'h', 'third tap flips back to Across');
assert.ok(cell.parentNode.classList.contains('cw-dir-h'), 'arrow back to →');
console.log('4. third tap flips back to Across: OK');

// 5. Tapping a non-intersection cell twice does not toggle
// (find a cell covered by exactly one word — the last cell of an Across
// word can itself be an intersection, so search for one explicitly)
let sPos = null;
outer: for (const w of puzzle.words) {
  for (let i = 0; i < w.answer.length; i++) {
    const r = w.r + (w.dir === 'v' ? i : 0), c = w.c + (w.dir === 'h' ? i : 0);
    if (wordsAt(r, c).length === 1) { sPos = { r, c }; break outer; }
  }
}
assert.ok(sPos, 'puzzle has a non-intersection cell');
const sCell = cellAt(sPos.r, sPos.c);
assert.strictEqual(wordsAt(sPos.r, sPos.c).length, 1, 'test cell is a non-intersection');
sCell.focus();
const before = sandbox.duolibeeCrossword.active();
sCell.onmousedown();
assert.strictEqual(sandbox.duolibeeCrossword.active(), before, 're-tap on a non-intersection does not change direction');
console.log('5. re-tap on a non-intersection cell does not toggle: OK');

// 6. Backspace in the Across direction moves left
// (a1 = the cell right of the intersection in the Across word; it exists
// because the intersection is not the last letter of the Across word)
cell.focus();
const j = target.c - target.h.c;
const a1 = cellAt(target.h.r, target.c + 1);
assert.ok(a1, 'cell after the intersection in the Across word exists');
assert.strictEqual(typeof a1.onkeydown, 'function', 'cell has a backspace handler');
a1.value = target.h.answer[j + 1];
a1.oninput();
a1.focus();
a1.onkeydown({ key: 'Backspace', preventDefault: () => {} });
assert.strictEqual(a1.value, '', 'backspace on a filled cell clears it');
assert.strictEqual(document.activeElement, cell, 'backspace on a filled cell moves left to the previous cell');
// backspace on an empty cell moves left and clears the previous cell
a1.focus();
a1.onkeydown({ key: 'Backspace', preventDefault: () => {} });
assert.strictEqual(cell.value, '', 'backspace on an empty cell clears the previous cell');
assert.strictEqual(document.activeElement, cell, 'backspace on an empty cell moves left');
console.log('6. backspace in the Across direction moves left and deletes: OK');

// 7. Backspace in the Down direction moves up
cell.focus();
cell.onmousedown();
assert.strictEqual(sandbox.duolibeeCrossword.active(), target.v, 'flipped to Down for the backspace test');
const k = target.r - target.v.r;
const d1 = cellAt(target.r + 1, target.c);
assert.ok(d1, 'cell below the intersection in the Down word exists');
cell.value = target.v.answer[k];
cell.oninput();
d1.value = target.v.answer[k + 1];
d1.oninput();
d1.focus();
d1.onkeydown({ key: 'Backspace', preventDefault: () => {} });
assert.strictEqual(d1.value, '', 'backspace on a filled cell clears it (Down)');
assert.strictEqual(document.activeElement, cell, 'backspace on a filled cell moves up to the previous cell');
d1.focus();
d1.onkeydown({ key: 'Backspace', preventDefault: () => {} });
assert.strictEqual(cell.value, '', 'backspace on an empty cell clears the previous cell (Down)');
assert.strictEqual(document.activeElement, cell, 'backspace on an empty cell moves up');
console.log('7. backspace in the Down direction moves up and deletes: OK');

console.log('CROSSWORD DIRECTION: PASS');
process.exit(0);
