/* 슈카월드 아침 브리핑 — vanilla JS, no build step */
(function () {
  'use strict';

  var DATA_URL = 'data/episodes.json';
  var PREFIX = 'syuka.v1';
  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  var TABS = [
    { key: 'cards', label: '읽기' },
    { key: 'quiz', label: '퀴즈' },
    { key: 'notes', label: '생각해 보기' }
  ];

  var state = { episodes: [], generatedAt: '', loaded: false };
  var panelAC = null;

  var view = document.getElementById('view');
  var mastheadDate = document.getElementById('masthead-date');

  /* ---------- small helpers ---------- */

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ESC[c];
    });
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function formatDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return m[1] + '.' + m[2] + '.' + m[3] + ' (' + WEEKDAYS[d.getDay()] + ')';
  }

  function shortDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? m[2] + '.' + m[3] : String(iso || '');
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

  function writePos(episodeId, index) {
    writeJSON(PREFIX + '.pos.' + episodeId, index);
  }

  function quizRecord(episodeId) {
    var r = readJSON(PREFIX + '.quiz.' + episodeId, null);
    if (r && typeof r.best === 'number' && typeof r.total === 'number') return r;
    return null;
  }

  function noteKey(episodeId, questionId) {
    return PREFIX + '.note.' + episodeId + '.' + questionId;
  }

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

  /* ---------- routing ---------- */

  function findEpisode(id) {
    for (var i = 0; i < state.episodes.length; i += 1) {
      if (state.episodes[i].id === id) return state.episodes[i];
    }
    return null;
  }

  function parseRoute() {
    var raw = String(location.hash || '').replace(/^#/, '');
    var parts = raw.split('?')[0].split('/').filter(Boolean);
    if (parts[0] === 'e' && parts[1]) {
      var ep = findEpisode(decodeURIComponent(parts[1]));
      if (ep) {
        var tab = parts[2];
        if (tab !== 'cards' && tab !== 'quiz' && tab !== 'notes') tab = 'cards';
        return { name: 'reader', episode: ep, tab: tab };
      }
    }
    return { name: 'home' };
  }

  function navigate(episodeId, tab) {
    var hash = '#/e/' + encodeURIComponent(episodeId) + '/' + (tab || 'cards');
    if (location.hash === hash) {
      render();
    } else {
      location.hash = hash;
    }
  }

  function render() {
    if (!state.loaded) return;
    var route = parseRoute();
    if (route.name === 'reader') {
      renderReader(route.episode, route.tab);
    } else {
      if (panelAC) { panelAC.abort(); panelAC = null; }
      renderHome();
    }
    window.scrollTo(0, 0);
  }

  /* ---------- home ---------- */

  function episodeMetaLine(ep) {
    var bits = [];
    var cards = Array.isArray(ep.cards) ? ep.cards.length : 0;
    var quiz = Array.isArray(ep.quizzes) ? ep.quizzes.length : 0;
    if (cards) bits.push('카드 ' + cards);
    if (quiz) bits.push('퀴즈 ' + quiz);
    return bits.join(' · ');
  }

  function renderHome() {
    var eps = state.episodes;
    if (!eps.length) {
      view.innerHTML = '<div class="state">아직 브리핑이 없습니다.<br>매일 아침 8시에 새 브리핑이 올라옵니다.</div>';
      return;
    }

    var latest = eps[0];
    var cards = Array.isArray(latest.cards) ? latest.cards : [];
    var quizzes = Array.isArray(latest.quizzes) ? latest.quizzes : [];
    var reflections = Array.isArray(latest.reflections) ? latest.reflections : [];
    var pos = readPos(latest.id, Math.max(cards.length, 1));
    var rec = quizRecord(latest.id);
    var notes = countNotes(latest);
    var started = pos > 0 || !!rec || notes > 0;

    var html = '<section class="home">' +
      '<article class="hero">' +
        '<div class="hero-label">오늘의 브리핑</div>' +
        '<h1 class="hero-title">' + esc(latest.title) + '</h1>' +
        (latest.summary ? '<p class="hero-dek">' + esc(latest.summary) + '</p>' : '') +
        '<div class="chips">' +
          '<span class="chip chip-bar">' + esc(formatDate(latest.date)) + '</span>' +
          (cards.length ? '<span class="chip">카드 ' + cards.length + '</span>' : '') +
          (quizzes.length ? '<span class="chip">퀴즈 ' + quizzes.length + '</span>' : '') +
          (reflections.length ? '<span class="chip">질문 ' + reflections.length + '</span>' : '') +
          (rec ? '<span class="chip">퀴즈 ' + rec.best + '/' + rec.total + '</span>' : '') +
        '</div>' +
        '<div class="hero-actions">' +
          '<a class="btn btn-primary" href="#/e/' + encodeURIComponent(latest.id) + '/cards">' +
            (started ? '이어 읽기 · ' + (pos + 1) + '/' + cards.length : '읽기 시작') +
          '</a>' +
          (latest.url ? '<a class="btn btn-ghost" href="' + esc(latest.url) + '" target="_blank" rel="noopener">원문 영상</a>' : '') +
        '</div>' +
      '</article>';

    if (eps.length > 1) {
      html += '<div class="section-head"><h2>지난 브리핑</h2><span>' + (eps.length - 1) + '편</span></div>' +
        '<ul class="ep-list">';
      eps.slice(1).forEach(function (ep) {
        var n = Array.isArray(ep.cards) ? ep.cards.length : 0;
        var p = readPos(ep.id, Math.max(n, 1));
        var done = n > 0 && p >= n - 1;
        html += '<li class="ep-item"><a class="ep-link" href="#/e/' + encodeURIComponent(ep.id) + '/cards">' +
          '<div class="ep-date">' + esc(formatDate(ep.date)) + '</div>' +
          '<h3 class="ep-name">' + esc(ep.title) + '</h3>' +
          '<div class="ep-sub"><span>' + esc(episodeMetaLine(ep)) + '</span>' +
            (done ? '<span class="dot-sep"></span><span class="ep-done">다 읽음</span>' : '') +
          '</div></a></li>';
      });
      html += '</ul>';
    } else {
      html += '<div class="empty-note">매일 아침 8시, 슈카월드에 새 영상이 올라오면 그 영상을 카드로 정리해 여기에 쌓입니다. ' +
        '읽던 자리와 퀴즈 점수, 적어 둔 생각은 이 기기에 저장됩니다.</div>';
    }

    html += '<div class="site-foot">슈카월드 최신 영상을 매일 아침 카드로 정리합니다.<br>' +
      '원본 영상과 모든 내용의 출처는 <a href="https://www.youtube.com/@syukaworld" target="_blank" rel="noopener">슈카월드 유튜브 채널</a>입니다.' +
      '</div></section>';

    view.innerHTML = html;
  }

  /* ---------- reader ---------- */

  function renderReader(ep, tab) {
    if (panelAC) panelAC.abort();
    panelAC = new AbortController();
    var sig = { signal: panelAC.signal };

    var tabsHTML = TABS.map(function (t) {
      return '<button type="button" role="tab" data-tab="' + t.key + '" aria-selected="' +
        (t.key === tab ? 'true' : 'false') + '">' + t.label + '</button>';
    }).join('');

    var numbers = Array.isArray(ep.numbers) ? ep.numbers.filter(function (n) { return n && n.value; }) : [];
    var numbersHTML = numbers.length ? '<div class="numstrip">' + numbers.map(function (n) {
      return '<div class="numstrip-item"><div class="numstrip-value">' + esc(n.value) + '</div>' +
        (n.label ? '<div class="numstrip-label">' + esc(n.label) + '</div>' : '') + '</div>';
    }).join('') + '</div>' : '';

    view.innerHTML = '<section class="reader">' +
      '<a class="back" href="#/">← 브리핑 목록</a>' +
      '<header class="ep-head">' +
        '<div class="ep-meta">' + esc(formatDate(ep.date)) + ' · 슈카월드</div>' +
        '<h1 class="ep-title">' + esc(ep.title) + '</h1>' +
        (ep.subtitle ? '<p class="ep-subtitle">' + esc(ep.subtitle) + '</p>' : '') +
        (ep.summary ? '<p class="ep-dek">' + esc(ep.summary) + '</p>' : '') +
        numbersHTML +
        '<div class="ep-actions">' +
          (ep.url ? '<a class="btn btn-yt" href="' + esc(ep.url) + '" target="_blank" rel="noopener">▶ 원문 영상 보기</a>' : '') +
          (state.episodes.length > 1 ? '<button class="btn btn-ghost" type="button" id="switch-btn">지난 브리핑</button>' : '') +
        '</div>' +
      '</header>' +
      '<nav class="tabs" role="tablist">' + tabsHTML + '</nav>' +
      '<div id="panel"></div>' +
    '</section>';

    var tabsEl = view.querySelector('.tabs');
    tabsEl.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-tab]');
      if (!btn) return;
      navigate(ep.id, btn.getAttribute('data-tab'));
    }, sig);

    var switchBtn = view.querySelector('#switch-btn');
    if (switchBtn) {
      switchBtn.addEventListener('click', function () { openEpisodeSheet(ep.id); }, sig);
    }

    var panel = view.querySelector('#panel');
    if (tab === 'quiz') renderQuiz(ep, panel, sig);
    else if (tab === 'notes') renderNotes(ep, panel, sig);
    else renderCards(ep, panel, sig);
  }

  function cardHTML(card, i, total) {
    var body = Array.isArray(card.body) ? card.body : [];
    var bodyHTML = body.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    var tag = card.kicker ? String(card.kicker).split('·')[1] : '';

    return '<article class="card" data-i="' + i + '"><div class="card-inner">' +
      (card.kicker ? '<div class="card-kicker">' + esc(card.kicker) + '</div>' : '') +
      '<h2 class="card-title">' + esc(card.title) + '</h2>' +
      (bodyHTML ? '<div class="card-body">' + bodyHTML + '</div>' : '') +
      (card.pullQuote ? '<blockquote class="pull">' + esc(card.pullQuote) + '</blockquote>' : '') +
      (card.stat && card.stat.value ? '<div class="stat">' +
        '<div class="stat-value">' + esc(card.stat.value) + '</div>' +
        (card.stat.label ? '<div class="stat-label">' + esc(card.stat.label) + '</div>' : '') +
      '</div>' : '') +
      (card.footnote ? '<p class="footnote">' + esc(card.footnote) + '</p>' : '') +
      '<div class="card-foot"><span>' + pad(i + 1) + ' / ' + pad(total) + '</span>' +
        (tag ? '<span>' + esc(tag.trim()) + '</span>' : '') + '</div>' +
    '</div></article>';
  }

  function renderCards(ep, panel, sig) {
    var cards = Array.isArray(ep.cards) ? ep.cards : [];
    var n = cards.length;
    if (!n) {
      panel.innerHTML = '<p class="muted" style="padding:24px 0">이 편에는 카드가 없습니다.</p>';
      return;
    }

    var html = '<div class="deck-wrap" id="deck-wrap"><div class="deck" id="deck">' +
      cards.map(function (c, i) { return cardHTML(c, i, n); }).join('') +
      '</div></div>';

    if (n > 1) {
      html += '<div class="deck-ui">' +
        '<div class="bar"><i id="bar"></i></div>' +
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

    html += '<div class="end-cta">' +
      '<p>여기까지 읽었습니다. 기억에 남는 숫자 하나를 골라 두면 훨씬 오래 갑니다.</p>' +
      '<div class="end-cta-row">' +
        '<button class="btn btn-primary" type="button" id="go-quiz">퀴즈 풀기</button>' +
        '<button class="btn btn-ghost" type="button" id="go-notes">생각 정리하기</button>' +
      '</div></div>';

    panel.innerHTML = html;

    var goQuiz = panel.querySelector('#go-quiz');
    if (goQuiz) goQuiz.addEventListener('click', function () { navigate(ep.id, 'quiz'); }, sig);
    var goNotes = panel.querySelector('#go-notes');
    if (goNotes) goNotes.addEventListener('click', function () { navigate(ep.id, 'notes'); }, sig);

    var deck = panel.querySelector('#deck');
    var wrap = panel.querySelector('#deck-wrap');
    if (!deck || !wrap) return;

    var index = readPos(ep.id, n);
    var bar = panel.querySelector('#bar');
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
      if (bar) bar.style.width = (((i + 1) / n) * 100) + '%';
      if (counter) counter.textContent = (i + 1) + ' / ' + n;
      var hint = panel.querySelector('#swipe-hint');
      if (hint) {
        if (i > 0) {
          hint.parentNode.removeChild(hint);
        }
      }
      if (dots) {
        Array.prototype.forEach.call(dots.children, function (d, k) {
          if (k === i) d.classList.add('on'); else d.classList.remove('on');
        });
      }
      if (prev) prev.disabled = i === 0;
      if (next) {
        var atEnd = i === n - 1;
        if (atEnd) next.classList.add('is-end'); else next.classList.remove('is-end');
        next.textContent = atEnd ? '퀴즈 풀기 →' : '→';
        next.setAttribute('aria-label', atEnd ? '퀴즈 풀기' : '다음 카드');
      }
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
      var top = wrap.getBoundingClientRect().top + window.scrollY - 64;
      if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }

    if (n > 1) {
      deck.addEventListener('scroll', onScroll, { passive: true, signal: sig.signal });
      if (prev) prev.addEventListener('click', function () { goTo(current() - 1); }, sig);
      if (next) next.addEventListener('click', function () {
        var i = current();
        if (i >= n - 1) navigate(ep.id, 'quiz');
        else goTo(i + 1);
      }, sig);
      if (dots) dots.addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-i]');
        if (b) goTo(Number(b.getAttribute('data-i')));
      }, sig);
      window.addEventListener('keydown', function (ev) {
        if (ev.key === 'ArrowRight') { goTo(current() + 1); }
        else if (ev.key === 'ArrowLeft') { goTo(current() - 1); }
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
      panel.innerHTML = '<p class="muted" style="padding:24px 0">이 편에는 퀴즈가 없습니다.</p>';
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

      var head = correct ? '✓ 정답입니다' : '✕ 아쉬워요 — 정답은 ' + esc(o.opts[q.answer] == null ? '' : String(o.opts[q.answer]).slice(0, 40));
      var fb = panel.querySelector('#fb');
      fb.innerHTML = '<div class="fb ' + (correct ? 'ok' : 'no') + '">' +
        '<div class="fb-head">' + head + '</div>' +
        (q.explanation ? '<p class="fb-body">' + esc(q.explanation) + '</p>' : '') +
        '<button class="btn btn-primary" type="button" id="next-q">' +
          (idx === qs.length - 1 ? '결과 보기' : '다음 문제') + '</button>' +
      '</div>';

      fb.querySelector('#next-q').addEventListener('click', function () {
        if (idx < qs.length - 1) {
          idx += 1;
          draw();
          var tabs = document.querySelector('.tabs');
          if (tabs) window.scrollTo({ top: Math.max(0, tabs.getBoundingClientRect().top + window.scrollY - 70), behavior: 'smooth' });
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
      if (score === qs.length) msg = '완벽합니다. 오늘 브리핑의 숫자를 그대로 붙잡았습니다.';
      else if (score >= Math.ceil(qs.length * 0.7)) msg = '좋습니다. 핵심은 잡았습니다. 틀린 문제만 다시 보면 됩니다.';
      else if (score > 0) msg = '절반쯤 왔습니다. 아래 정답을 훑고 한 번 더 풀어 보세요.';
      else msg = '괜찮습니다. 숫자는 한 번에 외워지지 않습니다. 카드로 돌아가 다시 읽어 보세요.';

      var reviewHTML = wrong.length ? '<div class="review">' + wrong.map(function (w) {
        var o = quizOptions(w.q);
        var label = o.opts[w.q.answer];
        return '<div class="review-item">' +
          '<div class="review-q">' + esc(w.q.question) + '</div>' +
          '<div class="review-a">정답 · ' + esc(label) + '</div>' +
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
        navigate(ep.id, 'notes');
      }, sig);
    }

    draw();
  }

  /* ---------- reflection notes ---------- */

  function renderNotes(ep, panel, sig) {
    var rs = Array.isArray(ep.reflections) ? ep.reflections : [];
    if (!rs.length) {
      panel.innerHTML = '<p class="muted" style="padding:24px 0">이 편에는 생각해 볼 질문이 없습니다.</p>';
      return;
    }

    var html = '<div class="notes">' +
      '<p class="notes-hint">정답을 정해 두는 곳이 아니라, 생각을 적어 두는 곳입니다. 적은 내용은 이 기기의 브라우저에만 저장되고 밖으로 나가지 않습니다.</p>';

    rs.forEach(function (r, i) {
      var qid = r.id || 'q' + (i + 1);
      html += '<article class="note">' +
        '<div class="note-num">질문 ' + (i + 1) + '</div>' +
        '<h3 class="note-q">' + esc(r.question) + '</h3>' +
        (r.hint ? '<p class="note-hint">' + esc(r.hint) + '</p>' : '') +
        '<textarea class="note-input" data-qid="' + esc(qid) + '" rows="4" placeholder="떠오르는 대로 적어 보세요. 자동으로 저장됩니다."></textarea>' +
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
        foot.textContent = '아직 적지 않았습니다';
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
        navigate(ep.id, 'quiz');
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
          copyBtn.textContent = '적어 둔 메모가 없습니다';
          window.setTimeout(function () { copyBtn.textContent = '메모 전체 복사'; }, 1600);
          return;
        }
        var done = function () {
          copyBtn.textContent = '복사했습니다';
          window.setTimeout(function () { copyBtn.textContent = '메모 전체 복사'; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(payload).then(done, function () { copyBtn.textContent = '복사할 수 없습니다'; });
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

  /* ---------- episode sheet ---------- */

  function openEpisodeSheet(currentId) {
    var backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="브리핑 목록">' +
      '<div class="sheet-head"><div class="sheet-title">브리핑 목록</div>' +
        '<button class="sheet-close" type="button" aria-label="닫기">✕</button></div>' +
      '<ul class="sheet-list">' + state.episodes.map(function (e) {
        return '<li class="sheet-item' + (e.id === currentId ? ' current' : '') + '">' +
          '<a href="#/e/' + encodeURIComponent(e.id) + '/cards">' +
            '<span class="d">' + esc(shortDate(e.date)) + '</span>' +
            '<span class="t">' + esc(e.title) + '</span>' +
          '</a></li>';
      }).join('') + '</ul>' +
    '</div>';
    document.body.appendChild(backdrop);

    function close() {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.removeEventListener('keydown', onKey);
    }

    function onKey(ev) {
      if (ev.key === 'Escape') close();
    }

    backdrop.addEventListener('click', function (ev) {
      if (ev.target === backdrop || ev.target.closest('.sheet-close') || ev.target.closest('a')) close();
    });
    document.addEventListener('keydown', onKey);
  }

  /* ---------- boot ---------- */

  function renderError(err) {
    view.innerHTML = '<div class="state">브리핑을 불러오지 못했습니다.<br>' +
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
        list.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
        state.episodes = list;
        state.generatedAt = (data && data.generatedAt) || '';
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
