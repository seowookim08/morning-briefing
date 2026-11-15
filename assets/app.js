/* 슈카월드 아침 브리핑 — multi-channel daily briefing. vanilla JS, no build step */
(function () {
  'use strict';

  var DATA_URL = 'data/episodes.json';
  var PREFIX = 'syuka.v1';
  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  var YT_TABS = [
    { key: 'cards', label: '읽기' },
    { key: 'quiz', label: '퀴즈' },
    { key: 'notes', label: '생각해 보기' }
  ];

  var state = {
    loaded: false,
    channels: [],
    episodes: [],
    days: [],
    index: {}
  };

  var panelAC = null;
  var view = document.getElementById('view');
  var topbar = document.getElementById('topbar');
  var mastheadDate = document.getElementById('masthead-date');

  /* ---------- helpers ---------- */

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  /* escape first, then turn **강조** into <strong> — safe by construction */
  function inline(value) {
    return esc(value).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function parseISO(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function formatDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return m[1] + '.' + m[2] + '.' + m[3] + ' (' + WEEKDAYS[d.getDay()] + ')';
  }

  function formatDateLong(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number(m[1]) + '년 ' + Number(m[2]) + '월 ' + Number(m[3]) + '일 ' + WEEKDAYS[d.getDay()] + '요일';
  }

  function shortDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? m[2] + '.' + m[3] : String(iso || '');
  }

  function shortTime(iso) {
    if (!iso) return '';
    var t = new Date(iso);
    if (isNaN(t.getTime())) return '';
    var kst = new Date(t.getTime() + (9 * 60 * 60 * 1000));
    return pad(kst.getUTCMonth() + 1) + '.' + pad(kst.getUTCDate()) + ' ' +
      pad(kst.getUTCHours()) + ':' + pad(kst.getUTCMinutes());
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function todayLabel() {
    var d = new Date();
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) +
      ' (' + WEEKDAYS[d.getDay()] + ')';
  }

  function readText(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeText(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }
  function removeText(key) {
    try { localStorage.removeItem(key); } catch (e) { /* private mode */ }
  }
  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  function readPos(episodeId, count) {
    var v = readJSON(PREFIX + '.pos.' + episodeId, 0);
    v = typeof v === 'number' && isFinite(v) ? Math.round(v) : 0;
    return Math.max(0, Math.min(Math.max(count - 1, 0), v));
  }
  function writePos(episodeId, index) { writeJSON(PREFIX + '.pos.' + episodeId, index); }

  function quizRecord(episodeId) {
    var r = readJSON(PREFIX + '.quiz.' + episodeId, null);
    if (r && typeof r.best === 'number' && typeof r.total === 'number') return r;
    return null;
  }

  function noteKey(episodeId, questionId) { return PREFIX + '.note.' + episodeId + '.' + questionId; }

  function countNotes(episode) {
    var rs = Array.isArray(episode.reflections) ? episode.reflections : [];
    var n = 0;
    rs.forEach(function (r, i) {
      var qid = r.id || 'q' + (i + 1);
      var v = readText(noteKey(episode.id, qid));
      if (v && v.trim()) n += 1;
    });
    return n;
  }

  /* ---------- index & routing ---------- */

  function buildIndex() {
    state.days = [];
    state.index = {};
    var seen = {};
    state.episodes.forEach(function (ep) {
      var day = ep.briefingDate || ep.date;
      if (!seen[day]) { seen[day] = true; state.days.push(day); }
      state.index[day + '|' + ep.channel] = ep;
    });
    state.days.sort(function (a, b) { return String(b).localeCompare(String(a)); });
  }

  function channelById(id) {
    for (var i = 0; i < state.channels.length; i += 1) {
      if (state.channels[i].id === id) return state.channels[i];
    }
    return null;
  }

  function episodeFor(day, channelId) {
    return state.index[day + '|' + channelId] || null;
  }

  function channelHasContent(day) {
    var map = {};
    state.channels.forEach(function (ch) { if (episodeFor(day, ch.id)) map[ch.id] = true; });
    return map;
  }

  function defaultChannelFor(day) {
    var pref = ['syuka'];
    for (var i = 0; i < pref.length; i += 1) {
      if (episodeFor(day, pref[i])) return pref[i];
    }
    for (var j = 0; j < state.channels.length; j += 1) {
      if (episodeFor(day, state.channels[j].id)) return state.channels[j].id;
    }
    return state.channels.length ? state.channels[0].id : 'syuka';
  }

  function parseRoute() {
    var raw = String(location.hash || '').replace(/^#/, '');
    var parts = raw.split('?')[0].split('/').filter(Boolean);
    var day = null;
    var channel = null;
    var tab = 'cards';

    if (parts[0] === 'd' && parts[1]) {
      var d = decodeURIComponent(parts[1]);
      if (state.days.indexOf(d) >= 0) day = d;
      if (parts[2]) {
        var c = decodeURIComponent(parts[2]);
        if (channelById(c)) channel = c;
      }
      if (parts[3] && ['cards', 'quiz', 'notes'].indexOf(parts[3]) >= 0) tab = parts[3];
    }

    if (!day) day = state.days.length ? state.days[0] : null;
    if (!day) return null;
    if (!channel) channel = defaultChannelFor(day);
    return { day: day, channel: channel, tab: tab };
  }

  function navigate(day, channel, tab) {
    var hash = '#/d/' + encodeURIComponent(day) + '/' + encodeURIComponent(channel) + '/' + (tab || 'cards');
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  /* ---------- render ---------- */

  function render() {
    if (!state.loaded) return;
    var route = parseRoute();
    if (!route) {
      view.innerHTML = '<div class="state">아직 브리핑이 없어요.<br>매일 아침 8시에 새 브리핑이 올라와요.</div>';
      topbar.innerHTML = '';
      return;
    }
    renderTopbar(route);
    renderContent(route);
    window.scrollTo(0, 0);
  }

  function renderTopbar(route) {
    var dayIdx = state.days.indexOf(route.day);
    var has = channelHasContent(route.day);
    var isToday = route.day === todayISO();

    var dateHTML = '<div class="datebar">' +
      '<button class="date-nav" type="button" id="prev-day" aria-label="이전 날짜"' +
        (dayIdx >= state.days.length - 1 ? ' disabled' : '') + '>‹</button>' +
      '<button class="date-pick" type="button" id="date-pick">' +
        '<span class="date-main">' + esc(formatDate(route.day)) + '</span>' +
        (isToday ? '<span class="date-tag">오늘</span>' : '') +
        '<span class="date-caret">▾</span>' +
      '</button>' +
      '<button class="date-nav" type="button" id="next-day" aria-label="다음 날짜"' +
        (dayIdx <= 0 ? ' disabled' : '') + '>›</button>' +
    '</div>';

    var chHTML = '<nav class="channels" id="channels" aria-label="채널">' +
      state.channels.map(function (ch) {
        var active = ch.id === route.channel;
        return '<button class="ch-tab' + (active ? ' on' : '') + '" type="button" data-ch="' + esc(ch.id) + '"' +
          (active ? ' aria-current="true"' : '') + '>' +
          '<span class="ch-name">' + esc(ch.name) + '</span>' +
          '<span class="ch-dot' + (has[ch.id] ? ' on' : '') + '" aria-hidden="true"></span>' +
          '<span class="sr-only">' + (has[ch.id] ? '새 브리핑 있음' : '새 브리핑 없음') + '</span>' +
        '</button>';
      }).join('') + '</nav>';

    topbar.innerHTML = dateHTML + chHTML;

    var prev = document.getElementById('prev-day');
    if (prev) prev.addEventListener('click', function () {
      var i = state.days.indexOf(route.day);
      var nextDay = state.days[i + 1];
      if (nextDay) navigate(nextDay, route.channel, 'cards');
    });

    var next = document.getElementById('next-day');
    if (next) next.addEventListener('click', function () {
      var i = state.days.indexOf(route.day);
      var nextDay = state.days[i - 1];
      if (nextDay) navigate(nextDay, route.channel, 'cards');
    });

    var pick = document.getElementById('date-pick');
    if (pick) pick.addEventListener('click', function () { openDateSheet(route); });

    var channels = document.getElementById('channels');
    if (channels) channels.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.ch-tab');
      if (!btn) return;
      navigate(route.day, btn.getAttribute('data-ch'), 'cards');
    });

    var active = topbar.querySelector('.ch-tab.on');
    if (active && active.scrollIntoView) {
      try { active.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { /* old browser */ }
    }
  }

  function renderContent(route) {
    if (panelAC) { panelAC.abort(); panelAC = null; }

    var ep = episodeFor(route.day, route.channel);
    var ch = channelById(route.channel);
    if (!ch) return;

    if (!ep) {
      view.innerHTML = emptyStateHTML(route, ch);
      var retry = document.getElementById('go-latest');
      if (retry) retry.addEventListener('click', function () {
        var latest = state.days[0];
        navigate(latest, defaultChannelFor(latest), 'cards');
      });
      return;
    }

    panelAC = new AbortController();
    var sig = { signal: panelAC.signal };
    var isYT = ch.kind === 'youtube';
    var tab = isYT ? route.tab : 'cards';

    var numbers = Array.isArray(ep.numbers) ? ep.numbers.filter(function (n) { return n && n.value; }) : [];
    var numbersHTML = numbers.length ? '<div class="numstrip">' + numbers.map(function (n) {
      return '<div class="numstrip-item"><div class="numstrip-value">' + esc(n.value) + '</div>' +
        (n.label ? '<div class="numstrip-label">' + esc(n.label) + '</div>' : '') + '</div>';
    }).join('') + '</div>' : '';

    var subtabs = isYT ? '<nav class="tabs" role="tablist">' + YT_TABS.map(function (t) {
      return '<button type="button" role="tab" data-tab="' + t.key + '" aria-selected="' +
        (t.key === tab ? 'true' : 'false') + '">' + t.label + '</button>';
    }).join('') + '</nav>' : '';

    var action = ep.url
      ? '<a class="ep-link" href="' + esc(ep.url) + '" target="_blank" rel="noopener">' +
        (isYT ? '원문 영상' : '원문') + ' <span aria-hidden="true">↗</span></a>'
      : '';

    view.innerHTML = '<section class="reader">' +
      '<div class="ep-bar">' +
        '<span class="ch-badge">' + esc(ch.name) + '</span>' +
        '<h1 class="ep-title">' + esc(ep.title) + '</h1>' +
        action +
      '</div>' +
      numbersHTML +
      subtabs +
      '<div id="panel"></div>' +
    '</section>';

    var tabsEl = view.querySelector('.tabs');
    if (tabsEl) {
      tabsEl.addEventListener('click', function (ev) {
        var btn = ev.target.closest('button[data-tab]');
        if (btn) navigate(route.day, route.channel, btn.getAttribute('data-tab'));
      }, sig);
    }

    var panel = view.querySelector('#panel');
    if (isYT && tab === 'quiz') renderQuiz(ep, panel, sig);
    else if (isYT && tab === 'notes') renderNotes(ep, panel, sig);
    else renderCards(ep, panel, sig, ch);
  }

  function emptyStateHTML(route, ch) {
    var isYT = ch.kind === 'youtube';
    var link = isYT
      ? 'https://www.youtube.com/channel/' + ch.source
      : 'https://x.com/search?q=' + encodeURIComponent(ch.name === '뉴진스' ? '뉴진스' : 'AI') + '&f=live';
    return '<div class="state empty">' +
      '<div class="empty-ch">' + esc(ch.name) + '</div>' +
      '<p>' + esc(formatDateLong(route.day)) + '에는<br>' + esc(ch.name) + ' 새 브리핑이 없어요.</p>' +
      '<p class="empty-sub">새 영상이나 화제가 잡히면 다음 아침 8시에 이 자리에 올라와요.</p>' +
      '<a class="btn btn-ghost" href="' + esc(link) + '" target="_blank" rel="noopener">' +
        (isYT ? '채널 바로 가기' : 'X에서 보기') + '</a>' +
    '</div>';
  }

  /* ---------- cards ---------- */

  function sourcesHTML(card) {
    var list = Array.isArray(card.sources) ? card.sources : [];
    if (!list.length) return '';
    return '<div class="sources">' + list.map(function (s) {
      return '<a class="source" href="' + esc(s.url) + '" target="_blank" rel="noopener">' +
        '<span class="source-tag">X</span>' +
        '<span class="source-author">@' + esc(s.author) + '</span>' +
        (s.time ? '<span class="source-time">' + esc(shortTime(s.time)) + '</span>' : '') +
        '<span class="source-arrow">↗</span>' +
      '</a>';
    }).join('') + '</div>';
  }

  function cardHTML(card, i, total, kind) {
    var body = Array.isArray(card.body) ? card.body : [];
    var bodyHTML = body.map(function (p) { return '<p>' + inline(p) + '</p>'; }).join('');
    var tags = Array.isArray(card.tags)
      ? card.tags.filter(function (t) { return typeof t === 'string' && t.trim(); })
      : [];
    var section = String(card.kicker || '').replace(/^\s*\d+\s*[·.\-]\s*/, '').trim();
    var pct = Math.round(((i + 1) / total) * 100);

    return '<article class="card" data-i="' + i + '"><div class="card-inner">' +
      '<div class="card-progress" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' +
      '<div class="card-meta">' +
        '<span class="cm-label">' + esc(section || '읽기') + '</span>' +
        '<span class="cm-sep">·</span>' +
        '<span class="cm-count">' + (i + 1) + '/' + total + '</span>' +
      '</div>' +
      '<h2 class="card-title">' + inline(card.title) + '</h2>' +
      (bodyHTML ? '<div class="card-body">' + bodyHTML + '</div>' : '') +
      (card.stat && card.stat.value ? '<div class="card-stat">' +
        '<span class="stat-value">' + esc(card.stat.value) + '</span>' +
        (card.stat.label ? '<span class="stat-label">' + esc(card.stat.label) + '</span>' : '') +
      '</div>' : '') +
      (card.pullQuote ? '<blockquote class="pull">' + inline(card.pullQuote) + '</blockquote>' : '') +
      sourcesHTML(card) +
      (card.footnote ? '<p class="footnote">' + inline(card.footnote) + '</p>' : '') +
      (tags.length ? '<div class="card-tags">' + tags.map(function (t) {
        return '<span class="tag">' + esc(t) + '</span>';
      }).join('') + '</div>' : '') +
      (kind === 'x' ? '<div class="card-foot"><span class="foot-x">X 실시간</span></div>' : '') +
    '</div></article>';
  }

  function renderCards(ep, panel, sig, ch) {
    var cards = Array.isArray(ep.cards) ? ep.cards : [];
    var n = cards.length;
    var kind = (ch && ch.kind) || 'youtube';
    if (!n) {
      panel.innerHTML = '<p class="muted" style="padding:24px 0">이 편에는 카드가 없어요.</p>';
      return;
    }

    var html = '<div class="deck-wrap" id="deck-wrap"><div class="deck" id="deck">' +
      cards.map(function (c, i) { return cardHTML(c, i, n, kind); }).join('') +
      '</div></div>';

    if (n > 1) {
      html += '<div class="deck-ui">' +
        (readPos(ep.id, n) === 0 ? '<div class="swipe-hint" id="swipe-hint">옆으로 넘겨서 다음 카드로 →</div>' : '') +
        '<div class="deck-row">' +
          '<button class="nav-btn" type="button" id="prev" aria-label="이전 카드">←</button>' +
          '<span class="counter" id="counter">1 / ' + n + '</span>' +
          '<button class="nav-btn" type="button" id="next" aria-label="다음 카드">→</button>' +
        '</div>' +
        '<div class="dots" id="dots">' + cards.map(function (c, i) {
          return '<button type="button" data-i="' + i + '" aria-label="' + (i + 1) + '번 카드"></button>';
        }).join('') + '</div>' +
      '</div>';
    }

    if (kind === 'youtube') {
      html += '<div class="end-cta">' +
        '<p>여기까지 다 읽었어요. 기억에 남는 숫자 하나만 골라 두면 훨씬 오래 남아요.</p>' +
        '<div class="end-cta-row">' +
          '<button class="btn btn-primary" type="button" id="go-quiz">퀴즈 풀기</button>' +
          '<button class="btn btn-ghost" type="button" id="go-notes">생각 정리하기</button>' +
        '</div></div>';
    }

    panel.innerHTML = html;

    var goQuiz = panel.querySelector('#go-quiz');
    if (goQuiz) goQuiz.addEventListener('click', function () { navigate(ep.briefingDate || ep.date, ep.channel, 'quiz'); }, sig);
    var goNotes = panel.querySelector('#go-notes');
    if (goNotes) goNotes.addEventListener('click', function () { navigate(ep.briefingDate || ep.date, ep.channel, 'notes'); }, sig);

    var deck = panel.querySelector('#deck');
    var wrap = panel.querySelector('#deck-wrap');
    if (!deck || !wrap) return;

    var index = readPos(ep.id, n);
    var counter = panel.querySelector('#counter');
    var dots = panel.querySelector('#dots');
    var prev = panel.querySelector('#prev');
    var next = panel.querySelector('#next');
    var raf = 0;
    var last = index;

    function cardWidth() { return deck.clientWidth || 1; }
    function current() {
      return Math.max(0, Math.min(n - 1, Math.round(deck.scrollLeft / cardWidth())));
    }

    function paint(i) {
      if (counter) counter.textContent = (i + 1) + ' / ' + n;
      if (dots) {
        Array.prototype.forEach.call(dots.children, function (d, k) {
          if (k === i) d.classList.add('on'); else d.classList.remove('on');
        });
      }
      if (prev) prev.disabled = i === 0;
      if (next) {
        var atEnd = i === n - 1;
        if (atEnd) next.classList.add('is-end'); else next.classList.remove('is-end');
        next.textContent = atEnd
          ? (kind === 'youtube' ? '퀴즈 풀기 →' : '끝')
          : '→';
        next.setAttribute('aria-label', atEnd ? (kind === 'youtube' ? '퀴즈 풀기' : '마지막 카드') : '다음 카드');
        next.disabled = atEnd && kind !== 'youtube';
      }
      var hint = panel.querySelector('#swipe-hint');
      if (hint && i > 0) hint.parentNode.removeChild(hint);
    }

    function onScroll() {
      if (raf) return;
      raf = window.requestAnimationFrame(function () {
        raf = 0;
        var i = current();
        if (i !== last) {
          last = i;
          paint(i);
          writePos(ep.id, i);
        }
      });
    }

    function goTo(target) {
      var i = Math.max(0, Math.min(n - 1, target));
      var left = i * cardWidth();
      if (typeof deck.scrollTo === 'function') {
        try { deck.scrollTo({ left: left, behavior: 'smooth' }); }
        catch (e) { deck.scrollLeft = left; }
      } else {
        deck.scrollLeft = left;
      }
      var top = wrap.getBoundingClientRect().top + window.scrollY - 110;
      if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }

    if (n > 1) {
      deck.addEventListener('scroll', onScroll, { passive: true, signal: sig.signal });
      if (prev) prev.addEventListener('click', function () { goTo(current() - 1); }, sig);
      if (next) next.addEventListener('click', function () {
        var i = current();
        if (i >= n - 1) {
          if (kind === 'youtube') navigate(ep.briefingDate || ep.date, ep.channel, 'quiz');
        } else {
          goTo(i + 1);
        }
      }, sig);
      if (dots) dots.addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-i]');
        if (b) goTo(Number(b.getAttribute('data-i')));
      }, sig);
      window.addEventListener('keydown', function (ev) {
        if (ev.key === 'ArrowRight') goTo(current() + 1);
        else if (ev.key === 'ArrowLeft') goTo(current() - 1);
      }, sig);
      window.addEventListener('resize', function () {
        deck.scrollLeft = Math.max(0, Math.min(n - 1, last)) * cardWidth();
      }, sig);
    }

    window.requestAnimationFrame(function () {
      var prevBehavior = deck.style.scrollBehavior;
      deck.style.scrollBehavior = 'auto';
      deck.scrollLeft = index * cardWidth();
      deck.style.scrollBehavior = prevBehavior;
      last = index;
      paint(index);
    });
  }

  /* ---------- quiz ---------- */

  function quizOptions(q) {
    var isOX = q && q.type === 'ox';
    var opts = q && Array.isArray(q.options) && q.options.length ? q.options : (isOX ? ['O', 'X'] : []);
    return { isOX: isOX, opts: opts };
  }

  function renderQuiz(ep, panel, sig) {
    var qs = Array.isArray(ep.quizzes) ? ep.quizzes : [];
    if (!qs.length) {
      panel.innerHTML = '<p class="muted" style="padding:24px 0">이 편에는 퀴즈가 없어요.</p>';
      return;
    }

    var idx = 0;
    var answers = [];

    function draw() {
      var q = qs[idx];
      var o = quizOptions(q);
      var pct = Math.round((idx / qs.length) * 100);
      var optsHTML = o.opts.map(function (label, i) {
        var inner = o.isOX
          ? '<span class="opt-mark">' + esc(label) + '</span><span class="opt-cap">' + (i === 0 ? '맞다' : '아니다') + '</span>'
          : '<span class="opt-key">' + String.fromCharCode(65 + i) + '</span><span class="opt-label">' + esc(label) + '</span>';
        return '<button class="opt" type="button" data-i="' + i + '">' + inner + '</button>';
      }).join('');

      panel.innerHTML = '<div class="quiz">' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="quiz-step"><span>' + (idx + 1) + ' / ' + qs.length + '</span>' +
          '<span class="badge">' + (o.isOX ? 'OX' : '객관식') + '</span></div>' +
        '<h2 class="q-title">' + esc(q.question) + '</h2>' +
        '<div class="opts' + (o.isOX ? ' ox' : '') + '" id="opts">' + optsHTML + '</div>' +
        '<div id="fb"></div>' +
      '</div>';

      var optsEl = panel.querySelector('#opts');
      optsEl.addEventListener('click', function (ev) {
        var btn = ev.target.closest('.opt');
        if (!btn || btn.disabled) return;
        answer(Number(btn.getAttribute('data-i')));
      });
    }

    function answer(picked) {
      if (answers[idx] !== undefined && answers[idx] !== null) return;
      var q = qs[idx];
      var o = quizOptions(q);
      answers[idx] = picked;
      var correct = picked === q.answer;

      Array.prototype.forEach.call(panel.querySelectorAll('.opt'), function (b, k) {
        b.disabled = true;
        if (k === q.answer) b.classList.add('correct');
        else if (k === picked) b.classList.add('wrong');
      });

      var head = correct ? '✓ 정답입니다'
        : '✕ 아쉬워요 — 정답은 ' + esc(String(o.opts[q.answer] == null ? '' : o.opts[q.answer]).slice(0, 40));
      var fb = panel.querySelector('#fb');
      fb.innerHTML = '<div class="fb ' + (correct ? 'ok' : 'no') + '">' +
        '<div class="fb-head">' + head + '</div>' +
        (q.explanation ? '<p class="fb-body">' + inline(q.explanation) + '</p>' : '') +
        '<button class="btn btn-primary" type="button" id="next-q">' +
          (idx === qs.length - 1 ? '결과 보기' : '다음 문제') + '</button>' +
      '</div>';

      fb.querySelector('#next-q').addEventListener('click', function () {
        if (idx < qs.length - 1) {
          idx += 1;
          draw();
          var tabs = view.querySelector('.tabs');
          if (tabs) window.scrollTo({ top: Math.max(0, tabs.getBoundingClientRect().top + window.scrollY - 110), behavior: 'smooth' });
        } else {
          finish();
        }
      });
    }

    function finish() {
      var score = 0;
      var wrong = [];
      qs.forEach(function (q, i) {
        if (answers[i] === q.answer) score += 1;
        else wrong.push({ q: q, i: i });
      });

      var record = quizRecord(ep.id);
      writeJSON(PREFIX + '.quiz.' + ep.id, {
        best: Math.max(score, record ? record.best : 0),
        last: score,
        total: qs.length,
        at: new Date().toISOString()
      });

      var msg;
      if (score === qs.length) msg = '완벽해요. 오늘 브리핑의 숫자를 그대로 붙잡았어요.';
      else if (score >= Math.ceil(qs.length * 0.7)) msg = '좋아요. 핵심은 잡았어요. 틀린 문제만 다시 보면 돼요.';
      else if (score > 0) msg = '절반쯤 왔어요. 아래 정답을 훑고 한 번 더 풀어 보세요.';
      else msg = '괜찮아요. 숫자는 한 번에 외워지지 않아요. 카드로 돌아가 다시 읽어 보세요.';

      var reviewHTML = wrong.length ? '<div class="review">' + wrong.map(function (w) {
        var o = quizOptions(w.q);
        return '<div class="review-item">' +
          '<div class="review-q">' + esc(w.q.question) + '</div>' +
          '<div class="review-a">정답 · ' + esc(o.opts[w.q.answer]) + '</div>' +
        '</div>';
      }).join('') + '</div>' : '';

      panel.innerHTML = '<div class="score">' +
        '<div class="score-num">' + score + '<small> / ' + qs.length + '</small></div>' +
        '<p class="score-line">' + esc(msg) + '</p>' +
        reviewHTML +
        '<div class="score-actions">' +
          '<button class="btn btn-ghost" type="button" id="retry">다시 풀기</button>' +
          '<button class="btn btn-primary" type="button" id="to-notes">생각 정리하기</button>' +
        '</div></div>';

      panel.querySelector('#retry').addEventListener('click', function () {
        idx = 0;
        answers = [];
        draw();
      }, sig);
      panel.querySelector('#to-notes').addEventListener('click', function () {
        navigate(ep.briefingDate || ep.date, ep.channel, 'notes');
      }, sig);
    }

    draw();
  }

  /* ---------- reflection notes ---------- */

  function renderNotes(ep, panel, sig) {
    var rs = Array.isArray(ep.reflections) ? ep.reflections : [];
    if (!rs.length) {
      panel.innerHTML = '<p class="muted" style="padding:24px 0">이 편에는 생각해 볼 질문이 없어요.</p>';
      return;
    }

    var html = '<div class="notes">' +
      '<p class="notes-hint">정답을 정해 두는 곳이 아니라, 생각을 적어 두는 곳이에요. 적은 내용은 이 기기의 브라우저에만 저장되고 밖으로 나가지 않아요.</p>';

    rs.forEach(function (r, i) {
      var qid = r.id || 'q' + (i + 1);
      html += '<article class="note">' +
        '<div class="note-num">질문 ' + (i + 1) + '</div>' +
        '<h3 class="note-q">' + esc(r.question) + '</h3>' +
        (r.hint ? '<p class="note-hint">' + esc(r.hint) + '</p>' : '') +
        '<textarea class="note-input" data-qid="' + esc(qid) + '" rows="4" placeholder="떠오르는 대로 적어 보세요. 자동으로 저장돼요."></textarea>' +
        '<div class="note-foot"><span class="save-state"></span>' +
          '<button class="link-btn" type="button" data-clear="' + esc(qid) + '">지우기</button></div>' +
      '</article>';
    });

    html += '<div class="notes-actions">' +
      '<button class="btn btn-ghost" type="button" id="copy-notes">메모 전체 복사</button>' +
      '<button class="btn btn-ghost" type="button" id="to-quiz">퀴즈로</button>' +
    '</div></div>';

    panel.innerHTML = html;

    var timers = {};

    function stateText(ta, saved) {
      var foot = ta.parentNode.querySelector('.save-state');
      if (!foot) return;
      var len = ta.value.trim().length;
      if (!len) {
        foot.textContent = '아직 적지 않았어요';
        foot.classList.remove('saved');
        return;
      }
      foot.textContent = (saved ? '저장됨' : '저장 중…') + ' · ' + len + '자';
      if (saved) foot.classList.add('saved'); else foot.classList.remove('saved');
    }

    function persist(ta) {
      var key = noteKey(ep.id, ta.getAttribute('data-qid'));
      var value = ta.value;
      if (value.trim()) {
        writeText(key, value);
        stateText(ta, true);
      } else {
        removeText(key);
        stateText(ta, true);
      }
    }

    Array.prototype.forEach.call(panel.querySelectorAll('.note-input'), function (ta) {
      var qid = ta.getAttribute('data-qid');
      var saved = readText(noteKey(ep.id, qid));
      if (saved) ta.value = saved;
      stateText(ta, true);

      ta.addEventListener('input', function () {
        window.clearTimeout(timers[qid]);
        stateText(ta, false);
        timers[qid] = window.setTimeout(function () { persist(ta); }, 400);
      }, sig);

      ta.addEventListener('blur', function () {
        window.clearTimeout(timers[qid]);
        persist(ta);
      }, sig);
    });

    panel.addEventListener('click', function (ev) {
      var clearBtn = ev.target.closest('button[data-clear]');
      if (clearBtn) {
        var qid = clearBtn.getAttribute('data-clear');
        var ta = null;
        Array.prototype.forEach.call(panel.querySelectorAll('.note-input'), function (el) {
          if (el.getAttribute('data-qid') === qid) ta = el;
        });
        if (!ta) return;
        if (ta.value.trim() && !window.confirm('이 질문에 적은 메모를 지울까요?')) return;
        ta.value = '';
        removeText(noteKey(ep.id, qid));
        stateText(ta, true);
        return;
      }

      if (ev.target.closest('#to-quiz')) {
        navigate(ep.briefingDate || ep.date, ep.channel, 'quiz');
        return;
      }

      var copyBtn = ev.target.closest('#copy-notes');
      if (copyBtn) {
        var lines = [];
        Array.prototype.forEach.call(panel.querySelectorAll('.note'), function (art) {
          var q = art.querySelector('.note-q');
          var t = art.querySelector('.note-input');
          var text = t && t.value.trim();
          if (!text) return;
          lines.push('Q. ' + (q ? q.textContent : '').trim() + '\n' + text);
        });
        var payload = lines.join('\n\n');
        if (!payload) {
          copyBtn.textContent = '적어 둔 메모가 없어요';
          window.setTimeout(function () { copyBtn.textContent = '메모 전체 복사'; }, 1600);
          return;
        }
        var done = function () {
          copyBtn.textContent = '복사했습니다';
          window.setTimeout(function () { copyBtn.textContent = '메모 전체 복사'; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(payload).then(done, function () { copyBtn.textContent = '복사할 수 없어요'; });
        } else {
          var area = document.createElement('textarea');
          area.value = payload;
          document.body.appendChild(area);
          area.select();
          try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
          document.body.removeChild(area);
        }
      }
    }, sig);
  }

  /* ---------- date sheet ---------- */

  function openDateSheet(route) {
    var backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="날짜 선택">' +
      '<div class="sheet-head"><div class="sheet-title">브리핑 날짜</div>' +
        '<button class="sheet-close" type="button" aria-label="닫기">✕</button></div>' +
      '<ul class="sheet-list">' + state.days.map(function (d) {
        var has = channelHasContent(d);
        var count = Object.keys(has).length;
        return '<li class="sheet-item' + (d === route.day ? ' current' : '') + '">' +
          '<a href="#/d/' + encodeURIComponent(d) + '/' + encodeURIComponent(route.channel) + '/cards">' +
            '<span class="d">' + esc(shortDate(d)) + '</span>' +
            '<span class="t">' + esc(formatDateLong(d)) + '</span>' +
            '<span class="n">' + count + '개 채널</span>' +
          '</a></li>';
      }).join('') + '</ul></div>';
    document.body.appendChild(backdrop);

    function close() {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(ev) { if (ev.key === 'Escape') close(); }

    backdrop.addEventListener('click', function (ev) {
      if (ev.target === backdrop || ev.target.closest('.sheet-close') || ev.target.closest('a')) close();
    });
    document.addEventListener('keydown', onKey);
  }

  /* ---------- boot ---------- */

  function renderError(err) {
    view.innerHTML = '<div class="state">브리핑을 불러오지 못했어요.<br>' +
      '<span style="font-size:12px;opacity:.7">' + esc(err && err.message ? err.message : '') + '</span><br>' +
      '<button class="btn btn-ghost" type="button" id="retry-load">다시 불러오기</button></div>';
    var btn = document.getElementById('retry-load');
    if (btn) btn.addEventListener('click', function () { load(); });
  }

  function load() {
    if (mastheadDate) mastheadDate.textContent = todayLabel();
    view.innerHTML = '<div class="state">브리핑을 불러오는 중…</div>';

    fetch(DATA_URL, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var list = Array.isArray(data) ? data : (data && Array.isArray(data.episodes) ? data.episodes : []);
        var channels = data && Array.isArray(data.channels) ? data.channels : [];
        state.channels = channels;
        state.episodes = list;
        buildIndex();
        state.loaded = true;
        render();
      })
      .catch(function (err) {
        state.loaded = false;
        renderError(err);
      });
  }

  window.addEventListener('hashchange', function () {
    if (state.loaded) render();
  });

  load();
})();
