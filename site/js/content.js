/* Fuyamo Travel — site content.
   Everything a non-developer is likely to edit lives here: contact details,
   page titles and the wording of each section. Trips, FAQs, reviews and photos are edited in the admin
   (fuyamo.co.za/admin), which saves them in content/; Travel Talk articles are in posts/. build.command turns
   them into js/data.js and js/posts.js, read here. */

window.FUYAMO = (function () {
  const PHOTOS = 'assets/photos/';
  const LOGOS = 'assets/logos/';
  // What the admin manages (content/), as build.command published it in js/data.js.
  const DATA = Object.assign({ trips: [], faqs: [], reviews: { reviews: [] } }, window.FUYAMO_DATA);
  const PHOTO = Object.assign({ headers: {}, moments: [], intro: [], why: [], about: [], services: [] }, DATA.photos);
  const SRCSET = DATA.srcsets || {}; // a photo's smaller copies (made by the build), so phones load a fitting size

  const SITE = {
    // The live address. Used for WhatsApp/Facebook link previews, the sitemap and canonical links.
    url: 'https://fuyamo.co.za',

    whatsapp: '27738662763',
    whatsappDisplay: '+27 73 866 2763',
    phone: '+27722415151',
    phoneDisplay: '072 241 5151',
    email: 'info@fuyamo.co.za',
    // The website's forms post to the Google script in tools/enquiries/Code.gs. It saves each one in the
    // "Fuyamo website enquiries" Google Sheet, emails the address above and tells Plunk (see the README).
    forms: { endpoint: 'https://script.google.com/macros/s/AKfycbyPq_duz3U-vs3mpuZnm99d7OBMBjgRLygfrGGw6Ql2x7rgtMZgSUoXiiiWmfjmyOvbBA/exec' },
    // Office address, as listed on the Google Business Profile (map opens that listing).
    address: {
      street: '3 Bauhinia St', area: 'Highveld Techno Park', city: 'Centurion', postcode: '0157',
      region: 'Gauteng', country: 'ZA', map: 'https://g.page/r/CU1rkt4d-LzMEAE',
    },
    // Yamo links. ref=fuyamo-site lets Yamo see which visits came from this website.
    yamo: {
      site: 'https://www.yamo.travel/?ref=fuyamo-site',
      scan: 'https://app.yamo.travel/scan?ref=fuyamo-site',
      signup: 'https://app.yamo.travel/signup?ref=fuyamo-site',
      trips: 'https://app.yamo.travel/explore?ref=fuyamo-site',
      talk: 'https://www.yamo.travel/?ref=fuyamo-site#talk',
      agencies: 'https://www.yamo.travel/agencies/?ref=fuyamo-site',
    },

    // The trip page's main button. With two labels, visitors are split 50/50 and each keeps theirs on every visit,
    // so Google Analytics shows which label gets more clicks (README, "Button test"). Keep one label to end the test.
    seatButton: ['Reserve seat', 'Secure seat'],
    // Google Analytics 4 measurement ID ("G-…"). Empty: no analytics. It only runs on the live domain, not previews.
    analytics: { ga4: 'G-S6MT5HXJXG' },

    social: [
      { name: 'Instagram', handle: '@travelwithfuyamo', url: 'https://www.instagram.com/travelwithfuyamo/' },
      { name: 'TikTok', handle: '@travelwithfuyamo', url: 'https://www.tiktok.com/@travelwithfuyamo' },
      { name: 'Facebook', handle: 'facebook.com/fuyamo', url: 'https://www.facebook.com/fuyamo' },
    ],

    bank: { accountName: 'Fuyamo PTY', bank: 'Absa · Cheque', accountNumber: '4096 856 552' },

    // Google rating, review count and review link: edited in the admin (Reviews).
    reviews: { rating: DATA.reviews.rating, count: DATA.reviews.count, link: DATA.reviews.link },
  };

  // Each page's address (relative to the site root), browser title and search/share description. Header photos
  // (also used for link previews) are photos/headers/<page>.jpg, named like the address: home, trips, how-to-book, …
  const PAGES = {
    home: {
      path: '', title: 'Fuyamo Travel · Group trips, tailored & corporate travel',
      description: 'A Black-owned, ASATA-registered travel company from South Africa. 2027 group trips to Bali, Thailand, Zanzibar, Namibia, Victoria Falls, Lesotho and Mozambique, plus tailored and corporate travel.',
      // Which part of the header photo stays in view as the screen shape changes ('center', 'center 30%', …).
      imagePosition: 'center 45%',
    },
    trips: { path: 'trips/', title: 'Group trips 2027',
      description: 'Nine group trips across 2027, by air and by road. Flights, stays and activities in one price. Reserve with a deposit and pay the balance in instalments.' },
    calendar: { path: 'calendar/', title: '2027 trip calendar',
      description: 'Every Fuyamo group departure in 2027, month by month. Travelling in your birthday month? That’s R500 off.' },
    services: { path: 'services/', title: 'Services',
      description: 'Group packages, tailored holidays and Public Sector & corporate travel. Flights, hotels, visas, insurance, forex and 24/7 support.' },
    about: { path: 'about/', title: 'About us',
      description: 'Fuyamo Travel is a Black-owned, ASATA-registered, Level 1 B-BBEE travel management company from South Africa, planning trips since 2019.' },
    book: { path: 'how-to-book/', title: 'How to book',
      description: 'Three steps to your seat: pay a deposit from R2,500, use your name and trip as the reference, and send proof of payment. Pay the balance in instalments.' },
    corporate: { path: 'corporate/', title: 'Corporate travel',
      description: 'Retreats, conferences and official travel for businesses and the public sector. Level 1 B-BBEE, consolidated invoicing and a dedicated accounts manager.' },
    talk: { path: 'travel-talk/', title: 'Travel Talk',
      description: 'Tips, guides and trip stories from the Fuyamo Travel team: passports, packing, destination guides and how booking works.' },
    yamo: { path: 'yamo/', title: 'Yamo',
      description: 'Yamo is your passport, journal and trip app in one. Scan your stamps, turn every trip into a page, and book Fuyamo group trips with a deposit and instalments.' },
    contact: { path: 'contact/', title: 'Contact',
      description: 'WhatsApp, call or email Fuyamo Travel about group trips, tailored travel or corporate travel.' },
    // A text page: no header photo (link previews use the home one).
    privacy: { path: 'privacy/', title: 'Privacy notice', plain: true,
      description: 'How Fuyamo Travel collects, uses and protects your personal information, in line with POPIA.' },
  };

  const headerName = (key) => PAGES[key].path.replace(/\/$/, '').replace(/-/g, '_') || 'home';
  // A page without its own header photo shows a plain dark header (each photo is used only once on the site).
  Object.keys(PAGES).forEach((key) => { PAGES[key].image = PHOTO.headers[headerName(key)] || ''; });

  // Trip and article pages are generated from TRIPS and POSTS at these addresses.
  const PATHS = {
    trip: (key) => 'trips/' + key + '/',
    post: (slug) => 'travel-talk/' + slug + '/',
  };

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // The trips, edited in the admin (Trips). Dates must be written as "<day>–<day> <Mon> <year>"; the calendar,
  // filters and "Departing soon" are all derived from them. Each departure has its own Yamo booking link.
  const TRIPS = DATA.trips.map((t) => ({
    key: t.key, name: t.name, edition: t.edition || undefined, menuLabel: t.menu_label || t.name, place: t.place,
    subtitle: t.subtitle, nights: t.nights, price: t.price, deposit: t.deposit, ref: t.reference || t.name,
    type: t.type === 'road' ? 'road' : 'fly', family: !!t.family, blurb: t.blurb,
    // Extra price lines (e.g. parents and children); otherwise one price per person sharing.
    prices: (t.prices || []).length ? t.prices.map((p) => ({ v: p.amount, l: p.label })) : undefined,
    dates: t.departures.map((d) => d.dates),
    yamo: t.departures.map((d) => d.yamo || ''),
    included: t.included || [], optional: t.optional || [],
    cover: t.cover, gallery: t.gallery || [], hasPdf: !!t.has_pdf,
    // How the trip is named in Google results, in the words people search with (e.g. "Victoria Falls, Zambia & Chobe Group Trip").
    searchName: t.search_name || '',
  }));

  const WHY_ICONS = {
    sorted: '<path d="M2 16l20-8-6 12-4-5z"/><path d="M12 15l-1 5"/>',
    people: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M15 14.5c.6-.3 1.3-.5 2-.5 2.8 0 4.5 2.2 4.5 5"/>',
    pay: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M3 10h18"/><path d="M7 15h4"/>',
    trust: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12.2l2.2 2.2 4.3-4.6"/>',
    bday: '<path d="M4 21h16"/><path d="M5 21v-7a2 2 0 012-2h10a2 2 0 012 2v7"/><path d="M5 16c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0"/><path d="M12 12V9"/><path d="M12 6.5c.8-.8.8-1.7 0-3-.8 1.3-.8 2.2 0 3z"/>',
  };

  const WHY = [
    { icon: 'sorted', t: 'Everything, sorted', d: 'Flights, stays, transfers and the good stuff in one price. You just pack.' },
    { icon: 'people', t: 'Meet your people', d: 'Come solo, leave with a crew. Your future travel buddies just booked the same trip.' },
    { icon: 'pay', t: 'No payment panic', d: 'Lock in your seat from R2,500 and pay the rest before you fly.' },
    { icon: 'trust', t: 'Travel with confidence', d: 'ASATA-registered and Level 1 B-BBEE, planning trips since 2019.' },
    { icon: 'bday', t: 'Birthday month perk', d: 'Travelling in your birthday month? Take R500 off your trip.' },
  ];
  // Card photos: chosen in the admin (Photos → Why cards), in card order.
  WHY.forEach((w, i) => { w.img = PHOTO.why[i]; });

  // Google reviews, edited in the admin (Reviews), newest first. when: month and year; trip: optional label.
  const REVIEWS = DATA.reviews.reviews || [];
  const REVIEW_COLORS = ['#0F4C81', '#B5174E', '#1E7A4C', '#7A3FB0', '#B85C00'];

  // Moments ("Trips that left the group chat"): edited in the admin (Photos → Moments).
  const MOMENTS = PHOTO.moments;

  // Questions and answers, edited in the admin (FAQs).
  const FAQS = DATA.faqs.map((f) => [f.question, f.answer]);

  const SERVICES = ['Domestic & international flights', 'Hotel & accommodation reservations', 'Visa & passport assistance', 'Travel insurance coordination', 'Shuttle & car hire', 'Conference & incentive travel', 'Forex advisory (SARS exchange rates)', '24/7 emergency travel support', 'Travel policy compliance monitoring', 'Expense tracking & reporting'];

  const VALUES = [
    { icon: 'heart', t: 'Customer centric', d: 'You are at the heart of everything we plan.' },
    { icon: 'check', t: 'Integrity', d: 'Transparent pricing and honest advice, always.' },
    { icon: 'star', t: 'Excellence', d: 'Service that goes beyond what you expect.' },
    { icon: 'bulb', t: 'Innovation', d: 'Smart tools and fresh ideas for better trips.' },
    { icon: 'leaf', t: 'Sustainability', d: 'Travel that respects people and places.' },
  ];

  // Line icons for the icon tiles (corporate "Why Fuyamo" and the About page values), drawn on a 24px grid.
  const CARD_ICONS = {
    bbbee: '<circle cx="12" cy="9" r="5.5"/><path d="M9 13.8L7.5 21l4.5-2.4 4.5 2.4-1.5-7.2"/>',
    gov: '<path d="M3 21h18"/><path d="M4 10h16"/><path d="M12 3l8.5 5h-17z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/>',
    manager: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>',
    invoice: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12.2l2.2 2.2 4.3-4.6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    event: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h3v3H8z"/>',
    incentive: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5.5a2.5 2.5 0 0 0 2.6 3.6M16 6h2.5a2.5 2.5 0 0 1-2.6 3.6"/><path d="M12 13v4M8.5 20h7l-1-3h-5z"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.2 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    check: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-4.9"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
    bulb: '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2v.1h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    leaf: '<path d="M5 19c0-8 5.5-13.5 14-14 .5 8.5-5 14-13 14z"/><path d="M5 19l7-7"/>',
    group: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c0-3.2 2.5-5.5 5.5-5.5s5.5 2.3 5.5 5.5"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M16 13.6c2.6-.2 4.5 1.8 4.5 4.6"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    briefcase: '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 12.5h17"/>',
  };

  // "Your corporate travel partner" tiles: four across on desktop, two on tablets and phones. Keep it to 8 at most.
  const CORP_WHY = [
    { icon: 'bbbee', t: 'Level 1 B-BBEE', d: 'Maximum procurement recognition for your supplier scorecard.' },
    { icon: 'gov', t: 'Public Sector ready', d: 'Approval-ready quotes and full documentation. Registered with SARS and CIPC.' },
    { icon: 'event', t: 'Conferences & events', d: 'Flights, rooms and transfers for every delegate, coordinated to the event schedule.' },
    { icon: 'incentive', t: 'Incentive travel', d: 'Reward trips for top performers, built from the same experiences as our group tours.' },
    { icon: 'manager', t: 'Dedicated accounts manager', d: 'One person who knows your team, your policy and your preferences.' },
    { icon: 'invoice', t: 'Invoicing & reporting', d: 'One invoice for all company travel, with policy tracking and monthly spend reports.' },
    { icon: 'shield', t: 'ASATA & POPIA', d: 'An ASATA member agency that handles traveller data in line with POPIA.' },
    { icon: 'clock', t: '24/7 support', d: 'Delayed flight or changed plans? Someone answers, day or night.' },
  ];

  const CORP_TABS = [
    { label: 'General enquiry', title: 'How can we help?', sub: 'Flights, a booking for a colleague, a company travel account or a question. Tell us what you need.', sizeLabel: 'Number of travellers' },
    { label: 'Corporate retreats', title: 'Retreats & team building', sub: 'A team getaway with activities, stays and transport, planned end to end.', sizeLabel: 'Team size' },
    { label: 'Conferences & events', title: 'Conferences & events', sub: 'Flights, rooms and transfers for every delegate, timed to your programme.', sizeLabel: 'Number of delegates' },
    { label: 'Public Sector travel', title: 'Public Sector & official travel', sub: 'Compliant, approval-ready quotes with full documentation for your department.', sizeLabel: 'Number of travellers' },
    { label: 'Travel management', title: 'Ongoing travel management', sub: 'One account, one accounts manager and consolidated invoicing for all company travel.', sizeLabel: 'Trips per month' },
    // Not a trip: the trip fields and "What do you need?" are hidden, and the admin skips the quote for these.
    { label: 'Partnerships', title: 'Partnerships & opportunities', sub: 'Hotels, venues, tour operators, brands and other businesses: tell us what you have in mind.', sizeLabel: 'Number of travellers', partner: true, notes: 'Tell us about your business and the opportunity…' },
  ];

  const CORP_FIELDS = [
    { k: 'name', label: 'Full name', ph: 'Your full name', req: true, type: 'text', autocomplete: 'name' },
    { k: 'company', label: 'Company / department', ph: 'Organisation name', req: true, type: 'text', autocomplete: 'organization' },
    { k: 'email', label: 'Work email', ph: 'you@company.co.za', req: true, type: 'email', autocomplete: 'email' },
    { k: 'phone', label: 'Phone', ph: '+27', req: false, type: 'tel', autocomplete: 'tel' },
    { k: 'dest', name: 'destination', label: 'Destination', ph: 'e.g. Cape Town, Zanzibar', req: false, type: 'text', trip: true },
    { k: 'size', name: 'group_size', label: 'Team size', ph: 'e.g. 20', req: false, type: 'text', trip: true },
    { k: 'dates', label: 'Preferred dates', ph: 'e.g. 10–15 May 2027', req: false, type: 'text', trip: true },
    { k: 'budget', label: 'Budget per person', ph: 'Optional', req: false, type: 'text', trip: true },
  ];

  const CORP_INCLUDES = ['Flights', 'Accommodation', 'Transfers', 'Meals', 'Team activities', 'Venue & conferencing', 'Visa assistance', 'Travel insurance'];
  const CORP_INCLUDES_DEFAULT = [];

  // Clients and partners in the logo band on the corporate page. Each logo is a PNG in its brand colours on a
  // transparent background in assets/logos/; w and h are its pixel size, used to give every logo a similar visual
  // weight. tile: true marks a logo that keeps its own coloured square (rounded on the page).
  const CLIENTS = [
    { name: 'The South African State Theatre', file: 'state-theatre.png', w: 360, h: 112 },
    { name: 'ASATA, Association of Southern African Travel Advisors', file: 'asata.png', w: 352, h: 112 },
    { name: 'Greater Giyani Municipality', file: 'giyani.png', w: 70, h: 112 },
    { name: 'Pace Car Rental', file: 'pace.png', w: 279, h: 112 },
    { name: 'University of Cape Town', file: 'uct.png', w: 108, h: 112 },
    { name: 'Mine Health and Safety Council', file: 'mhsc.png', w: 88, h: 112 },
    { name: 'Sixt', file: 'sixt.png', w: 273, h: 112 },
    { name: 'Thamane Travel & Tour', file: 'thamane.png', w: 107, h: 112 },
    { name: 'Snake Nation', file: 'snake-nation.png', w: 80, h: 112 },
    { name: 'Wiggle', file: 'wiggle.png', w: 224, h: 112 },
    { name: 'Legae Lux Properties', file: 'legae-lux.png', w: 112, h: 112, tile: true },
  ];
  const ACCREDITATIONS = [
    { label: 'ASATA member' },
    { label: 'Level 1 B-BBEE' },
    { label: 'POPIA compliant' },
    { label: 'SARS & CIPC compliant' },
  ];

  // The privacy notice (footer link). Each section: [heading, [paragraphs]]; a list inside the paragraphs becomes
  // bullet points, and [text](address) becomes a link. Change `updated` whenever the wording changes.
  const A = SITE.address;
  const PRIVACY = {
    updated: '2026-10-20',
    intro: 'This notice explains what personal information Fuyamo Travel collects through this website and when you book with us, why we need it, and your rights under the Protection of Personal Information Act (POPIA).',
    sections: [
      ['Who we are', [
        `Fuyamo Travel (Pty) Ltd is responsible for your personal information. Our office is at ${A.street}, ${A.area}, ${A.city} ${A.postcode}. You can reach us at [${SITE.email}](mailto:${SITE.email}) or ${SITE.phoneDisplay}.`,
        `Questions about your personal information go to our Information Officer at [${SITE.email}](mailto:${SITE.email}).`,
      ]],
      ['What we collect', [[
        'Enquiries: your name, WhatsApp number or email address, company, destination, travel dates and anything you write to us.',
        'The birthday offer: your name, WhatsApp number and birthday month.',
        'Bookings: what airlines, hotels and other suppliers need, such as your name as it appears in your passport, ID or passport number, date of birth and contact details, plus dietary or medical needs you tell us about. For family trips, a parent or guardian gives us their children’s details.',
        'Website use: the pages you visit, the buttons you click, your device, browser and approximate location, through Google Analytics.',
      ],
      'This website doesn’t take card payments. Deposits and instalments paid in the Yamo app are handled by Yamo, and EFT payments go straight to our bank.',
      ]],
      ['Why we use it', [[
        'To answer your enquiry and send the quotes, proposals or offers you ask for.',
        'To book and manage your trip with our suppliers, and to support you while you travel.',
        'To send you the birthday offer and other trip news you signed up for. You can opt out at any time.',
        'To understand how people use this website and improve it.',
        'To meet our legal, tax and accounting duties.',
      ]]],
      ['Who we share it with', [[
        'Travel suppliers such as airlines, hotels, transfer and activity companies and insurers, when your booking needs it.',
        'Yamo, which we use to plan tailored trips and send proposals, and when you reserve or pay in the Yamo app. Yamo’s own privacy policy applies there.',
        'Google, which stores the messages from this website’s forms in our Google Workspace account and provides Google Analytics.',
        'Plunk, which sends our emails about your enquiry and, if you ask for them, trip news. Every trip news email has an unsubscribe link.',
      ],
      'We never sell your personal information.',
      ]],
      ['Information sent outside South Africa', [
        'Some of these services, including Google and Plunk, store information outside South Africa, and international trips mean sharing your details with suppliers abroad. We only do this with services that protect personal information to a standard similar to POPIA, or when it’s needed for the trip you booked.',
      ]],
      ['Cookies', [
        'Google Analytics uses cookies (named _ga) to count visits and see which pages and buttons are used. This website also saves two small settings in your browser: whether you closed the birthday offer, and which wording of the booking button you see. We don’t use advertising cookies. You can clear or block cookies in your browser’s settings.',
      ]],
      ['How long we keep it', [
        'We keep enquiries for as long as we need them to help you, and no longer than two years. Booking and financial records are kept for five years, as the law requires. After that we delete them or remove anything that identifies you.',
      ]],
      ['Keeping it safe', [
        'We take reasonable technical and organisational steps to protect your information from loss, misuse and unauthorised access, and we expect our suppliers to do the same.',
      ]],
      ['Your rights', [[
        'Ask what personal information we hold about you, and get a copy.',
        'Ask us to correct or delete it.',
        'Object to how we use it, or withdraw your consent, including for marketing messages.',
        'Complain to the Information Regulator at [inforegulator.org.za](https://inforegulator.org.za).',
      ],
      `To use these rights, email [${SITE.email}](mailto:${SITE.email}). We reply within 30 days.`,
      ]],
      ['Changes to this notice', [
        'We may update this notice from time to time. The date at the top shows when it last changed.',
      ]],
    ],
  };

  // Travel Talk articles live in the posts/ folder (one Markdown file each); build.command turns them into js/posts.js.
  const POSTS = window.FUYAMO_POSTS || [];

  return {
    PHOTOS, PHOTO, SRCSET, LOGOS, SITE, PAGES, headerName, PATHS, MONTHS, MONTHS_FULL, TRIPS, WHY, WHY_ICONS, REVIEWS, REVIEW_COLORS, MOMENTS, FAQS,
    PRIVACY, SERVICES, VALUES, CARD_ICONS, CORP_WHY, CORP_TABS, CORP_FIELDS, CORP_INCLUDES, CORP_INCLUDES_DEFAULT, CLIENTS, ACCREDITATIONS, POSTS,
  };
})();
