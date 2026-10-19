/* Fuyamo Travel — site builder. Runs on any Mac with no installs (JavaScript for Automation
   plus macOS's built-in `sips` image tool). Start it with build.command in the project folder.

   Reads posts/*.md, content/ (both edited in the admin at /admin), photos/ and site/js/content.js, then writes
   inside site/:
   - js/posts.js: the Travel Talk articles, converted from Markdown
   - js/data.js: trips, FAQs, reviews and the chosen photos from content/, which content.js reads
   - assets/img/: those photos, upright and web-sized
   - one index.html per page (home, trips/, trips/<key>/, travel-talk/<slug>/, …) with the page's full
     HTML (rendered by js/render.js), its own title, description, link-preview tags and structured data
   - 404.html, robots.txt and sitemap.xml
   - assets/share/*.jpg link-preview images (1200×630) and assets/photos/thumbs/*.jpg calendar thumbnails */

ObjC.import('Foundation');

const shell = Application.currentApplication();
shell.includeStandardAdditions = true;

const WHATSAPP_ICON = '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>';
const MAIL_ICON = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/></svg>';
const SHARE_SIZE = [1200, 630];
const THUMB_SIZE = 168; // calendar thumbnails show at 56px; 3× for sharp phone screens
const PHOTO_LIMITS = { width: 2400, kb: 450 };
const SCRIPTS = ['js/posts.js', 'js/data.js', 'js/content.js', 'js/render.js', 'js/app.js'];

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
const q = (value) => "'" + String(value).replace(/'/g, "'\\''") + "'";
const sh = (command) => shell.doShellScript(command);
const dirname = (path) => path.replace(/\/[^/]+$/, '');
const exists = (path) => $.NSFileManager.defaultManager.fileExistsAtPath(path);
const isoDate = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

function read(path) {
  const text = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  if (text.isNil()) throw new Error('Could not read ' + path);
  return text.js;
}

function write(path, text) {
  sh('mkdir -p ' + q(dirname(path)));
  if (!$(text).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null)) throw new Error('Could not write ' + path);
}

// Scales src to fill width×height, crops the centre and saves a JPEG. Skips work when dest is
// already newer than src. Returns true when an image was (re)made.
function coverImage(src, dest, width, height, quality) {
  if (sh(`[ ${q(dest)} -nt ${q(src)} ] && echo fresh || echo stale`) === 'fresh') return false;
  const [w, h] = sh(`sips -g pixelWidth -g pixelHeight ${q(src)} | awk '/pixel/ {print $2}'`).split(/\s+/).map(Number);
  const scale = Math.max(width / w, height / h);
  const tmp = dest + '.tmp.png';
  sh(`mkdir -p ${q(dirname(dest))}`
    + ` && sips -s format png -z ${Math.ceil(h * scale)} ${Math.ceil(w * scale)} ${q(src)} --out ${q(tmp)} >/dev/null`
    + ` && sips -c ${height} ${width} -s format jpeg -s formatOptions ${quality} ${q(tmp)} --out ${q(dest)} >/dev/null`
    + ` && rm ${q(tmp)}`);
  return true;
}

// ---------- Travel Talk posts (Markdown) ----------

// **bold**, *italic* and [links](address). Site links can be written as /trips/bali/.
function inline(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => /^https?:/.test(href)
      ? `<a href="${href}" target="_blank" rel="noopener">${label}</a>`
      : `<a href="${href.replace(/^\//, '')}">${label}</a>`);
}

// Blocks are separated by a blank line: ## headings, - lists, 1. lists, > quotes, ![images](…) and paragraphs.
function markdown(source) {
  return source.trim().split(/\n\s*\n/).map((block) => {
    const lines = block.split('\n').map((l) => l.trim());
    let m;
    if (lines.length === 1 && (m = lines[0].match(/^(#{1,4})\s+(.+)$/))) {
      const level = Math.max(2, m[1].length); // the post title is the page's only h1
      return `<h${level}>${inline(m[2])}</h${level}>`;
    }
    if (lines.every((l) => /^[-*]\s+/.test(l))) return '<ul>' + lines.map((l) => '<li>' + inline(l.replace(/^[-*]\s+/, '')) + '</li>').join('') + '</ul>';
    if (lines.every((l) => /^\d+[.)]\s+/.test(l))) return '<ol>' + lines.map((l) => '<li>' + inline(l.replace(/^\d+[.)]\s+/, '')) + '</li>').join('') + '</ol>';
    if (lines.every((l) => /^>/.test(l))) return '<blockquote><p>' + inline(lines.map((l) => l.replace(/^>\s?/, '')).join(' ')) + '</p></blockquote>';
    if (lines.length === 1 && (m = lines[0].match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) {
      return `<figure><img src="${esc(m[2].replace(/^\//, ''))}" alt="${esc(m[1])}" loading="lazy">${m[1] ? `<figcaption>${esc(m[1])}</figcaption>` : ''}</figure>`;
    }
    return '<p>' + inline(lines.join(' ')) + '</p>';
  }).join('\n');
}

// The details block at the top of an article, as the admin writes it (YAML): plain or quoted values, and long
// values spread over several lines (folded ">" or kept as written "|").
function frontMatter(text) {
  const meta = {}, lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    const more = [];
    while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || (!lines[i + 1].trim() && /^\s+\S/.test(lines[i + 2] || '')))) more.push(lines[++i]);
    let value = m[2].trim();
    if (/^[>|][+-]?$/.test(value)) {
      const indent = Math.min(...more.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
      const block = more.map((l) => l.slice(indent)).join('\n').trim();
      value = value[0] === '|' ? block : block.replace(/([^\n])\n(?!\n)/g, '$1 ');
    } else {
      value = [value].concat(more.map((l) => l.trim())).join(' ').trim();
      if (/^".*"$/.test(value)) { try { value = JSON.parse(value); } catch (err) { value = value.slice(1, -1); } }
      else if (/^'.*'$/.test(value)) value = value.slice(1, -1).replace(/''/g, "'");
    }
    meta[m[1].toLowerCase()] = value;
  }
  return meta;
}

function readPosts(root, photo, notes) {
  const dir = root + '/posts';
  const files = sh(`ls ${q(dir)} 2>/dev/null; true`).split(/\r|\n/).filter((f) => /^[^_.].*\.md$/.test(f));
  const posts = files.map((file) => {
    const text = read(dir + '/' + file).replace(/\r\n?/g, '\n');
    const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) throw new Error(`posts/${file} must start with the --- details block`);
    const meta = frontMatter(m[1]);
    ['title', 'category', 'date', 'image', 'intro'].forEach((key) => {
      if (!meta[key]) throw new Error(`posts/${file} is missing "${key}:" in its details block`);
    });
    meta.date = String(meta.date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(`posts/${file}: write the date as YYYY-MM-DD, e.g. 2026-10-13`);
    const where = 'Travel Talk → ' + meta.title;
    // Photos chosen in the admin live in photos/ and are published like the rest; older articles name a file in
    // site/assets/photos/.
    let img;
    if (/^\/?photos\//.test(meta.image)) img = photo(meta.image, 'posts', where);
    else {
      img = meta.image.includes('/') ? meta.image.replace(/^\//, '') : 'assets/photos/' + meta.image;
      if (!exists(root + '/site/' + img)) notes.push(`${where}: the photo ${img} isn't in site/.`);
    }
    const body = m[2].replace(/\]\((\/?photos\/[^)\s]+)\)/g, (all, src) => '](/' + photo(src, 'posts', where) + ')');
    const words = body.split(/\s+/).filter(Boolean).length;
    return {
      slug: file.replace(/\.md$/, ''), title: meta.title, cat: meta.category, date: meta.date,
      read: meta.read || Math.max(1, Math.round(words / 200)) + ' min', img, intro: meta.intro, html: markdown(body),
    };
  });
  // Newest first; posts from the same day keep alphabetical order.
  return posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// ---------- Photos: photos/ → site/assets/img/ ----------

// Photos are chosen in the admin (content/*.json and the articles point at files in photos/). Each one used is
// published to site/assets/img/<section>/: big or phone photos are turned upright, shrunk and saved as JPEG; a
// JPEG or WebP that's already small enough is copied as it is.
const PHOTO_FILE = /\.(jpe?g|png|webp|heic|heif)$/i;
const PHOTO_SIZES = { // longest side in px
  headers: 2400, trips: 2000, posts: 1600, about: 1200, services: 1200, how_to_book: 1200, why: 1000,
  birthday_popup: 1000, yamo_passport: 800, moments: 640, intro: 600,
};

const slugify = (name) => name.replace(PHOTO_FILE, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Upright, at most maxPx on the longest side, as JPEG (macOS ImageIO, which also reads iPhone HEIC photos).
function saveJpeg(src, out, maxPx, quality) {
  ObjC.import('ImageIO');
  const source = $.CGImageSourceCreateWithURL($.NSURL.fileURLWithPath(src), null);
  const image = source && $.CGImageSourceCreateThumbnailAtIndex(source, 0, $({
    kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: maxPx,
  }));
  if (!image) throw new Error('Could not read the photo ' + src);
  const dest = $.CGImageDestinationCreateWithURL($.NSURL.fileURLWithPath(out), $('public.jpeg'), 1, null);
  $.CGImageDestinationAddImage(dest, image, $({ kCGImageDestinationLossyCompressionQuality: quality }));
  if (!$.CGImageDestinationFinalize(dest)) throw new Error('Could not save ' + out);
}

// Publishes one photo and returns its address inside site/ (e.g. assets/img/why/why-1-everything-sorted.jpg).
function publishPhoto(siteDir, src, rel, maxPx, quality) {
  const web = src.match(/\.(jpe?g|webp)$/i);
  const [w, h, bytes] = web ? sh(`sips -g pixelWidth -g pixelHeight ${q(src)} | awk '/pixel/ {print $2}'; stat -f%z ${q(src)}`).split(/\s+/).map(Number) : [];
  const copy = web && Math.max(w, h) <= maxPx && bytes <= 600 * 1024;
  const out = rel + (copy ? '.' + web[1].toLowerCase().replace('jpeg', 'jpg') : '.jpg');
  const dest = siteDir + '/' + out;
  if (sh(`[ ${q(dest)} -nt ${q(src)} ] && echo fresh || echo stale`) === 'stale') {
    sh('mkdir -p ' + q(dirname(dest)));
    if (copy) sh(`cp ${q(src)} ${q(dest)}`); else saveJpeg(src, dest, maxPx, quality);
  }
  return out;
}

// Keeps track of the photos published in this build, so the ones no longer used can be removed at the end.
function photoPublisher(root, notes) {
  const siteDir = root + '/site', made = new Set();
  // "/photos/trips/bali/1 cover.webp" → "assets/img/trips/trips-bali-1-cover.webp"
  const publish = (src, section, where) => {
    if (!src) { notes.push(`${where}: a photo is missing. Choose one in the admin.`); return ''; }
    const file = root + '/' + src.replace(/^\//, '');
    if (!exists(file)) { notes.push(`${where}: the photo ${src} isn't in the photos folder.`); return ''; }
    const out = publishPhoto(siteDir, file, 'assets/img/' + section + '/' + slugify(src.replace(/^\/?photos\//, '')),
      PHOTO_SIZES[section], section === 'moments' ? 0.62 : 0.72);
    made.add(out);
    return out;
  };
  publish.cleanUp = () => {
    sh(`cd ${q(siteDir)} && find assets/img -type f 2>/dev/null; true`).split(/\r|\n/).filter(Boolean).forEach((file) => {
      if (!made.has(file)) sh('rm ' + q(siteDir + '/' + file));
    });
  };
  return publish;
}

// ---------- Content: content/ (edited in the admin) → site/js/data.js ----------

const readJson = (path) => JSON.parse(read(path));
// Adds ref=fuyamo-site to a Yamo link, so Yamo can see the visit came from this website.
const withRef = (url) => (!url || /[?&]ref=/.test(url) ? url : url + (url.includes('?') ? '&' : '?') + 'ref=fuyamo-site');

function loadContent(root, photo, notes) {
  const dir = root + '/content';
  const P = readJson(dir + '/photos.json');
  const list = (srcs, section, label, need) => {
    if (need && (srcs || []).length !== need) notes.push(`Photos → ${label} has ${(srcs || []).length} photos; it needs ${need}.`);
    return (srcs || []).map((src, i) => photo(src, section, `Photos → ${label} ${i + 1}`));
  };
  const headers = {};
  Object.keys(P.headers || {}).forEach((k) => { headers[k] = photo(P.headers[k], 'headers', 'Photos → Page headers → ' + k); });
  const photos = {
    headers, intro: list(P.intro, 'intro', 'Intro pills', 3), why: list(P.why, 'why', 'Why cards', 5),
    moments: (P.moments || []).map((m, i) => ({ src: photo(m.image, 'moments', 'Photos → Moments ' + (i + 1)), caption: m.caption || '', trip: m.trip || '' })),
    about: list(P.about, 'about', 'About', 2), services: list(P.services, 'services', 'Services', 3),
    how_to_book: photo(P.how_to_book, 'how_to_book', 'Photos → How to book'),
    birthday_popup: photo(P.birthday_popup, 'birthday_popup', 'Photos → Birthday popup'),
    yamo_passport: photo(P.yamo_passport, 'yamo_passport', 'Photos → Yamo passport'),
  };
  const trips = sh(`cd ${q(dir + '/trips')} && ls *.json`).split(/\r|\n/).filter(Boolean)
    .map((file) => Object.assign({ key: file.replace(/\.json$/, '') }, readJson(dir + '/trips/' + file)))
    .filter((t) => !t.hidden)
    .sort((a, b) => (a.order || 99) - (b.order || 99))
    .map((t) => {
      if ((t.gallery || []).length !== 3) notes.push(`Trips → ${t.name} has ${(t.gallery || []).length} gallery photos; it needs 3.`);
      if (!(t.departures || []).length) notes.push(`Trips → ${t.name} has no departures.`);
      return Object.assign(t, {
        cover: photo(t.cover, 'trips', `Trips → ${t.name} → cover`),
        gallery: (t.gallery || []).map((src, i) => photo(src, 'trips', `Trips → ${t.name} → gallery ${i + 1}`)),
        departures: (t.departures || []).map((d) => ({ dates: d.dates, yamo: withRef(d.yamo) })),
      });
    });
  return { trips, photos, faqs: readJson(dir + '/faqs.json').faqs, reviews: readJson(dir + '/reviews.json') };
}

// ---------- Structured data (schema.org) ----------

function structuredData(p, R, siteUrl) {
  const C = R.C, S = C.SITE, A = S.address;
  const abs = (path) => siteUrl + '/' + path;
  const agency = {
    '@type': 'TravelAgency', '@id': siteUrl + '/#agency', name: 'Fuyamo Travel', url: siteUrl + '/',
    logo: abs('assets/brand/fuyamo-travel-icon-tile-256.png'), image: abs('assets/share/home.jpg'),
    description: C.PAGES.home.description, telephone: S.phone, email: S.email, foundingDate: '2019', areaServed: 'ZA',
    sameAs: S.social.map((s) => s.url).concat(A ? [A.map] : []),
  };
  if (A) {
    agency.address = { '@type': 'PostalAddress', streetAddress: A.street + ', ' + A.area, addressLocality: A.city, addressRegion: A.region, postalCode: A.postcode, addressCountry: A.country };
  }
  const ref = { '@id': agency['@id'] };
  const crumbs = (items) => ({
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(path) })),
  });
  const rand = (v) => Number(String(v).replace(/[^\d.]/g, ''));

  const graph = [agency];
  if (p.page === 'home') graph.push({ '@type': 'WebSite', '@id': siteUrl + '/#website', name: 'Fuyamo Travel', url: siteUrl + '/', publisher: ref, inLanguage: 'en-ZA' });
  if (p.page === 'trips') {
    graph.push({ '@type': 'ItemList', name: p.title, itemListElement: R.TRIPS.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.fullName, url: abs(t.href) })) });
  }
  if (p.page === 'trip') {
    const t = R.findTrip(p.param);
    graph.push({
      '@type': 'TouristTrip', name: t.fullName + ' group trip', description: t.blurb, url: abs(p.path), image: abs(t.hero),
      touristType: t.family ? 'Families' : 'Group travellers', provider: ref,
      offers: t.departures.map((d, i) => ({
        '@type': 'Offer', name: t.fullName + ', ' + d.label, price: rand(t.prices[0].v), priceCurrency: 'ZAR',
        availability: 'https://schema.org/InStock', validThrough: isoDate(d.start), url: R.yamoLink(t, i), seller: ref,
      })),
    }, crumbs([['Home', ''], ['Group trips', C.PAGES.trips.path], [t.fullName, p.path]]));
  }
  if (p.page === 'book') {
    graph.push({ '@type': 'FAQPage', mainEntity: C.FAQS.map(([question, answer]) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })) });
  }
  if (p.page === 'talk') graph.push({ '@type': 'Blog', name: 'Travel Talk by Fuyamo Travel', url: abs(p.path), publisher: ref, inLanguage: 'en-ZA' });
  if (p.page === 'post') {
    const post = R.findPost(p.param);
    graph.push({
      '@type': 'BlogPosting', headline: post.title, description: post.intro, image: abs(post.img), articleSection: post.cat,
      datePublished: post.date, dateModified: post.date, author: ref, publisher: ref, mainEntityOfPage: abs(p.path), inLanguage: 'en-ZA',
    }, crumbs([['Home', ''], ['Travel Talk', C.PAGES.talk.path], [post.title, p.path]]));
  }
  // "<" is escaped so text can never close the script tag early.
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

// ---------- Pages ----------

// Button test (trip pages): picks the visitor's seat-button label before the page draws, and keeps it for
// later visits. Visitors whose browser blocks storage all see the first label.
const SEAT_TEST_SCRIPT = "<script>(function(){var v='0';try{v=localStorage.getItem('fuyamo-seat-button');"
  + "if(v!=='0'&&v!=='1'){v=Math.random()<.5?'0':'1';localStorage.setItem('fuyamo-seat-button',v)}}catch(e){v='0'}"
  + "document.documentElement.setAttribute('data-ab',v)})();</script>";

// Google Analytics 4. gtag() is defined on every page so app.js can record events, but the tracker itself only
// loads on the live domain, so previews and local copies never count as visits.
function analyticsScript(id, siteUrl) {
  const host = siteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  return '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}'
    + `if(location.hostname.replace(/^www\\./,'')==='${host}'){var s=document.createElement('script');s.async=true;`
    + `s.src='https://www.googletagmanager.com/gtag/js?id=${id}';document.head.appendChild(s);`
    + `gtag('js',new Date());gtag('config','${id}',{allow_google_signals:false,allow_ad_personalization_signals:false})}</script>`;
}

function pageHtml(p, R, versions, siteUrl, today) {
  const C = R.C;
  const depth = p.path.split('/').filter(Boolean).length;
  // 404.html is served at any address, so it points at the site root directly.
  const base = p.page === 'notfound' ? '/' : depth ? '../'.repeat(depth) : './';
  const shareImage = 'assets/share/' + p.share + '.jpg';
  // Link previews need full addresses; without SITE.url fall back to a path relative to this page.
  const shareUrl = siteUrl ? siteUrl + '/' + shareImage : base + shareImage;
  const pageUrl = siteUrl + '/' + p.path;
  const indexable = p.page !== 'notfound';
  const solidNav = ['talk', 'notfound', 'yamo', 'privacy'].includes(R.navSection(p.page)); // pages without a dark photo behind the nav
  const contact = R.primaryContact(p.page);
  const ga4 = C.SITE.analytics && C.SITE.analytics.ga4;
  const head = (p.page === 'trip' && C.SITE.seatButton.length > 1 ? SEAT_TEST_SCRIPT + '\n' : '')
    + (ga4 && /^G-[A-Z0-9]+$/.test(ga4) && siteUrl ? analyticsScript(ga4, siteUrl) + '\n' : '');
  return `<!DOCTYPE html>
<!-- Generated by tools/build.js. Edit site/js/content.js or posts/, then run build.command. -->
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}<base href="${base}">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
${indexable ? (siteUrl ? `<link rel="canonical" href="${esc(pageUrl)}">\n` : '') : '<meta name="robots" content="noindex">\n'}<meta name="theme-color" content="#111111">
<meta property="og:site_name" content="Fuyamo Travel">
<meta property="og:locale" content="en_ZA">
<meta property="og:type" content="${p.type || 'website'}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
${siteUrl && indexable ? `<meta property="og:url" content="${esc(pageUrl)}">\n` : ''}<meta property="og:image" content="${esc(shareUrl)}">
<meta property="og:image:width" content="${SHARE_SIZE[0]}">
<meta property="og:image:height" content="${SHARE_SIZE[1]}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="assets/brand/fuyamo-travel-icon-tile.svg" type="image/svg+xml">
<link rel="icon" href="assets/brand/fuyamo-travel-icon-tile-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="assets/brand/fuyamo-travel-icon-tile-256.png">
<link rel="preload" as="font" type="font/woff2" href="assets/fonts/outfit-latin.woff2" crossorigin>
<link rel="stylesheet" href="css/styles.css?v=${versions['css/styles.css']}">
${SCRIPTS.map((s) => `<script src="${s}?v=${versions[s]}" defer></script>`).join('\n')}
${siteUrl && indexable ? `<script type="application/ld+json">${structuredData(p, R, siteUrl)}</script>\n` : ''}</head>
<body data-page="${p.page}"${p.param ? ` data-param="${esc(p.param)}"` : ''} data-prerendered="true">
<a class="skip-link" href="${p.page === 'notfound' ? '' : p.path}#app">Skip to content</a>
<header class="nav${solidNav ? ' is-solid' : ''}" id="nav">${R.nav(p.page)}</header>
<main id="app">${R.page(p.page, p.param, today)}</main>
<footer class="site-footer" id="footer">${R.footer(today.getFullYear())}</footer>
<a class="fab" id="fab" href="${contact.href}" ${contact.attrs} aria-label="${contact.label}" aria-hidden="true" tabindex="-1">${contact.email ? MAIL_ICON : WHATSAPP_ICON}</a>
${R.callbackPanel()}
${R.birthdayPopup()}
</body>
</html>
`;
}

function run(argv) {
  const ROOT = argv[0];
  const SITE_DIR = ROOT + '/site';
  const notes = [];
  const today = new Date();

  // 1. Articles: posts/*.md → site/js/posts.js
  const photo = photoPublisher(ROOT, notes);
  const posts = readPosts(ROOT, photo, notes);
  write(SITE_DIR + '/js/posts.js', '/* Generated by tools/build.js from the Markdown files in posts/. Edit those, not this file. */\n'
    + 'window.FUYAMO_POSTS = ' + JSON.stringify(posts, null, 1) + ';\n');

  // 2. Trips, FAQs, reviews and photos: content/ → site/js/data.js (and the photos → site/assets/img/).
  const data = loadContent(ROOT, photo, notes);
  photo.cleanUp();
  write(SITE_DIR + '/js/data.js', '/* Generated by tools/build.js from content/ (edited in the admin). Don\'t edit this file. */\n'
    + 'window.FUYAMO_DATA = ' + JSON.stringify(data, null, 1) + ';\n');

  // 3. Load the same scripts the browser runs.
  const window = {};
  SCRIPTS.slice(0, -1).forEach((s) => eval(read(SITE_DIR + '/' + s)));
  const R = window.FUYAMO_RENDER, C = R.C;
  const siteUrl = C.SITE.url.replace(/\/+$/, '');

  // 4. Every page, its address and what to show in search results and link previews.
  const pages = Object.keys(C.PAGES).map((key) => {
    const p = C.PAGES[key];
    return {
      page: key, path: p.path, description: p.description, image: p.image, share: key,
      title: key === 'home' ? p.title : p.title + ' · Fuyamo Travel',
    };
  });
  R.TRIPS.forEach((t) => pages.push({
    page: 'trip', param: t.key, path: t.href, share: 'trip-' + t.key, image: t.hero,
    title: `${t.name}${t.edition ? ' ' + t.edition : ''} · ${t.dates[0].slice(-4)} group trip · Fuyamo Travel`,
    description: `${t.blurb} ${t.nights}, from ${t.price} per person.`,
  }));
  posts.forEach((p) => pages.push({
    page: 'post', param: p.slug, path: C.PATHS.post(p.slug), share: 'post-' + p.slug, type: 'article', lastmod: p.date,
    image: p.img, title: p.title + ' · Fuyamo Travel', description: p.intro,
  }));

  // Content hashes make browsers fetch fresh CSS/JS after a change, and keep their cache otherwise.
  const versions = {};
  ['css/styles.css'].concat(SCRIPTS).forEach((f) => { versions[f] = sh('md5 -q ' + q(SITE_DIR + '/' + f)).slice(0, 8); });

  let images = 0;
  pages.forEach((p) => {
    write(SITE_DIR + '/' + p.path + 'index.html', pageHtml(p, R, versions, siteUrl, today));
    if (coverImage(SITE_DIR + '/' + p.image, SITE_DIR + '/assets/share/' + p.share + '.jpg', SHARE_SIZE[0], SHARE_SIZE[1], 66)) images++;
  });
  write(SITE_DIR + '/404.html', pageHtml({
    page: 'notfound', path: '', share: 'home', title: 'Page not found · Fuyamo Travel', description: C.PAGES.home.description,
  }, R, versions, siteUrl, today));
  R.TRIPS.forEach((t) => {
    if (coverImage(SITE_DIR + '/' + t.hero, SITE_DIR + '/' + t.thumb, THUMB_SIZE, THUMB_SIZE, 72)) images++;
    if (!exists(SITE_DIR + '/' + t.pdf)) notes.push(`The "Trip details" button on ${t.fullName} has no PDF yet. Add it as site/${t.pdf}.`);
  });

  // 5. Search engines.
  write(SITE_DIR + '/robots.txt', 'User-agent: *\nAllow: /\nDisallow: /admin/\n' + (siteUrl ? `Sitemap: ${siteUrl}/sitemap.xml\n` : ''));
  const ga4 = C.SITE.analytics && C.SITE.analytics.ga4;
  if (ga4 && !/^G-[A-Z0-9]+$/.test(ga4)) notes.push(`analytics.ga4 in content.js should look like G-ABC123XYZ (it's "${ga4}"). Analytics is off until it's fixed.`);
  if (!ga4 && C.SITE.seatButton.length > 1) notes.push('The seat button test is running but analytics.ga4 in content.js is empty, so clicks aren\'t being counted yet.');
  if (siteUrl) {
    write(SITE_DIR + '/sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + pages.map((p) => `  <url><loc>${esc(siteUrl + '/' + p.path)}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}</url>\n`).join('') + '</urlset>\n');
  } else {
    notes.push('SITE.url is empty in content.js: link previews use relative image paths and no sitemap was made. Set it once the domain is live.');
  }

  // 6. Housekeeping: folders left by removed trips or posts, and photos that would slow the site down.
  const known = new Set(pages.map((p) => p.path));
  Object.keys(C.PAGES).filter((key) => !C.PAGES[key].plain).forEach((key) => {
    const name = C.headerName(key);
    if (!C.PHOTO.headers[name]) notes.push(`The ${key} page has no header photo. Choose one in the admin: Photos → Page headers.`);
  });
  ['trips', 'travel-talk'].forEach((folder) => {
    sh(`cd ${q(SITE_DIR + '/' + folder)} 2>/dev/null && ls -d */ 2>/dev/null; true`).split(/\r|\n/).filter(Boolean).forEach((sub) => {
      if (!known.has(folder + '/' + sub)) notes.push(`site/${folder}/${sub} is no longer in content.js or posts/. Delete that folder.`);
    });
  });
  sh(`cd ${q(SITE_DIR + '/' + C.PHOTOS)} && for f in *.webp *.jpg *.png; do [ -f "$f" ] && echo "$f $(stat -f%z "$f") $(sips -g pixelWidth "$f" | awk '/pixelWidth/ {print $2}')"; done; true`)
    .split(/\r|\n/).filter(Boolean).forEach((line) => {
      const [name, bytes, width] = line.split(' ');
      if (+width > PHOTO_LIMITS.width || +bytes > PHOTO_LIMITS.kb * 1024) {
        notes.push(`${name} is ${width}px wide and ${Math.round(bytes / 1024)} KB. Aim for at most ${PHOTO_LIMITS.width}px and ${PHOTO_LIMITS.kb} KB.`);
      }
    });

  return [`Built ${pages.length} pages (${posts.length} articles) and ${images} new image${images === 1 ? '' : 's'}.`]
    .concat(notes.map((n) => '• ' + n)).join('\n');
}
