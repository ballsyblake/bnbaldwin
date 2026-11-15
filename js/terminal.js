// Terminal mode for bnbaldwin.com. Reads its content from the page itself,
// so the normal layout stays the single source of truth.
(function () {
  var overlay, out, input, history = [], hIndex = 0, lastFocus = null;

  function text(sel) {
    var n = document.querySelector(sel);
    return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function projects() {
    return Array.prototype.map.call(document.querySelectorAll('main article.card'), function (card) {
      var play = card.querySelector('a.play');
      return { name: card.querySelector('h3').textContent.trim(), href: play ? play.getAttribute('href') : null, desc: card.querySelector('p').textContent.replace(/\s+/g, ' ').trim() };
    });
  }

  function listItems(sel) {
    return Array.prototype.map.call(document.querySelectorAll(sel + ' li'), function (li) {
      var s = li.querySelector('strong'), e = li.querySelector('em');
      return (s ? s.textContent : '') + (e ? '  (' + e.textContent + ')' : '');
    });
  }

  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  var COMMANDS = {
    help: function () {
      return [
        'Commands:',
        '  whoami        who I am',
        '  projects      list projects',
        '  open <name>   open a project, e.g. open gunther',
        '  experience    work history',
        '  education     degrees',
        '  skills        what I work with',
        '  contact       where to find me',
        '  theme <light|dark>',
        '  clear         clear the screen',
        '  exit          back to the normal site (or press Esc)'
      ];
    },
    whoami: function () {
      return ['Blake Baldwin', text('header p'), '', text('#about p')];
    },
    about: function () { return COMMANDS.whoami(); },
    projects: function () {
      return projects().map(function (p) { return '  ' + slug(p.name).padEnd(28) + p.desc.slice(0, 70) + (p.desc.length > 70 ? '...' : ''); })
        .concat(['', 'Type "open <name>" to launch one.']);
    },
    ls: function () { return projects().map(function (p) { return slug(p.name) + '/'; }).concat(['flag.txt']); },
    open: function (arg) {
      if (!arg) return ['Usage: open <name>. Try "projects".'];
      var hit = projects().filter(function (p) { return slug(p.name).indexOf(slug(arg)) === 0 || slug(p.name).indexOf(slug(arg)) > -1; })[0];
      if (!hit) return ['No project matches "' + arg + '".'];
      if (!hit.href) return [hit.name + ' has no public link.'];
      setTimeout(function () { location.href = hit.href; }, 400);
      return ['Opening ' + hit.name + '...'];
    },
    play: function (arg) { return COMMANDS.open(arg || 'gunther'); },
    experience: function () { return listItems('#experience'); },
    education: function () { return listItems('#education'); },
    skills: function () {
      return Array.prototype.map.call(document.querySelectorAll('#skills .skills > div'), function (g) {
        var h = g.querySelector('h3').textContent;
        var tags = Array.prototype.map.call(g.querySelectorAll('.tags span'), function (s) { return s.textContent; });
        return h + ': ' + tags.join(', ');
      });
    },
    contact: function () {
      return Array.prototype.map.call(document.querySelectorAll('header .links a'), function (a) {
        var h = a.getAttribute('href');
        return '  ' + a.textContent.trim().padEnd(10) + (h.indexOf('mailto:') === 0 ? h.slice(7) : h);
      });
    },
    theme: function (arg) {
      if (arg !== 'light' && arg !== 'dark') return ['Usage: theme light | theme dark'];
      document.documentElement.setAttribute('data-theme', arg);
      try { localStorage.setItem('theme', arg); } catch (e) {}
      return ['Theme set to ' + arg + '.'];
    },
    cat: function (arg) {
      if (arg === 'flag.txt') return ['Permission denied. Real hackers read the source.'];
      return ['cat: ' + (arg || '') + ': No such file'];
    },
    sudo: function () { return ['blake is not in the sudoers file. This incident will be reported.']; },
    hint: function () { return ['There is a flag hidden on this site. Start where every web hacker starts: view the page source.']; },
    clear: function () { out.textContent = ''; return []; },
    exit: function () { close(); return []; },
    gui: function () { close(); return []; }
  };

  function print(lines, cls) {
    lines.forEach(function (l) {
      var d = document.createElement('div');
      if (cls) d.className = cls;
      d.textContent = l === '' ? ' ' : l;
      out.appendChild(d);
    });
    out.scrollTop = out.scrollHeight;
  }

  function run(raw) {
    var line = raw.trim();
    print(['blake@bnbaldwin:~$ ' + line], 'cmd');
    if (!line) return;
    history.push(line); hIndex = history.length;
    var parts = line.split(/\s+/), name = parts[0].toLowerCase(), arg = parts.slice(1).join(' ');
    var fn = COMMANDS[name];
    print(fn ? fn(arg) : [name + ': command not found. Type "help".']);
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'term';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Terminal mode');
    overlay.innerHTML =
      '<div class="term-bar"><span>blake@bnbaldwin: ~</span><button type="button" class="term-close" aria-label="Close terminal">Exit</button></div>' +
      '<div class="term-out" aria-live="polite"></div>' +
      '<form class="term-line"><label for="term-in">blake@bnbaldwin:~$</label>' +
      '<input id="term-in" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"></form>';
    document.body.appendChild(overlay);
    out = overlay.querySelector('.term-out');
    input = overlay.querySelector('input');
    overlay.querySelector('.term-close').addEventListener('click', close);
    overlay.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); run(input.value); input.value = ''; });
    overlay.addEventListener('click', function (e) { if (e.target === overlay || e.target === out) input.focus(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); }
      else if (e.key === 'ArrowUp' && hIndex > 0) { input.value = history[--hIndex]; e.preventDefault(); }
      else if (e.key === 'ArrowDown') { hIndex = Math.min(history.length, hIndex + 1); input.value = history[hIndex] || ''; e.preventDefault(); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        var v = input.value.trim().toLowerCase();
        var m = Object.keys(COMMANDS).filter(function (k) { return k.indexOf(v) === 0; });
        if (m.length === 1) input.value = m[0] + ' ';
      }
    });
    print(['Welcome to bnbaldwin.com, terminal edition.', 'Type "help" to see what you can do. Esc to leave.', '']);
  }

  function open() {
    lastFocus = document.activeElement;
    if (!overlay) build();
    overlay.hidden = false;
    document.body.classList.add('term-open');
    input.focus();
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove('term-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  window.__openTerminal = open;
})();
