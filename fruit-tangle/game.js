(function(){
  // ---------- storage (iframes may block localStorage) ----------
  const mem = {};
  function ld(k, d){ try{ const v = localStorage.getItem(k); if(v!==null) return JSON.parse(v); }catch(e){ if(k in mem) return mem[k]; } return d; }
  function sv(k, v){ mem[k]=v; try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

  const $ = id => document.getElementById(id);
  const EMO = ['🐶','🐱','🐟','🐰','🐴','🐮','🐹'];
  const FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  let N = Math.min(6, Math.max(3, ld('pt_n', 3)));
  let level = ld('pt_lvl', 1);
  let grid, hist, moves, secs, timer, started, paused, won, soundOn = true;

  // ---------- sound ----------
  let actx = null;
  function beep(f1, f2, dur, vol, type){
    if(!soundOn) return;
    try{
      if(!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if(actx.state === 'suspended') actx.resume();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f1, t);
      o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + dur);
    }catch(e){}
  }
  const sSnap = () => beep(350, 150, .12, .12);
  const sGrab = () => beep(240, 320, .08, .08);
  const sGood = () => beep(523, 784, .2, .09);
  function sWin(){ [262,330,392,523,659,784,1047].forEach((f,i)=>setTimeout(()=>beep(f,f*1.02,.5,.08,'triangle'), i*110)); }

  // ---------- game logic ----------
  const rot = (a, n) => { const l=a.length, k=((n%l)+l)%l; return k? a.slice(l-k).concat(a.slice(0,l-k)) : a; };
  function shiftRow(g, r, s){ g[r] = rot(g[r], s); }
  function shiftCol(g, c, s){ const col = rot(g.map(row=>row[c]), s); for(let r=0;r<N;r++) g[r][c] = col[r]; }
  function colTangle(g, c){
    const cnt = {}; let mx = 0;
    for(let r=0;r<N;r++){ const t = g[r][c]; cnt[t] = (cnt[t]||0)+1; if(cnt[t]>mx) mx = cnt[t]; }
    return N - mx;
  }
  const tangle = g => { let s=0; for(let c=0;c<N;c++) s += colTangle(g,c); return s; };
  const copy = g => g.map(r => r.slice());

  function fmt(s){ return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'); }
  function showMoves(){ $('mv').textContent = moves; }

  function newGame(){
    grid = [];
    for(let r=0;r<N;r++){ grid.push([]); for(let c=0;c<N;c++) grid[r].push(c); }
    do{
      for(let i=0;i<N*12;i++){
        const d = Math.random()<.5 ? 1 : -1, k = Math.floor(Math.random()*N);
        if(Math.random()<.5) shiftRow(grid,k,d); else shiftCol(grid,k,d);
      }
    }while(tangle(grid) === 0);
    hist = [copy(grid)]; moves = 0; secs = 0; started = false; paused = false; won = false;
    clearInterval(timer); timer = null;
    $('tm').textContent = '00:00'; showMoves(); undoState();
    ['mPause','mWin','mCfg'].forEach(i => $(i).classList.remove('show'));
    $('bPause').textContent = '⏸️';
  }

  function startTimer(){
    if(started) return;
    started = true;
    timer = setInterval(() => { if(!paused && !won){ secs++; $('tm').textContent = fmt(secs); } }, 1000);
  }
  function undoState(){ $('bUndo').classList.toggle('off', hist.length <= 1); }

  function commit(dir, idx, shift){
    if(dir === 'h') shiftRow(grid, idx, shift); else shiftCol(grid, idx, shift);
    const before = tangle(hist[hist.length-1]);
    moves++; showMoves();
    hist.push(copy(grid)); undoState();
    const t = tangle(grid);
    if(t === 0){ win(); }
    else if(t < before) sGood();
  }

  function win(){
    won = true; clearInterval(timer);
    sWin();
    setTimeout(() => {
      $('vL').textContent = level; $('vM').textContent = moves; $('vT').textContent = fmt(secs);
      $('mWin').classList.add('show');
    }, 700);
  }

  function undo(){
    if(drag || anim || paused || won || hist.length <= 1) return;
    hist.pop(); grid = copy(hist[hist.length-1]);
    moves = Math.max(0, moves-1); showMoves(); undoState(); sSnap();
  }

  // ---------- rendering (robust sizing: measured every frame) ----------
  const cv = $('cv'), ctx = cv.getContext('2d'), box = $('box');
  let W=0, H=0, DPR=1, cell=0, ox=0, oy=0;
  let drag = null;   // {dir, idx, off, row, col, sx, sy, locked}
  let anim = null;   // {from, to, t0}

  function measure(){
    const w = box.clientWidth, h = box.clientHeight, d = window.devicePixelRatio || 1;
    if(!w || !h) return false;
    if(w !== W || h !== H || d !== DPR){
      W = w; H = h; DPR = d;
      cv.width = Math.round(W*DPR); cv.height = Math.round(H*DPR);
    }
    cell = Math.floor(Math.min(W, H) / N);
    ox = Math.round((W - cell*N) / 2); oy = Math.round((H - cell*N) / 2);
    return true;
  }

  const mod = (a, m) => ((a % m) + m) % m;
  const lerp = (a, b, t) => a + (b - a) * t;

  function draw(){
    try{ drawInner(); }catch(e){ console.error(e); }
  }
  function drawInner(){
    if(!measure()) return;
    ctx.setTransform(DPR,0,0,DPR,0,0);
    ctx.clearRect(0,0,W,H);
    const size = cell*N;

    // animate snap
    if(anim){
      const p = Math.min(1, (performance.now() - anim.t0) / 160);
      const e = 1 - Math.pow(1-p, 3);
      drag.off = lerp(anim.from, anim.to, e);
      if(p >= 1){
        const d = drag, shift = Math.round(anim.to / cell);
        drag = null; anim = null;
        if(shift !== 0) commit(d.dir, d.idx, shift);
      }
    }

    // column tracks
    for(let c=0;c<N;c++){
      const ratio = N>1 ? 1 - colTangle(grid,c)/(N-1) : 1;
      const rr = Math.round(lerp(228,194,ratio)), gg = Math.round(lerp(232,245,ratio)), bb = Math.round(lerp(235,221,ratio));
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
      ctx.beginPath();
      const tx = ox + c*cell + 4, tw = cell - 8;
      ctx.roundRect ? ctx.roundRect(tx, oy + 2, tw, size - 4, 12) : ctx.rect(tx, oy + 2, tw, size - 4);
      ctx.fill();
      if(ratio === 1){ ctx.strokeStyle = 'rgba(0,189,112,.75)'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    ctx.strokeStyle = 'rgba(0,189,112,.35)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(ox, oy, size, size);

    // pets, clipped to the board
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, size, size); ctx.clip();
    ctx.globalAlpha = 1;
    ctx.font = Math.floor(cell*0.68) + 'px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for(let r=0;r<N;r++){
      for(let c=0;c<N;c++){
        let x = c*cell, y = r*cell;
        const dx = (drag && drag.dir==='h' && drag.idx===r);
        const dy = (drag && drag.dir==='v' && drag.idx===c);
        if(dx){ x = mod(x + drag.off, size); }
        if(dy){ y = mod(y + drag.off, size); }
        const cx = ox + x + cell/2, cy = oy + y + cell/2 + cell*0.04;
        const t = EMO[grid[r][c] % EMO.length];
        ctx.fillText(t, cx, cy);
        if(dx){ ctx.fillText(t, cx - size, cy); ctx.fillText(t, cx + size, cy); }
        if(dy){ ctx.fillText(t, cx, cy - size); ctx.fillText(t, cx, cy + size); }
      }
    }
    ctx.restore();
  }

  // ---------- input ----------
  cv.addEventListener('pointerdown', e => {
    if(paused || won || anim) return;
    const rect = cv.getBoundingClientRect();
    const x = e.clientX - rect.left - ox, y = e.clientY - rect.top - oy;
    const c = Math.floor(x / cell), r = Math.floor(y / cell);
    if(c<0 || c>=N || r<0 || r>=N) return;
    drag = {dir:null, idx:-1, off:0, row:r, col:c, sx:e.clientX, sy:e.clientY};
    try{ cv.setPointerCapture(e.pointerId); }catch(_){}
    e.preventDefault();
  });
  cv.addEventListener('pointermove', e => {
    if(!drag || anim) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if(!drag.dir){
      if(Math.hypot(dx,dy) < 8) return;
      if(Math.abs(dx) > Math.abs(dy)){ drag.dir='h'; drag.idx=drag.row; }
      else { drag.dir='v'; drag.idx=drag.col; }
      sGrab();
    }
    drag.off = drag.dir==='h' ? dx : dy;
    e.preventDefault();
  });
  function release(){
    if(!drag || anim) return;
    if(!drag.dir){ drag = null; return; }
    startTimer(); sSnap();
    anim = {from: drag.off, to: Math.round(drag.off / cell) * cell, t0: performance.now()};
  }
  // keep the browser/feed from turning drags into scrolls or back-gestures
  ['touchstart','touchmove'].forEach(t => cv.addEventListener(t, e => e.preventDefault(), {passive:false}));
  document.addEventListener('touchmove', e => e.preventDefault(), {passive:false});
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', release);

  // ---------- buttons ----------
  $('bUndo').onclick = undo;
  $('bNew').onclick = () => { if(!paused){ newGame(); } };
  $('bSnd').onclick = () => { soundOn = !soundOn; $('bSnd').textContent = soundOn ? '🔊' : '🔇'; };
  function togglePause(){
    if(won || anim || drag) return;
    paused = !paused;
    $('mPause').classList.toggle('show', paused);
    $('bPause').textContent = paused ? '▶️' : '⏸️';
    sSnap();
  }
  $('bPause').onclick = togglePause;
  $('bResume').onclick = togglePause;

  function markSizes(){ document.querySelectorAll('#sizes button').forEach(b => b.classList.toggle('on', +b.dataset.n === N)); }
  $('bCfg').onclick = () => { if(paused) return; markSizes(); $('mCfg').classList.add('show'); };
  document.querySelectorAll('#sizes button').forEach(b => b.onclick = () => { N = +b.dataset.n; sv('pt_n', N); markSizes(); });
  $('cfgGo').onclick = newGame;

  $('bAgain').onclick = newGame;
  $('bNext').onclick = () => {
    level++; if(N < 6) N++;
    sv('pt_lvl', level); sv('pt_n', N);
    newGame();
  };

  newGame();

  // ---------- tutorial (animated, skippable) ----------
  const DN = 3, DC = 64, DMS = 420, DEMO_EMO = ['🐶','🐱','🐟'];
  const SCR = [{d:'h',i:0,s:1},{d:'v',i:1,s:1},{d:'h',i:2,s:-1},{d:'v',i:0,s:-1},{d:'h',i:1,s:1},{d:'v',i:2,s:1}];
  const SOL = SCR.slice().reverse().map(m => ({d:m.d, i:m.i, s:-m.s}));
  const STEPS = [
    { t:'The goal', d:'Slide the pets until every column holds just one kind of pet.',
      cfg:{ start:'scrambled', moves:SOL, hop:true, gap:260, end:1700 } },
    { t:'Slide rows and columns', d:'Drag any pet sideways to slide its row, or up and down to slide its column.',
      cfg:{ start:'scrambled', moves:[{d:'h',i:1,s:1},{d:'h',i:1,s:-1},{d:'v',i:0,s:-1},{d:'v',i:0,s:1}], dim:true, gap:500, end:900 } },
    { t:'It loops around', d:'The pet that slides off one edge jumps to the opposite side. Rows and columns are circular.',
      cfg:{ start:'solved', moves:[{d:'h',i:1,s:-1},{d:'h',i:1,s:-1},{d:'h',i:1,s:-1}], arc:true, dim:true, dur:850, gap:450, end:1000 } },
  ];
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let demoStop = null, tutStep = 0, pausedByTut = false;

  function startDemo(el, cfg){
    let alive = true, tiles = [], types = [], strips = [];
    const D = cfg.dur || DMS;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const place = (t, x, y, anim) => {
      t._x = x; t._y = y;
      t.style.transition = anim ? `transform ${D}ms ease-in-out, opacity ${D}ms` : 'none';
      t.style.transform = `translate(${x}px,${y}px)`;
    };
    function paint(){
      for(let r=0;r<DN;r++) for(let c=0;c<DN;c++) place(tiles[r][c], c*DC, r*DC, false);
      strips.forEach((s, c) => {
        const cnt = {}; let mx = 0;
        types.forEach(row => { cnt[row[c]] = (cnt[row[c]]||0) + 1; mx = Math.max(mx, cnt[row[c]]); });
        const q = (mx - 1) / (DN - 1);
        s.style.background = `rgb(${Math.round(lerp(228,194,q))},${Math.round(lerp(232,245,q))},${Math.round(lerp(235,221,q))})`;
        s.classList.toggle('ok', q === 1);
      });
    }
    function build(){
      el.innerHTML = ''; tiles = []; types = []; strips = [];
      for(let c=0;c<DN;c++){
        const s = document.createElement('b');
        s.className = 'dstrip'; s.style.left = (c*DC + 4) + 'px';
        el.appendChild(s); strips.push(s);
      }
      for(let r=0;r<DN;r++){
        tiles.push([]); types.push([]);
        for(let c=0;c<DN;c++){
          const t = document.createElement('div');
          t.className = 'dtile'; t.textContent = DEMO_EMO[c];
          el.appendChild(t); tiles[r].push(t); types[r].push(c);
        }
      }
      paint();
    }
    function apply(m){
      if(m.d === 'h'){ tiles[m.i] = rot(tiles[m.i], m.s); types[m.i] = rot(types[m.i], m.s); }
      else {
        const t = rot(tiles.map(row => row[m.i]), m.s), y = rot(types.map(row => row[m.i]), m.s);
        for(let r=0;r<DN;r++){ tiles[r][m.i] = t[r]; types[r][m.i] = y[r]; }
      }
    }
    async function slide(m){
      const line = m.d === 'h' ? tiles[m.i].slice() : tiles.map(row => row[m.i]);
      // arc mode: the pet that falls off one edge jumps over to the other side
      const jumper = cfg.arc ? line[m.s < 0 ? 0 : DN - 1] : null;
      const moving = line.filter(t => t !== jumper);
      if(!cfg.arc){
        line.forEach(t => [-1, 1].forEach(k => {
          const g = el.appendChild(t.cloneNode(true));
          g._ghost = true; g.style.opacity = 1;
          place(g, t._x + (m.d==='h' ? k*DN*DC : 0), t._y + (m.d==='v' ? k*DN*DC : 0), false);
          moving.push(g);
        }));
      }
      if(cfg.dim) tiles.flat().forEach(t => { t.style.transition = `opacity ${D}ms`; t.style.opacity = line.includes(t) ? 1 : .3; });
      void el.offsetWidth;
      moving.forEach(t => place(t, t._x + (m.d==='h' ? m.s*DC : 0), t._y + (m.d==='v' ? m.s*DC : 0), true));
      let jump = null;
      if(jumper && jumper.animate){
        const x0 = jumper._x, y0 = jumper._y;
        const x1 = m.d==='h' ? (m.s < 0 ? (DN-1)*DC : 0) : x0;
        const y1 = m.d==='v' ? (m.s < 0 ? (DN-1)*DC : 0) : y0;
        const R = DC * 0.9, kf = [];
        for(let k = 0; k <= 16; k++){
          const q = k / 16, arc = Math.sin(Math.PI * q);
          const x = x0 + (x1 - x0) * q + (m.d==='v' ? R * arc : 0);
          const y = y0 + (y1 - y0) * q - (m.d==='h' ? R * arc : 0);
          kf.push({ transform: `translate(${x}px,${y}px) scale(${1 + 0.3 * arc})` });
        }
        jumper.style.zIndex = 3; jumper.style.opacity = 1;
        jump = jumper.animate(kf, { duration: D, easing: 'ease-in-out', fill: 'forwards' });
      }
      await wait(D + 30);
      moving.filter(t => t._ghost).forEach(t => t.remove());
      apply(m); paint();
      if(jump){ jump.cancel(); jumper.style.zIndex = ''; }
    }
    if(reduceMotion){ build(); if(cfg.start === 'scrambled') SCR.forEach(apply); paint(); return () => {}; }
    (async () => {
      while(alive){
        build();
        if(cfg.start === 'scrambled'){ SCR.forEach(apply); paint(); }
        await wait(900); if(!alive) return;
        for(const m of cfg.moves){
          await slide(m); if(!alive) return;
          await wait(cfg.gap || 300); if(!alive) return;
        }
        if(cfg.hop) tiles.flat().forEach((t, i) => setTimeout(() => { t.classList.add('hop'); }, i * 40));
        await wait(cfg.end || 1500);
      }
    })();
    return () => { alive = false; };
  }

  function showStep(i){
    tutStep = i;
    const st = STEPS[i];
    $('tutT').textContent = st.t; $('tutD').textContent = st.d;
    [...$('tutDots').children].forEach((d, k) => d.classList.toggle('on', k === i));
    $('tutNext').textContent = i < STEPS.length - 1 ? 'Next' : "Let's play";
    if(demoStop) demoStop();
    demoStop = startDemo($('dclip'), st.cfg);
  }
  function openTut(){
    pausedByTut = !paused && !won;
    if(pausedByTut) paused = true;
    $('mTut').classList.add('show');
    showStep(0);
  }
  function closeTut(){
    if(demoStop) demoStop(); demoStop = null;
    $('mTut').classList.remove('show');
    sv('pt_tut', true);
    if(pausedByTut) paused = false;
    pausedByTut = false;
  }
  $('tutNext').onclick = () => { if(tutStep < STEPS.length - 1) showStep(tutStep + 1); else closeTut(); };
  $('tutSkip').onclick = closeTut;
  $('bHelp').onclick = () => { if(paused || won || drag || anim) return; openTut(); };
  if(!ld('pt_tut', false)) openTut();
  (function raf(){ requestAnimationFrame(raf); draw(); })();
  setInterval(draw, 100); // fallback in case rAF is throttled in the iframe
})();
