/* ============================================================
   🍌 کوییز موز — منطق بازی
   فقط جاوااسکریپت خالص، بدون هیچ کتابخانه‌ای
   ============================================================ */
(function () {
  'use strict';

  /* ---------- ابزارهای کمکی ---------- */
  function $(id) { return document.getElementById(id); }

  var FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  function faNum(n) {
    return String(n).replace(/\d/g, function (d) { return FA_DIGITS[+d]; });
  }

  /* تبدیل ارقام فارسی/عربی به انگلیسی (برای ورودی کد روم و کپچا) */
  function toEnDigits(s) {
    return String(s)
      .replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
      .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); });
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function restartAnim(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; /* ریست انیمیشن */
    el.classList.add(cls);
  }

  /* ---------- تنظیمات بازی ---------- */
  var QUESTION_COUNT = 15;  /* تعداد سوال هر بازی */
  var TIME_PER_Q = 15;      /* ثانیه برای هر سوال */
  var AUTO_NEXT_MS = 1500;  /* تاخیر خودکار رفتن به سوال بعد */

  /* عناوین رنک‌ها (آستانه‌ها متناسب با تعداد سوال بازی محاسبه می‌شود) */
  var RANK_DEFS = [
    { cls: 'r1', emoji: '🤢', title: 'موز کپک زده', msg: 'یوه! این موز کپک زده! دوباره بازی کن و نجاتش بده.' },
    { cls: 'r2', emoji: '🟢', title: 'موز نارس',    msg: 'هنوز خامی! یک دور دیگر تلاش کن تا رسیده شوی.' },
    { cls: 'r3', emoji: '🌳', title: 'موز درختی',   msg: 'هنوز روی درخت آویزانی! بیشتر تلاش کن تا برداشت شوی.' },
    { cls: 'r4', emoji: '🍌', title: 'موز رسیده',   msg: 'خوب بود! کمی دیگر، طلایی می‌شوی.' },
    { cls: 'r5', emoji: '👑', title: 'موز طلایی',   msg: 'فوق‌العاده! تو پادشاه موزها هستی!' }
  ];

  /* آستانهٔ رنک برای بازی n سوالی — برای ۱۵ سؤال: ۰-۳، ۴-۵، ۶-۸، ۹-۱۲، ۱۳-۱۵ */
  function ranksFor(total) {
    function cl(x) { return Math.round(total * x / 15); }
    var a = Math.min(total, cl(3));
    var b = Math.min(total, Math.max(a + 1, cl(5)));
    var c = Math.min(total, Math.max(b + 1, cl(8)));
    var d = Math.min(total, Math.max(c + 1, cl(12)));
    var lim = [a, b, c, d, 999];
    return RANK_DEFS.map(function (def, i) {
      return {
        cls: def.cls, emoji: def.emoji, title: def.title, msg: def.msg,
        min: i === 0 ? 0 : lim[i - 1] + 1,
        max: lim[i]
      };
    });
  }

  /* ---------- وضعیت بازی ---------- */
  var state = {
    name: '',
    nick: '',
    category: null,   /* دستهٔ انتخاب‌شده */
    questions: [],
    idx: 0,
    score: 0,
    log: [],          /* {q, chosen, correct, ok, timedOut} */
    timerId: null,
    timeLeft: TIME_PER_Q,
    locked: false,
    nextTimer: null,
    lastRank: ranksFor(QUESTION_COUNT)[3],
    newRecord: false,
    party: false       /* 🎉 حالت پارتی آنلاین */
  };

  /* ---------- ذخیره‌سازی محلی ---------- */
  function getPlayer() {
    try { return JSON.parse(localStorage.getItem('mozQuizPlayer') || 'null'); }
    catch (e) { return null; }
  }
  function getBest() {
    try { return JSON.parse(localStorage.getItem('mozQuizBest') || 'null'); }
    catch (e) { return null; }
  }

  /* ---------- بانک سؤال مصرف‌شدهٔ هر بازیکن (ضد تکرار) ----------
     کلید بر اساس «نام + لقب» است؛ با تغییر هرکدام، بانک دوباره پر می‌شود */
  function playerKey() {
    return 'mozQuizUsed_' + encodeURIComponent((state.name || '') + '|' + (state.nick || ''));
  }
  function getUsedAll() {
    try { return JSON.parse(localStorage.getItem(playerKey()) || '{}'); }
    catch (e) { return {}; }
  }
  function saveUsedAll(map) {
    try { localStorage.setItem(playerKey(), JSON.stringify(map)); } catch (e) { /* ignore */ }
  }
  function remainingIndices(cat) {
    var used = getUsedAll()[cat.id] || [];
    var map = {};
    used.forEach(function (i) { map[i] = 1; });
    var rem = [];
    for (var i = 0; i < cat.questions.length; i++) if (!map[i]) rem.push(i);
    return rem;
  }
  function markUsed(catId, indices) {
    var all = getUsedAll();
    all[catId] = (all[catId] || []).concat(indices);
    saveUsedAll(all);
  }

  /* ---------- جابه‌جایی بین صفحات ---------- */
  function show(screenId) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
    $(screenId).classList.add('active');
    window.scrollTo(0, 0);
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    restartAnim(t, 'toast');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 2200);
  }

  /* ---------- صفحهٔ ورود ---------- */
  function endsWithMooz(s) { return /موز\s*$/.test(s); }

  function enterSite() {
    var name = $('player-name').value.trim();
    var nick = $('player-nick').value.trim();
    var err = $('entry-error');

    function fail(msg) {
      err.textContent = msg;
      err.classList.remove('hidden');
      restartAnim(err, 'error');
    }

    if (!name) { fail('نام را وارد کن 😅'); return; }
    if (!nick) { fail('لقب موزی‌ات را وارد کن 🍌'); return; }
    if (!endsWithMooz(nick)) {
      fail('لقب باید به «موز» ختم شود! مثلاً: کاپیتان موز');
      return;
    }

    err.classList.add('hidden');
    state.name = name;
    state.nick = nick;
    try {
      localStorage.setItem('mozQuizPlayer', JSON.stringify({ name: name, nick: nick }));
    } catch (e) { /* دسترسی محدود */ }
    startMusic(); /* 🎵 موزیک بانانا با اولین حرکت کاربر */
    goHome();
  }

  function goHome() {
    $('home-name').textContent = state.name;
    $('home-nick').textContent = state.nick;
    var best = getBest();
    $('home-best').textContent = best
      ? '🏆 بهترین امتیاز تو: ' + faNum(best.score) + ' — با لقب «' + best.nick + '»'
      : '🏆 هنوز رکوردی ثبت نشده';
    updateRejoinChip(); /* 🎉 اگر روم بازی داریم، دکمهٔ برگشت نشان بده */
    show('screen-home');
  }

  /* ---------- صفحهٔ انتخاب دسته ---------- */
  function buildCategoryGrid() {
    var grid = $('cat-grid');
    grid.innerHTML = '';
    var cats = window.QUESTION_CATEGORIES || [];
    cats.forEach(function (cat) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-card c-' + cat.id;

      var emoji = document.createElement('span');
      emoji.className = 'cat-emoji';
      emoji.textContent = cat.icon;

      var info = document.createElement('span');
      info.className = 'cat-info';
      var name = document.createElement('span');
      name.className = 'cat-name';
      name.textContent = cat.name;
      var meta = document.createElement('span');
      meta.className = 'cat-meta';
      var rem = remainingIndices(cat);
      if (!rem.length) {
        btn.classList.add('done');
        meta.textContent = '🎉 همهٔ سؤال‌ها رو جواب دادی! با تغییر اسم یا لقب، دوباره باز می‌شه';
      } else if (rem.length < QUESTION_COUNT) {
        meta.textContent = 'فقط ' + faNum(rem.length) + ' سؤال برات مونده!';
      } else {
        meta.textContent = faNum(rem.length) + ' سؤال برات مونده • ' + faNum(QUESTION_COUNT) + ' سؤال تصادفی';
      }
      info.appendChild(name);
      info.appendChild(meta);

      var arrow = document.createElement('span');
      arrow.className = 'cat-arrow';
      arrow.textContent = '◂';

      btn.appendChild(emoji);
      btn.appendChild(info);
      btn.appendChild(arrow);
      btn.addEventListener('click', function () { startQuiz(cat.id); });
      grid.appendChild(btn);
    });
  }

  function showCategoryScreen() {
    buildCategoryGrid(); /* تعداد سوال‌ها همیشه تازه محاسبه شود */
    show('screen-category');
  }

  /* ---------- شروع بازی ----------
     در حالت پارتی: partyPicks = ایندکس سؤال‌های روم (برای همهٔ بازیکن‌ها یکسان است
     و از بانک ضدتکرار شخصی کم نمی‌شود) */
  function startQuiz(catId, partyPicks) {
    state.party = !!partyPicks; /* بدون partyPicks یعنی بازی انفرادی */

    var cats = window.QUESTION_CATEGORIES || [];
    var cat = null;
    for (var i = 0; i < cats.length; i++) {
      if (cats[i].id === catId) { cat = cats[i]; break; }
    }
    if (!cat || !cat.questions.length) {
      toast('این دسته سوالی ندارد! فایل questions.js را بررسی کن.');
      return;
    }

    var take, picks;
    if (state.party) {
      /* 🎉 پارتی: سؤال‌ها از میزبان روم می‌آید و برای همه یکسان است */
      picks = (partyPicks || []).filter(function (i) { return i >= 0 && i < cat.questions.length; });
      take = picks.length;
      if (!take) { toast('سؤال‌های روم پیدا نشد! 😕'); return; }
    } else {
      /* ضد تکرار: فقط از سؤال‌های باقی‌ماندهٔ این بازیکن بردار */
      var rem = remainingIndices(cat);
      if (!rem.length) {
        toast('🎉 همهٔ ' + faNum(cat.questions.length) + ' سؤال این دسته رو جواب دادی! برای بازی دوباره، اسم یا لقبت رو عوض کن.');
        return;
      }
      take = Math.min(QUESTION_COUNT, rem.length);
      picks = shuffle(rem).slice(0, take);
      markUsed(cat.id, picks); /* مصرف شد تا دیگر تکرار نشود */
    }

    state.category = cat;
    state.questions = picks.map(function (qIndex) {
      var item = cat.questions[qIndex];
      /* ترتیب تصادفی گزینه‌ها با حفظ گزینهٔ درست */
      var opts = item.options.map(function (text, i) {
        return { text: text, correct: i === item.correct };
      });
      return { q: item.q, hint: item.hint || '', options: shuffle(opts) };
    });

    if (!state.party && take < QUESTION_COUNT) {
      toast('⚠️ فقط ' + faNum(take) + ' سؤال از این دسته برات مونده — این بازی کوتاه‌تره!');
    }

    state.idx = 0;
    state.score = 0;
    state.log = [];
    $('quiz-score').textContent = faNum(0);
    $('quiz-nick').textContent = state.nick || '🍌';
    show('screen-quiz');
    renderQuestion();
  }

  /* ---------- نمایش سوال ---------- */
  function renderQuestion() {
    var total = state.questions.length;
    var item = state.questions[state.idx];

    state.locked = false;
    $('quiz-progress').textContent = (state.category ? state.category.icon + ' ' + state.category.name + ' • ' : '') +
      'سؤال ' + faNum(state.idx + 1) + ' از ' + faNum(total);
    $('progress-fill').style.width = (state.idx / total * 100) + '%';

    restartAnim($('question-card'), 'slide-in');
    $('question-text').textContent = item.q;

    var box = $('options');
    box.innerHTML = '';
    item.options.forEach(function (opt, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';

      var num = document.createElement('span');
      num.className = 'opt-num';
      num.textContent = faNum(i + 1);

      var txt = document.createElement('span');
      txt.className = 'opt-text';
      txt.textContent = opt.text;

      var mark = document.createElement('span');
      mark.className = 'mark';

      btn.appendChild(num);
      btn.appendChild(txt);
      btn.appendChild(mark);
      btn.addEventListener('click', function () { answer(i); });
      box.appendChild(btn);
    });

    $('explanation').classList.add('hidden');
    $('next-hint').classList.add('hidden');
    startTimer();
  }

  /* ---------- تایمر ---------- */
  function startTimer() {
    stopTimer();
    state.timeLeft = TIME_PER_Q;
    updateTimerUI();
    var last = Date.now();
    state.timerId = setInterval(function () {
      var now = Date.now();
      state.timeLeft -= (now - last) / 1000;
      last = now;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        updateTimerUI();
        stopTimer();
        answer(-1); /* وقت تمام شد */
        return;
      }
      updateTimerUI();
    }, 100);
  }

  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }

  function updateTimerUI() {
    var fill = $('timer-fill');
    fill.style.width = (state.timeLeft / TIME_PER_Q * 100) + '%';
    fill.classList.toggle('warn', state.timeLeft <= 8 && state.timeLeft > 5);
    fill.classList.toggle('danger', state.timeLeft <= 5);
    $('timer-num').textContent = faNum(Math.ceil(state.timeLeft));
  }

  /* ---------- پاسخ دادن ---------- */
  function answer(i) {
    if (state.locked) return;
    state.locked = true;
    stopTimer();

    var total = state.questions.length;
    var item = state.questions[state.idx];
    var timedOut = (i === -1);
    var ok = !timedOut && item.options[i].correct;
    var chosenText = timedOut ? null : item.options[i].text;
    var correctText = item.options.filter(function (o) { return o.correct; })[0].text;

    /* افکت صوتی نتیجه */
    sfx(timedOut ? 'timeout' : (ok ? 'correct' : 'wrong'));

    /* رنگ‌بندی گزینه‌ها و قفل کردن */
    var btns = document.querySelectorAll('#options .option');
    for (var j = 0; j < btns.length; j++) {
      (function (k) {
        var btn = btns[k];
        var opt = item.options[k];
        btn.disabled = true; /* قفل فوری */
        if (opt.correct) {
          btn.classList.add('correct');
          btn.querySelector('.mark').textContent = '✅';
        } else if (k === i) {
          btn.classList.add('wrong');
          btn.querySelector('.mark').textContent = '❌';
        } else {
          btn.classList.add('dim');
        }
      })(j);
    }

    /* جملهٔ توضیح */
    var prefix = timedOut ? '⏰ وقت تمام شد! ' : (ok ? '🎉 آفرین! ' : '🤔 اشتباه بود! ');
    var exp = $('explanation');
    exp.textContent = prefix + item.hint;
    exp.classList.remove('hidden');

    /* نوار پیشرفت + امتیاز */
    if (ok) {
      state.score++;
      $('quiz-score').textContent = faNum(state.score);
      floatPlusOne();
    }
    $('progress-fill').style.width = ((state.idx + 1) / total * 100) + '%';

    /* ثبت در پرونده */
    state.log.push({
      q: item.q,
      chosen: chosenText,
      correct: correctText,
      ok: ok,
      timedOut: timedOut
    });

    /* راهنمای رفتن به سوال بعد */
    var isLast = (state.idx + 1 >= total);
    $('next-hint-text').textContent = isLast ? 'در حال آماده‌سازی پرونده…' : 'سؤال بعدی…';
    var hint = $('next-hint');
    hint.classList.remove('hidden');
    restartAnim(hint.querySelector('.next-fill'), 'next-fill');

    /* رفتن خودکار بعد از ۱.۵ ثانیه */
    clearTimeout(state.nextTimer);
    state.nextTimer = setTimeout(nextQuestion, AUTO_NEXT_MS);
  }

  function floatPlusOne() {
    var chip = document.querySelector('.score-chip');
    if (!chip) return;
    var span = document.createElement('span');
    span.className = 'float-up';
    span.textContent = '+۱';
    chip.appendChild(span);
    setTimeout(function () { if (span.parentNode) span.parentNode.removeChild(span); }, 900);
  }

  function nextQuestion() {
    clearTimeout(state.nextTimer);
    state.idx++;
    if (state.idx >= state.questions.length) {
      finishQuiz();
    } else {
      renderQuestion();
    }
  }

  /* ---------- پایان بازی: ساخت پرونده ---------- */
  function finishQuiz() {
    var total = state.questions.length;
    var correct = state.score;
    var wrong = state.log.filter(function (l) { return !l.ok && !l.timedOut; }).length;
    var timeouts = state.log.filter(function (l) { return l.timedOut; }).length;

    /* 🎉 پارتی: نتیجه به روم ارسال و صفحهٔ انتظار/نتایج باز می‌شود */
    if (state.party) {
      partyOnFinished(correct, wrong, timeouts);
      return;
    }

    /* بهترین امتیاز در localStorage */
    var best = getBest();
    state.newRecord = !best || correct > best.score;
    if (state.newRecord) {
      best = { score: correct, name: state.name, nick: state.nick };
      try { localStorage.setItem('mozQuizBest', JSON.stringify(best)); } catch (e) { /* ignore */ }
    }

    /* رنک بر اساس امتیاز (آستانه‌ها متناسب با تعداد سوال این بازی) */
    var RANKS = ranksFor(total);
    var rank = RANKS[0];
    for (var r = 0; r < RANKS.length; r++) {
      if (correct >= RANKS[r].min && correct <= RANKS[r].max) { rank = RANKS[r]; break; }
    }
    state.lastRank = rank;

    /* پر کردن پرونده */
    $('file-no').textContent = 'شمارهٔ پرونده: MOZ-' + faNum(Math.floor(1000 + Math.random() * 9000));
    $('d-name').textContent = state.name;
    $('d-nick').textContent = state.nick;
    $('d-date').textContent = new Date().toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
    $('d-cat').textContent = state.category ? (state.category.icon + ' ' + state.category.name) : '—';
    $('d-correct').textContent = faNum(correct) + ' مورد ✅';
    $('d-wrong').textContent = faNum(wrong) + ' مورد ❌';
    $('d-timeout').textContent = faNum(timeouts) + ' مورد ⏰';
    $('d-score').textContent = faNum(correct) + ' از ' + faNum(total);
    $('d-best').innerHTML = faNum(best.score) + ' امتیاز' +
      (state.newRecord ? ' <span class="new-record">— 🎉 رکورد جدید!</span>' : '');

    /* مهر رنک */
    var stamp = $('rank-stamp');
    stamp.className = 'rank-stamp ' + rank.cls;
    stamp.textContent = rank.title + ' ' + rank.emoji;
    restartAnim(stamp, 'stampDrop');

    $('rank-msg').textContent = rank.msg;

    /* جزئیات پاسخ‌ها */
    buildReview();

    show('screen-result');
  }

  function buildReview() {
    var list = $('review-list');
    list.innerHTML = '';
    state.log.forEach(function (l) {
      var li = document.createElement('li');

      var head = document.createElement('div');
      head.className = 'rv-head';

      var icon = document.createElement('span');
      icon.textContent = l.ok ? '✅' : (l.timedOut ? '⏰' : '❌');

      var q = document.createElement('span');
      q.textContent = l.q;

      head.appendChild(icon);
      head.appendChild(q);
      li.appendChild(head);

      var ans = document.createElement('div');
      ans.className = 'rv-a ' + (l.ok ? 'ok' : (l.timedOut ? 'to' : 'no'));
      ans.textContent = l.ok
        ? ('پاسخ درست: ' + l.correct)
        : (l.timedOut
          ? ('وقت تمام شد — پاسخ درست: ' + l.correct)
          : ('پاسخ شما: ' + l.chosen + ' | پاسخ درست: ' + l.correct));
      li.appendChild(ans);

      list.appendChild(li);
    });
  }

  /* ---------- اشتراک‌گذاری: عکس پرونده ---------- */
  function buildShareText() {
    var total = state.questions.length;
    var best = getBest();
    return (
      '🍌 کوییز موز 🍌\n' +
      '👤 ' + state.name + ' (' + state.nick + ')\n' +
      '📂 دسته: ' + (state.category ? state.category.name : '—') + '\n' +
      '✅ امتیاز: ' + faNum(state.score) + ' از ' + faNum(total) + '\n' +
      '🏅 رنک: ' + state.lastRank.title + ' ' + state.lastRank.emoji + '\n' +
      (best ? '🏆 بهترین امتیاز: ' + faNum(best.score) + '\n' : '') +
      'ساخته‌شده توسط محمد مهدی عدالتیان'
    );
  }

  function downloadBlob(blob) {
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'moz-quiz-dossier.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
    } catch (e) { /* ignore */ }
  }

  /* عکس‌برداری واقعی از پرونده با html2canvas */
  function snapDossierImage(cb) {
    var dossier = document.querySelector('.dossier');
    var review = dossier ? dossier.querySelector('.review') : null;
    var tab = dossier ? dossier.querySelector('.dossier-tab') : null;
    if (!dossier || !window.html2canvas) { cb(null); return; }

    /* html2canvas لیست جزئیات را همیشه باز رندر می‌کند؛
       موقع عکس‌برداری مخفی‌اش می‌کنیم تا عکس تمیز باشد.
       زبانهٔ قهوه‌ای هم بیرون کادر است؛ موقع عکس‌برداری می‌آوریمش داخل کادر */
    var prevReview = review ? review.style.display : '';
    var prevTop = tab ? tab.style.top : '';
    if (review) review.style.display = 'none';
    if (tab) tab.style.top = '0px';

    window.html2canvas(dossier, {
      scale: 2,
      backgroundColor: '#FFF8E7',
      useCORS: true,
      logging: false,
      width: dossier.offsetWidth,
      height: dossier.offsetHeight,
      windowWidth: dossier.offsetWidth,
      windowHeight: dossier.offsetHeight + 40
    }).then(function (canvas) {
      if (review) review.style.display = prevReview;
      if (tab) tab.style.top = prevTop;
      canvas.toBlob(function (blob) { cb(blob || null); }, 'image/png');
    }).catch(function () {
      if (review) review.style.display = prevReview;
      if (tab) tab.style.top = prevTop;
      cb(null);
    });
  }

  /* نسخهٔ پشتیبان: رسم دستی پرونده روی بوم (بدون هیچ کتابخانه‌ای) */
  function manualDossierImage(cb) {
    try {
      var W = 720, H = 1040;
      var c = document.createElement('canvas');
      c.width = W; c.height = H;
      var x = c.getContext('2d');
      var R = function (px, py, pw, ph, pr) {
        if (x.roundRect) { x.beginPath(); x.roundRect(px, py, pw, ph, pr); }
        else { x.beginPath(); x.rect(px, py, pw, ph); }
      };

      /* پس‌زمینه و کاغذ */
      x.fillStyle = '#FFE682'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#FFFDF5'; R(30, 90, W - 60, H - 180, 24); x.fill();
      x.strokeStyle = '#E3C98F'; x.lineWidth = 4; R(30, 90, W - 60, H - 180, 24); x.stroke();

      /* زبانه */
      x.fillStyle = '#5D3A1A'; R(W - 280, 62, 240, 56, 16); x.fill();
      x.fillStyle = '#FFE682'; x.textAlign = 'center'; x.direction = 'rtl';
      x.font = '900 24px Vazirmatn, Tahoma';
      x.fillText('پروندهٔ بازیکن', W - 160, 100);

      /* عنوان و شمارهٔ پرونده */
      x.fillStyle = '#3E2610'; x.textAlign = 'right';
      x.font = '900 32px Vazirmatn, Tahoma';
      x.fillText('🗂️ پروندهٔ عملکرد کوییز موز', W - 70, 190);
      x.fillStyle = '#8A6A3F'; x.font = '700 20px Vazirmatn, Tahoma';
      x.fillText($('file-no').textContent, W - 70, 232);

      /* ردیف‌ها */
      var rows = [
        ['نام و نام خانوادگی', state.name, '#3E2610'],
        ['لقب موزی', state.nick, '#3E2610'],
        ['تاریخ', new Date().toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }), '#3E2610'],
        ['دستهٔ سؤال‌ها', state.category ? (state.category.icon + ' ' + state.category.name) : '—', '#3E2610'],
        ['پاسخ‌های درست', $('d-correct').textContent, '#1F7A33'],
        ['پاسخ‌های اشتباه', $('d-wrong').textContent, '#D93636'],
        ['بدون پاسخ (اتمام وقت)', $('d-timeout').textContent, '#C98A00'],
        ['امتیاز نهایی', $('d-score').textContent, '#3E2610'],
        ['بهترین امتیاز', $('d-best').textContent, '#B8860B']
      ];
      var y = 288;
      rows.forEach(function (r) {
        x.strokeStyle = '#E8D5A8'; x.lineWidth = 2;
        x.setLineDash([6, 6]);
        x.beginPath(); x.moveTo(70, y + 18); x.lineTo(W - 70, y + 18); x.stroke();
        x.setLineDash([]);
        x.font = '600 24px Vazirmatn, Tahoma'; x.fillStyle = '#8A6A3F'; x.textAlign = 'right';
        x.fillText(r[0], W - 70, y + 8);
        x.font = '800 26px Vazirmatn, Tahoma'; x.fillStyle = r[2]; x.textAlign = 'left';
        x.fillText(r[1], 70, y + 8);
        y += 58;
      });

      /* واترمارک موز */
      x.globalAlpha = 0.07; x.font = '260px serif'; x.textAlign = 'center';
      x.fillText('🍌', W / 2, H - 260); x.globalAlpha = 1;

      /* مهر رنک */
      x.save();
      x.translate(W / 2, H - 192);
      x.rotate(-0.1);
      var rc = { r1: '#7A8B6F', r2: '#1F7A33', r3: '#8B5E2B', r4: '#C98A00', r5: '#B8860B' }[state.lastRank.cls] || '#C98A00';
      x.fillStyle = 'rgba(255,255,255,.6)'; R(-160, -34, 320, 68, 14); x.fill();
      x.strokeStyle = rc; x.lineWidth = 5; R(-160, -34, 320, 68, 14); x.stroke();
      x.lineWidth = 1.5; R(-152, -26, 304, 52, 10); x.stroke();
      x.fillStyle = rc;
      x.font = '900 30px Vazirmatn, Tahoma'; x.textAlign = 'center'; x.direction = 'rtl';
      x.fillText(state.lastRank.title + ' ' + state.lastRank.emoji, 0, 11);
      x.restore();

      /* مهر سازنده */
      x.save();
      x.translate(190, H - 122);
      x.rotate(0.07);
      x.strokeStyle = '#2C4A6E'; x.lineWidth = 3; R(-155, -34, 310, 68, 12); x.stroke();
      x.lineWidth = 1; R(-149, -28, 298, 56, 9); x.stroke();
      x.fillStyle = '#2C4A6E'; x.textAlign = 'center'; x.direction = 'rtl';
      x.font = '600 18px Vazirmatn, Tahoma';
      x.fillText('تهیه‌کنندهٔ سایت', 0, -4);
      x.font = '800 21px Vazirmatn, Tahoma';
      x.fillText('محمد مهدی عدالتیان', 0, 22);
      x.restore();

      c.toBlob(function (blob) { cb(blob || null); }, 'image/png');
    } catch (e) { cb(null); }
  }

  function makeDossierImage(cb) {
    snapDossierImage(function (blob) {
      if (blob) { cb(blob); return; }
      manualDossierImage(cb);
    });
  }

  function shareResult() {
    var text = buildShareText();

    makeDossierImage(function (blob) {
      /* اگر حتی عکس هم ساخته نشد: فقط متن */
      if (!blob) {
        if (navigator.share) {
          navigator.share({ title: 'کوییز موز 🍌', text: text }).catch(function () { /* لغو شد */ });
        } else {
          toast('امکان ارسال عکس در این مرورگر نیست 😕');
        }
        return;
      }

      var file;
      try {
        file = new File([blob], 'moz-quiz-dossier.png', { type: 'image/png' });
      } catch (e) {
        file = blob;
      }

      /* موبایل: ارسال مستقیم عکس پرونده با شیت اشتراک سیستم */
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'کوییز موز 🍌', text: text })
          .catch(function () { /* لغو شد */ });
        return;
      }

      /* پشتیبان: ذخیرهٔ عکس + متن اشتراک اگر شیت داشت */
      downloadBlob(blob);
      if (navigator.share) {
        navigator.share({ title: 'کوییز موز 🍌', text: text }).catch(function () { /* لغو شد */ });
      } else {
        toast('عکس پرونده ذخیره شد! 📸 حالا از گالری بفرستش');
      }
    });
  }

  /* ---------- صدا: «موزیک بانانا» + افکت‌ها (Web Audio — بدون فایل صوتی) ---------- */
  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var actx = null, masterGain = null, musicGain = null, sfxGain = null;
  var musicTimer = null, seqPos = 0, nextNoteTime = 0;
  var BPM = 108, SEC8 = 60 / BPM / 2; /* مدت هر نت هشتم */
  var MUSIC_ON = true;
  try { MUSIC_ON = localStorage.getItem('mozQuizMuted') !== '1'; } catch (e) { /* ignore */ }

  /* نت‌های «موزیک بانانا» — ملودی شاد استوایی ۸ میزانی (لوپ بی‌درز) */
  var MELODY = [
    'G4', '',   'C5', 'E5', 'G5', '',   'E5', 'C5',
    'D5', '',   'D5', 'F5', 'A5', '',   'G5', 'F5',
    'E5', '',   'C5', 'E5', 'G5', '',   'A5', 'G5',
    'F5', 'E5', 'D5', 'E5', 'C5', '',   '',   '',
    'A4', '',   'C5', 'E5', 'A5', '',   'G5', 'E5',
    'F4', '',   'A4', 'C5', 'F5', '',   'E5', 'C5',
    'D5', 'F5', 'A5', 'G5', 'F5', 'E5', 'D5', 'C5',
    'C5', '',   'G4', '',   'C5', '',   '',   ''
  ];
  var BASS = [
    'C3', 'G2', 'C3', 'G2', 'D3', 'A2', 'D3', 'A2',
    'C3', 'G2', 'C3', 'G2', 'F2', 'C3', 'G2', 'B2',
    'A2', 'E3', 'A2', 'E3', 'F2', 'C3', 'F2', 'C3',
    'D3', 'A2', 'G2', 'D3', 'C3', 'G2', 'C2', ''
  ];

  var NOTE_SEMI = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  function noteFreq(n) {
    var m = /^([A-G]#?)(\d)$/.exec(n);
    if (!m) return 0;
    var semi = NOTE_SEMI[m[1]] + (+m[2] + 1) * 12;
    return 440 * Math.pow(2, (semi - 69) / 12);
  }

  function ensureAudio() {
    if (!AudioCtx) return false;
    if (!actx) {
      actx = new AudioCtx();
      masterGain = actx.createGain(); masterGain.gain.value = 0.9; masterGain.connect(actx.destination);
      musicGain = actx.createGain(); musicGain.gain.value = 0.18; musicGain.connect(masterGain); /* موزیک متعادل */
      sfxGain = actx.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(masterGain);        /* افکت واضح */
    }
    if (actx.state === 'suspended') actx.resume();
    return true;
  }

  function tone(t, freq, dur, type, vol, dest, slideTo) {
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || musicGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function hat(t, vol) {
    var len = 0.05, buf = actx.createBuffer(1, Math.floor(actx.sampleRate * len), actx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    var src = actx.createBufferSource(); src.buffer = buf;
    var hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
    var g = actx.createGain(); g.gain.value = vol;
    src.connect(hp); hp.connect(g); g.connect(musicGain);
    src.start(t);
  }

  function scheduleEighth(pos, t) {
    var m = MELODY[pos % 64];
    if (m) tone(t, noteFreq(m), 0.26, 'triangle', 0.5, musicGain);
    if (pos % 2 === 0) {
      var b = BASS[Math.floor(pos / 2) % 32];
      if (b) tone(t, noteFreq(b), 0.42, 'sine', 0.6, musicGain);
    }
    hat(t, 0.12);
    if (pos % 8 === 0 || pos % 8 === 4) tone(t, 150, 0.14, 'sine', 0.55, musicGain, 50); /* ضرب */
  }

  function startMusic() {
    if (!ensureAudio() || !MUSIC_ON || musicTimer) return;
    seqPos = 0;
    nextNoteTime = actx.currentTime + 0.1;
    musicTimer = setInterval(function () {
      if (!actx) return;
      while (nextNoteTime < actx.currentTime + 0.3) {
        scheduleEighth(seqPos, nextNoteTime);
        seqPos = (seqPos + 1) % 64;
        nextNoteTime += SEC8;
      }
    }, 120);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function applyAudioBtn() {
    var b = $('audio-toggle');
    if (!b) return;
    b.textContent = MUSIC_ON ? '🔊' : '🔇';
    b.title = 'موزیک بانانا — ' + (MUSIC_ON ? 'روشن (بزن تا خاموش شود)' : 'خاموش (بزن تا روشن شود)');
  }

  function toggleMusic() {
    MUSIC_ON = !MUSIC_ON;
    try { localStorage.setItem('mozQuizMuted', MUSIC_ON ? '0' : '1'); } catch (e) { /* ignore */ }
    applyAudioBtn();
    if (MUSIC_ON) startMusic(); else stopMusic();
    toast(MUSIC_ON ? '🎵 موزیک بانانا روشن شد' : '🔇 موزیک بانانا خاموش شد');
  }

  /* افکت‌های صوتی نتیجهٔ پاسخ */
  function sfx(kind) {
    if (!ensureAudio()) return;
    var t = actx.currentTime + 0.02;
    if (kind === 'correct') {          /* درست! — آرپژ بالاروندهٔ شاد */
      tone(t, noteFreq('C6'), 0.12, 'triangle', 0.9, sfxGain);
      tone(t + 0.08, noteFreq('E6'), 0.12, 'triangle', 0.9, sfxGain);
      tone(t + 0.16, noteFreq('G6'), 0.22, 'triangle', 0.9, sfxGain);
    } else if (kind === 'wrong') {     /* اشتباه! — بازر پایین‌رونده */
      tone(t, 220, 0.18, 'sawtooth', 0.5, sfxGain, 140);
      tone(t + 0.16, 160, 0.30, 'sawtooth', 0.5, sfxGain, 95);
    } else if (kind === 'timeout') {   /* وقت تمام! — سه بوق نرم پایین‌رونده */
      tone(t, noteFreq('A4'), 0.14, 'square', 0.35, sfxGain);
      tone(t + 0.20, noteFreq('F4'), 0.14, 'square', 0.35, sfxGain);
      tone(t + 0.40, noteFreq('D4'), 0.30, 'square', 0.35, sfxGain);
    }
  }

  /* وقتی تب مخفی شد موزیک متوقف شود (باتری دوست) */
  document.addEventListener('visibilitychange', function () {
    if (!actx) return;
    if (document.hidden) stopMusic();
    else if (MUSIC_ON && state.name) startMusic();
  });

  /* ============================================================
     🎉 پارتی با دوستان — روم آنلاین با کد
     بک‌اند: textdb.dev (رایگان، بدون ثبت‌نام، CORS فعال)
     هر روم = یک کلید «bq-room-<کد ۴ رقمی>» شامل وضعیت کامل روم
     ============================================================ */
  var PARTY_API = 'https://textdb.dev/api/data/';
  var ROOM_PREFIX = 'bq-room-';
  var POLL_MS = 2500;               /* فاصلهٔ پولینگ وضعیت روم */
  var HOST_TIMEOUT_MS = 45000;      /* اگر میزبان این‌قدر ساکت شد، آفلاین فرض شود */
  var ROOM_TTL_MS = 3 * 60 * 60 * 1000; /* روم بعد از ۳ ساعت منقضی می‌شود */

  var party = {
    code: '',
    pid: '',
    isHost: false,
    pollTimer: null,
    lastDoc: null,
    lastResults: null,
    captchaAction: '',   /* 'create' | 'join' */
    captchaA: 0,
    offlineTicks: 0,
    hbTicks: 0
  };

  /* ---------- ذخیرهٔ روم فعلی (برای برگشت پس از رفرش) ---------- */
  function partyLS() {
    try { return JSON.parse(localStorage.getItem('mozQuizParty') || 'null'); }
    catch (e) { return null; }
  }
  function partyLSsave(v) {
    try {
      if (v) localStorage.setItem('mozQuizParty', JSON.stringify(v));
      else localStorage.removeItem('mozQuizParty');
    } catch (e) { /* ignore */ }
  }

  /* ---------- لایهٔ ارتباط با سرور ---------- */
  function roomUrl(code) { return PARTY_API + ROOM_PREFIX + code; }

  /* cb(doc): doc=Object | null (روم نیست) | undefined (خطای شبکه) */
  function roomRead(code, cb) {
    fetch(roomUrl(code), { cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var doc = null;
        try {
          if (t.indexOf('value=') === 0) t = t.slice(6);
          doc = JSON.parse(t);
        } catch (e) { doc = null; }
        cb(doc);
      })
      .catch(function () { cb(undefined); });
  }

  function roomWrite(code, doc, cb) {
    fetch(roomUrl(code), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'value=' + encodeURIComponent(JSON.stringify(doc))
    }).then(function (r) { cb(!!r.ok); }).catch(function () { cb(false); });
  }

  /* خواندن → تغییر → نوشتن؛ در تصادم با تاخیر تصادفی دوباره تلاش می‌کند */
  function roomMerge(code, mutator, cb, tries) {
    if (tries === undefined) tries = 0;
    roomRead(code, function (doc) {
      if (!doc) { cb(false); return; }
      mutator(doc);
      roomWrite(code, doc, function (ok) {
        if (ok || tries >= 5) { cb(ok); return; }
        setTimeout(function () { roomMerge(code, mutator, cb, tries + 1); }, 350 + Math.floor(Math.random() * 650));
      });
    });
  }

  /* ---------- کپچا: «من ربات نیستم» + جمع و تفریق ---------- */
  function newCaptchaQuestion() {
    var a = 2 + Math.floor(Math.random() * 11); /* ۲ تا ۱۲ */
    var b = 2 + Math.floor(Math.random() * 11);
    var plus = Math.random() < 0.5;
    if (!plus && b > a) { var t = a; a = b; b = t; } /* تفریق منفی نشود */
    party.captchaA = plus ? (a + b) : (a - b);
    $('captcha-question').textContent = faNum(a) + ' ' + (plus ? '+' : '−') + ' ' + faNum(b) + ' = ؟';
    $('captcha-answer').value = '';
  }

  function openCaptcha(action) {
    party.captchaAction = action;
    $('captcha-robot').checked = false;
    $('captcha-error').classList.add('hidden');
    newCaptchaQuestion();
    $('captcha-modal').classList.remove('hidden');
    setTimeout(function () { try { $('captcha-answer').focus(); } catch (e) { } }, 120);
  }

  function closeCaptcha() {
    $('captcha-modal').classList.add('hidden');
    party.captchaAction = '';
  }

  function verifyCaptcha() {
    var err = $('captcha-error');
    function fail(msg) {
      err.textContent = msg;
      err.classList.remove('hidden');
      restartAnim(err, 'error');
      newCaptchaQuestion();
      $('captcha-robot').checked = false;
      sfx('wrong');
      return;
    }
    if (!$('captcha-robot').checked) { fail('اول تیک «من ربات نیستم» رو بزن! 🤖'); return; }
    var val = toEnDigits($('captcha-answer').value).trim();
    if (val === '') { fail('جواب سؤال ریاضی رو بنویس! ✍️'); return; }
    if (parseInt(val, 10) !== party.captchaA) { fail('اشتباه بود! یه مسائل جدید گرفتم، دوباره امتحان کن 😄'); return; }
    err.classList.add('hidden');
    var action = party.captchaAction;
    closeCaptcha();
    sfx('correct');
    if (action === 'create') createRoom();
    else if (action === 'join') joinRoom();
  }

  /* ---------- ساخت و ورود به روم ---------- */
  function makePid() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function freshPlayer() {
    return {
      name: state.name, nick: state.nick,
      joinedAt: Date.now(), seen: Date.now(),
      done: false, score: 0, wrong: 0, timeout: 0, finishedAt: null
    };
  }

  function range(n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(i);
    return a;
  }

  function generateCode(cb, attempt) {
    attempt = attempt || 0;
    if (attempt > 20) { cb(null); return; }
    var code = String(1000 + Math.floor(Math.random() * 9000));
    roomRead(code, function (doc) {
      /* اگر روم زنده‌ای با این کد هست، کد دیگری امتحان کن */
      if (doc && doc.code && (Date.now() - (doc.createdAt || 0)) < ROOM_TTL_MS) {
        generateCode(cb, attempt + 1); return;
      }
      cb(code);
    });
  }

  function createRoom() {
    toast('در حال ساخت روم… 🏗️');
    generateCode(function (code) {
      if (!code) { toast('ساخت روم ناموفق بود! دوباره امتحان کن 😕'); return; }
      var pid = makePid();
      var doc = {
        v: 1, code: code,
        status: 'lobby',
        createdAt: Date.now(),
        hostId: pid, hostSeen: Date.now(),
        settings: null,
        players: {}
      };
      doc.players[pid] = freshPlayer();
      roomWrite(code, doc, function (ok) {
        if (!ok) { toast('اتصال به سرور روم نشد! اینترنتت رو چک کن 🌐'); return; }
        enterRoom(code, pid, true);
        toast('روم ساخته شد! 🎉');
      });
    });
  }

  function joinRoom() {
    var raw = toEnDigits($('join-code').value).replace(/\D/g, '');
    var err = $('party-error');
    function fail(msg) {
      err.textContent = msg;
      err.classList.remove('hidden');
      restartAnim(err, 'error');
      sfx('wrong');
    }
    if (raw.length !== 4) { fail('کد روم ۴ رقمیه! درستش رو بنویس 😅'); return; }
    err.classList.add('hidden');
    toast('در حال ورود به روم… 🚪');
    roomRead(raw, function (doc) {
      if (doc === undefined) { toast('اتصال به سرور روم نشد! اینترنتت رو چک کن 🌐'); return; }
      if (!doc || doc.closed) { fail('رومی با این کد پیدا نشد! کد رو دوباره چک کن 🤔'); return; }
      if ((Date.now() - (doc.createdAt || 0)) >= ROOM_TTL_MS) { fail('این روم قدیمی شده و منقضی شده! یه روم جدید بسازید 🍌'); return; }
      if (doc.status !== 'lobby') { fail('بازی این روم همین الان شروع شده! دفعهٔ بعد زودتر بیا ⏰'); return; }
      var pid = makePid();
      roomMerge(raw, function (d) { d.players[pid] = freshPlayer(); }, function (ok) {
        if (!ok) { toast('ورود به روم ناموفق بود! دوباره امتحان کن 😕'); return; }
        enterRoom(raw, pid, false);
        toast('وارد روم شدی! 🎉');
      });
    });
  }

  function enterRoom(code, pid, isHost) {
    party.code = code;
    party.pid = pid;
    party.isHost = isHost;
    party.offlineTicks = 0;
    party.hbTicks = 0;
    partyLSsave({ code: code, pid: pid, host: isHost });
    renderLobbySkeleton();
    $('lobby-code').textContent = faNum(code);
    $('lobby-players').innerHTML = '';
    $('lobby-status').textContent = '';
    $('lobby-hint').textContent = 'در حال گرفتن بازیکن‌ها…';
    startPolling();
    show('screen-lobby');
  }

  function renderLobbySkeleton() {
    var sel = $('host-cat');
    sel.innerHTML = '';
    var cats = window.QUESTION_CATEGORIES || [];
    cats.forEach(function (cat, i) {
      var opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.icon + ' ' + cat.name + ' (' + faNum(cat.questions.length) + ' سؤال)';
      if (i === 0) opt.selected = true;
      sel.appendChild(opt);
    });
    $('host-panel').classList.toggle('hidden', !party.isHost);
    $('guest-panel').classList.toggle('hidden', party.isHost);
    $('btn-force-results').classList.add('hidden');
  }

  function renderPlayersLobby(doc) {
    var box = $('lobby-players');
    box.innerHTML = '';
    var ids = Object.keys(doc.players || {});
    ids.sort(function (a, b) {
      if (a === doc.hostId) return -1;
      if (b === doc.hostId) return 1;
      return (doc.players[a].joinedAt || 0) - (doc.players[b].joinedAt || 0);
    });
    ids.forEach(function (pid) {
      var p = doc.players[pid];
      var row = document.createElement('div');
      row.className = 'player-row' + (pid === party.pid ? ' me' : '');

      var av = document.createElement('span');
      av.className = 'p-avatar';
      av.textContent = '🍌';

      var info = document.createElement('span');
      info.className = 'p-info';
      var nm = document.createElement('span');
      nm.className = 'p-name';
      nm.textContent = p.name || 'بازیکن';
      var nk = document.createElement('span');
      nk.className = 'p-nick';
      nk.textContent = p.nick || '';
      info.appendChild(nm); info.appendChild(nk);

      var tag = document.createElement('span');
      if (pid === doc.hostId) {
        tag.className = 'p-tag host';
        tag.textContent = '👑 میزبان';
      } else if (pid === party.pid) {
        tag.className = 'p-tag';
        tag.textContent = 'تو';
      } else {
        tag.className = 'p-tag';
        tag.textContent = 'آماده';
      }

      row.appendChild(av); row.appendChild(info); row.appendChild(tag);
      box.appendChild(row);
    });
  }

  /* ---------- پولینگ مرکزی ---------- */
  function startPolling() {
    stopPolling();
    party.pollTimer = setInterval(pollTick, POLL_MS);
    pollTick();
  }
  function stopPolling() {
    if (party.pollTimer) { clearInterval(party.pollTimer); party.pollTimer = null; }
  }

  function pollTick() {
    if (document.hidden) return; /* صرفه‌جویی باتری و ترافیک */
    if (!party.code) return;
    var scr = document.querySelector('.screen.active');
    var scrId = scr ? scr.id : '';
    if (scrId === 'screen-quiz') return; /* وسط بازی پول نزن */

    roomRead(party.code, function (doc) {
      if (!party.code) return; /* در فاصلهٔ پاسخ، خارج شده */
      if (doc === undefined) {
        party.offlineTicks++;
        if (party.offlineTicks > 2) $('lobby-status').textContent = 'اتصال ضعیفه… 🌐';
        return;
      }
      party.offlineTicks = 0;
      $('lobby-status').textContent = '';
      if (!doc || doc.closed) { roomClosedByHost(); return; }
      if (doc.code !== party.code) return;
      party.lastDoc = doc;

      if (scrId === 'screen-lobby') tickLobby(doc);
      else if (scrId === 'screen-party-wait') tickWait(doc);
      else if (scrId === 'screen-party-results') tickResults(doc);
    });
  }

  function tickLobby(doc) {
    renderPlayersLobby(doc);
    var n = Object.keys(doc.players || {}).length;
    $('lobby-hint').textContent = n <= 1
      ? 'فعلاً تنهایی! کد رو به دوستات بده تا بیان تو 👇'
      : faNum(n) + ' نفر تو روم هستن! هر وقت خواستی شروع کن 🚀';

    if (doc.status === 'playing' && doc.settings) { startPartyQuiz(doc); return; }
    if (doc.status === 'results') { showPartyResults(doc); return; }

    if (!party.isHost) {
      /* میزبان در حالت لابی باید تپنده باشد */
      var stale = Date.now() - (doc.hostSeen || 0) > HOST_TIMEOUT_MS;
      if (stale) $('lobby-status').textContent = 'میزبان انگار روم رو ول کرده 😴';
    } else {
      party.hbTicks++;
      if (party.hbTicks % 4 === 0) { /* هر ~۱۰ ثانیه، ضربان میزبان */
        roomMerge(party.code, function (d) {
          if (d.players && d.players[party.pid]) d.players[party.pid].seen = Date.now();
          d.hostSeen = Date.now();
        }, function () { });
      }
    }
  }

  /* ---------- شروع دور بازی ---------- */
  function hostStart() {
    if (!party.isHost) return;
    var catId = $('host-cat').value;
    var cats = window.QUESTION_CATEGORIES || [];
    var cat = null;
    for (var i = 0; i < cats.length; i++) if (cats[i].id === catId) { cat = cats[i]; break; }
    if (!cat) { toast('دسته پیدا نشد!'); return; }

    var total = Math.min(QUESTION_COUNT, cat.questions.length);
    var picks = shuffle(range(cat.questions.length)).slice(0, total);
    var settings = { catId: cat.id, catName: cat.name, catIcon: cat.icon, count: total, qIndices: picks };
    toast('شروع بازی! 🚀');
    sfx('correct');
    roomMerge(party.code, function (d) {
      d.status = 'playing';
      d.settings = settings;
      Object.keys(d.players || {}).forEach(function (pid) {
        d.players[pid].done = false;
        d.players[pid].score = 0;
        d.players[pid].wrong = 0;
        d.players[pid].timeout = 0;
        d.players[pid].finishedAt = null;
      });
      d.hostSeen = Date.now();
    }, function (ok) {
      if (!ok) { toast('شروع ناموفق بود! دوباره بزن 😕'); return; }
      startPartyQuiz({ settings: settings });
    });
  }

  function startPartyQuiz(doc) {
    var s = doc && doc.settings;
    if (!s || !s.qIndices || !s.qIndices.length) { toast('سؤال‌های روم ناقصه! 😕'); return; }
    startQuiz(s.catId, s.qIndices);
  }

  /* ---------- پایان بازی در پارتی ---------- */
  function partyOnFinished(correct, wrong, timeouts) {
    state.party = false;
    toast('نتیجه‌ات ثبت شد! ⏳');
    roomMerge(party.code, function (d) {
      if (d.players && d.players[party.pid]) {
        var p = d.players[party.pid];
        p.done = true;
        p.score = correct;
        p.wrong = wrong;
        p.timeout = timeouts;
        p.finishedAt = Date.now();
      }
    }, function (ok) {
      if (!ok) toast('ثبت نتیجه ناموفق بود! اینترنتت رو چک کن 🌐');
      $('wait-sub').textContent = 'منتظر بقیهٔ بازیکن‌ها…';
      renderWaitTable(party.lastDoc);
      show('screen-party-wait');
    });
  }

  function tickWait(doc) {
    if (doc.status === 'results') { showPartyResults(doc); return; }
    if (doc.status === 'lobby') { /* میزبان دور جدید زده */
      $('lobby-code').textContent = faNum(party.code);
      renderLobbySkeleton();
      show('screen-lobby');
      return;
    }
    renderWaitTable(doc);
    var ids = Object.keys(doc.players || {});
    var doneN = ids.filter(function (pid) { return doc.players[pid].done; }).length;
    $('wait-sub').textContent = 'منتظر بقیه… (' + faNum(doneN) + ' از ' + faNum(ids.length) + ' نفر تموم کردن)';
    if (party.isHost) {
      $('btn-force-results').classList.remove('hidden');
      if (ids.length > 0 && doneN >= ids.length) hostShowResults();
    }
  }

  function renderWaitTable(doc) {
    var box = $('wait-table');
    box.innerHTML = '';
    if (!doc || !doc.players) return;
    var total = doc.settings ? doc.settings.count : QUESTION_COUNT;
    var ids = Object.keys(doc.players);
    ids.sort(function (a, b) {
      var da = doc.players[a].done ? 1 : 0, db = doc.players[b].done ? 1 : 0;
      if (da !== db) return db - da;
      if (da && db && doc.players[a].score !== doc.players[b].score) return doc.players[b].score - doc.players[a].score;
      return (doc.players[a].joinedAt || 0) - (doc.players[b].joinedAt || 0);
    });
    ids.forEach(function (pid) {
      var p = doc.players[pid];
      var row = document.createElement('div');
      row.className = 'wait-row';

      var nm = document.createElement('span');
      nm.className = 'w-name';
      nm.textContent = (pid === party.pid ? 'تو — ' : '') + (p.name || 'بازیکن');

      var st = document.createElement('span');
      st.className = 'w-state ' + (p.done ? 'done' : 'play');
      st.textContent = p.done ? '✅' : '⏳';

      var sc = document.createElement('span');
      sc.className = 'w-score';
      sc.textContent = p.done ? faNum(p.score) + ' از ' + faNum(total) : '…';

      row.appendChild(nm); row.appendChild(st); row.appendChild(sc);
      box.appendChild(row);
    });
  }

  function hostShowResults() {
    if (!party.isHost) return;
    roomMerge(party.code, function (d) { d.status = 'results'; }, function () { });
  }

  /* ---------- جدول نتایج نهایی ---------- */
  function rankOfScore(score, total) {
    var RANKS = ranksFor(total);
    for (var i = 0; i < RANKS.length; i++) {
      if (score >= RANKS[i].min && score <= RANKS[i].max) return RANKS[i];
    }
    return RANKS[0];
  }

  function sortedResults(doc) {
    var list = Object.keys(doc.players || {}).map(function (pid) {
      var p = doc.players[pid];
      return { pid: pid, name: p.name || 'بازیکن', nick: p.nick || '', score: p.score || 0, wrong: p.wrong || 0, timeout: p.timeout || 0 };
    });
    list.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.wrong !== a.wrong) return a.wrong - b.wrong;
      if (b.timeout !== a.timeout) return a.timeout - b.timeout;
      return 0;
    });
    return list;
  }

  function showPartyResults(doc) {
    party.lastResults = doc;
    var total = doc.settings ? doc.settings.count : QUESTION_COUNT;
    $('results-sub').textContent = (doc.settings ? doc.settings.catIcon + ' ' + doc.settings.catName + ' • ' : '') +
      'روم ' + faNum(doc.code) + ' • ' + faNum(total) + ' سؤال';

    var list = sortedResults(doc);
    var win = $('winner-banner');
    win.innerHTML = '';
    if (!list.length) {
      win.textContent = 'بازیکنی نبود!';
    } else if (list[0].score === 0) {
      win.textContent = '😂 همه صفر گرفتید! هیچ‌کس موز طلایی نشد';
    } else {
      var wr = rankOfScore(list[0].score, total);
      var l1 = document.createElement('div');
      l1.className = 'w-big';
      l1.textContent = '🏆 برنده: ' + list[0].name + ' (' + list[0].nick + ')';
      var l2 = document.createElement('div');
      l2.textContent = 'با ' + faNum(list[0].score) + ' امتیاز از ' + faNum(total) + ' — ' + wr.title + ' ' + wr.emoji;
      win.appendChild(l1); win.appendChild(l2);
    }

    /* گروه‌بندی امتیازهای مساوی برای یادداشت جدول */
    var sameScore = {};
    list.forEach(function (p) { (sameScore[p.score] = sameScore[p.score] || []).push(p.name); });

    var box = $('results-table');
    box.innerHTML = '';
    list.forEach(function (p, i) {
      var rk = rankOfScore(p.score, total);
      var row = document.createElement('div');
      row.className = 'result-row';

      var pos = document.createElement('span');
      pos.className = 'r-pos';
      pos.textContent = ['🥇', '🥈', '🥉'][i] || faNum(i + 1);

      var mid = document.createElement('span');
      mid.className = 'r-mid';
      var nm = document.createElement('span');
      nm.className = 'r-name';
      nm.textContent = p.name + (p.pid === party.pid ? ' (تو)' : '');
      var nk = document.createElement('span');
      nk.className = 'r-nick';
      nk.textContent = p.nick;
      mid.appendChild(nm); mid.appendChild(nk);

      /* یادداشت مقایسه: بالاترین / مساوی با کی / کمترین */
      var note = document.createElement('span');
      var peers = (sameScore[p.score] || []).filter(function (n) { return n !== p.name; });
      var noteTxt = '', noteCls = 'r-note';
      if (i === 0 && list.length > 1 && p.score > list[1].score) { noteTxt = '🏆 بالاترین امتیاز'; noteCls += ' top'; }
      else if (peers.length) { noteTxt = '🟰 مساوی با ' + peers.slice(0, 2).join(' و ') + (peers.length > 2 ? ' و…' : ''); noteCls += ' eq'; }
      else if (i === list.length - 1 && list.length > 2) { noteTxt = 'کمترین امتیاز 😅'; noteCls += ' bottom'; }
      note.className = noteCls;
      note.textContent = noteTxt;
      mid.appendChild(note);

      var side = document.createElement('span');
      side.className = 'r-side';
      var sc = document.createElement('span');
      sc.className = 'r-score';
      sc.textContent = faNum(p.score) + ' از ' + faNum(total);
      var dt = document.createElement('span');
      dt.className = 'r-detail';
      dt.textContent = '✅ ' + faNum(p.score) + ' • ❌ ' + faNum(p.wrong) + ' • ⏰ ' + faNum(p.timeout);
      var stamp = document.createElement('span');
      stamp.className = 'rank-stamp mini ' + rk.cls;
      stamp.textContent = rk.title + ' ' + rk.emoji;
      side.appendChild(sc); side.appendChild(dt); side.appendChild(stamp);

      row.appendChild(pos); row.appendChild(mid); row.appendChild(side);
      box.appendChild(row);
    });

    $('btn-party-again').classList.toggle('hidden', !party.isHost);
    show('screen-party-results');
  }

  function tickResults(doc) {
    if (doc.status === 'lobby') { /* میزبان دور جدید زده */
      toast('میزبان دور جدید آماده کرده! 🔄');
      $('lobby-code').textContent = faNum(party.code);
      renderLobbySkeleton();
      show('screen-lobby');
    }
  }

  function sharePartyResults() {
    var doc = party.lastResults;
    if (!doc) { toast('هنوز نتیجه‌ای نیست!'); return; }
    var total = doc.settings ? doc.settings.count : QUESTION_COUNT;
    var list = sortedResults(doc);
    var medals = ['🥇', '🥈', '🥉'];
    var lines = list.map(function (p, i) {
      var rk = rankOfScore(p.score, total);
      return (medals[i] || faNum(i + 1) + '️⃣') + ' ' + p.name + ' (' + p.nick + ') — ' +
        faNum(p.score) + ' از ' + faNum(total) + ' — ' + rk.title + ' ' + rk.emoji;
    });
    var text = '🎉 نتیجهٔ پارتی «بانانا کوییز» 🍌\n' +
      (doc.settings ? doc.settings.catIcon + ' دسته: ' + doc.settings.catName + ' • ' : '') +
      'روم ' + faNum(doc.code) + '\n' + lines.join('\n') + '\n' +
      'ساخته‌شده توسط محمد مهدی عدالتیان';
    if (navigator.share) {
      navigator.share({ title: 'نتایج پارتی — بانانا کوییز 🍌', text: text }).catch(function () { });
    } else {
      try {
        navigator.clipboard.writeText(text).then(function () { toast('نتایج کپی شد! 📋'); },
          function () { toast('اشتراک‌گذاری در این مرورگر نیست 😕'); });
      } catch (e) { toast('اشتراک‌گذاری در این مرورگر نیست 😕'); }
    }
  }

  /* ---------- خروج / بستن / دور جدید ---------- */
  function leaveRoom(silent) {
    stopPolling();
    var code = party.code, pid = party.pid;
    party.code = ''; party.pid = ''; party.isHost = false;
    partyLSsave(null);
    if (code && pid) {
      roomMerge(code, function (d) { if (d.players) delete d.players[pid]; }, function () { });
    }
    if (!silent) toast('از روم خارج شدی 🚶');
    goHome();
  }

  function closeRoomByHost() {
    stopPolling();
    var code = party.code;
    party.code = ''; party.pid = ''; party.isHost = false;
    partyLSsave(null);
    if (code) roomWrite(code, { closed: true, code: code }, function () { });
    toast('روم بسته شد 🔒');
    goHome();
  }

  function roomClosedByHost() {
    stopPolling();
    party.code = ''; party.pid = ''; party.isHost = false;
    partyLSsave(null);
    toast('میزبان روم رو بست 🔒');
    goHome();
  }

  function hostNewRound() {
    if (!party.isHost) return;
    roomMerge(party.code, function (d) {
      d.status = 'lobby';
      d.settings = null;
      Object.keys(d.players || {}).forEach(function (pid) {
        d.players[pid].done = false;
        d.players[pid].score = 0;
        d.players[pid].wrong = 0;
        d.players[pid].timeout = 0;
        d.players[pid].finishedAt = null;
      });
      d.hostSeen = Date.now();
    }, function (ok) {
      if (!ok) { toast('ناموفق بود، دوباره بزن 😕'); return; }
      $('lobby-code').textContent = faNum(party.code);
      renderLobbySkeleton();
      show('screen-lobby');
    });
  }

  /* ---------- برگشت به روم پس از رفرش ---------- */
  function updateRejoinChip() {
    var saved = partyLS();
    var btn = $('btn-rejoin');
    if (saved && saved.code) {
      $('rejoin-code').textContent = faNum(saved.code);
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  }

  function rejoinRoom() {
    var saved = partyLS();
    if (!saved || !saved.code) return;
    toast('در حال برگشت به روم… 🔄');
    roomRead(saved.code, function (doc) {
      if (doc === undefined) { toast('اتصال ناموفق! اینترنتت رو چک کن 🌐'); return; }
      if (!doc || doc.closed || (Date.now() - (doc.createdAt || 0)) >= ROOM_TTL_MS) {
        partyLSsave(null);
        updateRejoinChip();
        toast('اون روم دیگه وجود نداره 🍌');
        return;
      }
      party.code = saved.code;
      party.pid = saved.pid;
      party.isHost = !!saved.host;
      party.offlineTicks = 0;
      party.hbTicks = 0;
      if (!doc.players || !doc.players[saved.pid]) {
        roomMerge(saved.code, function (d) { d.players[saved.pid] = freshPlayer(); }, function () { });
      }
      partyLSsave({ code: saved.code, pid: saved.pid, host: party.isHost });
      startPolling();
      var me = doc.players && doc.players[saved.pid];
      if (doc.status === 'playing' && doc.settings) {
        if (me && me.done) { renderWaitTable(doc); show('screen-party-wait'); }
        else startPartyQuiz(doc);
      } else if (doc.status === 'results') {
        showPartyResults(doc);
      } else {
        $('lobby-code').textContent = faNum(saved.code);
        renderLobbySkeleton();
        show('screen-lobby');
      }
    });
  }

  /* ---------- لینک مستقیم با کد روم (?room=1234) ---------- */
  function checkRoomParam() {
    try {
      var q = new URLSearchParams(location.search);
      var room = toEnDigits(q.get('room') || '').replace(/\D/g, '');
      if (room.length === 4) {
        $('join-code').value = room;
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function copyRoomCode() {
    var code = party.code;
    if (!code) return;
    var ok = function () { toast('کد روم کپی شد! 📋'); };
    var fail = function () { toast('کد روم: ' + faNum(code)); };
    try { navigator.clipboard.writeText(code).then(ok, fail); } catch (e) { fail(); }
  }

  function shareRoomCode() {
    var code = party.code;
    if (!code) return;
    var link = location.origin + location.pathname + '?room=' + code;
    var text = '🎉 تو «بانانا کوییز» پارتی گذاشتم!\n🚪 کد روم: ' + code + '\n' + link;
    if (navigator.share) {
      navigator.share({ title: 'پارتی بانانا کوییز 🍌', text: text }).catch(function () { });
    } else {
      try {
        navigator.clipboard.writeText(text).then(function () { toast('کد و لینک کپی شد! 📋'); },
          function () { toast('کد روم: ' + code); });
      } catch (e) { toast('کد روم: ' + code); }
    }
  }

  /* ---------- اتصال رویدادها و شروع ---------- */
  function init() {
    $('btn-enter').addEventListener('click', enterSite);
    $('player-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') enterSite(); });
    $('player-nick').addEventListener('keydown', function (e) { if (e.key === 'Enter') enterSite(); });

    $('btn-start').addEventListener('click', showCategoryScreen);
    $('btn-logout').addEventListener('click', function () { show('screen-entry'); });

    $('btn-cat-back').addEventListener('click', goHome);

    $('btn-share').addEventListener('click', shareResult);
    $('btn-again').addEventListener('click', showCategoryScreen);
    $('btn-newplayer').addEventListener('click', function () { show('screen-entry'); });

    /* 🎉 پارتی با دوستان */
    $('btn-party').addEventListener('click', function () { show('screen-party'); });
    $('btn-party-back').addEventListener('click', goHome);
    $('btn-room-create').addEventListener('click', function () { openCaptcha('create'); });
    $('btn-room-join').addEventListener('click', function () { openCaptcha('join'); });
    $('captcha-submit').addEventListener('click', verifyCaptcha);
    $('captcha-cancel').addEventListener('click', closeCaptcha);
    $('captcha-refresh').addEventListener('click', function () {
      $('captcha-error').classList.add('hidden');
      newCaptchaQuestion();
    });
    $('captcha-answer').addEventListener('keydown', function (e) { if (e.key === 'Enter') verifyCaptcha(); });
    $('btn-room-start').addEventListener('click', hostStart);
    $('btn-copy-code').addEventListener('click', copyRoomCode);
    $('btn-share-code').addEventListener('click', shareRoomCode);
    $('btn-lobby-leave').addEventListener('click', function () { party.isHost ? closeRoomByHost() : leaveRoom(false); });
    $('btn-wait-leave').addEventListener('click', function () { party.isHost ? closeRoomByHost() : leaveRoom(false); });
    $('btn-results-leave').addEventListener('click', function () { party.isHost ? closeRoomByHost() : leaveRoom(false); });
    $('btn-force-results').addEventListener('click', hostShowResults);
    $('btn-share-results').addEventListener('click', sharePartyResults);
    $('btn-party-again').addEventListener('click', hostNewRound);
    $('btn-rejoin').addEventListener('click', rejoinRoom);

    updateRejoinChip();
    checkRoomParam();

    /* دکمهٔ موزیک بانانا */
    $('audio-toggle').addEventListener('click', toggleMusic);
    applyAudioBtn();

    /* پر کردن خودکار فرم از ذخیرهٔ قبلی */
    var p = getPlayer();
    if (p) {
      $('player-name').value = p.name || '';
      $('player-nick').value = p.nick || '';
    }
    show('screen-entry');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
