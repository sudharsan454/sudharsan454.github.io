/* Sudharsan R portfolio · shared script · v3.0 · 9 Oct 2026
   Theme icon, mobile menu, copy email, scroll-spy, tag filter, lightbox,
   one-pass agent flow, eval rounds chart, and review mode.
   Review mode: the comment layer loads ONLY when the URL itself carries ?review.
   Nothing is remembered between visits, so a normal link never shows comments. */
(function(){
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;

  /* theme: auto -> light -> dark, shown as an icon */
  var ICON = {
    auto:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg>',
    light:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
  };
  var NAME = {auto:'Theme follows your device', light:'Light theme', dark:'Dark theme'};
  var tb = document.getElementById('themeBtn'), modes = ['auto','light','dark'], cur = 'auto';
  try { cur = localStorage.getItem('sr-theme') || 'auto'; } catch(e){}
  function applyTheme(m){
    cur = m;
    if (m === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', m);
    if (tb){ tb.innerHTML = ICON[m]; tb.setAttribute('aria-label', NAME[m] + '. Click to change.'); tb.title = NAME[m]; }
    try { localStorage.setItem('sr-theme', m); } catch(e){}
  }
  applyTheme(cur);
  if (tb) tb.addEventListener('click', function(){ applyTheme(modes[(modes.indexOf(cur)+1)%3]); });

  /* mobile menu */
  var nav = document.querySelector('.nav'), mb = document.getElementById('menuBtn');
  if (mb && nav){
    mb.addEventListener('click', function(){ var o = nav.classList.toggle('open'); mb.setAttribute('aria-expanded', o); });
    [].forEach.call(nav.querySelectorAll('ul a'), function(a){ a.addEventListener('click', function(){ nav.classList.remove('open'); mb.setAttribute('aria-expanded', false); }); });
  }

  /* copy email */
  [].forEach.call(document.querySelectorAll('[data-copy]'), function(b){
    b.addEventListener('click', function(){
      var t = b.getAttribute('data-copy'), msg = document.getElementById(b.getAttribute('data-msg'));
      function ok(){ if (msg){ msg.textContent = 'Copied'; setTimeout(function(){ msg.textContent=''; }, 2000); } }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, function(){ if (msg) msg.textContent = t; });
      else if (msg) msg.textContent = t;
    });
  });

  /* scroll-spy: highlight the section in view */
  var links = [].slice.call(document.querySelectorAll('.nav ul a[href^="#"]'));
  if (links.length && 'IntersectionObserver' in window){
    var map = {};
    links.forEach(function(a){ var s = document.querySelector(a.getAttribute('href')); if (s) map[s.id] = a; });
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){
        if (e.isIntersecting){ links.forEach(function(a){ a.removeAttribute('aria-current'); }); var a = map[e.target.id]; if (a) a.setAttribute('aria-current','true'); }
      });
    }, {rootMargin:'-40% 0px -55% 0px'});
    Object.keys(map).forEach(function(id){ io.observe(document.getElementById(id)); });
  }

  /* tag filter (home) */
  (function(){
    var bar = document.getElementById('tagbar'); if (!bar) return;
    var cards = [].slice.call(document.querySelectorAll('[data-tags]')), btns = [].slice.call(bar.querySelectorAll('button'));
    var groups = [].slice.call(document.querySelectorAll('[data-group]'));
    btns.forEach(function(b){
      var t = b.dataset.tag, n = t === 'all' ? cards.length : cards.filter(function(c){ return c.dataset.tags.split(' ').indexOf(t) > -1; }).length;
      var c = document.createElement('span'); c.className = 'c'; c.textContent = n; b.appendChild(c);
    });
    function apply(t, push){
      btns.forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.tag === t); });
      cards.forEach(function(c){ c.classList.toggle('off', t !== 'all' && c.dataset.tags.split(' ').indexOf(t) < 0); });
      groups.forEach(function(g){ var any = g.querySelector('[data-tags]:not(.off)'); g.classList.toggle('off', !any); });
      if (push){ try { var u = new URL(location.href); if (t === 'all') u.searchParams.delete('tag'); else u.searchParams.set('tag', t); history.replaceState(null, '', u); } catch(e){} }
    }
    btns.forEach(function(b){ b.addEventListener('click', function(){ var t = b.getAttribute('aria-pressed') === 'true' && b.dataset.tag !== 'all' ? 'all' : b.dataset.tag; apply(t, true); }); });
    var q = null; try { q = new URL(location.href).searchParams.get('tag'); } catch(e){}
    if (q && btns.some(function(b){ return b.dataset.tag === q; })){ apply(q, false); var w = document.getElementById('work'); if (w) setTimeout(function(){ w.scrollIntoView(); }, 50); }
  })();

  /* lightbox: images open on top of the page */
  (function(){
    var imgs = [].slice.call(document.querySelectorAll('img[data-zoom]')); if (!imgs.length) return;
    var box = document.createElement('div'); box.className = 'lightbox'; box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true'); box.setAttribute('aria-label','Full size image');
    box.innerHTML = '<button class="iconbtn close" type="button" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button><figure><img alt=""><figcaption></figcaption></figure>';
    document.body.appendChild(box);
    var bi = box.querySelector('img'), bc = box.querySelector('figcaption'), cl = box.querySelector('.close'), last = null;
    function open(img){ last = img; bi.src = img.getAttribute('data-zoom') || img.src; bi.alt = img.alt; var cap = img.closest('figure'); bc.textContent = cap && cap.querySelector('figcaption') ? cap.querySelector('figcaption').innerText.replace(/\s+/g,' ') : ''; box.classList.add('open'); document.body.style.overflow = 'hidden'; cl.focus(); }
    function close(){ box.classList.remove('open'); bi.removeAttribute('src'); document.body.style.overflow = ''; if (last) last.focus(); }
    imgs.forEach(function(img){
      img.tabIndex = 0; img.setAttribute('role','button');
      img.addEventListener('click', function(){ open(img); });
      img.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(img); } });
    });
    cl.addEventListener('click', close);
    box.addEventListener('click', function(e){ if (e.target === box) close(); });
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && box.classList.contains('open')) close(); });
  })();

  /* agent flow: lights each agent once, in order, then stops */
  (function(){
    var agents = [].slice.call(document.querySelectorAll('#agentFlow .agent')); if (!agents.length || reduce) return;
    var started = false;
    function run(){ if (started) return; started = true; var i = 0;
      (function step(){ agents.forEach(function(a){ a.classList.remove('on'); }); if (i >= agents.length) return; agents[i].classList.add('on'); i++; setTimeout(step, 1100); })(); }
    if ('IntersectionObserver' in window){ var io = new IntersectionObserver(function(es){ if (es[0].isIntersecting){ run(); io.disconnect(); } }, {threshold:.5}); io.observe(agents[0].closest('.panel') || agents[0]); }
    else run();
  })();

  if (reduce) [].forEach.call(document.querySelectorAll('video[autoplay]'), function(v){ v.removeAttribute('autoplay'); try { v.pause(); } catch(e){} });

  /* eval rounds chart */
  (function(){
    var g = document.getElementById('roundBars'); if (!g) return; var NS = 'http://www.w3.org/2000/svg';
    var d = [['R11',7,8],['R12',60,63],['R13',17,17],['R14',24,24],['R16',3,7],['R17',7,7]], x0 = 70, bw = 52, gap = 28;
    d.forEach(function(r, i){
      var p = r[1]/r[2], h = 160*p, x = x0 + i*(bw+gap), y = 200 - h;
      var b = document.createElementNS(NS,'rect'); b.setAttribute('x',x); b.setAttribute('y',y); b.setAttribute('width',bw); b.setAttribute('height',h); b.setAttribute('rx',3); b.setAttribute('fill', p < 0.9 ? 'var(--bad)' : 'var(--teal)'); g.appendChild(b);
      var t = document.createElementNS(NS,'text'); t.setAttribute('x',x+bw/2); t.setAttribute('y',y-8); t.setAttribute('text-anchor','middle'); t.setAttribute('font-size','14'); t.setAttribute('font-weight','600'); t.setAttribute('fill','var(--ink)'); t.textContent = r[1]+'/'+r[2]; g.appendChild(t);
      var l = document.createElementNS(NS,'text'); l.setAttribute('x',x+bw/2); l.setAttribute('y',222); l.setAttribute('text-anchor','middle'); l.setAttribute('font-size','13'); l.setAttribute('fill','var(--muted)'); l.textContent = r[0]; g.appendChild(l);
    });
  })();

  /* review mode: only when this URL carries ?review */
  (function(){
    var on = /[?&]review(=|&|$)/.test(location.search) && !/[?&]review=off\b/.test(location.search);
    try { sessionStorage.removeItem('rv'); } catch(e){}
    if (!on) return;
    /* keep review mode while moving between pages of this site */
    [].forEach.call(document.querySelectorAll('a[href]'), function(a){
      var h = a.getAttribute('href');
      if (!h || h.charAt(0) === '#' || /^(https?:|mailto:)/.test(h) || /\.(pdf|jpg|png|mp4)$/i.test(h)) return;
      try { var u = new URL(h, location.href); if (u.origin !== location.origin) return; u.searchParams.set('review',''); a.setAttribute('href', u.pathname + u.search.replace('review=','review') + u.hash); } catch(e){}
    });
    var page = document.body.getAttribute('data-page') || 'index.html';
    var list = ['/review-backend.js','/comments.js','/pin-comments.js'];
    (function next(){ var src = list.shift(); if (!src) return; var s = document.createElement('script'); s.src = src + '?v=3'; s.setAttribute('data-page', page); s.onload = next; document.body.appendChild(s); })();
  })();
})();
