/* Fuyamo Travel — interactions.
   Every page arrives with its HTML already written by tools/build.js (using render.js). This script
   only adds behaviour: the nav and mega menu, filters, FAQs, carousels, the departure picker and the
   corporate quote form. Clicks are wired through [data-action] delegation. */

(function () {
  'use strict';

  const R = window.FUYAMO_RENDER;
  const { C, MONTHS, STYLES, ACTIVE_MONTHS } = R;
  const page = document.body.dataset.page || 'home';
  const param = document.body.dataset.param;
  const isFile = window.location.protocol === 'file:';

  // Folder addresses like "trips/" work on any web host, but a page opened straight from
  // disk needs the explicit index.html.
  function resolve(href) {
    const url = new URL(href, document.baseURI);
    if (isFile && url.pathname.endsWith('/')) url.pathname += 'index.html';
    return url.href;
  }

  const setPressed = (el, on) => { el.classList.toggle('is-on', on); el.setAttribute('aria-pressed', String(on)); };

  const navEl = document.getElementById('nav');
  const appEl = document.getElementById('app');
  const footerEl = document.getElementById('footer');
  const fabEl = document.getElementById('fab');
  const narrowQuery = window.matchMedia('(max-width: 979.98px)');
  const finePointer = window.matchMedia('(pointer: fine)');
  const go = (href) => { window.location.href = resolve(href); };

  // Pages built before this script existed (or opened without a build) are drawn here instead.
  if (document.body.dataset.prerendered !== 'true') {
    navEl.innerHTML = R.nav(page);
    appEl.innerHTML = R.page(page, param, new Date());
    footerEl.innerHTML = R.footer(new Date().getFullYear());
    fabEl.href = R.primaryContact(page).href;
  }
  if (!document.getElementById('callback')) document.body.insertAdjacentHTML('beforeend', R.callbackPanel() + R.birthdayPopup());

  const state = {
    menu: false,
    mega: '',
    scrolled: false,
    fab: false,
    trip: page === 'trip' ? R.findTrip(param) : null,
    tripStyle: 'all',
    tripMonth: -1,
    quote: R.defaultQuote(),
  };

  // ---------- Nav ----------

  function updateNav() {
    const active = R.navSection(page);
    const menuOpen = state.menu && narrowQuery.matches;
    navEl.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('is-active', a.dataset.nav === active || a.dataset.nav === state.mega));
    // Blog pages have no photo behind the nav, so it starts solid there.
    navEl.classList.toggle('is-solid', state.scrolled || menuOpen || !!state.mega || active === 'talk' || ['notfound', 'yamo', 'privacy'].includes(page));
    document.getElementById('mobile-menu').hidden = !state.menu;
    const btn = navEl.querySelector('.nav__menu-btn');
    btn.textContent = menuOpen ? '✕' : '☰';
    btn.setAttribute('aria-expanded', String(menuOpen));
  }

  function setMega(key) {
    if (narrowQuery.matches) key = '';
    if (key === state.mega) return;
    state.mega = key;
    const mega = document.getElementById('mega');
    const cols = R.megaColumns(key);
    mega.hidden = !cols;
    if (cols) {
      mega.firstElementChild.innerHTML = cols;
      // Line the panel up under its link, nudged left if it would run past the end of the bar.
      const from = navEl.querySelector('[data-nav="' + key + '"]').getBoundingClientRect().left - navEl.getBoundingClientRect().left;
      mega.style.left = Math.max(0, Math.min(from - 8, navEl.clientWidth - mega.offsetWidth)) + 'px';
    }
    updateNav();
  }

  function onScroll() {
    const scrolled = window.scrollY > 30, fab = window.scrollY > 500;
    if (scrolled !== state.scrolled) { state.scrolled = scrolled; updateNav(); }
    if (fab !== state.fab) {
      state.fab = fab;
      fabEl.classList.toggle('is-visible', fab);
      fabEl.tabIndex = fab ? 0 : -1;
      fabEl.setAttribute('aria-hidden', String(!fab));
    }
  }

  // ---------- Page behaviour ----------

  // Only offer "Read more" on reviews the four-line clamp actually cuts off.
  function fitReviews() {
    document.querySelectorAll('.review').forEach((card) => {
      const text = card.querySelector('.review__text');
      card.querySelector('.review__more').hidden = !card.classList.contains('is-open') && text.scrollHeight <= text.clientHeight + 1;
    });
  }

  function updateTrips() {
    document.querySelectorAll('[data-action="style"]').forEach((b) => setPressed(b, b.dataset.value === state.tripStyle));
    document.querySelectorAll('[data-action="month"]').forEach((b) => setPressed(b, +b.dataset.value === state.tripMonth));
    const results = R.tripResults(state.tripStyle, state.tripMonth);
    document.getElementById('trip-count').textContent = results.count;
    document.getElementById('trip-results').innerHTML = results.html;
  }

  function syncTripsAddress() {
    const params = new URLSearchParams();
    if (state.tripStyle !== 'all') params.set('style', state.tripStyle);
    if (state.tripMonth >= 0) params.set('month', MONTHS[state.tripMonth].toLowerCase());
    const search = params.toString();
    try {
      window.history.replaceState(null, '', window.location.pathname + (search ? '?' + search : ''));
    } catch (e) {
      // Some browsers refuse address changes on pages opened from disk; filtering still works.
    }
  }

  // Keeps the email/WhatsApp fallbacks and the form's hidden fields in step with what's been entered.
  function updateQuoteLinks() {
    const q = state.quote, data = R.quoteSubmission(q);
    document.getElementById('quote-email').href = R.quoteEmail(q);
    document.getElementById('quote-wa').href = R.wa(R.quoteMessage(q));
    document.getElementById('quote-subject').value = data._subject;
    document.getElementById('quote-type').value = data['Enquiry type'];
    document.getElementById('quote-include').value = data['Needs'] || '';
  }

  function showQuoteSent() {
    const form = document.getElementById('quote-form'), done = document.getElementById('quote-done');
    form.classList.add('is-sent');
    done.hidden = false;
    done.focus({ preventScroll: true });
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Sends a form's details to the Fuyamo enquiries script (saved, emailed to info@); throws if it didn't go through.
  // Sent as plain text so the browser makes a simple request that Google answers directly.
  async function sendToInbox(data) {
    const res = await fetch(C.SITE.forms.endpoint, { method: 'POST', body: JSON.stringify(data) });
    const reply = await res.json().catch(() => ({}));
    if (!res.ok || reply.ok !== true) throw new Error(reply.error || 'HTTP ' + res.status);
  }

  // Sends the enquiry form in the background so the visitor stays on the page. Without JavaScript the form
  // still posts normally, and the script shows a thank-you page with a link back to corporate/?sent=1.
  async function sendQuote(e) {
    e.preventDefault();
    const form = e.currentTarget, btn = document.getElementById('quote-submit'), label = btn.querySelector('.send-btn__label');
    const error = document.getElementById('quote-error');
    error.hidden = true;
    btn.disabled = true;
    label.textContent = 'Sending…';
    try {
      await sendToInbox(Object.assign(R.quoteSubmission(state.quote), { _honey: form.elements._honey.value, _news: form.elements._news.checked }));
      // Every enquiry is a lead in Google Analytics (with the page it came from), so the funnel can be measured.
      track('generate_lead', { form: 'corporate', enquiry_type: C.CORP_TABS[state.quote.tab].label });
      showQuoteSent();
    } catch (err) {
      error.hidden = false;
    } finally {
      btn.disabled = false;
      label.textContent = 'Send enquiry';
    }
  }

  // The contact page's message form, sent in the background like the enquiry form. The script files it as a callback
  // request that asks for an email reply.
  async function sendContact(e) {
    e.preventDefault();
    const form = e.currentTarget, btn = document.getElementById('contact-submit'), label = btn.querySelector('.send-btn__label');
    const error = document.getElementById('contact-error'), done = document.getElementById('contact-done');
    const name = form.elements.name.value.trim(), about = form.elements.About.value;
    const data = {
      _form: 'callback',
      _subject: 'Contact form: ' + about + ' · ' + name,
      name,
      email: form.elements.email.value.trim(),
      'Reply by': 'Email',
      About: about,
      Message: form.elements.Message.value.trim(),
      'Asked from': document.title + ' · ' + window.location.href.split(/[?#]/)[0],
      _honey: form.elements._honey.value,
    };
    error.hidden = true;
    btn.disabled = true;
    label.textContent = 'Sending…';
    try {
      await sendToInbox(data);
      track('generate_lead', { form: 'contact', enquiry_type: about });
      form.classList.add('is-sent');
      document.getElementById('contact-done-title').textContent = 'Thanks, ' + name.split(' ')[0] + '.';
      document.getElementById('contact-done-text').textContent = "We'll reply to " + data.email + ' within one working day.';
      done.hidden = false;
      done.focus({ preventScroll: true });
    } catch (err) {
      error.hidden = false;
    } finally {
      btn.disabled = false;
      label.textContent = 'Send message';
    }
  }

  // ---------- "Leave your number" card ----------

  const cb = { trigger: null, method: 'whatsapp', plan: '', context: '', autoMessage: '' };
  const cbEl = (id) => document.getElementById(id);

  // "072 123 4567", "72 123 4567", "+27 72…" or "0027…" become "+27721234567". Other countries need their + code.
  function normaliseNumber(raw) {
    let d = raw.replace(/[^\d+]/g, '');
    if (d.startsWith('00')) d = '+' + d.slice(2);
    if (d.startsWith('+')) return /^\+\d{8,15}$/.test(d) ? d : '';
    if (d.startsWith('27') && d.length === 11) return '+' + d;
    if (d.startsWith('0')) d = d.slice(1);
    return /^\d{9}$/.test(d) ? '+27' + d : '';
  }
  const prettyNumber = (n) => (n.startsWith('+27') ? '+27 ' + n.slice(3).replace(/(\d{2})(\d{3})(\d{4})/, '$1 $2 $3') : n);

  function setCallbackMethod(method) {
    const form = cbEl('callback-form'), email = method === 'email';
    cb.method = method;
    cbEl('callback-switch').textContent = email ? 'Use WhatsApp instead' : 'Use email instead';
    cbEl('callback-wa-field').hidden = email;
    cbEl('callback-email-field').hidden = !email;
    form.elements.whatsapp.disabled = email;
    form.elements.email.disabled = !email;
    cbEl('callback-news').hidden = !email; // trip news goes by email, so it's only offered with an email address
    if (!cb.plan) cbEl('callback-title').textContent = email ? "We'll email you" : "We'll WhatsApp you";
    placeCallback();
  }

  // Desktop: next to the button that opened it. Phones, or a button that's no longer visible: a sheet at the bottom.
  // The "Share this trip" card is placed the same way.
  function placeCallback() {
    const panel = cbEl('callback');
    if (!panel.hidden) placeFloating(panel, cb.trigger);
  }

  function placeFloating(panel, trigger) {
    const r = trigger ? trigger.getBoundingClientRect() : null;
    const sheet = !r || !r.width || window.innerWidth < 560;
    panel.classList.toggle('is-sheet', sheet);
    if (sheet) { panel.style.top = panel.style.left = ''; return; }
    const w = panel.offsetWidth, h = panel.offsetHeight, gap = 10, edge = 12;
    let top = r.bottom + gap;
    if (top + h > window.innerHeight - edge && r.top - gap - h > edge) top = r.top - gap - h;
    panel.style.top = Math.max(edge, Math.min(top, window.innerHeight - h - edge)) + 'px';
    panel.style.left = Math.max(edge, Math.min(r.right - w, window.innerWidth - w - edge)) + 'px';
  }

  // opts.plan: a destination we don't run a group trip to (from the home search); opts.message pre-fills the note.
  function openCallback(trigger, opts = {}) {
    const panel = cbEl('callback'), form = cbEl('callback-form');
    if (state.menu) { state.menu = false; updateNav(); }
    closeShare(false);
    if (cb.trigger) cb.trigger.setAttribute('aria-expanded', 'false');
    cb.trigger = trigger;
    cb.plan = opts.plan || '';
    // What they were looking at, so the team knows the context: given, or the WhatsApp message on the button.
    cb.context = opts.context || '';
    if (!cb.context && trigger && trigger.href) {
      try { cb.context = new URL(trigger.href).searchParams.get('text') || ''; } catch (err) { cb.context = ''; }
    }
    form.hidden = false;
    cbEl('callback-done').hidden = true;
    cbEl('callback-error').hidden = true;
    // From the home search, for somewhere we don't go yet: "Let's plan Paris", with one line of explanation.
    if (cb.plan) cbEl('callback-title').textContent = "Let's plan " + cb.plan.charAt(0).toUpperCase() + cb.plan.slice(1);
    cbEl('callback-sub').textContent = cb.plan ? "No group trip there yet. We'll plan one for you." : '';
    cbEl('callback-sub').hidden = !cb.plan;
    // A message we filled in from the search is cleared next time; one they typed themselves is kept.
    if (opts.message) form.elements.message.value = opts.message;
    else if (form.elements.message.value === cb.autoMessage) form.elements.message.value = '';
    cb.autoMessage = opts.message || '';
    showCallbackMessage(!!form.elements.message.value);
    cbEl('callback-fallback').href = R.wa(cb.context || 'Hi Fuyamo, I would like to chat about a trip.');
    panel.hidden = false;
    setCallbackMethod(cb.method);
    if (trigger && trigger.hasAttribute('data-callback')) trigger.setAttribute('aria-expanded', 'true');
    if (finePointer.matches) {
      const next = [...form.querySelectorAll('input:not([disabled]):not([name="_honey"])')].find((i) => !i.value);
      (next || cbEl('callback-send')).focus({ preventScroll: true });
    }
  }

  function closeCallback(restoreFocus) {
    const panel = cbEl('callback');
    if (panel.hidden) return;
    panel.hidden = true;
    if (cb.trigger) {
      cb.trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus && cb.trigger.offsetParent) cb.trigger.focus({ preventScroll: true });
    }
    cb.trigger = null;
  }

  // ---------- "Share this trip" card (trip pages) ----------

  const share = { trigger: null };
  // The trip's public address: the page's canonical link, or this address without its query.
  const shareUrl = () => (document.querySelector('link[rel="canonical"]') || { href: window.location.href.split(/[?#]/)[0] }).href;

  function openShare(trigger) {
    const panel = cbEl('share');
    closeCallback(false);
    share.trigger = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    cbEl('share-more').hidden = !navigator.share; // the phone's own share sheet, where there is one
    cbEl('share-copy').textContent = 'Copy link';
    panel.hidden = false;
    placeFloating(panel, trigger);
    panel.querySelector('.share__opt').focus({ preventScroll: true });
  }

  function closeShare(restoreFocus) {
    const panel = cbEl('share');
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    share.trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) share.trigger.focus({ preventScroll: true });
    share.trigger = null;
  }

  function showCallbackMessage(show) {
    cbEl('callback-message-field').hidden = !show;
    const more = document.querySelector('[data-action="callback-more"]');
    more.hidden = show;
    more.setAttribute('aria-expanded', String(show));
    placeCallback();
  }

  async function sendCallback(e) {
    e.preventDefault();
    const form = e.currentTarget, btn = cbEl('callback-send'), byEmail = cb.method === 'email';
    const name = form.elements.name.value.trim(), number = normaliseNumber(form.elements.whatsapp.value);
    const data = {
      _form: 'callback',
      _subject: (byEmail ? 'Email' : 'WhatsApp') + ' callback request: ' + name + (cb.plan ? ' · ' + cb.plan : ''),
      name,
      'Reply by': byEmail ? 'Email' : 'WhatsApp',
    };
    if (byEmail) { data.email = form.elements.email.value.trim(); data._news = form.elements._news.checked; }
    else { data['WhatsApp'] = prettyNumber(number); data['Start the chat'] = 'https://wa.me/' + number.slice(1); }
    if (form.elements.message.value.trim()) data['Message'] = form.elements.message.value.trim();
    if (cb.plan) data['Destination'] = cb.plan.charAt(0).toUpperCase() + cb.plan.slice(1);
    if (cb.context) data['About'] = cb.context;
    data['Asked from'] = document.title + ' · ' + window.location.href.split(/[?#]/)[0];
    data._honey = form.elements._honey.value;
    cbEl('callback-error').hidden = true;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      await sendToInbox(data);
      track('generate_lead', { form: 'callback', reply_by: byEmail ? 'email' : 'whatsapp' });
      form.hidden = true;
      cbEl('callback-done-title').textContent = 'Thanks, ' + name.split(' ')[0] + '.';
      cbEl('callback-done-text').textContent = byEmail ? "We'll email you at " + data.email + '.' : "We'll WhatsApp you at " + data['WhatsApp'] + '.';
      cbEl('callback-done').hidden = false;
      cbEl('callback-done').focus({ preventScroll: true });
      placeCallback();
    } catch (err) {
      cbEl('callback-error').hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send';
    }
  }

  // ---------- Home: destination search ----------

  // Somewhere we don't run a group trip yet: offer to plan it, with what they searched for filled in.
  function planTrip() {
    const dest = cbEl('find-dest').value.trim(), select = cbEl('find-month');
    const when = select.value === '' ? '' : select.options[select.selectedIndex].text;
    openCallback(document.querySelector('.search'), {
      plan: dest,
      context: 'Tailored trip to ' + dest + (when ? ', ' + when : ''),
      message: "I'd like to go to " + dest + (when ? ' in ' + when : '') + '.',
    });
  }

  // The destination box takes any place. As you type it suggests matching trips (arrow keys, Enter and Escape work);
  // somewhere we don't go yet gets "Plan a trip to …", which opens the "leave your number" card.
  // Video moments load and play only while on screen, and not at all for people who prefer less motion or save data
  // (they see the still).
  function playMoments() {
    const videos = document.querySelectorAll('video[data-video]');
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator.connection && navigator.connection.saveData);
    if (!videos.length || calm || !('IntersectionObserver' in window)) return;
    const watch = new IntersectionObserver((entries) => entries.forEach(({ target: video, isIntersecting }) => {
      if (!isIntersecting) { video.pause(); return; }
      if (!video.getAttribute('src')) video.src = video.dataset.video;
      video.play().catch(() => {});
    }), { rootMargin: '200px' });
    videos.forEach((video) => watch.observe(video));
  }

  // On phones the Moments rows are swiped by hand, and drift on their own in between (the second row the other way):
  // a finger on a row stops it, and it carries on a few seconds after letting go. The list is in twice, so going past
  // half way jumps back by half and the row never runs out. (Bigger screens move them with CSS.)
  function driftMoments() {
    const phone = window.matchMedia('(max-width: 759.98px)');
    const rows = [...document.querySelectorAll('.moments__row')];
    if (!rows.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const SPEED = 32; // px per second
    const half = (row) => row.firstElementChild.scrollWidth / 2;
    const state = rows.map((row, i) => ({ row, dir: i ? -1 : 1, pos: row.scrollLeft, holdUntil: 0 }));
    state.forEach((s) => {
      const hold = () => { s.holdUntil = Infinity; };
      const release = () => { s.holdUntil = performance.now() + 2500; };
      s.row.addEventListener('touchstart', hold, { passive: true });
      s.row.addEventListener('touchend', release);
      s.row.addEventListener('touchcancel', release);
      s.row.addEventListener('scroll', () => {
        if (!phone.matches) return;
        const h = half(s.row);
        if (s.row.scrollLeft >= h) s.row.scrollLeft -= h;
        else if (s.row.scrollLeft <= 0) s.row.scrollLeft += h;
      }, { passive: true });
    });
    let visible = false, running = false, last = 0;
    const tick = (now) => {
      if (!visible || !phone.matches) { running = false; return; }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      state.forEach((s) => {
        if (now < s.holdUntil) { s.pos = s.row.scrollLeft; return; }
        const h = half(s.row);
        s.pos += s.dir * SPEED * dt;
        if (s.pos >= h) s.pos -= h; else if (s.pos < 0) s.pos += h;
        s.row.scrollLeft = s.pos;
      });
      requestAnimationFrame(tick);
    };
    const start = () => { if (running || !visible || !phone.matches) return; running = true; last = 0; requestAnimationFrame(tick); };
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; start(); }).observe(rows[0].closest('.moments'));
    phone.addEventListener('change', start);
  }

  function setupSearch() {
    const input = cbEl('find-dest'), list = cbEl('find-list');
    let active = -1;
    const options = () => [...list.querySelectorAll('[role="option"]')];
    const setActive = (i) => {
      active = i;
      options().forEach((o, j) => { o.classList.toggle('is-active', j === i); o.setAttribute('aria-selected', String(j === i)); });
      const current = options()[i];
      if (current) { input.setAttribute('aria-activedescendant', current.id); current.scrollIntoView({ block: 'nearest' }); }
      else input.removeAttribute('aria-activedescendant');
    };
    // Suggestions appear once something is typed; an empty box is just a box.
    const show = () => {
      if (!input.value.trim()) { hide(); return; }
      list.innerHTML = R.findOptions(input.value);
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      setActive(-1);
    };
    const hide = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); setActive(-1); };
    const choose = (option) => { hide(); if (option.dataset.trip) go(C.PATHS.trip(option.dataset.trip)); else planTrip(); };
    input.addEventListener('input', show);
    input.addEventListener('focus', show);
    input.addEventListener('keydown', (e) => {
      const count = options().length;
      if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) show(); setActive(Math.min(active + 1, count - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(active - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) choose(options()[active]); else { hide(); ACTIONS.find(); } }
      else if (e.key === 'Escape') hide();
    });
    list.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the box while choosing
    list.addEventListener('click', (e) => { const option = e.target.closest('[role="option"]'); if (option) choose(option); });
    document.addEventListener('pointerdown', (e) => { if (!list.hidden && !e.target.closest('.search')) hide(); });
  }

  // ---------- Birthday offer popup ----------

  // Shown at most once per visit, to people browsing trips, after they've had a look around: 8+ seconds in and then
  // halfway down the page, ~25 seconds, or heading for the close button (desktop). "No thanks" hides it for 14 days;
  // claiming hides it for good. ?offer in the address opens it straight away (handy for sharing).
  const PROMO_KEY = 'fuyamo-birthday-offer';
  const PROMO_PAGES = ['home', 'trips', 'trip', 'calendar', 'book', 'services', 'about', 'talk', 'post', 'yamo'];
  const promoState = (value) => {
    try {
      if (value) localStorage.setItem(PROMO_KEY, JSON.stringify(value));
      return JSON.parse(localStorage.getItem(PROMO_KEY) || '{}');
    } catch (err) {
      return { until: Infinity }; // no storage: don't risk showing it on every page
    }
  };

  function openPromo() {
    const dlg = cbEl('promo-pop');
    if (dlg.open) return;
    closeCallback(false);
    if (state.menu) { state.menu = false; updateNav(); }
    dlg.showModal();
    fitPromo();
  }

  // Phones: keep the popup inside the part of the screen that's visible (the keyboard takes the rest), and drop
  // the photo when space is short, so the form is never pushed out of sight.
  function fitPromo() {
    const dlg = cbEl('promo-pop');
    if (!dlg || !dlg.open) return;
    const vv = window.visualViewport;
    const height = vv ? vv.height : window.innerHeight;
    const tight = window.innerWidth < 640 && height < 560;
    dlg.style.setProperty('--vvh', Math.round(height) + 'px');
    dlg.style.setProperty('--vvt', Math.round((vv ? vv.offsetTop : 0) + 8) + 'px');
    dlg.classList.toggle('is-tight', tight);
  }

  function setupPromo() {
    const dlg = cbEl('promo-pop');
    if (!dlg || typeof dlg.showModal !== 'function') return;
    dlg.addEventListener('close', () => { if (!promoState().claimed) promoState({ until: Date.now() + 14 * 864e5 }); });
    // Only a tap on the dimmed backdrop (outside the popup's box) closes it, not a tap on a gap inside it.
    dlg.addEventListener('click', (e) => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', fitPromo);
      window.visualViewport.addEventListener('scroll', fitPromo);
    }
    window.addEventListener('resize', fitPromo);
    cbEl('promo-form').addEventListener('submit', sendPromo);
    cbEl('promo-form').elements.whatsapp.addEventListener('input', (e) => {
      e.target.setCustomValidity(!e.target.value || normaliseNumber(e.target.value) ? '' : 'Enter a WhatsApp number, e.g. 072 123 4567');
    });
    if (new URLSearchParams(window.location.search).has('offer')) { openPromo(); return; }
    const saved = promoState();
    if (!PROMO_PAGES.includes(page) || saved.claimed || saved.until > Date.now()) return;

    const earliest = Date.now() + 8000;
    let done = false;
    const show = () => {
      if (done) return;
      if (Date.now() < earliest) { setTimeout(show, earliest - Date.now()); return; }
      // Don't interrupt: wait while they're typing, or the contact card, share card or menu is open.
      const busy = !cbEl('callback').hidden || share.trigger || state.menu || document.hidden || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName);
      if (busy) { setTimeout(show, 4000); return; }
      done = true;
      window.removeEventListener('scroll', onScrollDepth);
      document.removeEventListener('mouseout', onExit);
      openPromo();
    };
    const onScrollDepth = () => {
      const depth = window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      if (depth > 0.5) show();
    };
    const onExit = (e) => { if (!e.relatedTarget && e.clientY <= 0) show(); };
    window.addEventListener('scroll', onScrollDepth, { passive: true });
    document.addEventListener('mouseout', onExit);
    setTimeout(show, 25000);
  }

  async function sendPromo(e) {
    e.preventDefault();
    const form = e.currentTarget, btn = cbEl('promo-send');
    const month = +form.elements.month.value, monthName = C.MONTHS_FULL[month];
    const name = form.elements.name.value.trim(), number = normaliseNumber(form.elements.whatsapp.value);
    const trips = R.DEPARTURES.filter((d) => d.month === month).map((d) => d.trip.menuLabel + ' (' + d.label + ')');
    cbEl('promo-error').hidden = true;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      await sendToInbox({
        _form: 'birthday',
        _subject: 'Birthday R500 offer: ' + name + ' (' + monthName + ')',
        name,
        'Birthday month': monthName,
        'WhatsApp': prettyNumber(number),
        'Start the chat': 'https://wa.me/' + number.slice(1),
        'Trips that month': trips.join(', ') || 'None yet',
        'Asked from': document.title + ' · ' + window.location.href.split(/[?#]/)[0],
        _honey: form.elements._honey.value,
      });
      promoState({ claimed: true });
      track('generate_lead', { form: 'birthday' });
      form.hidden = true;
      cbEl('promo-done-title').textContent = "You're in, " + name.split(' ')[0] + '.';
      cbEl('promo-done-text').textContent = trips.length
        ? "We'll WhatsApp you about R500 off. Departing in " + monthName + ':'
        : 'No group trips depart in ' + monthName + " yet. We'll WhatsApp you when one does.";
      cbEl('promo-trips').innerHTML = R.monthTrips(month);
      cbEl('promo-done').hidden = false;
      cbEl('promo-done').focus();
    } catch (err) {
      cbEl('promo-error').hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Claim R500 off';
    }
  }

  // ---------- Home: scrolling statement ----------

  // Lights the statement up word by word as the section scrolls by (see .intro in styles.css). --p runs from 0, when
  // the text comes up from the bottom of the screen, to 1, just before it unpins and moves on.
  function scrollIntro() {
    const intro = document.querySelector('.intro');
    if (!intro || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    intro.dataset.scroll = '';
    let last = '';
    const update = () => {
      const box = intro.getBoundingClientRect(), screen = window.innerHeight;
      const p = Math.min(1, Math.max(0, (screen * .25 - box.top) / (box.height - screen * .95))).toFixed(3);
      if (p !== last) intro.style.setProperty('--p', last = p);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  }

  const MOUNTS = {
    home() {
      // The pages are built ahead of time; refresh "Departing soon" if a departure has passed since.
      const departing = document.getElementById('departing');
      const today = new Date();
      if (departing.dataset.key !== R.departingKey(today)) {
        departing.innerHTML = R.departingCards(today);
        departing.dataset.key = R.departingKey(today);
      }
      scrollIntro();
      playMoments();
      driftMoments();
      setupSearch();
      fitReviews();
      document.fonts.ready.then(fitReviews);
      window.addEventListener('resize', fitReviews);
    },
    // Phones and tablets get a pinned booking bar; it steps aside while the booking card is on screen.
    trip() {
      // One "seen" per trip page view, so each label's clicks can be compared with how often it was shown.
      track('seen_' + eventName(seatLabel()), { trip: state.trip.key });
      adTrack('ViewContent', 'ViewContent', state.trip);
      const bar = document.getElementById('book-bar');
      new IntersectionObserver(([entry]) => bar.classList.toggle('is-hidden', entry.isIntersecting))
        .observe(document.querySelector('.booking__card'));
    },
    // Filters can come from the address, e.g. trips/?style=road&month=jul
    corporate() {
      document.getElementById('quote-form').addEventListener('submit', sendQuote);
      if (new URLSearchParams(window.location.search).get('sent') === '1') showQuoteSent();
    },
    contact() {
      document.getElementById('contact-form').addEventListener('submit', sendContact);
    },
    trips() {
      const query = new URLSearchParams(window.location.search);
      if (STYLES.some((s) => s[0] === query.get('style'))) state.tripStyle = query.get('style');
      const month = MONTHS.findIndex((m) => m.toLowerCase() === (query.get('month') || '').toLowerCase());
      if (ACTIVE_MONTHS.includes(month)) state.tripMonth = month;
      if (state.tripStyle !== 'all' || state.tripMonth >= 0) updateTrips();
    },
  };

  // ---------- Seat button test & analytics ----------

  // Sends an event to Google Analytics when it's set up (SITE.analytics.ga4); otherwise does nothing. Enquiries and
  // WhatsApp taps also go to the Meta and TikTok pixels, which is what their ads learn from.
  function track(name, params) {
    if (typeof window.gtag === 'function') window.gtag('event', name, Object.assign({ transport_type: 'beacon' }, params));
    if (name === 'generate_lead') adTrack('Lead', 'SubmitForm');
    if (name === 'click_whatsapp') adTrack('Contact', 'Contact');
  }
  // An event for the Meta pixel and the TikTok pixel (when they're set up), under each one's standard name, with the
  // trip and its price when there is one.
  function adTrack(meta, tiktok, trip) {
    const value = trip && Number(trip.price.replace(/[^\d]/g, ''));
    if (typeof window.fbq === 'function') {
      window.fbq('track', meta, trip ? { content_name: trip.fullName, content_ids: [trip.key], content_type: 'product', value, currency: 'ZAR' } : {});
    }
    if (window.ttq && typeof window.ttq.track === 'function') {
      window.ttq.track(tiktok, trip ? { contents: [{ content_id: trip.key, content_name: trip.fullName }], content_type: 'product', value, currency: 'ZAR' } : {});
    }
  }
  // The label this visitor sees ("Reserve seat" or "Secure seat"), and its event-name form ("reserve_seat").
  const seatLabel = () => C.SITE.seatButton[C.SITE.seatButton.length > 1 && document.documentElement.dataset.ab === '1' ? 1 : 0];
  const eventName = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  // A click on the seat button: counted per label, and the label is added to the Yamo link (cta=…) so Yamo can
  // tell which one led to a booking. The link opens in a new tab, so this page stays to send the event.
  function seatClick(link) {
    const label = seatLabel();
    track('click_' + eventName(label), { trip: state.trip.key, button: link.dataset.seat });
    adTrack('InitiateCheckout', 'InitiateCheckout', state.trip);
    const url = new URL(link.href);
    url.searchParams.set('cta', eventName(label));
    link.href = url.href;
  }

  // ---------- Interactions ----------

  // Trip details tabs: show one panel and keep the others in the page (hidden).
  function selectTab(tab, focus) {
    tab.parentElement.querySelectorAll('[role="tab"]').forEach((t) => {
      const on = t === tab;
      t.classList.toggle('is-on', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
  }

  const ACTIONS = {
    menu() { state.menu = !state.menu; updateNav(); },

    // A typed destination goes to the best-matching trip, or offers to plan it if we don't go there yet.
    // An empty box shows all trips (for the chosen month).
    find() {
      const query = document.getElementById('find-dest').value.trim();
      const month = document.getElementById('find-month').value;
      const match = query && R.matchTrips(query)[0];
      if (match) { go(C.PATHS.trip(match.key)); return; }
      if (query) { planTrip(); return; }
      go(R.link('trips') + (month === '' ? '' : '?month=' + MONTHS[+month].toLowerCase()));
    },

    'callback-close'() { closeCallback(true); },
    'promo-close'() { cbEl('promo-pop').close(); },
    'callback-method'() { setCallbackMethod(cb.method === 'email' ? 'whatsapp' : 'email'); },
    'callback-more'() { showCallbackMessage(true); cbEl('callback-form').elements.message.focus(); },

    'to-booking'() { document.querySelector('.booking').scrollIntoView({ behavior: 'smooth' }); },
    tab(btn) { selectTab(btn); },

    // Share: the card offers WhatsApp, Facebook, email, copy link and (on phones) the system share sheet.
    // Without JavaScript the button is a plain WhatsApp share link.
    share(btn, e) {
      e.preventDefault();
      if (share.trigger === btn) closeShare(true); else openShare(btn);
    },
    'share-close'() { closeShare(true); },
    'share-done'() { setTimeout(() => closeShare(false)); }, // the link itself opens WhatsApp, Facebook or email
    async 'share-copy'() {
      const url = shareUrl();
      try {
        await navigator.clipboard.writeText(url);
        cbEl('share-copy').textContent = 'Copied ✓';
      } catch (err) {
        window.prompt('Copy this link:', url);
      }
    },
    async 'share-more'() {
      try {
        await navigator.share({ title: document.title, text: R.shareText(state.trip), url: shareUrl() });
        closeShare(false);
      } catch (err) { /* closed without sharing */ }
    },
    // From the hero quick bar, carry on where they left off: the first required field still empty.
    'to-quote'(btn) {
      document.getElementById('enquire').scrollIntoView({ behavior: 'smooth' });
      if (!btn.closest('.quick')) return;
      const next = [...document.querySelectorAll('#quote-form input[required]')].find((input) => !input.value);
      if (next) next.focus({ preventScroll: true });
    },

    scroll(btn) {
      const rail = document.getElementById(btn.dataset.target);
      rail.scrollBy({ left: rail.clientWidth * 0.7 * +btn.dataset.dir, behavior: 'smooth' });
    },

    bento(btn) {
      document.querySelectorAll('[data-action="bento"]').forEach((b) => setPressed(b, b === btn));
      document.getElementById('bento').innerHTML = R.bentoItems(btn.dataset.value);
    },

    style(btn) { state.tripStyle = btn.dataset.value; updateTrips(); syncTripsAddress(); },
    month(btn) { state.tripMonth = +btn.dataset.value; updateTrips(); syncTripsAddress(); },
    'clear-filters'() { state.tripStyle = 'all'; state.tripMonth = -1; updateTrips(); syncTripsAddress(); },

    faq(btn) {
      const item = btn.closest('.faq');
      const open = !item.classList.contains('is-open');
      item.parentElement.querySelectorAll('.faq').forEach((f) => {
        const on = open && f === item;
        f.classList.toggle('is-open', on);
        f.querySelector('.faq__q').setAttribute('aria-expanded', String(on));
        f.querySelector('.faq__a').hidden = !on;
      });
    },

    review(btn) {
      const card = btn.closest('.review');
      const open = card.classList.toggle('is-open');
      btn.textContent = open ? 'Show less' : 'Read more';
      btn.setAttribute('aria-expanded', String(open));
    },

    date(btn) {
      const index = +btn.dataset.index;
      document.querySelectorAll('.date-opt').forEach((b, i) => {
        b.classList.toggle('is-on', i === index);
        b.setAttribute('aria-checked', String(i === index));
      });
      // Every "reserve on Yamo" link on the page follows the chosen date.
      document.querySelectorAll('[data-reserve]').forEach((a) => { a.href = R.yamoLink(state.trip, index); });
    },

    'quote-tab'(btn) {
      const q = state.quote;
      q.tab = +btn.dataset.index;
      const tab = C.CORP_TABS[q.tab];
      document.querySelectorAll('[data-action="quote-tab"]').forEach((b, i) => setPressed(b, i === q.tab));
      document.getElementById('quote-title').textContent = tab.title;
      document.getElementById('quote-sub').textContent = tab.sub;
      document.getElementById('quote-size-label').textContent = tab.sizeLabel;
      // Partnerships aren't trips: hide destination, team size, dates, budget and "What do you need?".
      document.querySelectorAll('[data-trip-field]').forEach((el) => { el.hidden = !!tab.partner; });
      document.getElementById('quote-notes').placeholder = tab.notes || R.QUOTE_NOTES;
      updateQuoteLinks();
    },

    'quote-inc'(btn) {
      const inc = state.quote.inc, key = btn.dataset.value;
      if (inc.has(key)) inc.delete(key); else inc.add(key);
      const on = inc.has(key);
      setPressed(btn, on);
      btn.querySelector('.inc-chip__box').textContent = on ? '✓' : '';
      updateQuoteLinks();
    },

    'quote-reset'() {
      const form = document.getElementById('quote-form'), tab = state.quote.tab;
      form.reset(); // also clears the "needs filling in" highlights
      state.quote = Object.assign(R.defaultQuote(), { tab });
      document.querySelectorAll('[data-quote]').forEach((el) => { el.value = ''; });
      document.querySelectorAll('[data-action="quote-inc"]').forEach((b) => {
        const on = state.quote.inc.has(b.dataset.value);
        setPressed(b, on);
        b.querySelector('.inc-chip__box').textContent = on ? '✓' : '';
      });
      updateQuoteLinks();
      form.classList.remove('is-sent');
      document.getElementById('quote-done').hidden = true;
      form.querySelector('input[required]').focus();
    },

    'contact-reset'() {
      const form = document.getElementById('contact-form');
      form.reset();
      form.classList.remove('is-sent');
      document.getElementById('contact-done').hidden = true;
      form.elements.name.focus();
    },
  };

  document.addEventListener('click', (e) => {
    // WhatsApp buttons open the "leave your number" card (a second click closes it).
    const waLink = e.target.closest('a[data-wa]');
    if (waLink) track('click_whatsapp', { place: waLink.dataset.wa });
    const trigger = e.target.closest('[data-callback]');
    if (trigger) {
      e.preventDefault();
      if (cb.trigger === trigger && !cbEl('callback').hidden) closeCallback(true); else openCallback(trigger);
      return;
    }
    const seat = e.target.closest('[data-seat]');
    if (seat) seatClick(seat);
    const el = e.target.closest('[data-action]');
    if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el, e);
    // Opened from disk: send folder links to their index.html.
    const a = isFile && !e.defaultPrevented && e.target.closest('a[href]');
    if (a && a.protocol === 'file:' && a.pathname.endsWith('/')) {
      e.preventDefault();
      window.location.href = resolve(a.href);
    }
  });

  // Quote fields appear twice (hero quick bar + full form) and share one value.
  document.addEventListener('input', (e) => {
    const key = e.target.dataset && e.target.dataset.quote;
    if (!key) return;
    state.quote[key] = e.target.value;
    document.querySelectorAll('[data-quote="' + key + '"]').forEach((el) => { if (el !== e.target) el.value = e.target.value; });
    updateQuoteLinks();
  });

  navEl.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-mega]');
    if (el) setMega(el.dataset.mega);
  });
  navEl.addEventListener('mouseleave', () => setMega(''));
  narrowQuery.addEventListener('change', () => { setMega(''); updateNav(); });
  window.addEventListener('scroll', onScroll, { passive: true });

  cbEl('callback-form').addEventListener('submit', sendCallback);
  setupPromo();
  // Check the number as it's typed, so the browser's own "please fix this" message explains what's wrong.
  cbEl('callback-form').elements.whatsapp.addEventListener('input', (e) => {
    e.target.setCustomValidity(!e.target.value || normaliseNumber(e.target.value) ? '' : 'Enter a WhatsApp number, e.g. 072 123 4567');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCallback(true); closeShare(true); } });
  // Arrow keys move between tabs (Tab itself goes on into the open panel).
  document.addEventListener('keydown', (e) => {
    const tab = e.target.closest && e.target.closest('[role="tab"]');
    if (!tab) return;
    const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]')];
    const i = tabs.indexOf(tab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    selectTab(tabs[(next + tabs.length) % tabs.length], true);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!cbEl('callback').hidden && !e.target.closest('#callback, [data-callback], .search')) closeCallback(false);
    if (share.trigger && !e.target.closest('#share, [data-action="share"]')) closeShare(false);
  });
  let placing = 0;
  const replace = () => {
    cancelAnimationFrame(placing);
    placing = requestAnimationFrame(() => { placeCallback(); if (share.trigger) placeFloating(cbEl('share'), share.trigger); });
  };
  window.addEventListener('scroll', replace, { passive: true });
  window.addEventListener('resize', replace);

  document.getElementById('year').textContent = new Date().getFullYear();
  if (MOUNTS[page]) MOUNTS[page]();
  updateNav();
  onScroll();
})();
