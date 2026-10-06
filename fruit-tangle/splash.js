// Loaded in the background so this file also runs outside Reddit (local testing):
// there the import fails, and Play just opens the game page instead.
let expand = null;
import('@devvit/web/client').then(m => { expand = m.requestExpandedMode; }).catch(() => {});

document.getElementById('play').addEventListener('click', (event) => {
  if (expand) expand(event, 'game');
  else location.href = './pet_tangle_for_reddit.html';
});

// ---------- animated preview: a tangled board solves itself, then repeats ----------
const N = 3, CELL = 70, MS = 420;
const EMO = ['🐶', '🐱', '🐟'];
const clip = document.getElementById('clip');
const board = document.getElementById('board');

// scramble recipe; the solution is the same list reversed with shifts negated
const SCRAMBLE = [
  { d: 'h', i: 0, s: 1 }, { d: 'v', i: 1, s: 1 }, { d: 'h', i: 2, s: -1 },
  { d: 'v', i: 0, s: -1 }, { d: 'h', i: 1, s: 1 }, { d: 'v', i: 2, s: 1 },
];
const SOLVE = SCRAMBLE.slice().reverse().map(m => ({ ...m, s: -m.s }));

const strips = [];
for (let c = 0; c < N; c++) {
  const s = document.createElement('b');
  s.className = 'strip'; s.style.left = (c * CELL + 4) + 'px';
  clip.appendChild(s); strips.push(s);
}

let tiles = [];            // tiles[r][c] -> element
let types = [];            // types[r][c] -> pet index
const rot = (a, n) => { const l = a.length, k = ((n % l) + l) % l; return k ? a.slice(l - k).concat(a.slice(0, l - k)) : a; };

function place(el, x, y, animate) {
  el._x = x; el._y = y;
  el.style.transition = animate ? `transform ${MS}ms ease-in-out` : 'none';
  el.style.transform = `translate(${x}px,${y}px)`;
}
function layout() {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) place(tiles[r][c], c * CELL, r * CELL, false);
  strips.forEach((s, c) => {
    const cnt = {}; let mx = 0;
    types.forEach(row => { cnt[row[c]] = (cnt[row[c]] || 0) + 1; mx = Math.max(mx, cnt[row[c]]); });
    const q = (mx - 1) / (N - 1), L = (a, b) => Math.round(a + (b - a) * q);
    s.style.background = `rgb(${L(228,194)},${L(232,245)},${L(235,221)})`;
    s.classList.toggle('ok', q === 1);
  });
}
function build() {
  tiles.flat().forEach(el => el.remove());
  tiles = []; types = [];
  for (let r = 0; r < N; r++) {
    tiles.push([]); types.push([]);
    for (let c = 0; c < N; c++) {
      const el = document.createElement('div');
      el.className = 'tile'; el.textContent = EMO[c];
      clip.appendChild(el);
      tiles[r].push(el); types[r].push(c);
    }
  }
  layout();
}
// apply a move to the data only (no animation)
function apply(m) {
  if (m.d === 'h') { tiles[m.i] = rot(tiles[m.i], m.s); types[m.i] = rot(types[m.i], m.s); }
  else {
    const t = rot(tiles.map(row => row[m.i]), m.s), y = rot(types.map(row => row[m.i]), m.s);
    for (let r = 0; r < N; r++) { tiles[r][m.i] = t[r]; types[r][m.i] = y[r]; }
  }
}
function slide(m, done) {
  const line = m.d === 'h' ? tiles[m.i].slice() : tiles.map(row => row[m.i]);
  const moving = line.slice();
  line.forEach(el => {            // wrap-around ghosts on both sides
    [-1, 1].forEach(k => {
      const g = el.cloneNode(true);
      clip.appendChild(g); moving.push(g);
      place(g, el._x + (m.d === 'h' ? k * N * CELL : 0), el._y + (m.d === 'v' ? k * N * CELL : 0), false);
      g._ghost = true;
    });
  });
  void clip.offsetWidth;          // flush so the transition starts
  moving.forEach(el => place(el, el._x + (m.d === 'h' ? m.s * CELL : 0), el._y + (m.d === 'v' ? m.s * CELL : 0), true));
  setTimeout(() => {
    moving.filter(el => el._ghost).forEach(el => el.remove());
    apply(m); layout(); done();
  }, MS + 30);
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const slideP = m => new Promise(r => slide(m, r));

async function loop() {
  for (;;) {
    build();
    SCRAMBLE.forEach(apply); layout();
    await wait(1100);
    for (const m of SOLVE) { await slideP(m); await wait(260); }
    tiles.flat().forEach((el, i) => setTimeout(() => { el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); }, i * 40));
    await wait(1800);
    board.style.transition = 'opacity .3s'; board.style.opacity = 0;
    await wait(320);
    board.style.opacity = 1;
  }
}

if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  build(); SCRAMBLE.forEach(apply); layout();   // static tangled board
} else {
  loop();
}
