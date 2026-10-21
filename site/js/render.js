/* Fuyamo Travel — HTML renderer.
   Turns content.js (and the generated posts.js) into page HTML. It uses no browser APIs, so
   tools/build.js runs it to write every page's full HTML ahead of time (what search engines and
   link previews read), and app.js reuses the same pieces when a filter or tab changes. */

window.FUYAMO_RENDER = (function (C) {
  'use strict';

  const { SITE, PHOTO, PAGES, PATHS, MONTHS, MONTHS_FULL } = C;

  // Internal links are relative to the site root: each page's <base href> points there.
  const link = (page) => PAGES[page].path || './';

  // ---------- Helpers ----------

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
  const each = (list, fn) => list.map(fn).join('');
  const EXT = 'target="_blank" rel="noopener"';
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const word = (n) => WORDS[n] || String(n);
  const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // "2026-10-13" → "13 Oct 2026"
  const formatDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return d + ' ' + MONTHS[m - 1] + ' ' + y; };

  const wa = (message) => 'https://wa.me/' + SITE.whatsapp + '?text=' + encodeURIComponent(message);
  const WA = {
    general: wa("Hi Fuyamo, I'd like to find out about your 2027 trips."),
    group: wa('Hi Fuyamo, I have a question about a 2027 group trip.'),
    tailored: wa("Hi Fuyamo, I'd like help planning a tailored trip."),
    corporate: wa('Hi Fuyamo, I have a corporate travel enquiry.'),
  };

  // Buttons marked data-callback open the "leave your number" card instead of jumping to WhatsApp; their
  // WhatsApp link is the fallback when JavaScript is off.
  const CALLBACK = ' data-callback aria-haspopup="dialog" aria-controls="callback"';

  // The corporate page leads with email (businesses send enquiries and approvals by email); every other page leads with WhatsApp.
  // fab: the floating button, which opens the WhatsApp chat itself (the other WhatsApp buttons open the card).
  const primaryContact = (page) => page === 'corporate'
    ? { href: 'mailto:' + SITE.email + '?subject=' + encodeURIComponent('Corporate travel enquiry'), attrs: '', fab: '', short: 'Email us', label: 'Email Fuyamo', email: true }
    : { href: WA.general, attrs: EXT + CALLBACK, fab: EXT + ' data-wa="floating"', short: 'WhatsApp us', label: 'WhatsApp Fuyamo', email: false };

  const pin = (size) => '<span class="pin' + (size ? ' pin--' + size : '') + '"></span>';
  // hero: the page's main photo, fetched first; everything else loads lazily.
  // An empty slot (no photo chosen yet) leaves its frame's plain background.
  const cover = (src, alt, hero) => (src ? '<img class="cover" src="' + esc(src) + '" alt="' + esc(alt || '') + '"' + (hero ? ' fetchpriority="high"' : ' loading="lazy"') + '>' : '');
  // Dates like "16–18 Jul 2027" would otherwise break after the dash in narrow cards.
  const keepTogether = (text) => '<span class="nowrap">' + esc(text) + '</span>';
  const inlinePhoto = (src) => (src ? '<span class="inline-photo">' + cover(src) + '</span>' : '');
  const icon = (paths, size, stroke) =>
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + stroke + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';

  const LOGO = '<span class="logo__word">fuyam<span class="logo__o"></span></span>'
    + '<span class="logo__sub" aria-hidden="true"><span>T</span><span>R</span><span>A</span><span>V</span><span>E</span><span>L</span></span>';

  // ---------- Trips & departures ----------

  // "21–28 Mar 2027" → { label, month: 2, start: Date(2027, 2, 21) }
  function parseDeparture(label) {
    const m = label.match(/^(\d+).*\s([A-Z][a-z]{2})\s(\d{4})$/);
    const month = MONTHS.indexOf(m[2]);
    return { label, month, start: new Date(+m[3], month, +m[1]) };
  }

  const TRIPS = C.TRIPS.map((t) => ({
    ...t,
    prices: t.prices || [{ v: t.price, l: 'pps' }], // pps = per person sharing
    departures: t.dates.map(parseDeparture),
    href: PATHS.trip(t.key),
    // Chosen in the admin: the cover (cards, header, link preview) and the three gallery photos.
    hero: t.cover,
    thumb: C.PHOTOS + 'thumbs/' + t.key + '.jpg', // made by the build script
    photos: t.gallery.slice(0, 3),
    // The trip's details sheet (the same pages as the social posts), offered as a download on its page.
    pdf: 'assets/trips/fuyamo-' + t.dates[0].slice(-4) + '-' + t.key + '.pdf',
    mode: t.type === 'fly' ? 'FLY' : 'ROAD TRIP',
    fullName: t.name + (t.edition ? ' · Family' : ''),
  }));
  const findTrip = (key) => TRIPS.find((t) => t.key === key) || TRIPS[0];

  const DEPARTURES = TRIPS
    .flatMap((trip) => trip.departures.map((d) => ({ trip, ...d })))
    .sort((a, b) => a.start - b.start);
  const ACTIVE_MONTHS = [...new Set(DEPARTURES.map((d) => d.month))];
  const SEASON = DEPARTURES[0].start.getFullYear();

  const STYLES = [
    ['all', 'All trips', () => true],
    ['fly', 'Fly', (t) => t.type === 'fly'],
    ['road', 'Road trips', (t) => t.type === 'road'],
    ['family', 'Family', (t) => !!t.family],
  ];
  const styleFilter = (key) => STYLES.find((s) => s[0] === key)[2];

  // A trip's Yamo link: one per trip, or one per departure (a list in date order).
  function yamoLink(t, dateIndex) {
    const yamo = Array.isArray(t.yamo) ? t.yamo[dateIndex] : t.yamo;
    return yamo || SITE.yamo.site;
  }

  const findPost = (slug) => C.POSTS.find((p) => p.slug === slug);

  // ---------- Navigation ----------

  const tripLinks = (type) => TRIPS.filter((t) => t.type === type).map((t) => [t.menuLabel, t.href]);
  const [TRIPS_URL, SERVICES_URL, CORPORATE_URL, TALK_URL] = ['trips', 'services', 'corporate', 'talk'].map(link);
  const MEGA = {
    trips: [
      ['FLY', tripLinks('fly')],
      ['ROAD TRIPS', tripLinks('road')],
      ['PLAN YOUR TRIP', [['All 2027 trips', TRIPS_URL], ['2027 calendar', link('calendar')], ['How to book', link('book')]]],
    ],
    services: [
      ['LEISURE TRAVEL', [['Tailored holidays', SERVICES_URL], ['Honeymoons & celebrations', SERVICES_URL], ['Family holidays', SERVICES_URL], ['Group trips', TRIPS_URL]]],
      ['WE BOOK', [['Flights', SERVICES_URL], ['Hotels & accommodation', SERVICES_URL], ['Shuttle & car hire', SERVICES_URL], ['Travel insurance', SERVICES_URL]]],
      ['BEFORE YOU GO', [['Visa & passport assistance', SERVICES_URL], ['Forex advisory', SERVICES_URL], ['24/7 travel support', SERVICES_URL]]],
    ],
    corporate: [
      ['WHO WE SERVE', [['Public Sector travel', CORPORATE_URL], ['Corporate accounts', CORPORATE_URL]]],
      ['WHAT WE HANDLE', [['Conferences & events', CORPORATE_URL], ['Incentive travel', CORPORATE_URL], ['Travel policy & reporting', CORPORATE_URL]]],
      ['GET IN TOUCH', [['Make an enquiry', CORPORATE_URL + '#enquire']]],
    ],
    talk: [
      ['TOPICS', [...new Set(C.POSTS.map((p) => p.cat))].map((cat) => [cat, TALK_URL])],
      ['LATEST', C.POSTS.slice(0, 3).map((p) => [p.title, PATHS.post(p.slug)])],
      ['TRAVEL TALK', [['All posts', TALK_URL]]],
    ],
  };
  // About us is in the footer only.
  const NAV = [['Group Trips', 'trips'], ['Services', 'services'], ['Corporate Travel', 'corporate'], ['Travel Talk', 'talk'], ['Contact', 'contact']];
  const NAV_ALIAS = { trip: 'trips', calendar: 'trips', book: 'trips', post: 'talk' };
  const navSection = (page) => NAV_ALIAS[page] || page;

  const megaColumns = (key) => each(MEGA[key] || [], ([title, links]) =>
    `<div class="mega__col"><span class="mega__title">${title}</span>${each(links, ([l, h]) => `<a href="${h}" class="mega__link">${esc(l)}</a>`)}</div>`);

  function nav(page) {
    const active = navSection(page), contact = primaryContact(page);
    return `
      <div class="nav__bar">
        <a href="${link('home')}" class="logo" data-mega="" aria-label="Fuyamo Travel home">${LOGO}</a>
        <nav class="nav__links" aria-label="Main">${each(NAV, ([label, k]) =>
          `<a href="${link(k)}" class="nav__link${k === active ? ' is-active" aria-current="page' : ''}" data-nav="${k}" data-mega="${MEGA[k] ? k : ''}">${label}<span class="nav__caret" aria-hidden="true">${MEGA[k] ? '▾' : ''}</span></a>`)}
        </nav>
        <div class="nav__actions" data-mega="">
          <a href="${contact.href}" ${contact.attrs} class="nav__wa">${contact.short}</a>
          <a href="${link('yamo')}" class="nav__yamo"><span aria-hidden="true">✦</span>Yamo</a>
          <button class="nav__menu-btn" data-action="menu" aria-label="Menu" aria-expanded="false" aria-controls="mobile-menu">☰</button>
        </div>
      </div>
      <div class="mega" id="mega" hidden><div class="mega__inner"></div></div>
      <div class="mobile-menu" id="mobile-menu" hidden>
        ${each(NAV, ([label, k]) => `<a href="${link(k)}" class="mobile-menu__link${k === active ? ' is-active" aria-current="page' : ''}">${label}<span aria-hidden="true">→</span></a>`)}
        <a href="${contact.href}" ${contact.attrs} class="mobile-menu__wa">${contact.short}</a>
      </div>`;
  }

  function footer(year) {
    return `
      <div class="footer">
        <div class="wrap footer__inner">
          <div class="footer__top">
            <h2>Where to <span>next?</span></h2>
          </div>
          <div class="footer__cols">
            <div class="footer__brand">
              <span class="logo logo--lg" role="img" aria-label="Fuyamo Travel">${LOGO}</span>
              <p>Group, tailored and corporate travel from South Africa.</p>
            </div>
            <div class="footer__col">
              <span>TRAVEL</span>
              <a href="${link('trips')}">Group trips</a><a href="${link('calendar')}">${SEASON} calendar</a><a href="${link('corporate')}">Corporate Travel</a><a href="${link('services')}">Services</a>
            </div>
            <div class="footer__col">
              <span>COMPANY</span>
              <a href="${link('yamo')}">Yamo</a><a href="${link('about')}">About us</a><a href="${link('book')}#faqs">FAQs</a><a href="${link('talk')}">Travel Talk</a>
            </div>
            <div class="footer__col footer__col--contact">
              <span>CONTACT</span>
              <a href="mailto:${SITE.email}" aria-label="Email ${esc(SITE.email)}">Email</a>
              ${each(SITE.social, (s) => `<a href="${esc(s.url)}" ${EXT} aria-label="${esc(s.name + ' ' + s.handle)}">${esc(s.name)}</a>`)}
            </div>
          </div>
          <div class="footer__legal"><span>© <span id="year">${year}</span> FUYAMO TRAVEL (PTY) LTD</span><span><a href="${link('privacy')}">PRIVACY NOTICE</a> · ASATA · POPIA · LEVEL 1 B-BBEE</span></div>
        </div>
      </div>`;
  }

  // ---------- Destination search ----------

  const fold = (text) => String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const TRIP_WORDS = TRIPS.map((t) => ({ t, words: fold([t.name, t.fullName, t.menuLabel, t.place, t.subtitle, t.key, t.edition || ''].join(' ')).split(' ') }));

  // Trips whose name, country or stops start with every word typed ("vic", "zanz", "cape"), best first.
  function matchTrips(query) {
    const q = fold(query).split(' ').filter(Boolean);
    if (!q.length) return [];
    return TRIP_WORDS
      .map(({ t, words }) => ({ t, score: q.every((w) => words.some((x) => x.startsWith(w))) ? (fold(t.name).startsWith(q[0]) ? 2 : 1) : 0 }))
      .filter((m) => m.score)
      .sort((a, b) => b.score - a.score)
      .map((m) => m.t);
  }

  // The suggestions under the destination box: matching trips, or an offer to plan somewhere we don't go yet.
  function findOptions(query) {
    const matches = query.trim() ? matchTrips(query) : TRIPS;
    if (matches.length) {
      return each(matches.slice(0, 6), (t, i) => `<li class="search__opt" role="option" id="find-opt-${i}" data-trip="${t.key}" aria-selected="false">
          <img src="${esc(t.thumb)}" alt="" width="40" height="40">
          <span class="search__opt-text"><strong>${esc(t.menuLabel)}</strong><small>${esc(t.place)} · ${esc(t.dates[0])}</small></span>
          <span class="search__opt-price">${esc(t.price)}</span>
        </li>`);
    }
    return `<li class="search__opt search__opt--plan" role="option" id="find-opt-0" data-plan aria-selected="false">
          <span class="search__opt-icon" aria-hidden="true">✦</span>
          <span class="search__opt-text"><strong>Plan a trip to “${esc(query.trim())}”</strong><small>No group trip there yet. We'll put one together for you.</small></span>
        </li>`;
  }

  // ---------- "Leave your number" card ----------

  const FLAG_ZA = '<svg width="22" height="15" viewBox="0 0 90 60" aria-hidden="true"><path fill="#E03C31" d="M0 0h90v30H0z"/><path fill="#001489" d="M0 30h90v30H0z"/><path fill="none" stroke="#fff" stroke-width="20" d="M0 0l45 30L0 60M45 30h45"/><path fill="none" stroke="#007749" stroke-width="12" d="M0 0l45 30L0 60M45 30h45"/><path fill="#FFB81C" d="M0 12l27 18L0 48z"/><path fill="#000" d="M0 18l18 12L0 42z"/></svg>';

  // One card per page, opened by any [data-callback] button (app.js). People leave a WhatsApp number or an
  // email address and Fuyamo gets back to them, instead of being sent off to WhatsApp.
  function callbackPanel() {
    return `<div class="callback" id="callback" role="dialog" aria-labelledby="callback-title" hidden>
  <button type="button" class="callback__close" data-action="callback-close" aria-label="Close">✕</button>
  <form class="callback__form" id="callback-form">
    <div class="callback__head"><h2 class="callback__title" id="callback-title">We'll WhatsApp you</h2><p class="callback__sub" id="callback-sub" hidden></p></div>
    <label class="callback__field"><span class="sr-only">Name</span><input name="name" autocomplete="name" required placeholder="Your name"></label>
    <label class="callback__field" id="callback-wa-field"><span class="sr-only">WhatsApp number</span><span class="callback__phone"><span class="callback__cc">${FLAG_ZA}+27</span><input name="whatsapp" type="tel" inputmode="tel" autocomplete="tel" required placeholder="WhatsApp number"></span></label>
    <label class="callback__field" id="callback-email-field" hidden><span class="sr-only">Email</span><input name="email" type="email" autocomplete="email" required disabled placeholder="Email address"></label>
    <label class="callback__field" id="callback-message-field" hidden><span class="sr-only">Message</span><textarea name="message" rows="3" placeholder="Message (optional)"></textarea></label>
    <div class="callback__links">
      <button type="button" class="callback__link" data-action="callback-more" aria-expanded="false" aria-controls="callback-message-field">+ Add a message</button>
      <button type="button" class="callback__link" data-action="callback-method" id="callback-switch">Use email instead</button>
    </div>
    <label class="consent" id="callback-news" hidden><input type="checkbox" name="_news"><span>Email me trip news and offers</span></label>
    <input type="text" name="_honey" class="sr-only" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button type="submit" class="callback__send" id="callback-send">Send</button>
    <p class="callback__error" id="callback-error" role="alert" hidden>Didn't send. Try again or <a href="${WA.general}" ${EXT} id="callback-fallback">open WhatsApp</a>.</p>
  </form>
  <div class="callback__done" id="callback-done" tabindex="-1" hidden>
    <span class="done-icon" aria-hidden="true">✓</span>
    <strong class="callback__title" id="callback-done-title">Thanks.</strong>
    <p class="callback__sub" id="callback-done-text"></p>
  </div>
</div>`;
  }

  // ---------- Sharing a trip ----------

  const SHARE_ICONS = {
    share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    // Brand marks are solid shapes (stroke none) inside the same outline-icon helper.
    whatsapp: '<path fill="currentColor" stroke="none" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/>',
    facebook: '<path fill="currentColor" stroke="none" d="M14 8.5V6.8c0-.8.5-1.3 1.4-1.3H17V2.3h-2.6C11.6 2.3 10 4 10 6.6v1.9H7.5V12H10v9.7h4V12h2.7l.5-3.5z"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    more: '<g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></g>',
  };

  // The trip's public address (what friends receive) and the line that goes with it.
  const tripUrl = (t) => (SITE.url ? SITE.url.replace(/\/+$/, '') + '/' : '') + t.href;
  const shareText = (t) => `${t.fullName} with Fuyamo Travel: ${t.nights}, from ${t.price} per person.`;
  const shareWhatsApp = (t) => 'https://wa.me/?text=' + encodeURIComponent(shareText(t) + '\n' + tripUrl(t));

  // The "Share this trip" card, opened by the Share button on a trip page (app.js places it like the callback card).
  function sharePanel(t) {
    const url = tripUrl(t);
    const option = (key, label, attrs) => `<${attrs.startsWith('href') ? 'a' : 'button type="button"'} class="share__opt" ${attrs}><span class="share__icon">${icon(SHARE_ICONS[key], 20, 1.6)}</span><span class="share__label">${label}</span></${attrs.startsWith('href') ? 'a' : 'button'}>`;
    return `<div class="callback share" id="share" role="dialog" aria-labelledby="share-title" hidden>
  <button type="button" class="callback__close" data-action="share-close" aria-label="Close">✕</button>
  <h2 class="callback__title" id="share-title">Share this trip</h2>
  <div class="share__preview"><img src="${esc(t.thumb)}" alt="" width="44" height="44"><span><strong>${esc(t.fullName)}</strong><small>${esc(t.nights)} · from ${esc(t.price)}</small></span></div>
  <div class="share__opts">
    ${option('whatsapp', 'WhatsApp', `href="${esc(shareWhatsApp(t))}" ${EXT} data-action="share-done"`)}
    ${option('facebook', 'Facebook', `href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" ${EXT} data-action="share-done"`)}
    ${option('email', 'Email', `href="mailto:?subject=${encodeURIComponent(t.fullName + ' with Fuyamo Travel')}&amp;body=${encodeURIComponent(shareText(t) + '\n\n' + url)}" data-action="share-done"`)}
    ${option('link', '<span id="share-copy">Copy link</span>', 'data-action="share-copy"')}
    ${option('more', 'More', 'data-action="share-more" id="share-more" hidden')}
  </div>
</div>`;
  }

  // ---------- Birthday offer popup ----------

  // Shown once in a while to people browsing trips (app.js decides when), or straight away with ?offer in the address.
  function birthdayPopup() {
    return `<dialog class="promo-pop" id="promo-pop" aria-labelledby="promo-title">
  ${PHOTO.birthday_popup ? `<div class="promo-pop__media">${cover(PHOTO.birthday_popup, '')}</div>` : ''}
  <div class="promo-pop__body">
    <button type="button" class="callback__close" data-action="promo-close" aria-label="Close">✕</button>
    <form class="promo-pop__form" id="promo-form">
      <h2 class="promo-pop__title" id="promo-title">Travel in your birthday month?<br>Get R500 off.</h2>
      <label class="callback__field"><span class="sr-only">Birthday month</span><select name="month" required><option value="">Your birthday month</option>${each(MONTHS_FULL, (m, i) => `<option value="${i}">${m}</option>`)}</select></label>
      <label class="callback__field"><span class="sr-only">Name</span><input name="name" autocomplete="given-name" required placeholder="Your name"></label>
      <label class="callback__field"><span class="sr-only">WhatsApp number</span><span class="callback__phone"><span class="callback__cc">${FLAG_ZA}+27</span><input name="whatsapp" type="tel" inputmode="tel" autocomplete="tel" required placeholder="WhatsApp number"></span></label>
      <input type="text" name="_honey" class="sr-only" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button type="submit" class="callback__send" id="promo-send">Claim R500 off</button>
      <p class="callback__error" id="promo-error" role="alert" hidden>Didn't send. Please try again.</p>
      <button type="button" class="promo-pop__skip" data-action="promo-close">No thanks</button>
    </form>
    <div class="promo-pop__done" id="promo-done" tabindex="-1" hidden>
      <span class="done-icon" aria-hidden="true">✓</span>
      <strong class="promo-pop__title" id="promo-done-title">You're in.</strong>
      <p class="promo-pop__sub" id="promo-done-text"></p>
      <div class="promo-pop__trips" id="promo-trips"></div>
    </div>
  </div>
</dialog>`;
  }

  // Trips departing in a month, as links for the popup's thank-you.
  const monthTrips = (month) => each(DEPARTURES.filter((d) => d.month === month), (d) =>
    `<a href="${d.trip.href}" class="promo-pop__trip"><strong>${esc(d.trip.menuLabel)}</strong><span>${esc(d.label)}</span></a>`);

  // ---------- Shared blocks ----------

  // The open Yamo passport (as on yamo.travel): holder page on the left, a taped-in trip photo on the right.
  const passportVisual = () => `<div class="passport" aria-hidden="true">
              <div class="passport__book">
                <div class="passport__page">
                  <div class="passport__row"><span>HOLDER</span><span>NO. YM 0421</span></div>
                  <strong class="passport__name">Amara K.</strong>
                  <span class="passport__row">22 COUNTRIES · 5 CONTINENTS</span>
                  <span class="passport__stamp">ADMITTED<br>✈<br>MAPUTO</span>
                  <span class="passport__mrz">P&lt;YAMO&lt;AMARA&lt;&lt;K&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;<br>YM0421&lt;&lt;ZAF&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</span>
                </div>
                <div class="passport__page">
                  <div class="passport__row"><span>MOMENTS</span><span>NO. 2 / 22</span></div>
                  <figure class="passport__photo">${PHOTO.yamo_passport ? `<img src="${esc(PHOTO.yamo_passport)}" alt="" loading="eager">` : '<span class="passport__blank"></span>'}<figcaption>BILENE · 12–16 FEB</figcaption></figure>
                </div>
              </div>
            </div>`;

  // "Pay your deposit on Yamo": the quickest way to reserve, shown above the EFT steps. Dark, not amber: amber is kept
  // for the one main button on screen (here the booking card's Reserve).
  const yamoRow = (href, text, follows) => `<a href="${esc(href)}" ${EXT}${follows ? ' data-reserve' : ''} class="contact-option contact-option--dark yamo-row">
          <span class="contact-option__icon">${icon(C.CARD_ICONS.phone, 22, 1.5)}</span>
          <span class="contact-option__text"><strong>Pay your deposit on Yamo</strong><small>${text}</small></span>
          <span class="contact-option__go" aria-hidden="true">→</span>
        </a>`;

  // A compact tile with a round icon, a title and a line of text (corporate "Why Fuyamo", About page values).
  const iconCard = (c) => `
          <div class="icon-card">
            <span class="icon-card__icon">${icon(C.CARD_ICONS[c.icon], 24, 1.5)}</span>
            <h3 class="icon-card__t">${esc(c.t)}</h3>
            <span class="icon-card__d">${esc(c.d)}</span>
          </div>`;

  function pageHero(img, eyebrow, title, text) {
    return '<section class="frame"><div class="page-hero">' + cover(img, '', true) + '<div class="page-hero__shade"></div>'
      + '<div class="page-hero__inner"><div class="stack gap-16"><div class="eyebrow eyebrow--light">' + eyebrow + '</div><h1 class="page-hero__title">' + title + '</h1></div>'
      + (text ? '<p class="page-hero__text">' + text + '</p>' : '')
      + '</div></div></section>';
  }

  // The seat button's words. With two labels both are written out and the page shows the visitor's one (the
  // data-ab attribute that build.js's head script sets on <html>), so there's no flicker; without it, the first.
  const seatLabel = () => SITE.seatButton.length > 1
    ? each(SITE.seatButton.slice(0, 2), (l, i) => `<span class="ab-${i}">${esc(l)}</span>`)
    : esc(SITE.seatButton[0]);

  function tripCard(t, lines, cta) {
    return `<a href="${t.href}" class="trip-card">
      <div class="media trip-card__media">
        ${cover(t.hero, t.fullName + ' group trip')}
        <div class="tags"><span class="tag">${t.mode}</span>${t.edition ? `<span class="tag tag--edition">${esc(t.edition)}</span>` : ''}</div>
        <span class="corner-arrow" aria-hidden="true">↗</span>
      </div>
      <div class="trip-card__body">
        <span class="place">${pin()}${esc(t.place)}</span>
        <span class="trip-card__name">${esc(t.name)}</span>
        ${lines}
        <div class="trip-card__foot">
          <span class="trip-card__price"><strong>${esc(t.price)}</strong><span>/ person</span></span>
          <span class="trip-card__cta">${cta}</span>
        </div>
      </div>
    </a>`;
  }

  // Tabs that share one panel space (trip details), instead of stacking every section down the page.
  // tabs: [key, label, count (0 = none), panel HTML]; falsy entries are skipped. app.js switches them; without
  // JavaScript the <noscript> style shows every panel and hides the tab row.
  function detailTabs(tabs) {
    const list = tabs.filter(Boolean);
    return `
          <div class="pills tabs" role="tablist" aria-label="Trip details">${each(list, ([k, label, n], i) =>
            `<button class="pill${i ? '' : ' is-on'}" role="tab" id="tab-${k}" aria-controls="panel-${k}" aria-selected="${!i}" tabindex="${i ? -1 : 0}" data-action="tab">${label}${n ? ` <span class="pill__count">${n}</span>` : ''}</button>`)}
          </div>
          ${each(list, ([k, label, , html], i) => `<div class="tab-panel" role="tabpanel" id="panel-${k}" aria-labelledby="tab-${k}"${i ? ' hidden' : ''}>
            <h2 class="tab-panel__title">${label}</h2>
            ${html}
          </div>`)}
          <noscript><style>.tabs { display: none !important; } .tab-panel[hidden] { display: flex !important; } .tab-panel__title { position: static; width: auto; height: auto; margin: 0; overflow: visible; clip: auto; white-space: normal; }</style></noscript>`;
  }

  function faqList(items) {
    return '<div class="faq-list">' + each(items, ([q, a], i) => `
      <div class="faq${i === 0 ? ' is-open' : ''}">
        <button class="faq__q" data-action="faq" aria-expanded="${i === 0}"><span class="faq__q-text">${esc(q)}</span><span class="faq__icon" aria-hidden="true">+</span></button>
        <p class="faq__a"${i === 0 ? '' : ' hidden'}>${esc(a)}</p>
      </div>`) + '</div>';
  }

  const arrows = (target, small, label) => `<div class="arrows">
      <button class="arrow-btn${small ? ' arrow-btn--sm' : ''}" data-action="scroll" data-target="${target}" data-dir="-1" aria-label="Previous${label}">←</button>
      <button class="arrow-btn${small ? ' arrow-btn--sm' : ''}" data-action="scroll" data-target="${target}" data-dir="1" aria-label="Next${label}">→</button>
    </div>`;

  // ---------- Home ----------

  const SVG_PIN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
  const SVG_CAL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
  const SVG_SEARCH = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/></svg>';
  const MOMENT_TILT = [['-5deg', '10px'], ['3deg', '-6px'], ['-2deg', '14px'], ['4deg', '-10px'], ['-3deg', '8px'], ['2deg', '-4px'], ['-4deg', '12px']];
  const BENTO_SPANS = [4, 2, 2, 2, 2, 3, 3, 2, 4];

  // "Moments worth the trip": one polaroid per photo chosen in the admin (Photos → Moments), linked to the trip its caption names (or the
  // [word] in its file name). The row drifts sideways, so it's written twice (the copy hidden from screen readers)
  // to loop without a gap.
  const momentCards = (copy) => each(C.MOMENTS, (m, i) => {
    const [rot, y] = MOMENT_TILT[i % MOMENT_TILT.length];
    const trip = matchTrips(m.trip || m.caption)[0];
    return `<a href="${trip ? trip.href : link('trips')}" class="polaroid" style="--rot:${rot};--y:${y}"${copy ? ' aria-hidden="true" tabindex="-1"' : ''}><div class="media polaroid__img">${cover(m.src, copy ? '' : 'Fuyamo travellers: ' + m.caption)}</div><div class="polaroid__cap">${pin()}${esc(m.caption)}</div></a>`;
  });

  // The next four departures from `today` (or the first four, once the season has passed).
  function upcoming(today) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const next = DEPARTURES.filter((d) => d.start >= day);
    return (next.length ? next : DEPARTURES).slice(0, 4);
  }
  const departingKey = (today) => upcoming(today).map((d) => d.trip.key + '@' + d.label).join('|');
  const departingCards = (today) => each(upcoming(today), (d) =>
    tripCard(d.trip, `<span class="trip-card__when">${keepTogether(d.label)}&nbsp;· ${keepTogether(d.trip.nights)}</span>`, 'Book now'));

  function reviewCard(r, i) {
    return `<div class="review">
      <div class="review__who">
        <span class="review__avatar" style="background:${C.REVIEW_COLORS[i % C.REVIEW_COLORS.length]}" aria-hidden="true">${esc(r.name.charAt(0))}</span>
        <span class="review__meta"><span class="review__name">${esc(r.name)}</span><span class="review__when">${esc(r.when)}</span></span>
        <span class="review__g" aria-hidden="true">G</span>
      </div>
      <span class="review__rating">
        <span class="sr-only">${r.rating} out of 5 stars</span>
        <span class="review__stars" aria-hidden="true">${'★'.repeat(r.rating)}</span><span class="review__stars review__stars--empty" aria-hidden="true">${'★'.repeat(5 - r.rating)}</span>
        <span class="review__trip">${esc(r.trip)}</span>
      </span>
      <p class="review__text">${esc(r.text)}</p>
      <button class="review__more" data-action="review" aria-expanded="false" hidden>Read more</button>
    </div>`;
  }

  function bentoItems(style) {
    const shown = TRIPS.filter(styleFilter(style));
    const n = shown.length, full = Math.floor(n / 3) * 3;
    return each(shown, (t, i) => {
      // "All" uses the hand-tuned layout; filtered views fill rows of three, stretching the remainder.
      const span = style === 'all' ? (BENTO_SPANS[i] || 2) : (i < full ? 2 : 6 / (n - full));
      return `<a href="${t.href}" class="media bento__item" style="--span:span ${span}">
        ${cover(t.hero, t.fullName + ' group trip')}
        <div class="fade-bottom"></div>
        <span class="bento__arrow" aria-hidden="true">↗</span>
        <div class="bento__info">
          <div class="stack"><span class="bento__name">${esc(t.fullName)}</span><span class="place">${pin()}${esc(t.place)}</span></div>
          <span class="from"><small>FROM</small><strong>${esc(t.price)}</strong></span>
        </div>
      </a>`;
    });
  }

  function homePage(param, today) {
    const monthYear = (i) => MONTHS_FULL[i] + ' ' + DEPARTURES.find((d) => d.month === i).start.getFullYear();

    return `
      <section class="frame">
        <div class="hero">
          <img class="cover" src="${esc(PAGES.home.image)}" alt="" fetchpriority="high" style="object-position:${esc(PAGES.home.imagePosition || 'center')}">
          <div class="hero__shade"></div>
          <div class="hero__content">
            <h1 class="hero__title">Time to travel.</h1>
            <div class="search" role="search">
              <label class="search__field">${SVG_PIN}<input id="find-dest" type="text" placeholder="Where to?" autocomplete="off" spellcheck="false" enterkeyhint="search" role="combobox" aria-label="Destination" aria-autocomplete="list" aria-expanded="false" aria-controls="find-list"></label>
              <label class="search__field">${SVG_CAL}<select id="find-month" aria-label="Month"><option value="">When?</option>${each(ACTIVE_MONTHS, (i) => `<option value="${i}">${monthYear(i)}</option>`)}</select></label>
              <button class="search__go" data-action="find" aria-label="Search trips">${SVG_SEARCH}<span class="search__label" aria-hidden="true">Search trips</span></button>
              <ul class="search__list" id="find-list" role="listbox" aria-label="Matching trips" hidden></ul>
            </div>
          </div>
        </div>
      </section>

      <section class="intro">
        <p class="intro__statement">We plan the flights, ${inlinePhoto(PHOTO.intro[0])} the&nbsp;stays ${inlinePhoto(PHOTO.intro[1])} and the good&nbsp;stuff, <span class="intro__keep">so you just ${inlinePhoto(PHOTO.intro[2])} show&nbsp;up.</span></p>
      </section>

      <section class="wrap departing">
        <div class="section-head">
          <h2 class="title-xl">The next seats<br>to go.</h2>
          <a href="${link('trips')}" class="btn-line btn-line--lg">All ${SEASON} trips →</a>
        </div>
        <div class="trip-grid" id="departing" data-key="${esc(departingKey(today))}">${departingCards(today)}</div>
      </section>

      <section class="why">
        <div class="wrap why__head">
          <h2 class="title-xl">Travel, minus<br>the stress.</h2>
          ${arrows('why-rail', false, '')}
        </div>
        <div class="rail why__rail" id="why-rail">${each(C.WHY, (w) => `
          <div class="media why-card${w.img ? '' : ' why-card--blank'}">
            ${cover(w.img)}
            <div class="why-card__shade"></div>
            <div class="why-card__body">
              <span class="why-card__icon">${icon(C.WHY_ICONS[w.icon], 34, 1.4)}</span>
              <h3 class="why-card__t">${esc(w.t)}</h3>
              <span class="why-card__d">${esc(w.d)}</span>
            </div>
          </div>`)}
        </div>
      </section>

      ${C.MOMENTS.length ? `<section class="moments">
        <div class="center-head"><h2 class="title-xl balance">Moments worth<br>the trip.</h2></div>
        <div class="moments__row"><div class="moments__track">${momentCards(false)}${momentCards(true)}</div></div>
      </section>` : ''}

      <section class="wrap destinations">
        <div class="center-head">
          <h2 class="title-xl">${capitalise(word(TRIPS.length))} trips. One year.</h2>
          <div class="pills">${each(STYLES, ([k, label]) => `<button class="pill${k === 'all' ? ' is-on' : ''}" data-action="bento" data-value="${k}" aria-pressed="${k === 'all'}">${label}</button>`)}</div>
        </div>
        <div class="bento" id="bento">${bentoItems('all')}</div>
      </section>

      <section class="reviews">
        <div class="wrap reviews__head">
          <div class="reviews__score">
            <span class="review__g reviews__g" aria-hidden="true">G</span>
            <h2 class="reviews__title">Rated ${esc(SITE.reviews.rating)} on Google</h2>
            <span class="reviews__stars" aria-hidden="true">★★★★★</span>
            <a href="${esc(SITE.reviews.link)}" ${EXT} class="reviews__count">${esc(SITE.reviews.count)} reviews ↗</a>
          </div>
          ${arrows('reviews-rail', true, ' reviews')}
        </div>
        <div class="rail reviews__rail" id="reviews-rail">${each(C.REVIEWS, reviewCard)}</div>
      </section>

      <section class="wrap faq-section faq-section--home">
        <div class="faq-intro">
          <h2 class="title-lg">Questions,<br>answered.</h2>
          <a href="${link('book')}" class="btn-dark">How booking works →</a>
        </div>
        ${faqList(C.FAQS.slice(0, 4))}
      </section>
`;
  }

  // ---------- Trips ----------

  // The trip grid for a style and month (-1 = any month).
  function tripResults(style, month) {
    const shown = TRIPS.filter(styleFilter(style))
      .filter((t) => month < 0 || t.departures.some((d) => d.month === month));
    const html = shown.length
      ? '<div class="trip-grid trip-grid--list">' + each(shown, (t) => tripCard(t,
        `<span class="trip-card__when">${t.dates.map(keepTogether).join('&nbsp;· ')}</span><span class="trip-card__nights">${esc(t.nights)}</span>`, 'View trip')) + '</div>'
      : `<div class="empty-state">
          <strong>No group trips match that.</strong>
          <span>Try another month, or ask us to plan a tailored trip for your dates.</span>
          <button data-action="clear-filters">Show all trips</button>
        </div>`;
    return { count: shown.length + (shown.length === 1 ? ' TRIP' : ' TRIPS'), html };
  }

  function tripsPage() {
    const all = tripResults('all', -1);
    return pageHero(PAGES.trips.image, `THE ${SEASON} LINE-UP`, 'Pick your trip.') + `
      <section class="wrap trips-body">
        <div class="filters">
          <div class="filters__row">
            <div class="pills">${each(STYLES, ([k, label, fn]) => `<button class="pill${k === 'all' ? ' is-on' : ''}" data-action="style" data-value="${k}" aria-pressed="${k === 'all'}">${label} <span class="pill__count">${TRIPS.filter(fn).length}</span></button>`)}</div>
            <span class="sr-only" id="trip-count" aria-live="polite">${all.count}</span>
          </div>
          <div class="months">${each([-1, ...ACTIVE_MONTHS], (i) => `<button class="month-pill${i < 0 ? ' is-on' : ''}" data-action="month" data-value="${i}" aria-pressed="${i < 0}">${i < 0 ? 'ANY MONTH' : MONTHS[i].toUpperCase()}</button>`)}</div>
        </div>
        <div id="trip-results">${all.html}</div>
      </section>`;
  }

  function tripPage(key) {
    const t = findTrip(key);
    const more = TRIPS.filter((x) => x.key !== t.key)
      .sort((a, b) => (b.type === t.type) - (a.type === t.type))
      .slice(0, 4);
    const B = SITE.bank;
    return `
      <section class="wrap trip">
        <div class="trip__head">
          <div class="trip__top">
            <nav class="crumbs" aria-label="Breadcrumb"><a href="${link('trips')}" class="trip__back">← All trips</a></nav>
            <div class="trip__acts">
              ${t.hasPdf ? `<a href="${esc(t.pdf)}" download="${esc('Fuyamo ' + t.dates[0].slice(-4) + ' ' + t.fullName + '.pdf')}" class="trip-act">${icon(SHARE_ICONS.download, 16, 1.8)}Trip details<small>PDF</small></a>` : ''}
              <a href="${esc(shareWhatsApp(t))}" ${EXT} class="trip-act" data-action="share" aria-haspopup="dialog" aria-controls="share" aria-expanded="false">${icon(SHARE_ICONS.share, 16, 1.8)}Share</a>
            </div>
          </div>
          ${t.edition ? `<span class="tag tag--edition trip__edition">${esc(t.edition)}</span>` : ''}
          <h1 class="trip__title">${esc(t.name)}</h1>
          <span class="trip__sub">${pin(10)}${esc(t.subtitle)}</span>
          <div class="gallery">
            <div class="media gallery__main">${cover(t.hero, t.fullName + ' group trip', true)}</div>
            ${each(t.photos, (src, i) => `<div class="media gallery__item">${cover(src, t.fullName + ' trip photo ' + (i + 1))}</div>`)}
          </div>
          <p class="trip__blurb">${esc(t.blurb)}</p>
        </div>

        <div class="trip__rest">${detailTabs([
          ['inc', "What's included", t.included.length,
            `<div class="inc-grid">${each(t.included, (item) => `<div class="inc-item">${pin(10)}${esc(item)}</div>`)}</div>`],
          t.optional.length && ['extras', 'Extras', t.optional.length,
            `<p class="tab-note">Optional, at your own cost.</p><div class="chips">${each(t.optional, (o) => `<span class="chip">${esc(o)}</span>`)}</div>`],
          ['reserve', 'How to reserve', 0,
            `${yamoRow(yamoLink(t, 0), 'Pay the ' + esc(t.deposit) + ' pp deposit in the app' + (t.dates.length > 1 ? ' for the date you picked.' : '.'), true)}
            <span class="pay-or">OR PAY BY EFT</span>
            <div class="steps">
              <div class="step"><span class="step__n">01</span><span class="step__t">Pay ${esc(t.deposit)} pp</span><span class="step__d">${esc(B.accountName)} · ${esc(B.bank)}<br><b>${esc(B.accountNumber)}</b></span></div>
              <div class="step"><span class="step__n">02</span><span class="step__t">Reference</span><span class="step__d">Your name + “${esc(t.ref)}”</span></div>
              <div class="step"><span class="step__n">03</span><span class="step__t">Send proof</span><span class="step__d">${esc(SITE.email)} or WhatsApp ${esc(SITE.whatsappDisplay)}</span></div>
            </div>`],
        ])}
        </div>

        <aside class="booking" aria-label="Book this trip">
          <div class="booking__card">
            <div class="stack gap-8">
              <div class="booking__prices">${each(t.prices, (p) => `<div class="booking__price"><strong>${esc(p.v)}</strong><span${p.l === 'pps' ? ' title="per person sharing"' : ''}>${esc(p.l)}</span></div>`)}</div>
              <span class="booking__meta">${t.type === 'road' ? 'ROAD TRIP FROM JHB' : 'FLY'} · ${esc(t.nights.toUpperCase())}</span>
            </div>
            ${t.dates.length > 1 ? `<div class="stack gap-8">
              <span class="booking__label" id="departure-label">PICK A DATE</span>
              <div class="date-opts" role="radiogroup" aria-labelledby="departure-label">${each(t.dates, (d, i) => `<button class="date-opt${i === 0 ? ' is-on' : ''}" role="radio" aria-checked="${i === 0}" data-action="date" data-index="${i}">${esc(d)}<span class="date-opt__dot"></span></button>`)}</div>
            </div>` : `<div class="stack gap-8"><span class="booking__label">DEPARTS</span><span class="date-one">${esc(t.dates[0])}</span></div>`}
            <div class="fact fact--deposit"><span>Deposit to reserve</span><strong>${esc(t.deposit)} pp</strong></div>
            <div class="booking__ctas">
              <a href="${esc(yamoLink(t, 0))}" ${EXT} class="btn-amber" data-reserve data-seat="card">${seatLabel()} →</a>
              <a href="${esc(wa('Hi Fuyamo, I have a question about the ' + t.fullName + ' trip.'))}" ${EXT} data-wa="trip" class="booking__wa">${icon(SHARE_ICONS.whatsapp, 17, 1.6)}WhatsApp us</a>
            </div>
            <span class="booking__note">Deposit non-refundable. Balance in instalments, due 30 days before departure.</span>
          </div>
        </aside>
      </section>

      ${sharePanel(t)}

      <div class="book-bar" id="book-bar">
        <span class="book-bar__price"><small>FROM</small><strong>${esc(t.price)}</strong></span>
        ${t.dates.length > 1
          ? '<button class="book-bar__btn" data-action="to-booking">See dates &amp; book</button>'
          : `<a href="${esc(yamoLink(t, 0))}" ${EXT} class="book-bar__btn" data-reserve data-seat="bar">${seatLabel()} →</a>`}
      </div>

      <section class="paper">
        <div class="wrap more">
          <div class="section-head"><h2 class="more__title">You might also like</h2><a href="${link('trips')}" class="btn-line">All trips →</a></div>
          <div class="more__grid">${each(more, (m) => `
            <a href="${m.href}" class="media more-card">
              ${cover(m.hero, m.fullName + ' group trip')}
              <div class="fade-bottom"></div>
              <div class="more-card__info">
                <div><span class="more-card__name">${esc(m.fullName)}</span><span class="more-card__nights">${esc(m.nights)}</span></div>
                <span class="more-card__price">${esc(m.price)}</span>
              </div>
            </a>`)}
          </div>
        </div>
      </section>`;
  }

  function calendarPage() {
    return pageHero(PAGES.calendar.image, `${SEASON} CALENDAR`, 'Plan your year.',
      `${DEPARTURES.length} departures across ${ACTIVE_MONTHS.length} months. Travelling in your birthday month? That's R500 off.`) + `
      <section class="wrap cal">
        <div class="cal__grid">${each(MONTHS_FULL, (name, i) => {
          const items = DEPARTURES.filter((d) => d.month === i);
          return `<div class="cal-month${items.length ? ' has-trips' : ''}">
            <div class="cal-month__head"><h2 class="cal-month__name">${name}</h2><span class="cal-month__num">${String(i + 1).padStart(2, '0')}</span></div>
            ${items.length ? '' : '<span class="cal-month__empty">No group departures. Ask us about a tailored trip.</span>'}
            <div class="cal-items">${each(items, (d) => `
              <a href="${d.trip.href}" class="cal-item">
                <span class="media">${cover(d.trip.thumb)}</span>
                <span class="cal-item__text"><span class="cal-item__name">${esc(d.trip.fullName)}</span><span class="cal-item__date">${esc(d.label)}</span><span class="cal-item__price">${esc(d.trip.prices[0].v)}</span></span>
              </a>`)}
            </div>
          </div>`;
        })}</div>
      </section>`;
  }

  // ---------- Services, about, how to book ----------

  function servicesPage() {
    const service = (img, alt, n, title, text, more) => `<div class="service">
        <div class="media">${cover(img, alt)}</div>
        <div class="service__body"><span class="service__n">${n}</span><h2 class="service__t">${title}</h2><span class="service__d">${text}</span>${more}</div>
      </div>`;
    return pageHero(PAGES.services.image, 'OUR SERVICES', 'Any trip, handled.', 'From a solo getaway to a full public sector delegation, we plan, book and support the whole journey.') + `
      <section class="wrap services">
        ${service(PHOTO.services[0], 'A Fuyamo group trip', '01', 'Group travel packages', 'Curated trips for friends, families, clubs and teams, with flights, stays and activities in one price.', `<a href="${link('trips')}" class="service__link">See ${SEASON} trips →</a>`)}
        ${service(PHOTO.services[1], 'A traveller on a tailored trip', '02', 'Tailored travel', 'Private trips planned around you: honeymoons, birthdays, family holidays. Your dates, your budget.', `<a href="${WA.tailored}" ${EXT + CALLBACK} class="service__link">Plan a trip with us →</a>`)}
        ${service(PHOTO.services[2], 'Fuyamo travellers', '03', 'Public Sector &amp; corporate', 'Policy compliance, monthly spend reports and a dedicated accounts manager for every client.', `<a href="${link('corporate')}" class="service__link">Corporate Travel →</a>`)}
      </section>
      <section class="band">
        <div class="dark-panel">
          <div class="wrap dark-panel__inner">
            <div class="stack gap-18">
              <h2 class="title-lg">One team for<br>the whole journey.</h2>
              <p>Every client gets a consultant who knows their trip, plus 24/7 support while you're away.</p>
            </div>
            <div class="svc-list">${each(C.SERVICES, (s) => `<div class="svc-item">${pin(10)}${esc(s)}</div>`)}</div>
          </div>
        </div>
      </section>`;
  }

  function aboutPage() {
    return pageHero(PAGES.about.image, 'ABOUT FUYAMO', 'Travelling<br>since 2019.') + `
      <section class="wrap about-intro">
        <p>Fuyamo Travel is a Black-owned South African travel management company. We plan corporate, conference, group and private travel, and hold ourselves to ASATA's ethical and professional standards on every booking.</p>
        <div class="about-photos">
          <div class="media">${cover(PHOTO.about[0], 'Fuyamo travellers')}</div>
          <div class="media">${cover(PHOTO.about[1], 'Fuyamo travellers')}</div>
        </div>
      </section>
      <section class="wrap tiles">
        <div class="tile"><span>FOUNDED</span><strong>2019</strong></div>
        <div class="tile"><span>MEMBER</span><strong>ASATA</strong></div>
        <div class="tile"><span>B-BBEE</span><strong>Level 1</strong></div>
        <div class="tile tile--dark"><span>COMPLIANT · SARS &amp; CIPC</span><strong>POPIA</strong></div>
      </section>
      <section class="paper">
        <div class="wrap values-section">
          <h2 class="title-lg">Our values.</h2>
          <div class="card-grid card-grid--5">${each(C.VALUES, iconCard)}</div>
        </div>
      </section>`;
  }

  // The three steps as cards that pin and pile up as you scroll, each leaving its title showing, so the stack
  // ends up reading like a summary: deposit, balance, done.
  function bookPage() {
    const B = SITE.bank;
    const card = (i, title, text, actions, aside) => `
        <article class="stack-card" style="--i:${i}">
          <h2 class="stack-card__head"><span class="stack-card__n">0${i + 1}</span>${title}</h2>
          <div class="stack-card__body">
            <div class="stack-card__main"><p>${text}</p>${actions}</div>
            ${aside}
          </div>
        </article>`;
    return pageHero(PAGES.book.image, 'HOW TO BOOK', 'Three steps<br>to your seat.', 'No full payment upfront. A deposit holds your seat, and the balance is paid in instalments.') + `
      <section class="wrap book-steps">
        <div class="stack-cards">
          ${card(0, 'Pay your deposit', 'From R2,500 per person, depending on the trip. It holds your seat.',
            `<a href="${esc(SITE.yamo.trips)}" ${EXT} class="btn-amber">Pay on Yamo →</a>`,
            `<div class="stack-card__aside eft-box">
              <span class="pay-or">OR PAY BY EFT</span>
              <dl class="eft-box__list">
                <div><dt>Account</dt><dd>${esc(B.accountName)}</dd></div>
                <div><dt>Bank</dt><dd>${esc(B.bank)}</dd></div>
                <div><dt>Number</dt><dd class="eft-box__num">${esc(B.accountNumber)}</dd></div>
                <div><dt>Reference</dt><dd>Your name + trip, e.g. “Thandi Bali”</dd></div>
              </dl>
              <span class="eft-box__note">Then send proof to <a href="mailto:${SITE.email}">${esc(SITE.email)}</a> or <a href="${WA.general}" ${EXT + CALLBACK}>WhatsApp</a>.</span>
            </div>`)}
          ${card(1, 'Pay the balance your way', 'No interest. Pick what suits you.', '',
            `<ul class="stack-card__aside pay-ways">
              <li><strong>Monthly</strong><span>Spread it over the months before you fly.</span><em>RECOMMENDED</em></li>
              <li><strong>At your own pace</strong><span>Top up any amount, any time.</span></li>
              <li><strong>In full</strong><span>Pay once, nothing to think about later.</span></li>
            </ul>`)}
          ${card(2, 'Settle up 30 days before you fly', 'Then pack. Travelling in your birthday month? R500 comes off your balance.',
            `<a href="${link('trips')}" class="btn-line">Find your trip →</a>`,
            `<div class="media stack-card__aside stack-card__photo">${cover(PHOTO.how_to_book, 'Fuyamo travellers')}</div>`)}
        </div>
        <p class="book-steps__note">Deposits vary by trip and are non-refundable. Trips booked less than 30 days before departure are paid in full.</p>
      </section>
      <section class="wrap faq-section faq-section--book" id="faqs">
        <h2 class="title-lg">Questions,<br>answered.</h2>
        ${faqList(C.FAQS)}
      </section>`;
  }

  // ---------- Corporate ----------

  const QUOTE_NOTES = 'Who’s travelling, when, approvals needed, or any questions…';
  const defaultQuote = () => ({ tab: 0, inc: new Set(C.CORP_INCLUDES_DEFAULT), notes: '' });

  // A partnership isn't a trip, so the trip fields and needs are left out for it.
  const quoteFields = (tab) => C.CORP_FIELDS.filter((f) => !(tab.partner && f.trip));
  const quoteNeeds = (q, tab) => (tab.partner ? '' : C.CORP_INCLUDES.filter((k) => q.inc.has(k)).join(', '));
  const quoteSubject = (q, tab) => (tab.partner ? 'Partnership enquiry' : 'Corporate enquiry: ' + tab.label);

  function quoteMessage(q) {
    const tab = C.CORP_TABS[q.tab];
    const lines = [tab.partner ? 'Hi Fuyamo, I have a partnership enquiry.' : 'Hi Fuyamo, I have a corporate travel enquiry: ' + tab.label];
    quoteFields(tab).forEach((f) => { if (q[f.k]) lines.push((f.k === 'size' ? tab.sizeLabel : f.label) + ': ' + q[f.k]); });
    const inc = quoteNeeds(q, tab);
    if (inc) lines.push('Include: ' + inc);
    if (q.notes) lines.push('Message: ' + q.notes);
    return lines.join('\n');
  }

  // What the enquiry form sends: readable labels for the email and the dashboard, with "name", "email" and "phone"
  // kept as-is so replies go straight to the person who asked.
  function quoteSubmission(q) {
    const tab = C.CORP_TABS[q.tab];
    const data = { _form: 'corporate', _subject: quoteSubject(q, tab) + (q.company ? ' · ' + q.company : ''), 'Enquiry type': tab.label };
    quoteFields(tab).forEach((f) => {
      if (q[f.k]) data[['name', 'email', 'phone'].includes(f.k) ? f.k : f.k === 'size' ? tab.sizeLabel : f.label] = q[f.k];
    });
    const inc = quoteNeeds(q, tab);
    if (inc) data['Needs'] = inc;
    if (q.notes) data['Message'] = q.notes;
    return data;
  }

  // The client logo band: every logo gets roughly the same visual area, whatever its shape. The list is
  // repeated (hidden from screen readers) so the loop scrolls without a seam.
  function clientsBand() {
    const AREA = 5200;
    const size = (w, h, area, max) => { const r = w / h, ht = Math.min(max, Math.round(Math.sqrt(area / r))); return { w: Math.round(ht * r), h: ht }; };
    const logo = (c, copy) => {
      const d = size(c.w, c.h, AREA, 60);
      return `<li class="logos__item${c.tile ? ' logos__item--tile' : ''}"${copy ? ' aria-hidden="true"' : ''} style="--w:${d.w}px;--h:${d.h}px"><img src="${C.LOGOS + c.file}" alt="${copy ? '' : esc(c.name)}" width="${d.w}" height="${d.h}" loading="lazy"></li>`;
    };
    return `
      <section class="logos" aria-labelledby="logos-title">
        <h2 class="logos__title" id="logos-title">TRUSTED BY CLIENTS AND PARTNERS</h2>
        <div class="marquee"><ul class="marquee__track">${each(C.CLIENTS, (c) => logo(c))}${each(C.CLIENTS, (c) => logo(c, true))}</ul></div>
        <ul class="accreds">${each(C.ACCREDITATIONS, (a) => `<li class="accred">${pin(10)}${esc(a.label)}</li>`)}</ul>
      </section>`;
  }

  const quoteEmail = (q) => 'mailto:' + SITE.email
    + '?subject=' + encodeURIComponent(quoteSubject(q, C.CORP_TABS[q.tab]))
    + '&body=' + encodeURIComponent(quoteMessage(q));

  function corporatePage() {
    const q = defaultQuote(), tab = C.CORP_TABS[q.tab];
    const QUICK = [['name', 'YOUR NAME', 'Full name'], ['company', 'COMPANY', 'Organisation'], ['dest', 'DESTINATION', 'Where to?'], ['dates', 'TRAVEL DATES', 'e.g. 10–15 May']];
    return `
      <section class="frame">
        <div class="corp-hero">
          ${cover(PAGES.corporate.image, '', true)}
          <div class="corp-hero__shade"></div>
          <div class="corp-hero__inner">
            <div class="corp-hero__copy">
              <div class="eyebrow eyebrow--light">CORPORATE TRAVEL</div>
              <h1>Business travel, managed.</h1>
              <p>Retreats, conferences and official travel for businesses and the public sector.</p>
            </div>
            <div class="quick">
              ${each(QUICK, ([k, label, ph]) => `<label class="quick__field"><span>${label}</span><input data-quote="${k}" value="" placeholder="${ph}"></label>`)}
              <button class="quick__send" data-action="to-quote">Get in touch →</button>
            </div>
            <button class="btn-amber corp-hero__cta" data-action="to-quote">Get in touch ↓</button>
          </div>
        </div>
      </section>
      ${clientsBand()}

      <section class="wrap corp-why">
        <div class="center-head"><h2 class="title-lg balance">Your corporate travel partner.</h2></div>
        <div class="card-grid">${each(C.CORP_WHY, iconCard)}</div>
      </section>


      <section class="quote" id="enquire">
        <div class="center-head"><h2 class="title-lg">Tell us what you need.</h2></div>
        <div class="pills quote__tabs">${each(C.CORP_TABS, (t, i) => `<button class="pill${i === q.tab ? ' is-on' : ''}" data-action="quote-tab" data-index="${i}" aria-pressed="${i === q.tab}">${esc(t.label)}</button>`)}</div>
        <form class="quote__card" id="quote-form" action="${esc(SITE.forms.endpoint)}" method="POST">
          <input type="hidden" name="_form" value="corporate">
          <input type="hidden" name="_subject" id="quote-subject" value="${esc('Corporate enquiry: ' + tab.label)}">
          <input type="hidden" name="enquiry_type" id="quote-type" value="${esc(tab.label)}">
          <input type="hidden" name="needs" id="quote-include" value="${esc(C.CORP_INCLUDES.filter((k) => q.inc.has(k)).join(', '))}">
          <input type="text" name="_honey" class="sr-only" tabindex="-1" autocomplete="off" aria-hidden="true">
          <div class="stack gap-8"><span class="quote__title" id="quote-title">${esc(tab.title)}</span><span class="quote__sub" id="quote-sub">${esc(tab.sub)}</span></div>
          <div class="fields">${each(C.CORP_FIELDS, (f) => `
            <label class="field"${f.trip ? ' data-trip-field' : ''}>
              <span class="field__label">${f.k === 'size' ? `<span id="quote-size-label">${esc(tab.sizeLabel)}</span>` : esc(f.label)} ${f.req ? '<b>*</b>' : ''}</span>
              <input type="${f.type}" name="${f.name || f.k}" data-quote="${f.k}" value="" placeholder="${esc(f.ph)}"${f.autocomplete ? ` autocomplete="${f.autocomplete}"` : ''}${f.req ? ' required' : ''}>
            </label>`)}
          </div>
          <div class="stack gap-12" data-trip-field>
            <span class="field__label">WHAT DO YOU NEED?</span>
            <div class="inc-chips">${each(C.CORP_INCLUDES, (k) => {
              const on = q.inc.has(k);
              return `<button type="button" class="inc-chip${on ? ' is-on' : ''}" data-action="quote-inc" data-value="${esc(k)}" aria-pressed="${on}"><span class="inc-chip__box" aria-hidden="true">${on ? '✓' : ''}</span>${esc(k)}</button>`;
            })}</div>
          </div>
          <label class="field"><span class="field__label">TELL US MORE</span><textarea name="message" data-quote="notes" rows="4" placeholder="${esc(tab.notes || QUOTE_NOTES)}" id="quote-notes"></textarea></label>
          <label class="consent"><input type="checkbox" name="_news" value="yes"><span>Email me trip news and offers</span></label>
          <div class="quote__actions">
            <button type="submit" class="send-btn" id="quote-submit"><span class="send-btn__label">Send enquiry</span><span aria-hidden="true">→</span></button>
            <a href="${quoteEmail(q)}" class="btn-email" id="quote-email">Email us instead</a>
            <span class="quote__note">A consultant replies by email within one working day. Prefer WhatsApp? <a href="${wa(quoteMessage(q))}" ${EXT + CALLBACK} id="quote-wa">Leave your number</a>.</span>
          </div>
          <p class="quote__error" id="quote-error" role="alert" hidden>That didn't go through. Try again, or use “Email us instead”: your details are already filled in.</p>
          <div class="quote__done" id="quote-done" tabindex="-1" hidden>
            <span class="done-icon" aria-hidden="true">✓</span>
            <strong class="quote__title">Enquiry sent.</strong>
            <span class="quote__sub">Thank you. A consultant will reply by email within one working day.</span>
            <button type="button" class="btn-line" data-action="quote-reset">Send another enquiry</button>
          </div>
        </form>
      </section>`;
  }

  // ---------- Travel Talk ----------

  function talkPage() {
    return `
      <section class="wrap talk-head">
        <div class="stack gap-16"><div class="eyebrow">TRAVEL TALK</div><h1 class="page-hero__title">Tips, guides<br>&amp; trip stories.</h1></div>
      </section>
      <section class="wrap posts">${each(C.POSTS, (p) => `
        <a href="${PATHS.post(p.slug)}" class="post-card">
          <div class="media">${cover(p.img, '')}<span class="tag">${esc(p.cat)}</span></div>
          <div class="post-card__body">
            <h2 class="post-card__title">${esc(p.title)}</h2>
            <span class="post-card__intro">${esc(p.intro)}</span>
            <span class="post-card__read"><time datetime="${p.date}">${formatDate(p.date)}</time> · ${esc(p.read)} READ →</span>
          </div>
        </a>`)}
      </section>`;
  }

  function postPage(slug) {
    const p = findPost(slug);
    if (!p) return talkPage();
    const others = C.POSTS.filter((x) => x.slug !== p.slug).slice(0, 3);
    return `
      <section class="article-head">
        <a href="${link('talk')}" class="article-back">← Travel Talk</a>
        <div class="article-meta"><span>${esc(p.cat)}</span><span>${p.updated ? `UPDATED <time datetime="${p.updated}">${formatDate(p.updated)}</time>` : `<time datetime="${p.date}">${formatDate(p.date)}</time>`} · ${esc(p.read)} READ</span></div>
        <h1>${esc(p.title)}</h1>
        <p>${esc(p.intro)}</p>
      </section>
      ${p.img ? `<section class="band"><div class="media article-cover">${cover(p.img, p.title, true)}</div></section>` : ''}
      <article class="article-body">
        <div class="prose">${p.html}</div>
        <div class="article-cta"><strong>Questions about your trip?</strong><a href="${WA.general}" ${EXT + CALLBACK} class="btn-amber">WhatsApp us →</a></div>
      </article>
      ${others.length ? `<section class="paper">
        <div class="wrap keep-reading">
          <h2>Keep reading</h2>
          <div class="more__grid">${each(others, (o) => `
            <a href="${PATHS.post(o.slug)}" class="mini-post">
              <div class="media">${cover(o.img, '')}</div>
              <span class="mini-post__cat">${esc(o.cat)}</span>
              <h3 class="mini-post__title">${esc(o.title)}</h3>
            </a>`)}
          </div>
        </div>
      </section>` : ''}`;
  }

  // ---------- Yamo ----------

  // Screens captured from yamo.travel: [image in assets/yamo, title, description, alt text, image height]
  const YAMO_APP = [
    ['map', 'Spin your world.', 'Every country you’ve been lights up in gold on a globe you can spin.', 'Yamo home screen: a globe with visited countries in gold and the latest passport stamps', 1170],
    ['journal', 'Every trip, a page.', 'Photos taped in, the stamp beside them and a line about the moment.', 'A Yamo journal page for Bilene, Mozambique with a group photo and an entry stamp', 1170],
    ['story', 'Relive it as a story.', 'Tap through any trip, photo by photo.', 'A Yamo trip story showing a photo from Bilene', 1170],
    ['compare', 'Who’s been further?', 'Put your map next to a friend’s and see where you overlap.', 'Yamo compare screen: two travellers’ maps and country counts side by side', 1170],
  ];
  const YAMO_BOOK = [
    ['find', 'Find it', 'Browse live group trips by budget or region, and see tailored proposals made for you.', 'Yamo explore screen with featured Mozambique and Bali trips', 1100],
    ['reserve', 'Reserve a seat', 'Dates, what’s included and seats left on one page. A deposit reserves your seat.', 'A Yamo trip page for Mozambique, February 2027 with price, deposit and dates', 1080],
    ['pay', 'Pay as you go', 'Pay instalments by card or EFT. Vouchers, trip documents and indemnity forms are in the app too.', 'Yamo payment plan with the deposit paid, instalments due and trip documents', 1100],
  ];

  const yamoShots = (shots) => each(shots, ([img, title, text, alt, height], i) => `
    <figure class="yamo-shot">
      <img src="assets/yamo/${img}.jpg" alt="${esc(alt)}" loading="lazy" width="590" height="${height}">
      <figcaption><span class="yamo-shot__n">0${i + 1}</span><strong>${esc(title)}</strong><span>${esc(text)}</span></figcaption>
    </figure>`);

  function yamoPage() {
    const Y = SITE.yamo;
    return `
      <section class="frame">
        <div class="yamo-hero">
          <div class="yamo-hero__inner">
            <div class="yamo-hero__copy">
              <h1>Your world,<br><em>journaled.</em></h1>
              <p>Scan your stamps. Every trip becomes a page.</p>
              <div class="yamo-hero__ctas">
                <a href="${Y.signup}" ${EXT} class="btn-amber">Create your Yamo account →</a>
                <a href="${Y.scan}" ${EXT} class="btn-line">Scan your passport</a>
              </div>
            </div>
            ${passportVisual()}
          </div>
        </div>
      </section>

      <section class="wrap yamo-section">
        <div class="yamo-head">
          <div class="stack gap-14"><div class="eyebrow">THE APP</div><h2 class="title-lg">Your passport,<br>in your pocket.</h2></div>
          <p class="lede">Scan the stamps in your passport. Yamo reads the country and date, then turns every trip into a page in your journal.</p>
        </div>
        <div class="yamo-shots">${yamoShots(YAMO_APP)}</div>
      </section>

      <section class="band">
        <div class="yamo-talk">
          <div class="wrap yamo-talk__inner">
            <div class="yamo-talk__copy">
              <div class="eyebrow eyebrow--light">TALK TO YAMO</div>
              <h2 class="title-lg">Dream it.<br>Yamo builds it.</h2>
              <p>Tell Yamo where you want to go, when, and what you love. A real agency like Fuyamo Travel builds the day-by-day itinerary and sends the proposal straight to your app.</p>
              <span class="yamo-talk__note">Usually replies the same day</span>
              <a href="${Y.talk}" ${EXT} class="btn-amber">✦ Talk to Yamo →</a>
            </div>
            <img class="yamo-talk__phone" src="assets/yamo/talk.jpg" alt="A tailored Japan trip in Yamo, built by Fuyamo Travel, with a day-by-day itinerary" loading="lazy" width="590" height="1145">
          </div>
        </div>
      </section>

      <section class="wrap yamo-section">
        <div class="yamo-head">
          <div class="stack gap-14"><div class="eyebrow">BOOK IN THE APP</div><h2 class="title-lg">From “that looks good”<br>to booked.</h2></div>
          <p class="lede">Every Fuyamo group trip is on Yamo. Reserve your seat with a deposit and pay the rest in instalments before you fly.</p>
        </div>
        <div class="yamo-shots yamo-shots--3">${yamoShots(YAMO_BOOK)}</div>
        <a href="${Y.trips}" ${EXT} class="btn-line btn-line--lg yamo-section__cta">See live trips on Yamo ↗</a>
      </section>

      <section class="band">
        <div class="yamo-cta">
          <h2>Where have <span>you</span> been?</h2>
          <p>Free for travellers. Start with your camera, make an account after.</p>
          <a href="${Y.scan}" ${EXT} class="btn-amber">Scan your passport on Yamo →</a>
          <a href="${Y.agencies}" ${EXT} class="yamo-cta__agency">Run a travel agency? See Yamo for agencies ↗</a>
        </div>
      </section>`;
  }

  // ---------- Privacy notice ----------

  // Plain text with [label](address) links.
  const linked = (text) => esc(text).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => `<a href="${href}"${/^https?:/.test(href) ? ' ' + EXT : ''}>${label}</a>`);

  function privacyPage() {
    const P = C.PRIVACY;
    return `
      <section class="article-head">
        <div class="article-meta"><span>POPIA</span><span>Updated <time datetime="${P.updated}">${formatDate(P.updated)}</time></span></div>
        <h1>Privacy notice</h1>
        <p>${esc(P.intro)}</p>
      </section>
      <article class="article-body">
        <div class="prose">${each(P.sections, ([title, blocks]) => `
          <h2>${esc(title)}</h2>${each(blocks, (b) => Array.isArray(b)
            ? `<ul>${each(b, (item) => `<li>${linked(item)}</li>`)}</ul>`
            : `<p>${linked(b)}</p>`)}`)}
        </div>
      </article>`;
  }

  // ---------- Contact & not found ----------

  function contactPage() {
    const A = SITE.address;
    const option = (href, attrs, tone, ic, title, text) => `
        <a href="${href}" ${attrs} class="contact-option${tone ? ' contact-option--' + tone : ''}">
          <span class="contact-option__icon">${icon(C.CARD_ICONS[ic], 22, 1.5)}</span>
          <span class="contact-option__text"><strong>${title}</strong><small>${text}</small></span>
          <span class="contact-option__go" aria-hidden="true">→</span>
        </a>`;
    return pageHero(PAGES.contact.image, 'CONTACT', "Let's talk travel.", "Pick what you need and we'll get back to you.") + `
      <section class="wrap contact-options">
        ${option(WA.group, EXT + CALLBACK, 'amber', 'group', 'Group trips', 'Ask about a ' + SEASON + ' trip')}
        ${option(WA.tailored, EXT + CALLBACK, '', 'heart', 'Tailored travel', 'Plan a private trip')}
        ${option(link('corporate') + '#enquire', '', 'dark', 'briefcase', 'Corporate travel', 'Business &amp; Public Sector')}
      </section>
      <section class="wrap contact-details">
        <div class="contact-details__box">
          <div><span>WHATSAPP</span><a href="${WA.general}" ${EXT} data-wa="contact-number">${esc(SITE.whatsappDisplay)}</a></div>
          <div><span>CALL</span><a href="tel:${SITE.phone}">${esc(SITE.phoneDisplay)}</a></div>
          <div><span>EMAIL</span><a href="mailto:${SITE.email}">${esc(SITE.email)}</a></div>
          ${A ? `<div><span>OFFICE</span><a href="${esc(A.map)}" ${EXT}><address>${esc(A.street)}<br>${esc(A.area)}, ${esc(A.city)} ${esc(A.postcode)}</address></a></div>` : ''}
          <div><span>FOLLOW US</span>${each(SITE.social, (s) => `<a href="${esc(s.url)}" ${EXT} aria-label="${esc(s.name + ' ' + s.handle)}">${esc(s.name)}</a>`)}</div>
        </div>
      </section>`;
  }

  function notFoundPage() {
    return `
      <section class="wrap not-found">
        <div class="eyebrow">PAGE NOT FOUND</div>
        <h1 class="page-hero__title">Off the map.</h1>
        <p class="lede">That page has moved or never existed. Try one of these instead.</p>
        <div class="not-found__links">
          <a href="${link('home')}" class="btn-dark">Home</a>
          <a href="${link('trips')}" class="btn-line">${SEASON} group trips</a>
          <a href="${link('talk')}" class="btn-line">Travel Talk</a>
          <a href="${WA.general}" ${EXT + CALLBACK} class="btn-line">WhatsApp us</a>
        </div>
      </section>`;
  }

  const VIEWS = {
    home: homePage, trips: tripsPage, trip: tripPage, calendar: calendarPage, services: servicesPage,
    about: aboutPage, book: bookPage, corporate: corporatePage, talk: talkPage, post: postPage,
    yamo: yamoPage, contact: contactPage, privacy: privacyPage, notfound: notFoundPage,
  };

  // The HTML inside <main> for a page. `today` decides which departures count as "departing soon".
  const page = (name, param, today) => (VIEWS[name] || homePage)(param, today);

  return {
    C, TRIPS, DEPARTURES, ACTIVE_MONTHS, SEASON, STYLES, MONTHS, WA,
    esc, link, wa, formatDate, findTrip, findPost, yamoLink, navSection,
    nav, footer, page, megaColumns, bentoItems, tripResults, departingCards, departingKey,
    defaultQuote, quoteMessage, quoteEmail, quoteSubmission, QUOTE_NOTES, primaryContact,
    matchTrips, findOptions, callbackPanel, birthdayPopup, monthTrips, shareText,
  };
})(window.FUYAMO);
