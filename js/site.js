// Small enhancements for the home page. Everything here is optional:
// the page reads fine with JavaScript off.
(function () {
  var root = document.documentElement;
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    } catch (e) { return null; }
  }

  // ---- Light/dark toggle. Starts from the system setting; a click pins a choice.
  var themeBtn = document.getElementById('theme-toggle');
  function effectiveTheme() {
    var t = root.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function setTheme(t) {
    if (t) root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
    store('theme', t || null);
    syncThemeBtn();
  }
  function syncThemeBtn() {
    if (!themeBtn) return;
    var dark = effectiveTheme() === 'dark';
    themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    themeBtn.innerHTML = dark
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>';
  }
  if (themeBtn) {
    themeBtn.hidden = false;
    themeBtn.addEventListener('click', function () { setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark'); });
    syncThemeBtn();
  }

  // ---- Fade sections in as they scroll into view (skipped for reduced motion).
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var items = document.querySelectorAll('main section, main .card');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < innerHeight) return; // already on screen: never hide it
      el.classList.add('reveal');
      io.observe(el);
    });
  }

  // ---- Game cards: short muted clips play on hover or keyboard focus.
  // Phones (no hover) and reduced-motion users keep the still image.
  var canHover = window.matchMedia && matchMedia('(hover: hover)').matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  if (canHover && !reduceMotion && !saveData) {
    document.querySelectorAll('.card[data-clip]').forEach(function (card) {
      var img = card.querySelector('img');
      if (!img) return;
      var video = null;
      function start() {
        if (!video) {
          video = document.createElement('video');
          video.src = card.getAttribute('data-clip');
          video.muted = true; video.loop = true; video.playsInline = true;
          video.setAttribute('aria-hidden', 'true');
          video.className = img.className + ' clip';
          video.poster = img.currentSrc || img.src;
          img.parentNode.insertBefore(video, img.nextSibling);
        }
        card.classList.add('playing');
        var p = video.play();
        if (p && p.catch) p.catch(function () {});
      }
      function stop() {
        card.classList.remove('playing');
        if (video) video.pause();
      }
      card.addEventListener('mouseenter', start);
      card.addEventListener('mouseleave', stop);
      card.addEventListener('focusin', start);
      card.addEventListener('focusout', function (e) { if (!card.contains(e.relatedTarget)) stop(); });
    });
  }

  // ---- Recent GitHub activity, straight from GitHub's public API.
  // Unauthenticated calls are limited to 60 an hour per visitor, so results
  // are cached for the session and the section stays hidden if anything fails.
  var gh = document.getElementById('activity');
  if (gh && window.fetch) loadGitHub(gh);

  function loadGitHub(section) {
    var KEY = 'gh-activity-v1';
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (cached && Date.now() - cached.at < 30 * 60 * 1000) return render(section, cached);
    var user = 'ballsyblake';
    var opts = { headers: { Accept: 'application/vnd.github+json' } };
    Promise.all([
      fetch('https://api.github.com/users/' + user + '/events/public?per_page=50', opts).then(ok),
      fetch('https://api.github.com/users/' + user + '/repos?per_page=100&sort=pushed', opts).then(ok)
    ]).then(function (res) {
      var events = res[0], repos = res[1];
      var pushes = [];
      events.forEach(function (ev) {
        if (ev.type !== 'PushEvent' || !ev.payload || !ev.payload.commits || !ev.payload.commits.length) return;
        var c = ev.payload.commits[ev.payload.commits.length - 1];
        pushes.push({ repo: ev.repo.name.split('/')[1], msg: (c.message || '').split('\n')[0], at: ev.created_at });
      });
      var seen = {}, recent = [];
      pushes.forEach(function (p) { if (!seen[p.repo] && recent.length < 5) { seen[p.repo] = 1; recent.push(p); } });
      var langs = {};
      repos.forEach(function (r) { if (!r.fork && r.language) langs[r.language] = (langs[r.language] || 0) + 1; });
      var data = { at: Date.now(), recent: recent, langs: langs, repos: repos.filter(function (r) { return !r.fork; }).length };
      try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
      render(section, data);
    }).catch(function () { /* rate limited or offline: leave the section hidden */ });
  }
  function ok(r) { if (!r.ok) throw new Error(r.status); return r.json(); }

  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    var units = [[86400 * 30, 'month'], [86400 * 7, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
    for (var i = 0; i < units.length; i++) {
      var n = Math.floor(s / units[i][0]);
      if (n >= 1) return n + ' ' + units[i][1] + (n > 1 ? 's' : '') + ' ago';
    }
    return 'just now';
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function render(section, data) {
    if (!data.recent.length && !Object.keys(data.langs).length) return;
    var list = section.querySelector('.gh-list');
    var bar = section.querySelector('.gh-bar');
    var legend = section.querySelector('.gh-legend');
    list.textContent = ''; bar.textContent = ''; legend.textContent = '';
    data.recent.forEach(function (p) {
      var li = el('li');
      var a = el('a', null, p.repo);
      a.href = 'https://github.com/ballsyblake/' + encodeURIComponent(p.repo);
      li.appendChild(a);
      li.appendChild(el('span', 'gh-msg', p.msg));
      li.appendChild(el('em', null, ago(p.at)));
      list.appendChild(li);
    });
    var entries = Object.keys(data.langs).map(function (k) { return [k, data.langs[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    var top = entries.slice(0, 5), rest = entries.slice(5).reduce(function (n, e) { return n + e[1]; }, 0);
    if (rest) top.push(['Other', rest]);
    var total = top.reduce(function (n, e) { return n + e[1]; }, 0);
    top.forEach(function (e, i) {
      var seg = el('span', 'gh-seg c' + i);
      seg.style.flexGrow = e[1];
      bar.appendChild(seg);
      var item = el('li');
      item.appendChild(el('i', 'gh-dot c' + i));
      item.appendChild(document.createTextNode(e[0] + ' ' + Math.round(e[1] / total * 100) + '%'));
      legend.appendChild(item);
    });
    bar.setAttribute('aria-label', 'Languages across ' + data.repos + ' public repositories: ' +
      top.map(function (e) { return e[0] + ' ' + Math.round(e[1] / total * 100) + '%'; }).join(', '));
    section.hidden = false;
  }

  // ---- Terminal mode: loaded only when someone opens it.
  var termBtn = document.getElementById('terminal-open');
  function openTerminal() {
    if (window.__openTerminal) return window.__openTerminal();
    var s = document.createElement('script');
    s.src = 'js/terminal.js';
    s.onload = function () { window.__openTerminal && window.__openTerminal(); };
    document.head.appendChild(s);
  }
  if (termBtn) {
    termBtn.hidden = false;
    termBtn.addEventListener('click', openTerminal);
  }
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === '`' || e.key === '~') { e.preventDefault(); openTerminal(); }
  });
})();
