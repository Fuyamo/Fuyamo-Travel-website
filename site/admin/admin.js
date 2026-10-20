/* Fuyamo admin (fuyamo.co.za/admin): edit trips, articles, photos, FAQs and reviews, and see how the site is doing.
   Everything is saved straight into the GitHub repository (content/, posts/, photos/). Each save is a commit, which
   GitHub turns into a new version of the site; the hosting picks it up within 5 minutes (README, "How publishing works").
   Signing in: the GitHub access token is kept in the repository encrypted with the team's code (admin/key.json), so
   people only ever type the code. Analytics come from Google Analytics, read with the viewer's own Google sign-in. */
(() => {
  'use strict';

  const REPO = 'Fuyamo/Fuyamo-Travel-website';
  const BRANCH = 'main';
  const API = 'https://api.github.com';
  const SITE = 'https://fuyamo.co.za';
  const KEY_PATH = 'admin/key.json';
  const SETTINGS_PATH = 'admin/settings.json';
  const TOKEN_KEY = 'fuyamo-admin-token';
  // ?mock on a local preview: no GitHub at all. Files come from /__repo/ and saves stay in memory (for testing).
  const MOCK = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('mock');
  const RAW = MOCK ? '/__repo/' : 'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const CATEGORIES = ['Destination guides', 'Booking tips', 'Packing', 'Visa & passports', 'Trip stories'];

  const S = {
    token: '', user: null,
    trips: null, photos: null, faqs: null, reviews: null, posts: null, settings: null, library: null,
    pending: new Map(), // photos chosen from the device but not saved yet: "/photos/…" → { base64, url }
    local: new Map(), // photos saved in this session, shown from the device copy: "/photos/…" → url
    build: null,
  };

  // ---------- Small helpers ----------

  const $ = (sel, root = document) => root.querySelector(sel);
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const h = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
  const each = (list, fn) => (list || []).map(fn).join('');
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const json = (o) => JSON.stringify(o, null, 2) + '\n';
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const niceDate = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return d ? d + ' ' + MONTHS[m - 1] + ' ' + y : ''; };
  function ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 90) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    if (s < 1.5 * 86400) return 'yesterday';
    if (s < 7 * 86400) return Math.round(s / 86400) + ' days ago';
    return niceDate(new Date(iso).toISOString());
  }
  const getPath = (o, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
  function setPath(o, path, value) {
    const keys = path.split('.'), last = keys.pop();
    keys.reduce((v, k) => v[k], o)[last] = value;
  }
  // "21–28 Mar 2027" → the start date (as the site reads it).
  function departureDate(label) {
    const m = String(label).match(/^(\d+).*\s([A-Z][a-z]{2})\s(\d{4})$/);
    return m ? new Date(+m[3], MONTHS.indexOf(m[2]), +m[1]) : null;
  }

  const ICONS = {
    overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    trips: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
    articles: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
    photos: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5.5-5.5L5 20"/>',
    faqs: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.3c-.7.3-1.1 1-1.1 1.7v.5M12 17h.01"/>',
    reviews: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
    analytics: '<path d="M4 20V11M10 20V4M16 20v-7M21 20H3"/>',
    settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M18 13l-6 6-6-6"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    file: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    enquiries: '<path d="M3 13l2.5-8h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
  };
  const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  const LOGO = '<span class="logo">fuyam<span class="logo__o"></span></span>';

  // ---------- Toasts and dialogs ----------

  function toast(message, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast--' + kind : '');
    el.setAttribute('role', 'status');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('is-out'), kind === 'error' ? 6000 : 3500);
    setTimeout(() => el.remove(), kind === 'error' ? 6600 : 4100);
  }

  // A dialog on top of the page; returns { el, close }.
  function dialog(html, { wide, onClose } = {}) {
    const back = document.createElement('div');
    back.className = 'dialog-back';
    back.innerHTML = `<div class="dialog${wide ? ' dialog--wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(back);
    document.body.classList.add('has-dialog');
    const close = (value) => {
      back.remove();
      if (!document.querySelector('.dialog-back')) document.body.classList.remove('has-dialog');
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
    const first = back.querySelector('input, textarea, button.btn-primary');
    if (first) setTimeout(() => first.focus(), 30);
    return { el: back.firstElementChild, close };
  }

  function confirmBox(title, text, { ok = 'OK', danger } = {}) {
    return new Promise((resolve) => {
      const d = dialog(`<h2 class="dialog__title">${h(title)}</h2><p class="dialog__text">${h(text)}</p>
        <div class="dialog__actions"><button class="btn" data-x="no">Cancel</button><button class="btn-primary${danger ? ' btn-danger' : ''}" data-x="yes">${h(ok)}</button></div>`,
      { onClose: (v) => resolve(v === true) });
      d.el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (b) d.close(b.dataset.x === 'yes');
      });
    });
  }

  function askText(title, label, value = '') {
    return new Promise((resolve) => {
      const d = dialog(`<h2 class="dialog__title">${h(title)}</h2>
        <label class="field"><span class="field__label">${h(label)}</span><input data-x="input" value="${h(value)}"></label>
        <div class="dialog__actions"><button class="btn" data-x="no">Cancel</button><button class="btn-primary" data-x="yes">OK</button></div>`,
      { onClose: (v) => resolve(v) });
      const input = d.el.querySelector('input');
      d.el.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-x]');
        if (b) d.close(b.dataset.x === 'yes' ? input.value.trim() : null);
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') d.close(input.value.trim()); });
    });
  }

  // ---------- GitHub ----------

  class GHError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

  async function gh(path, { method = 'GET', body, raw, auth = true } = {}) {
    if (MOCK) return mockGh(path, { method, body, raw });
    const headers = { Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (auth && S.token) headers.Authorization = 'Bearer ' + S.token;
    if (body) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    } catch (err) {
      throw new GHError(0, 'No connection. Check your internet and try again.');
    }
    if (!res.ok) {
      let message = res.statusText;
      try { message = (await res.json()).message || message; } catch (err) { /* not JSON */ }
      throw new GHError(res.status, message);
    }
    return raw ? res.text() : res.status === 204 ? null : res.json();
  }
  const readText = (path, opts) => gh(`/repos/${REPO}/contents/${encPath(path)}?ref=${BRANCH}`, Object.assign({ raw: true }, opts));
  const readJson = async (path, opts) => JSON.parse(await readText(path, opts));

  // One commit with any number of changes. files: [{ path, text } | { path, base64 } | { path, remove: true }].
  async function commit(files, message) {
    for (let attempt = 0; ; attempt++) {
      const head = (await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`)).object.sha;
      const base = await gh(`/repos/${REPO}/git/commits/${head}`);
      const tree = [];
      for (const f of files) {
        if (f.remove) tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
        else if (f.base64 != null) {
          const blob = await gh(`/repos/${REPO}/git/blobs`, { method: 'POST', body: { content: f.base64, encoding: 'base64' } });
          tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
        } else tree.push({ path: f.path, mode: '100644', type: 'blob', content: f.text });
      }
      const newTree = await gh(`/repos/${REPO}/git/trees`, { method: 'POST', body: { base_tree: base.tree.sha, tree } });
      const c = await gh(`/repos/${REPO}/git/commits`, { method: 'POST', body: { message, tree: newTree.sha, parents: [head] } });
      try {
        await gh(`/repos/${REPO}/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: { sha: c.sha } });
        return c.sha;
      } catch (err) {
        // Someone else saved at the same moment: build on top of their change and try again.
        if (attempt >= 2 || err.status !== 422) throw err;
      }
    }
  }

  // Saves, then shows the publish status and keeps the photos just uploaded on screen.
  async function save(files, message, button) {
    const label = button && button.textContent;
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    try {
      await commit(files, message);
      files.forEach((f) => {
        const key = '/' + f.path;
        if (S.pending.has(key)) {
          S.local.set(key, S.pending.get(key).url);
          S.pending.delete(key);
          if (S.library && !S.library.includes(key)) S.library.unshift(key);
        }
      });
      S.dirty = false;
      toast('Saved. It will be on the website in about 5–10 minutes.');
      S.build = { state: 'building' };
      renderStatus();
      setTimeout(refreshStatus, 8000);
      return true;
    } catch (err) {
      toast(err.status === 401 ? 'Your GitHub access has expired. Replace it in Settings.' : err.status === 403 ? CANT_SAVE : "Couldn't save: " + err.message, 'error');
      return false;
    } finally {
      if (button) { button.disabled = false; button.textContent = label; }
    }
  }

  // ---------- Test mode (?mock on a local preview) ----------

  const mock = { files: new Map(), tree: null, commits: [] };
  if (MOCK) window.fuyamoMock = mock; // so a test can see what would have been saved
  async function mockTree() {
    if (!mock.tree) mock.tree = await (await fetch('/__repo/__tree.json')).json();
    return mock.tree;
  }
  async function mockGh(path, { method, body }) {
    await new Promise((r) => setTimeout(r, 120));
    let m;
    if ((m = path.match(/\/contents\/(.+)\?ref=/))) {
      const p = decodeURIComponent(m[1]);
      const tree = await mockTree();
      if (mock.files.has(p)) {
        if (mock.files.get(p) == null) throw new GHError(404, 'Not Found');
        return mock.files.get(p);
      }
      const prefix = p + '/';
      if (tree.some((t) => t.startsWith(prefix)) || [...mock.files.keys()].some((k) => k.startsWith(prefix))) {
        const names = new Set(tree.concat([...mock.files.keys()].filter((k) => mock.files.get(k) != null))
          .filter((t) => t.startsWith(prefix) && !t.slice(prefix.length).includes('/')).map((t) => t.slice(prefix.length)));
        [...mock.files.entries()].forEach(([k, v]) => { if (v == null && k.startsWith(prefix)) names.delete(k.slice(prefix.length)); });
        return [...names].map((name) => ({ name, path: prefix + name, type: 'file' }));
      }
      const res = await fetch('/__repo/' + encPath(p), { cache: 'no-store' });
      if (!res.ok) throw new GHError(404, 'Not Found');
      return res.text();
    }
    if (path.includes('/git/trees/')) return { tree: (await mockTree()).map((p) => ({ path: p, type: 'blob' })) };
    if (path.includes('/git/ref/heads/')) return { object: { sha: 'mock' } };
    if (/\/git\/commits\/mock$/.test(path)) return { tree: { sha: 'mocktree' } };
    if (path.endsWith('/git/blobs')) return { sha: 'blob' };
    if (path.endsWith('/git/trees') && method === 'POST') {
      body.tree.forEach((f) => mock.files.set(f.path, f.sha === null ? null : f.content != null ? f.content : '(photo)'));
      return { sha: 'tree' };
    }
    if (path.endsWith('/git/commits') && method === 'POST') {
      mock.commits.unshift({ commit: { message: body.message, author: { date: new Date().toISOString(), name: 'You' } } });
      return { sha: 'c' + Date.now() };
    }
    if (path.includes('/git/refs/heads/')) return {};
    if (path.includes('/commits?')) return mock.commits.concat([{ commit: { message: 'Fuyamo Travel website with admin', author: { date: '2026-10-19T13:22:00Z', name: 'Fuyamo Travel' } } }]);
    if (path.includes('/actions/runs')) return { workflow_runs: [] };
    if (path === '/user') return { login: 'fuyamo', name: 'Orinea' };
    if (/^\/repos\/[^/]+\/[^/]+$/.test(path)) return { permissions: { push: true } };
    throw new GHError(404, 'Not in test mode: ' + path);
  }

  // ---------- Sign-in code (the GitHub token, encrypted with the code) ----------

  const te = new TextEncoder(), td = new TextDecoder();
  const toB64 = (bytes) => { let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function codeKey(code, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', te.encode(code.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function lockToken(token, code) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iterations = 600000;
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await codeKey(code, salt, iterations), te.encode(token));
    return { v: 1, iterations, salt: toB64(salt), iv: toB64(iv), data: toB64(new Uint8Array(data)) };
  }
  async function unlockToken(box, code) {
    const key = await codeKey(code, fromB64(box.salt), box.iterations);
    return td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.data)));
  }
  const codeProblem = (code) => (code.length < 10 ? 'Make the code at least 10 characters. Three or four random words work well.' : '');

  const CANT_SAVE = 'This token can’t save to the website yet. Either the Fuyamo organisation still has to approve it '
    + '(on GitHub: Fuyamo → Settings → Personal access tokens → Pending requests → Approve), or it’s missing '
    + '“Contents: Read and write” on Fuyamo-Travel-website.';

  // Checks a GitHub token works. With canSave, also proves it may save to the repository by storing a tiny unused
  // file object (invisible, never part of the site). Returns the account, or throws with a readable reason.
  async function checkToken(token, canSave) {
    S.token = token;
    try {
      const repo = await gh(`/repos/${REPO}`);
      if (!repo.permissions || !repo.permissions.push) throw new GHError(403, CANT_SAVE);
      if (canSave && !MOCK) await gh(`/repos/${REPO}/git/blobs`, { method: 'POST', body: { content: 'fuyamo-admin check', encoding: 'utf-8' } });
      return await gh('/user').catch(() => ({ login: 'fuyamo' }));
    } catch (err) {
      S.token = '';
      if (err.status === 401) throw new GHError(401, 'GitHub didn’t accept this token. It may be mistyped or expired.');
      if (err.status === 404) throw new GHError(404, 'This token can’t see Fuyamo-Travel-website. Check its owner is Fuyamo and the repository is selected.');
      if (err.status === 403) throw new GHError(403, CANT_SAVE);
      throw err;
    }
  }

  function remember(token, keep) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
      if (keep) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
    } catch (err) { /* private browsing: stay signed in for this tab only */ }
  }
  const kept = () => { try { return !!localStorage.getItem(TOKEN_KEY); } catch (err) { return false; } };
  function forget() {
    try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch (err) { /* nothing stored */ }
  }

  // ---------- Content ----------

  async function loadTrips() {
    const files = (await gh(`/repos/${REPO}/contents/content/trips?ref=${BRANCH}`)).filter((f) => f.name.endsWith('.json'));
    const trips = await Promise.all(files.map(async (f) => Object.assign({ key: f.name.replace(/\.json$/, '') }, await readJson(f.path), { _file: f.path })));
    return trips.sort((a, b) => (a.order || 99) - (b.order || 99) || a.name.localeCompare(b.name));
  }

  // The details block at the top of an article (the same rules as the site's build).
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
        if (/^".*"$/.test(value)) { try { value = JSON.parse(value); } catch (err) { value = value.slice(1, -1); } } else if (/^'.*'$/.test(value)) value = value.slice(1, -1).replace(/''/g, "'");
      }
      meta[m[1].toLowerCase()] = value;
    }
    return meta;
  }
  function parsePost(slug, text) {
    const m = text.replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    const meta = m ? frontMatter(m[1]) : {};
    return { slug, title: meta.title || slug, category: meta.category || CATEGORIES[0], date: String(meta.date || today()).slice(0, 10), image: meta.image || '', intro: meta.intro || '', body: (m ? m[2] : text).trim() };
  }
  const q = (s) => JSON.stringify(String(s || ''));
  const postText = (p) => `---\ntitle: ${q(p.title)}\ncategory: ${q(p.category)}\ndate: ${p.date}\nimage: ${q(p.image)}\nintro: ${q(p.intro)}\n---\n\n${p.body.trim()}\n`;

  async function loadPosts() {
    const files = (await gh(`/repos/${REPO}/contents/posts?ref=${BRANCH}`)).filter((f) => /^[^_.].*\.md$/.test(f.name));
    const posts = await Promise.all(files.map(async (f) => parsePost(f.name.replace(/\.md$/, ''), await readText(f.path))));
    return posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  async function loadLibrary() {
    const tree = (await gh(`/repos/${REPO}/git/trees/${BRANCH}?recursive=1`)).tree;
    S.paths = new Set(tree.filter((t) => t.type === 'blob').map((t) => t.path)); // every file, e.g. to see which trips have a PDF
    const photos = tree.filter((t) => t.type === 'blob' && /^photos\/.+\.(jpe?g|png|webp|heic|heif)$/i.test(t.path)).map((t) => '/' + t.path);
    // Newest uploads first, then everything else by folder.
    return photos.sort((a, b) => (b.startsWith('/photos/uploads/') - a.startsWith('/photos/uploads/')) || (a.startsWith('/photos/uploads/') ? b.localeCompare(a) : a.localeCompare(b, undefined, { numeric: true })));
  }

  const LOADERS = {
    trips: loadTrips,
    posts: loadPosts,
    photos: () => readJson('content/photos.json'),
    faqs: async () => (await readJson('content/faqs.json')).faqs,
    reviews: () => readJson('content/reviews.json'),
    settings: () => readJson(SETTINGS_PATH).catch((err) => { if (err.status === 404) return {}; throw err; }),
    library: loadLibrary,
  };
  async function ensure(...names) {
    await Promise.all(names.map(async (n) => { if (S[n] == null) S[n] = await LOADERS[n](); }));
  }

  // Where to show a photo from: the device copy just chosen, the repository, or (older articles) the live site.
  function photoUrl(src) {
    if (!src) return '';
    if (S.pending.has(src)) return S.pending.get(src).url;
    if (S.local.has(src)) return S.local.get(src);
    if (/^\/?photos\//.test(src)) return RAW + encPath(src.replace(/^\//, ''));
    if (/^(https?:|data:|blob:)/.test(src)) return src;
    return SITE + '/assets/photos/' + encodeURIComponent(src);
  }
  const photoName = (src) => decodeURIComponent(String(src).split('/').pop()).replace(/\.[a-z]+$/i, '');

  // Photos chosen from the device are sent with the save that uses them.
  function pendingFiles(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return [...S.pending.keys()].filter((p) => text.includes(p)).map((p) => ({ path: p.slice(1), base64: S.pending.get(p).base64 }));
  }

  // Shrinks a photo on the device before sending it (most phone photos are 3–6 MB). iPhone HEIC photos that this
  // browser can't open are sent as they are; the website build converts them.
  async function preparePhoto(file) {
    let blob = file, ext = (file.name.match(/\.([a-z0-9]+)$/i) || [, 'jpg'])[1].toLowerCase();
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
      ext = 'jpg';
    } catch (err) {
      if (!/^(jpe?g|png|webp|heic|heif)$/.test(ext)) throw new Error('That file isn’t a photo this site can use.');
      if (file.size > 25e6) throw new Error('That photo is too big (over 25 MB).');
    }
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const d = new Date();
    const name = slugify(file.name.replace(/\.[^.]+$/, '')).slice(0, 40) || 'photo';
    const path = `/photos/uploads/${d.getFullYear()}-${pad(d.getMonth() + 1)}/${name}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
    S.pending.set(path, { base64, url: URL.createObjectURL(blob) });
    return path;
  }

  // ---------- Photo picker ----------

  function pickPhoto(title = 'Choose a photo') {
    return new Promise((resolve) => {
      const d = dialog(`
        <div class="picker__head"><h2 class="dialog__title">${h(title)}</h2><button class="icon-btn" data-x="close" aria-label="Close">${icon('close')}</button></div>
        <label class="picker__upload">${icon('upload')}<span><strong>Upload from this device</strong><small>Any size. Phone photos are fine.</small></span><input type="file" accept="image/*,.heic,.heif" hidden></label>
        <input class="picker__search" type="search" placeholder="Search photos">
        <div class="picker__grid"><p class="muted">Loading photos…</p></div>`, { wide: true, onClose: (v) => resolve(v || null) });
      const grid = d.el.querySelector('.picker__grid'), search = d.el.querySelector('.picker__search');
      const draw = () => {
        const term = search.value.trim().toLowerCase();
        const list = [...S.pending.keys()].concat(S.library || []).filter((p) => !term || p.toLowerCase().includes(term));
        grid.innerHTML = list.length ? each(list, (p) => `<button class="picker__item" data-src="${h(p)}" title="${h(photoName(p))}"><img src="${h(photoUrl(p))}" alt="" loading="lazy"></button>`) : '<p class="muted">No photos found.</p>';
      };
      ensure('library').then(draw).catch((err) => { grid.innerHTML = `<p class="muted">Couldn’t load the photos: ${h(err.message)}</p>`; });
      search.addEventListener('input', draw);
      d.el.addEventListener('click', (e) => {
        if (e.target.closest('[data-x="close"]')) d.close(null);
        const item = e.target.closest('[data-src]');
        if (item) d.close(item.dataset.src);
      });
      d.el.querySelector('input[type=file]').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        grid.innerHTML = '<p class="muted">Preparing the photo…</p>';
        try { d.close(await preparePhoto(file)); } catch (err) { toast(err.message, 'error'); draw(); }
      });
    });
  }

  // ---------- Layout, navigation and publish status ----------

  const NAV = [
    ['', 'Overview', 'overview'], ['enquiries', 'Enquiries', 'enquiries'], ['trips', 'Trips', 'trips'], ['articles', 'Articles', 'articles'], ['photos', 'Photos', 'photos'],
    ['faqs', 'FAQs', 'faqs'], ['reviews', 'Reviews', 'reviews'], ['analytics', 'Analytics', 'analytics'], ['settings', 'Settings', 'settings'],
  ];
  const MOBILE_TABS = ['', 'enquiries', 'trips', 'articles'];

  function shell() {
    document.body.className = 'is-app';
    $('#app').innerHTML = `
      <aside class="side">
        <a class="side__brand" href="#/">${LOGO}<span>Admin</span></a>
        <nav class="side__nav">${each(NAV, ([path, label, ic]) => `<a href="#/${path}" data-nav="${path}">${icon(ic)}<span>${label}</span></a>`)}</nav>
        <div class="side__foot">
          <a href="${SITE}/" target="_blank" rel="noopener">${icon('external', 18)}<span>View website</span></a>
          <button data-act="signout">${icon('out', 18)}<span>Sign out</span></button>
        </div>
      </aside>
      <div class="main">
        <header class="top">
          <div class="top__brand">${LOGO}</div>
          <div class="top__title"><a class="top__back" id="back" hidden>${icon('back')}</a><h1 id="title"></h1></div>
          <button class="status" id="status" data-act="status" hidden></button>
          <div class="top__actions" id="actions"></div>
        </header>
        <main class="view" id="view"></main>
      </div>
      <nav class="tabs">${each(NAV.filter(([p]) => MOBILE_TABS.includes(p)), ([path, label, ic]) => `<a href="#/${path}" data-nav="${path}">${icon(ic)}<span>${label}</span></a>`)}
        <button data-act="more" data-nav="more">${icon('more')}<span>More</span></button></nav>`;
  }

  function setNav(path) {
    const section = path.split('/')[0];
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('is-on', a.dataset.nav === section || (a.dataset.nav === 'more' && !MOBILE_TABS.includes(section))));
  }

  // title, the HTML of the page, and optionally header buttons and a back link.
  function page(title, html, { actions = '', back } = {}) {
    $('#title').textContent = title;
    $('#actions').innerHTML = actions;
    const b = $('#back');
    b.hidden = !back;
    if (back) b.href = back;
    $('#view').innerHTML = html;
    document.title = title + ' · Fuyamo admin';
  }
  const loading = () => '<div class="loading"><span class="spinner"></span>Loading…</div>';
  const problem = (err) => `<div class="card card--error"><strong>Something went wrong.</strong><p>${h(err.message || err)}</p><button class="btn" data-act="retry">Try again</button></div>`;

  function renderStatus() {
    const el = $('#status');
    if (!el || !S.build) return;
    const labels = { live: 'Live', building: 'Saving to the site…', publishing: 'Going live…', failed: 'Didn’t publish' };
    el.hidden = false;
    el.className = 'status status--' + S.build.state;
    el.innerHTML = `<span class="status__dot"></span>${labels[S.build.state] || 'Live'}`;
  }

  // Building on GitHub → copied to the hosting (within 5 minutes) → live. build.json on the site says which version is live.
  let statusTimer = 0;
  async function refreshStatus() {
    clearTimeout(statusTimer);
    if (MOCK) { S.build = { state: 'live' }; renderStatus(); return; }
    try {
      const runs = await gh(`/repos/${REPO}/actions/runs?branch=${BRANCH}&per_page=1`).catch(() => gh(`/repos/${REPO}/actions/runs?branch=${BRANCH}&per_page=1`, { auth: false }));
      const run = runs.workflow_runs[0];
      const live = await fetch('/build.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!run) S.build = { state: 'live' };
      else if (run.status !== 'completed') S.build = { state: 'building', run };
      else if (run.conclusion !== 'success') S.build = { state: 'failed', run };
      else if (live && live.commit !== run.head_sha) S.build = { state: 'publishing', run, live };
      else S.build = { state: 'live', run, live };
    } catch (err) {
      return; // the status is a nice-to-have; try again on the next save
    }
    renderStatus();
    if (S.build.state === 'building' || S.build.state === 'publishing') statusTimer = setTimeout(refreshStatus, 20000);
  }

  function statusDetails() {
    const b = S.build || {};
    const text = {
      live: 'Everything you’ve saved is on the website.',
      building: 'GitHub is building the new version of the site. This takes about 2 minutes.',
      publishing: 'The new version is built. Your hosting picks it up within 5 minutes.',
      failed: 'The last save couldn’t be built, so the website still shows the version before it. Open the details to see why, or ask your developer.',
    }[b.state] || '';
    const d = dialog(`<h2 class="dialog__title">Publishing</h2><p class="dialog__text">${h(text)}</p>
      ${b.run ? `<p class="dialog__text muted">Last change: “${h(b.run.display_title)}”, ${h(ago(b.run.created_at))}.</p>` : ''}
      <div class="dialog__actions">${b.run ? `<a class="btn" href="${h(b.run.html_url)}" target="_blank" rel="noopener">Details on GitHub</a>` : ''}<button class="btn-primary" data-x="ok">OK</button></div>`);
    d.el.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) d.close(); });
  }

  function moreMenu() {
    const d = dialog(`<div class="menu">${each(NAV.filter(([p]) => !MOBILE_TABS.includes(p)), ([path, label, ic]) => `<a href="#/${path}">${icon(ic)}<span>${label}</span></a>`)}
      <a href="${SITE}/" target="_blank" rel="noopener">${icon('external')}<span>View website</span></a>
      <button data-x="signout">${icon('out')}<span>Sign out</span></button></div>`);
    d.el.addEventListener('click', (e) => {
      if (e.target.closest('a')) d.close();
      if (e.target.closest('[data-x="signout"]')) { d.close(); signOut(); }
    });
  }

  // ---------- Views ----------

  // V: the open page. V.draft is the copy being edited, V.act its buttons (data-act), V.redraw re-renders it.
  let V = {};
  S.dirty = false;
  const markDirty = () => { S.dirty = true; const n = $('#unsaved'); if (n) n.hidden = false; };

  function redraw() {
    const y = window.scrollY;
    V.redraw();
    window.scrollTo(0, y);
  }

  // Add, remove and reorder items in a list inside V.draft (data-list="departures", data-i="2").
  const LIST_ACTS = {
    add(el) {
      const list = getPath(V.draft, el.dataset.list);
      list.push(JSON.parse(el.dataset.item || '""'));
      markDirty(); redraw();
      const inputs = document.querySelectorAll(`[data-bind^="${el.dataset.list}.${list.length - 1}"]`);
      if (inputs[0]) inputs[0].focus();
    },
    remove(el) { getPath(V.draft, el.dataset.list).splice(+el.dataset.i, 1); markDirty(); redraw(); },
    up(el) { move(el, -1); },
    down(el) { move(el, 1); },
    async pick(el) {
      const src = await pickPhoto(el.dataset.title);
      if (src) { setPath(V.draft, el.dataset.path, src); markDirty(); redraw(); }
    },
  };
  function move(el, dir) {
    const list = getPath(V.draft, el.dataset.list), i = +el.dataset.i, j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    markDirty(); redraw();
  }

  // ----- Form pieces -----
  const field = (label, input, hint) => `<label class="field"><span class="field__label">${label}</span>${input}${hint ? `<small class="field__hint">${hint}</small>` : ''}</label>`;
  const text = (path, value, attrs = '') => `<input data-bind="${path}" value="${h(value)}" ${attrs}>`;
  const area = (path, value, rows = 3, attrs = '') => `<textarea data-bind="${path}" rows="${rows}" ${attrs}>${h(value)}</textarea>`;
  const rowTools = (list, i, n) => `<div class="row-tools">
      <button class="icon-btn" data-act="up" data-list="${list}" data-i="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon('up', 16)}</button>
      <button class="icon-btn" data-act="down" data-list="${list}" data-i="${i}" aria-label="Move down" ${i === n - 1 ? 'disabled' : ''}>${icon('down', 16)}</button>
      <button class="icon-btn icon-btn--danger" data-act="remove" data-list="${list}" data-i="${i}" aria-label="Remove">${icon('trash', 16)}</button></div>`;
  const slot = (path, src, label, title) => `<button class="slot${src ? '' : ' slot--empty'}" data-act="pick" data-path="${path}" data-title="${h(title || label || 'Choose a photo')}">
      ${src ? `<img src="${h(photoUrl(src))}" alt="" loading="lazy">` : icon('plus', 22)}${label ? `<span class="slot__label">${h(label)}</span>` : ''}</button>`;
  const savebar = (extra = '') => `<div class="savebar">${extra}<span class="savebar__note" id="unsaved" ${S.dirty ? '' : 'hidden'}>Unsaved changes</span><button class="btn-primary" data-act="save">Save</button></div>`;

  // ----- Overview -----

  async function overview() {
    page('Overview', loading());
    await ensure('trips', 'settings');
    const commits = await gh(`/repos/${REPO}/commits?sha=${BRANCH}&per_page=6`).catch(() => []);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const next = S.trips.filter((t) => !t.hidden).flatMap((t) => (t.departures || []).map((d) => ({ t, d, start: departureDate(d.dates) })))
      .filter((x) => x.start && x.start >= now).sort((a, b) => a.start - b.start).slice(0, 5);
    const name = S.user && (S.user.name || S.user.login) ? ', ' + String(S.user.name || S.user.login).split(' ')[0] : '';
    page('Overview', `
      <p class="hello">Welcome back${h(name)}.</p>
      <div class="quick">
        <a class="quick__item" href="#/articles/new">${icon('articles')}<span>Write an article</span></a>
        <a class="quick__item" href="#/trips">${icon('trips')}<span>Edit trips &amp; prices</span></a>
        <a class="quick__item" href="#/photos">${icon('photos')}<span>Change photos</span></a>
        <a class="quick__item" href="${SITE}/" target="_blank" rel="noopener">${icon('external')}<span>View website</span></a>
      </div>
      <section class="card" id="enq-summary" hidden></section>
      <section class="card" id="ga-summary"></section>
      <div class="grid-2">
        <section class="card">
          <h2 class="card__title">Next departures</h2>
          ${next.length ? `<ul class="rows">${each(next, ({ t, d, start }) => `<li><a href="#/trips/${h(t.key)}" class="row">
            <span class="row__date"><strong>${start.getDate()}</strong>${MONTHS[start.getMonth()]}</span>
            <span class="row__text"><strong>${h(t.name)}${t.edition ? ' · ' + h(t.edition) : ''}</strong><small>${h(d.dates)} · ${h(t.price)}</small></span>${icon('chevron', 18)}</a></li>`)}</ul>`
    : '<p class="muted">No upcoming departures. Add dates under Trips.</p>'}
        </section>
        <section class="card">
          <h2 class="card__title">Recent changes</h2>
          ${commits.length ? `<ul class="rows rows--plain">${each(commits.slice(0, 6), (c) => `<li class="row row--static"><span class="row__text"><strong>${h(c.commit.message.split('\n')[0])}</strong><small>${h(ago(c.commit.author.date))}</small></span></li>`)}</ul>` : '<p class="muted">No changes yet.</p>'}
        </section>
      </div>`);
    enqSummary();
    gaSummary();
  }

  // ----- Trips -----

  async function tripsList() {
    page('Trips', loading(), { actions: `<a class="btn-primary" href="#/trips/new">${icon('plus', 18)}<span>Add trip</span></a>` });
    await ensure('trips');
    page('Trips', `<ul class="list">${each(S.trips, (t) => {
      const next = (t.departures || []).map((d) => d.dates);
      return `<li><a class="list__item" href="#/trips/${h(t.key)}">
        <span class="thumb">${t.cover ? `<img src="${h(photoUrl(t.cover))}" alt="" loading="lazy">` : ''}</span>
        <span class="list__text"><strong>${h(t.name)}${t.edition ? ` <em class="tag">${h(t.edition)}</em>` : ''}${t.hidden ? ' <em class="tag tag--muted">Hidden</em>' : ''}</strong>
        <small>${h(t.price)} · ${h(next.join(', ') || 'No dates')}</small></span>${icon('chevron', 18)}</a></li>`;
    })}</ul>`, { actions: `<a class="btn-primary" href="#/trips/new">${icon('plus', 18)}<span>Add trip</span></a>` });
  }

  const BLANK_TRIP = {
    key: '', order: 10, name: '', edition: '', menu_label: '', place: '', subtitle: '', type: 'fly', family: false, nights: '', price: '',
    prices: [], deposit: '', reference: '', blurb: '', departures: [{ dates: '', yamo: '' }], included: [''], optional: [], cover: '', gallery: ['', '', ''], hidden: false,
  };
  const pdfPath = (t) => `site/assets/trips/fuyamo-${String((t.departures[0] || {}).dates || '').slice(-4)}-${t.key}.pdf`;

  async function tripEdit(key) {
    page('Trip', loading(), { back: '#/trips' });
    await ensure('trips', 'library');
    const original = key ? S.trips.find((t) => t.key === key) : null;
    if (key && !original) { page('Trip not found', '<p class="muted">This trip doesn’t exist any more.</p>', { back: '#/trips' }); return; }
    const draft = clone(original || Object.assign(clone(BLANK_TRIP), { order: S.trips.length + 1 }));
    ['prices', 'departures', 'included', 'optional', 'gallery'].forEach((k) => { draft[k] = draft[k] || []; });
    while (draft.gallery.length < 3) draft.gallery.push('');
    delete draft._file;
    let pdf = null; // a new trip details PDF chosen on this device: { name, base64 }

    V = {
      draft,
      redraw() {
        const d = V.draft;
        page(original ? d.name || 'Trip' : 'New trip', `
          <section class="card">
            <h2 class="card__title">Basics</h2>
            <div class="grid-2">
              ${field('Name', text('name', d.name, 'required placeholder="e.g. Bali"'))}
              ${field('Edition tag', text('edition', d.edition, 'placeholder="Optional, e.g. Family Edition"'))}
              ${field('Countries', text('place', d.place, 'placeholder="e.g. ZIMBABWE · ZAMBIA · BOTSWANA"'), 'In capitals.')}
              ${field('Stops', text('subtitle', d.subtitle, 'placeholder="e.g. UBUD · CANGGU · ULUWATU"'), 'In capitals.')}
              ${field('Travel by', `<select data-bind="type"><option value="fly"${d.type === 'fly' ? ' selected' : ''}>Fly</option><option value="road"${d.type === 'road' ? ' selected' : ''}>Road trip</option></select>`)}
              ${field('Length', text('nights', d.nights, 'placeholder="e.g. 5 nights · 7 days"'))}
            </div>
            ${field('Short description', area('blurb', d.blurb, 3), 'Two sentences under the photos on the trip page.')}
            <div class="checks">
              <label class="check"><input type="checkbox" data-bind="family"${d.family ? ' checked' : ''}><span>Family trip <small>Shows under the Family filter</small></span></label>
              <label class="check"><input type="checkbox" data-bind="hidden"${d.hidden ? ' checked' : ''}><span>Hide from the website <small>Keeps the trip here without showing it</small></span></label>
            </div>
          </section>

          <section class="card">
            <h2 class="card__title">Price</h2>
            <div class="grid-3">
              ${field('Price per person sharing', text('price', d.price, 'placeholder="e.g. R29,500"'))}
              ${field('Deposit', text('deposit', d.deposit, 'placeholder="e.g. R3,500"'))}
              ${field('EFT reference', text('reference', d.reference, 'placeholder="e.g. Bali"'), 'Added after the payer’s name.')}
            </div>
            <div class="sub">
              <span class="sub__title">Separate prices <small>Only when prices differ, e.g. parents and children</small></span>
              ${each(d.prices, (p, i) => `<div class="item item--row">${field('Amount', text(`prices.${i}.amount`, p.amount, 'placeholder="R7,000"'))}${field('Label', text(`prices.${i}.label`, p.label, 'placeholder="pp parents"'))}${rowTools('prices', i, d.prices.length)}</div>`)}
              <button class="btn-add" data-act="add" data-list="prices" data-item='{"amount":"","label":""}'>${icon('plus', 16)} Add a price</button>
            </div>
          </section>

          <section class="card">
            <h2 class="card__title">Dates &amp; booking</h2>
            <p class="card__hint">Each departure has its own Yamo link. “Reserve seat” opens it.</p>
            ${each(d.departures, (x, i) => `<div class="item item--row">
              ${field('Dates', text(`departures.${i}.dates`, x.dates, 'placeholder="21–28 Mar 2027"'))}
              ${field('Yamo booking link', text(`departures.${i}.yamo`, x.yamo, 'placeholder="https://app.yamo.travel/t/…"'))}
              ${rowTools('departures', i, d.departures.length)}</div>`)}
            <button class="btn-add" data-act="add" data-list="departures" data-item='{"dates":"","yamo":""}'>${icon('plus', 16)} Add a departure</button>
          </section>

          <div class="grid-2">
            <section class="card">
              <h2 class="card__title">What’s included</h2>
              ${each(d.included, (x, i) => `<div class="item item--line">${text(`included.${i}`, x, 'placeholder="e.g. Return flights"')}${rowTools('included', i, d.included.length)}</div>`)}
              <button class="btn-add" data-act="add" data-list="included">${icon('plus', 16)} Add an item</button>
            </section>
            <section class="card">
              <h2 class="card__title">Optional extras</h2>
              <p class="card__hint">Activities people can add at their own cost.</p>
              ${each(d.optional, (x, i) => `<div class="item item--line">${text(`optional.${i}`, x, 'placeholder="e.g. Jet ski"')}${rowTools('optional', i, d.optional.length)}</div>`)}
              <button class="btn-add" data-act="add" data-list="optional">${icon('plus', 16)} Add an extra</button>
            </section>
          </div>

          <section class="card">
            <h2 class="card__title">Photos</h2>
            <p class="card__hint">The cover shows on trip cards, at the top of the trip page and in link previews. The other three fill the gallery.</p>
            <div class="slots">${slot('cover', d.cover, 'Cover', 'Cover photo')}${each([0, 1, 2], (i) => slot('gallery.' + i, d.gallery[i], 'Gallery ' + (i + 1)))}</div>
          </section>

          <section class="card">
            <h2 class="card__title">Trip details PDF</h2>
            <p class="card__hint">The “Trip details” download on the trip page. Without a PDF, the button is hidden.</p>
            <div class="pdf">${icon('file')}<span>${pdf ? h(pdf.name) + ' <small>(saved with the trip)</small>'
    : S.paths && S.paths.has(pdfPath(d)) ? `<a href="${SITE}/${h(pdfPath(d).replace(/^site\//, ''))}" target="_blank" rel="noopener">Current PDF</a>` : '<span class="muted">No PDF yet</span>'}</span>
              <label class="btn">${icon('upload', 16)} Upload a new PDF<input type="file" accept="application/pdf" data-act-file="pdf" hidden></label></div>
          </section>

          <section class="card">
            <h2 class="card__title">Web address &amp; order</h2>
            <div class="grid-2">
              ${field('Web address', text('key', d.key, 'placeholder="e.g. bali" pattern="[a-z0-9-]+"'), `fuyamo.co.za/trips/<strong>${h(d.key || '…')}</strong>/ ${original ? '· Changing it breaks links people already shared.' : ''}`)}
              ${field('Order', `<input type="number" data-bind="order" value="${h(d.order)}" min="1">`, 'Position in trip lists (1 shows first).')}
            </div>
            ${field('Menu label', text('menu_label', d.menu_label, 'placeholder="Optional shorter name for menus"'))}
          </section>
          ${savebar(original ? `<button class="btn btn-danger-text" data-act="delete">${icon('trash', 16)} Delete trip</button>` : '')}`, { back: '#/trips' });
      },
      act: Object.assign({}, LIST_ACTS, {
        async save(btn) {
          const d = V.draft;
          if (!original && !d.key) d.key = slugify(d.name);
          const errors = [];
          if (!d.name.trim()) errors.push('Add the trip’s name.');
          if (!/^[a-z0-9-]+$/.test(d.key)) errors.push('The web address can only use lowercase letters, numbers and dashes.');
          if (S.trips.some((t) => t.key === d.key && t !== original)) errors.push('Another trip already uses that web address.');
          if (!d.price.trim()) errors.push('Add the price.');
          d.departures = d.departures.filter((x) => x.dates.trim() || x.yamo.trim());
          if (!d.departures.length) errors.push('Add at least one departure.');
          d.departures.forEach((x) => { if (!departureDate(x.dates.trim())) errors.push(`Write the dates like “21–28 Mar 2027” (not “${x.dates}”).`); });
          if (!d.cover) errors.push('Choose a cover photo.');
          if (d.gallery.filter(Boolean).length < 3) errors.push('Choose three gallery photos.');
          if (errors.length) { redraw(); toast(errors[0], 'error'); return; }
          d.included = d.included.map((x) => x.trim()).filter(Boolean);
          d.optional = d.optional.map((x) => x.trim()).filter(Boolean);
          d.departures = d.departures.map((x) => ({ dates: x.dates.trim(), yamo: x.yamo.trim() }));
          const files = [{ path: `content/trips/${d.key}.json`, text: json(d) }].concat(pendingFiles(d));
          if (original && original.key !== d.key) files.push({ path: `content/trips/${original.key}.json`, remove: true });
          if (pdf) { files.push({ path: pdfPath(d), base64: pdf.base64 }); if (S.paths) S.paths.add(pdfPath(d)); }
          if (await save(files, `Trips: ${original ? 'update' : 'add'} ${d.name}${d.edition ? ' ' + d.edition : ''}`, btn)) {
            const saved = Object.assign(clone(d), { _file: `content/trips/${d.key}.json` });
            S.trips = S.trips.filter((t) => t !== original).concat(saved).sort((a, b) => (a.order || 99) - (b.order || 99));
            location.hash = '#/trips';
          }
        },
        async delete() {
          if (!(await confirmBox(`Delete ${original.name}?`, 'It disappears from the website. Earlier versions stay on GitHub if you need it back. To keep it without showing it, use “Hide from the website” instead.', { ok: 'Delete', danger: true }))) return;
          if (await save([{ path: `content/trips/${original.key}.json`, remove: true }], `Trips: remove ${original.name}`)) {
            S.trips = S.trips.filter((t) => t !== original);
            location.hash = '#/trips';
          }
        },
      }),
      file: {
        async pdf(input) {
          const f = input.files[0];
          if (!f) return;
          if (f.size > 15e6) { toast('That PDF is too big (over 15 MB).', 'error'); return; }
          const base64 = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.readAsDataURL(f); });
          pdf = { name: f.name, base64 };
          markDirty(); redraw();
        },
      },
    };
    V.redraw();
  }

  // ----- Articles -----

  async function postsList() {
    const actions = `<a class="btn-primary" href="#/articles/new">${icon('plus', 18)}<span>New article</span></a>`;
    page('Articles', loading(), { actions });
    await ensure('posts');
    page('Articles', S.posts.length ? `<ul class="list">${each(S.posts, (p) => `<li><a class="list__item" href="#/articles/${h(p.slug)}">
        <span class="thumb">${p.image ? `<img src="${h(photoUrl(p.image))}" alt="" loading="lazy">` : ''}</span>
        <span class="list__text"><strong>${h(p.title)}</strong><small>${h(p.category)} · ${h(niceDate(p.date))}</small></span>${icon('chevron', 18)}</a></li>`)}</ul>`
      : '<div class="card"><p class="muted">No articles yet.</p></div>', { actions });
  }

  // Markdown, the same way the site turns articles into pages (for the preview).
  function inlineMd(s) {
    return h(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/(^|[\s(])_(\S(?:.*?\S)?)_(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  }
  function markdown(src) {
    return src.trim().split(/\n\s*\n/).map((block) => {
      const lines = block.split('\n').map((l) => l.trim());
      let m;
      if (lines.length === 1 && (m = lines[0].match(/^(#{1,4})\s+(.+)$/))) { const n = Math.max(2, m[1].length); return `<h${n}>${inlineMd(m[2])}</h${n}>`; }
      if (lines.every((l) => /^[-*]\s+/.test(l))) return '<ul>' + each(lines, (l) => '<li>' + inlineMd(l.replace(/^[-*]\s+/, '')) + '</li>') + '</ul>';
      if (lines.every((l) => /^\d+[.)]\s+/.test(l))) return '<ol>' + each(lines, (l) => '<li>' + inlineMd(l.replace(/^\d+[.)]\s+/, '')) + '</li>') + '</ol>';
      if (lines.every((l) => /^>/.test(l))) return '<blockquote><p>' + inlineMd(lines.map((l) => l.replace(/^>\s?/, '')).join(' ')) + '</p></blockquote>';
      if (lines.length === 1 && (m = lines[0].match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) return `<figure><img src="${h(photoUrl(decodeURIComponent(m[2])))}" alt=""><figcaption>${h(m[1])}</figcaption></figure>`;
      return '<p>' + inlineMd(lines.join(' ')) + '</p>';
    }).join('');
  }

  async function postEdit(slug) {
    page('Article', loading(), { back: '#/articles' });
    await ensure('posts');
    const original = slug ? S.posts.find((p) => p.slug === slug) : null;
    if (slug && !original) { page('Article not found', '<p class="muted">This article doesn’t exist any more.</p>', { back: '#/articles' }); return; }
    const draft = clone(original || { slug: '', title: '', category: CATEGORIES[0], date: today(), image: '', intro: '', body: '' });
    let tab = 'write';
    const cats = [...new Set(CATEGORIES.concat(S.posts.map((p) => p.category)))];

    V = {
      draft,
      redraw() {
        const d = V.draft;
        page(original ? 'Edit article' : 'New article', `
          <section class="card">
            ${field('Title', text('title', d.title, 'class="input-big" placeholder="Write it the way people search, e.g. What to pack for Zanzibar"'))}
            <div class="grid-2">
              ${field('Category', `<select data-bind="category">${each(cats, (c) => `<option${c === d.category ? ' selected' : ''}>${h(c)}</option>`)}</select>`)}
              ${field('Date', `<input type="date" data-bind="date" value="${h(d.date)}">`, 'Newest articles show first.')}
            </div>
            ${field('Intro', area('intro', d.intro, 2, 'placeholder="One or two sentences. Shown on Travel Talk and in Google results."'))}
            <div class="field"><span class="field__label">Photo</span><div class="slots slots--one">${slot('image', d.image, '', 'Article photo')}</div></div>
            ${original ? '' : field('Web address', text('slug', d.slug, `placeholder="${h(slugify(d.title) || 'e.g. what-to-pack-for-zanzibar')}"`), `fuyamo.co.za/travel-talk/<strong>${h(d.slug || slugify(d.title) || '…')}</strong>/ · Leave empty to use the title.`)}
          </section>
          <section class="card">
            <div class="editor-head">
              <div class="seg"><button class="${tab === 'write' ? 'is-on' : ''}" data-act="tab" data-tab="write">Write</button><button class="${tab === 'preview' ? 'is-on' : ''}" data-act="tab" data-tab="preview">Preview</button></div>
              ${tab === 'write' ? `<div class="toolbar">
                <button data-act="fmt" data-fmt="bold" title="Bold"><strong>B</strong></button>
                <button data-act="fmt" data-fmt="italic" title="Italic"><em>I</em></button>
                <button data-act="fmt" data-fmt="h2" title="Heading">H</button>
                <button data-act="fmt" data-fmt="h3" title="Small heading">h</button>
                <button data-act="fmt" data-fmt="list" title="List">•</button>
                <button data-act="fmt" data-fmt="ol" title="Numbered list">1.</button>
                <button data-act="fmt" data-fmt="quote" title="Quote">“</button>
                <button data-act="fmt" data-fmt="link" title="Link">Link</button>
                <button data-act="fmt" data-fmt="photo" title="Photo">${icon('photos', 16)}</button></div>` : ''}
            </div>
            ${tab === 'write' ? area('body', d.body, 18, 'class="editor" id="body" placeholder="Write the article here. Leave an empty line between paragraphs."')
    : `<div class="prose">${markdown(d.body) || '<p class="muted">Nothing written yet.</p>'}</div>`}
          </section>
          ${savebar(original ? `<button class="btn btn-danger-text" data-act="delete">${icon('trash', 16)} Delete article</button>` : '')}`, { back: '#/articles' });
      },
      act: Object.assign({}, LIST_ACTS, {
        tab(el) { tab = el.dataset.tab; redraw(); },
        async fmt(el) {
          const ta = $('#body');
          const { selectionStart: a, selectionEnd: b, value } = ta;
          const sel = value.slice(a, b);
          const lineStart = value.lastIndexOf('\n', a - 1) + 1;
          let insert, from = a, to = b, caret;
          const kind = el.dataset.fmt;
          if (kind === 'bold' || kind === 'italic') {
            const mark = kind === 'bold' ? '**' : '*';
            insert = mark + (sel || 'text') + mark;
            caret = [a + mark.length, a + mark.length + (sel || 'text').length];
          } else if (['h2', 'h3', 'list', 'ol', 'quote'].includes(kind)) {
            const prefix = { h2: '## ', h3: '### ', list: '- ', ol: '1. ', quote: '> ' }[kind];
            from = lineStart;
            insert = value.slice(lineStart, b).split('\n').map((l, i) => (kind === 'ol' ? (i + 1) + '. ' : prefix) + l.replace(/^(#{1,4}\s+|[-*]\s+|\d+[.)]\s+|>\s?)/, '')).join('\n');
          } else if (kind === 'link') {
            const url = await askText('Add a link', 'Address (a trip page like /trips/bali/ or a full https:// address)', '/trips/');
            if (!url) return;
            insert = `[${sel || 'link text'}](${url})`;
          } else if (kind === 'photo') {
            const src = await pickPhoto('Photo in the article');
            if (!src) return;
            const caption = (await askText('Photo caption', 'Caption (optional)')) || '';
            // Spaces and brackets in older photo names would end the Markdown address early.
            insert = `${a > 0 && value[a - 1] !== '\n' ? '\n\n' : ''}![${caption}](${encodeURI(src).replace(/\(/g, '%28').replace(/\)/g, '%29')})\n\n`;
          }
          V.draft.body = value.slice(0, from) + insert + value.slice(to);
          markDirty(); redraw();
          const fresh = $('#body');
          fresh.focus();
          if (caret) fresh.setSelectionRange(from + caret[0] - a, from + caret[1] - a); else fresh.setSelectionRange(from + insert.length, from + insert.length);
        },
        async save(btn) {
          const d = V.draft;
          if (!original) d.slug = slugify(d.slug || d.title);
          const errors = [];
          if (!d.title.trim()) errors.push('Add a title.');
          if (!d.intro.trim()) errors.push('Add a short intro.');
          if (!d.image) errors.push('Choose a photo.');
          if (!d.body.trim()) errors.push('Write the article.');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) errors.push('Choose a date.');
          if (!original && S.posts.some((p) => p.slug === d.slug)) errors.push('Another article already uses that web address.');
          if (errors.length) { toast(errors[0], 'error'); return; }
          const content = postText(d);
          if (await save([{ path: `posts/${d.slug}.md`, text: content }].concat(pendingFiles(content)), `Travel Talk: ${original ? 'update' : 'add'} “${d.title}”`, btn)) {
            S.posts = S.posts.filter((p) => p !== original).concat(clone(d)).sort((x, y) => (x.date < y.date ? 1 : -1));
            location.hash = '#/articles';
          }
        },
        async delete() {
          if (!(await confirmBox('Delete this article?', `“${original.title}” disappears from Travel Talk. Earlier versions stay on GitHub if you need it back.`, { ok: 'Delete', danger: true }))) return;
          if (await save([{ path: `posts/${original.slug}.md`, remove: true }], `Travel Talk: remove “${original.title}”`)) {
            S.posts = S.posts.filter((p) => p !== original);
            location.hash = '#/articles';
          }
        },
      }),
    };
    V.redraw();
  }

  // ----- Photos -----

  const HEADER_SLOTS = [['home', 'Home'], ['trips', 'Group trips'], ['calendar', 'Calendar'], ['services', 'Services'], ['about', 'About'], ['how_to_book', 'How to book'], ['corporate', 'Corporate'], ['contact', 'Contact'], ['travel_talk', 'Travel Talk'], ['yamo', 'Yamo']];
  const LIST_SLOTS = [
    ['intro', 'Intro photo pills', 'The three small round photos in “We plan the flights, the stays…”.', 3],
    ['why', 'Why cards', 'One for each “Travel, minus the stress” card, in order.', 5],
    ['about', 'About page', 'The two photos beside the text.', 2],
    ['services', 'Services page', 'Group travel, tailored travel, public sector &amp; corporate.', 3],
  ];
  const SINGLE_SLOTS = [['how_to_book', 'How to book', 'The last step'], ['birthday_popup', 'Birthday popup', 'The offer popup'], ['yamo_passport', 'Yamo passport', 'Taped into the passport']];

  async function photosView() {
    page('Photos', loading());
    await ensure('photos', 'trips');
    const draft = clone(S.photos);
    draft.headers = draft.headers || {};
    LIST_SLOTS.forEach(([k, , , n]) => { draft[k] = draft[k] || []; while (draft[k].length < n) draft[k].push(''); });
    draft.moments = draft.moments || [];
    V = {
      draft,
      redraw() {
        const d = V.draft;
        page('Photos', `
          <p class="intro-text">Choose a section’s photo to change it. Trip photos are under <a href="#/trips">Trips</a>.</p>
          <section class="card">
            <h2 class="card__title">Moments worth the trip</h2>
            <p class="card__hint">The drifting polaroids on the home page. Add as many as you like: real travellers having fun work best. Each links to the trip in its caption, or the one you pick.</p>
            <div class="moments">${each(d.moments, (m, i) => `<div class="moment">
              ${slot(`moments.${i}.image`, m.image, '', 'Moment photo')}
              ${text(`moments.${i}.caption`, m.caption, 'placeholder="Caption, e.g. Zanzibar"')}
              <select data-bind="moments.${i}.trip" title="The trip this photo links to"><option value="">Link: from caption</option>${each(S.trips, (t) => `<option value="${h(t.key)}"${t.key === m.trip ? ' selected' : ''}>Link: ${h(t.menu_label || t.name)}</option>`)}</select>
              ${rowTools('moments', i, d.moments.length)}</div>`)}
              <button class="moment moment--add" data-act="addMoment">${icon('plus', 22)}<span>Add a moment</span></button></div>
          </section>
          <section class="card">
            <h2 class="card__title">Page headers</h2>
            <p class="card__hint">The big photo at the top of each page. Landscape photos work best. Travel Talk and Yamo are only used for link previews.</p>
            <div class="slots">${each(HEADER_SLOTS, ([k, label]) => slot('headers.' + k, d.headers[k], label, label + ' header'))}</div>
          </section>
          ${each(LIST_SLOTS, ([k, label, hint, n]) => `<section class="card">
            <h2 class="card__title">${label}</h2><p class="card__hint">${hint}</p>
            <div class="slots">${each(d[k].slice(0, n), (src, i) => slot(`${k}.${i}`, src, String(i + 1), label))}</div></section>`)}
          <section class="card">
            <h2 class="card__title">Other photos</h2>
            <div class="slots">${each(SINGLE_SLOTS, ([k, label, hint]) => slot(k, d[k], label, label + ' · ' + hint))}</div>
          </section>
          ${savebar()}`);
      },
      act: Object.assign({}, LIST_ACTS, {
        async addMoment() {
          const src = await pickPhoto('New moment');
          if (!src) return;
          V.draft.moments.push({ image: src, caption: '', trip: '' });
          markDirty(); redraw();
          const inputs = document.querySelectorAll('.moment input');
          if (inputs.length) inputs[inputs.length - 1].focus();
        },
        async save(btn) {
          const d = V.draft;
          const missing = d.moments.findIndex((m) => !m.image || !m.caption.trim());
          if (missing >= 0) { toast(`Moment ${missing + 1} needs a photo and a caption.`, 'error'); return; }
          if (await save([{ path: 'content/photos.json', text: json(d) }].concat(pendingFiles(d)), 'Photos: update', btn)) {
            S.photos = clone(d);
            redraw();
          }
        },
      }),
    };
    V.redraw();
  }

  // ----- FAQs -----

  async function faqsView() {
    page('FAQs', loading());
    await ensure('faqs');
    V = {
      draft: { faqs: clone(S.faqs) },
      redraw() {
        const d = V.draft;
        page('FAQs', `<p class="intro-text">The first four also show on the home page.</p>
          ${each(d.faqs, (f, i) => `<section class="card item">
            ${field('Question', text(`faqs.${i}.question`, f.question))}
            ${field('Answer', area(`faqs.${i}.answer`, f.answer, 3))}
            ${rowTools('faqs', i, d.faqs.length)}</section>`)}
          <button class="btn-add btn-add--card" data-act="add" data-list="faqs" data-item='{"question":"","answer":""}'>${icon('plus', 16)} Add a question</button>
          ${savebar()}`);
      },
      act: Object.assign({}, LIST_ACTS, {
        async save(btn) {
          const faqs = V.draft.faqs.filter((f) => f.question.trim() || f.answer.trim());
          if (faqs.some((f) => !f.question.trim() || !f.answer.trim())) { toast('Each question needs an answer.', 'error'); return; }
          if (await save([{ path: 'content/faqs.json', text: json({ faqs }) }], 'FAQs: update', btn)) { S.faqs = clone(faqs); V.draft.faqs = clone(faqs); redraw(); }
        },
      }),
    };
    V.redraw();
  }

  // ----- Reviews -----

  async function reviewsView() {
    page('Reviews', loading());
    await ensure('reviews');
    V = {
      draft: clone(S.reviews),
      redraw() {
        const d = V.draft;
        page('Reviews', `
          <section class="card">
            <h2 class="card__title">Google rating</h2>
            <div class="grid-3">
              ${field('Rating', text('rating', d.rating, 'placeholder="5.0"'))}
              ${field('Number of reviews', text('count', d.count, 'placeholder="13"'))}
              ${field('“Leave a review” link', text('link', d.link))}
            </div>
          </section>
          <div class="row-head"><h2 class="card__title">Reviews <small>Newest first, as written on Google</small></h2>
            <button class="btn" data-act="addReview">${icon('plus', 16)} Add a review</button></div>
          ${each(d.reviews, (r, i) => `<section class="card item">
            <div class="grid-4">
              ${field('Name', text(`reviews.${i}.name`, r.name, 'placeholder="Lucky M."'))}
              ${field('When', text(`reviews.${i}.when`, r.when, 'placeholder="Jan 2026"'))}
              ${field('Stars', `<select data-bind="reviews.${i}.rating" data-number>${each([5, 4, 3, 2, 1], (n) => `<option value="${n}"${+r.rating === n ? ' selected' : ''}>${'★'.repeat(n)}</option>`)}</select>`)}
              ${field('Trip', text(`reviews.${i}.trip`, r.trip, 'placeholder="Optional, e.g. MOZAMBIQUE"'))}
            </div>
            ${field('Review', area(`reviews.${i}.text`, r.text, 3))}
            ${rowTools('reviews', i, d.reviews.length)}</section>`)}
          ${savebar()}`);
      },
      act: Object.assign({}, LIST_ACTS, {
        addReview() {
          V.draft.reviews.unshift({ name: '', when: MONTHS[new Date().getMonth()] + ' ' + new Date().getFullYear(), rating: 5, trip: '', text: '' });
          markDirty(); redraw();
          const first = document.querySelector('[data-bind="reviews.0.name"]');
          if (first) first.focus();
        },
        async save(btn) {
          const d = V.draft;
          d.reviews = d.reviews.filter((r) => r.name.trim() || r.text.trim());
          if (d.reviews.some((r) => !r.name.trim() || !r.text.trim())) { toast('Each review needs a name and the review text.', 'error'); return; }
          if (await save([{ path: 'content/reviews.json', text: json(d) }], 'Reviews: update', btn)) { S.reviews = clone(d); redraw(); }
        },
      }),
    };
    V.redraw();
  }

  // ---------- Analytics (Google Analytics Data API, with the viewer's Google sign-in) ----------

  const GA = { token: '', expires: 0, range: 28, cache: new Map() };
  const GOOGLE_KEY = 'fuyamo-admin-google';
  function keepGoogle() {
    try { if (GA.token) sessionStorage.setItem(GOOGLE_KEY, JSON.stringify({ token: GA.token, expires: GA.expires })); else sessionStorage.removeItem(GOOGLE_KEY); } catch (err) { /* no storage */ }
  }
  try { Object.assign(GA, JSON.parse(sessionStorage.getItem(GOOGLE_KEY) || '{}')); } catch (err) { /* no storage */ }
  const gaConfigured = () => !!(S.settings && S.settings.ga && S.settings.ga.property && S.settings.ga.client);
  const gaConnected = () => GA.token && Date.now() < GA.expires;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = resolve; s.onerror = () => reject(new Error('Couldn’t reach Google.'));
      document.head.appendChild(s);
    });
  }
  async function gaConnect() {
    if (MOCK) { GA.token = 'mock'; GA.expires = Date.now() + 3600e3; return; }
    await loadScript('https://accounts.google.com/gsi/client');
    await new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: S.settings.ga.client,
        scope: 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/userinfo.email',
        callback: (r) => {
          if (r.error) { reject(new Error(r.error_description || r.error)); return; }
          GA.token = r.access_token;
          GA.expires = Date.now() + (r.expires_in - 60) * 1000;
          keepGoogle();
          resolve();
        },
        error_callback: (e) => reject(new Error(e.message || 'Google sign-in was closed.')),
      });
      client.requestAccessToken();
    });
  }
  async function gaReport(body, realtime) {
    const key = (realtime ? 'rt' : '') + JSON.stringify(body);
    if (!realtime && GA.cache.has(key)) return GA.cache.get(key);
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(S.settings.ga.property)}:${realtime ? 'runRealtimeReport' : 'runReport'}`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + GA.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) { GA.token = ''; keepGoogle(); }
      throw new Error(data.error && data.error.message ? data.error.message : 'Google Analytics didn’t answer.');
    }
    const rows = (data.rows || []).map((r) => ({ d: (r.dimensionValues || []).map((v) => v.value), m: r.metricValues.map((v) => +v.value) }));
    if (!realtime) GA.cache.set(key, rows);
    return rows;
  }
  const rangeOf = (days, back = 0) => ({ startDate: (days * (back + 1)) + 'daysAgo', endDate: back ? (days * back + 1) + 'daysAgo' : 'today' });
  const fmtNum = (n) => Math.round(n).toLocaleString('en-ZA');
  const change = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
  const changeTag = (a, b) => { const c = change(a, b); return c == null ? '' : `<span class="delta ${c >= 0 ? 'delta--up' : 'delta--down'}">${c >= 0 ? '+' : ''}${c}%</span>`; };
  const SEAT = [['reserve_seat', 'Reserve seat'], ['secure_seat', 'Secure seat']];
  async function seatTest(days) {
    const rows = await gaReport({ dateRanges: [rangeOf(days)], dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: SEAT.flatMap(([k]) => ['seen_' + k, 'click_' + k]) } } } });
    const count = (name) => (rows.find((r) => r.d[0] === name) || { m: [0] }).m[0];
    return SEAT.map(([k, label]) => { const seen = count('seen_' + k), clicks = count('click_' + k); return { label, seen, clicks, rate: seen ? (clicks / seen) * 100 : 0 }; });
  }
  // "/trips/bali/" → "Bali", "/travel-talk/x/" → the article's title.
  function pageName(path) {
    if (path === '/' || path === '') return 'Home';
    let m;
    if ((m = path.match(/^\/trips\/([\w-]+)\/?$/)) && S.trips) { const t = S.trips.find((x) => x.key === m[1]); if (t) return t.name + (t.edition ? ' · ' + t.edition : '') + ' (trip)'; }
    if ((m = path.match(/^\/travel-talk\/([\w-]+)\/?$/)) && S.posts) { const p = S.posts.find((x) => x.slug === m[1]); if (p) return p.title; }
    const names = { '/trips/': 'All trips', '/calendar/': 'Calendar', '/how-to-book/': 'How to book', '/corporate/': 'Corporate', '/contact/': 'Contact', '/about/': 'About', '/services/': 'Services', '/travel-talk/': 'Travel Talk', '/yamo/': 'Yamo', '/privacy/': 'Privacy notice' };
    return names[path] || path;
  }

  function gaSetupCard() {
    return `<h2 class="card__title">Visitors</h2><p class="muted">Connect Google Analytics to see visitors, top trips and the Reserve vs Secure result here.</p>
      <a class="btn" href="#/settings">Set it up in Settings</a>`;
  }
  function gaConnectCard(where) {
    return `<h2 class="card__title">Visitors and enquiries</h2><p class="muted">Sign in with your fuyamo.co.za Google account (info@fuyamo.co.za).</p>
      <button class="btn-primary" data-act="gaConnect" data-where="${where}">Sign in with Google</button>`;
  }

  async function gaSummary() {
    const box = $('#ga-summary');
    if (!box) return;
    await ensure('settings').catch(() => {});
    if (!gaConfigured()) { box.innerHTML = gaSetupCard(); return; }
    if (!gaConnected()) { box.innerHTML = gaConnectCard('overview'); return; }
    box.innerHTML = '<h2 class="card__title">Last 7 days</h2>' + loading();
    try {
      const [totals, now, seat] = await Promise.all([
        gaReport({ dateRanges: [rangeOf(7), rangeOf(7, 1)], metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }] }),
        gaReport({ metrics: [{ name: 'activeUsers' }] }, true),
        seatTest(7),
      ]);
      const cur = totals.find((r) => r.d[0] === 'date_range_0') || totals[0] || { m: [0, 0] };
      const prev = totals.find((r) => r.d[0] === 'date_range_1') || { m: [0, 0] };
      const clicks = seat.reduce((s, x) => s + x.clicks, 0);
      box.innerHTML = `<div class="card__head"><h2 class="card__title">Last 7 days</h2><a href="#/analytics" class="link">All analytics →</a></div>
        <div class="stats">
          <div class="stat"><span>Visitors</span><strong>${fmtNum(cur.m[0])}</strong>${changeTag(cur.m[0], prev.m[0])}</div>
          <div class="stat"><span>Page views</span><strong>${fmtNum(cur.m[1])}</strong>${changeTag(cur.m[1], prev.m[1])}</div>
          <div class="stat"><span>Reserve clicks</span><strong>${fmtNum(clicks)}</strong></div>
          <div class="stat"><span>On the site now</span><strong>${fmtNum(now[0] ? now[0].m[0] : 0)}</strong></div>
        </div>`;
    } catch (err) { box.innerHTML = `<h2 class="card__title">Visitors</h2><p class="muted">${h(err.message)}</p>`; }
  }

  function lineChart(points) {
    if (!points.length) return '<p class="muted">No visits in this period yet.</p>';
    const W = 640, H = 160, P = 6, max = Math.max(1, ...points.map((p) => p.v));
    const x = (i) => P + (i * (W - 2 * P)) / Math.max(1, points.length - 1), y = (v) => H - P - (v / max) * (H - 2 * P - 14);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Visitors per day">
      <path d="${line}L${x(points.length - 1)},${H - P}L${x(0)},${H - P}Z" class="chart__area"/><path d="${line}" class="chart__line"/></svg>
      <div class="chart__axis"><span>${h(points[0].label)}</span><span>${h(points[points.length - 1].label)}</span></div>`;
  }
  const bars = (rows, total) => `<ul class="bars">${each(rows, (r) => `<li><span class="bars__label">${h(r.label)}</span><span class="bars__track"><span style="width:${total ? Math.max(2, (r.v / total) * 100) : 0}%"></span></span><span class="bars__value">${fmtNum(r.v)}</span></li>`)}</ul>`;

  async function analyticsView() {
    page('Analytics', loading());
    await ensure('settings', 'trips');
    ensure('posts').catch(() => {});
    if (!gaConfigured()) { page('Analytics', `<section class="card">${gaSetupCard()}</section>`); return; }
    if (!gaConnected()) { page('Analytics', `<section class="card">${gaConnectCard('analytics')}</section>`); return; }
    const days = GA.range;
    const ranges = `<div class="seg">${each([7, 28, 90], (n) => `<button class="${n === days ? 'is-on' : ''}" data-act="range" data-days="${n}">${n} days</button>`)}</div>`;
    page('Analytics', loading(), { actions: ranges });
    try {
      const r = rangeOf(days);
      const [totals, daily, pages, channels, devices, countries, seat, now] = await Promise.all([
        gaReport({ dateRanges: [r, rangeOf(days, 1)], metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }, { name: 'averageSessionDuration' }] }),
        gaReport({ dateRanges: [r], dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ dimension: { dimensionName: 'date' } }] }),
        gaReport({ dateRanges: [r], dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 10 }),
        gaReport({ dateRanges: [r], dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 6 }),
        gaReport({ dateRanges: [r], dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }] }),
        gaReport({ dateRanges: [r], dimensions: [{ name: 'country' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 6 }),
        seatTest(days),
        gaReport({ metrics: [{ name: 'activeUsers' }] }, true),
      ]);
      const cur = totals.find((x) => x.d[0] === 'date_range_0') || totals[0] || { m: [0, 0, 0, 0] };
      const prev = totals.find((x) => x.d[0] === 'date_range_1') || { m: [0, 0, 0, 0] };
      const mins = (s) => Math.floor(s / 60) + ':' + pad(Math.round(s % 60));
      const sum = (rows) => rows.reduce((s, x) => s + x.m[0], 0);
      const channelNames = { 'Organic Search': 'Google search', Direct: 'Typed the address', 'Organic Social': 'Social media', Referral: 'Other websites', 'Paid Search': 'Google ads', 'Paid Social': 'Social ads', Email: 'Email', Unassigned: 'Other' };
      const leader = seat[0].rate === seat[1].rate ? null : seat[0].rate > seat[1].rate ? seat[0] : seat[1];
      const enough = seat.every((x) => x.clicks >= 100);
      page('Analytics', `
        <p class="intro-text"><span class="live-dot"></span>${fmtNum(now[0] ? now[0].m[0] : 0)} ${now[0] && now[0].m[0] === 1 ? 'person' : 'people'} on the site right now.</p>
        <div class="stats stats--4">
          <div class="stat"><span>Visitors</span><strong>${fmtNum(cur.m[0])}</strong>${changeTag(cur.m[0], prev.m[0])}</div>
          <div class="stat"><span>Visits</span><strong>${fmtNum(cur.m[1])}</strong>${changeTag(cur.m[1], prev.m[1])}</div>
          <div class="stat"><span>Page views</span><strong>${fmtNum(cur.m[2])}</strong>${changeTag(cur.m[2], prev.m[2])}</div>
          <div class="stat"><span>Average visit</span><strong>${mins(cur.m[3])}</strong></div>
        </div>
        <section class="card"><h2 class="card__title">Visitors per day</h2>
          ${lineChart(daily.map((x) => ({ v: x.m[0], label: niceDate(x.d[0].slice(0, 4) + '-' + x.d[0].slice(4, 6) + '-' + x.d[0].slice(6, 8)) })))}</section>
        <section class="card">
          <h2 class="card__title">Button test: “Reserve seat” or “Secure seat”</h2>
          <div class="ab">${each(seat, (x) => `<div class="ab__col${leader === x ? ' is-lead' : ''}"><span>${h(x.label)}</span><strong>${x.rate.toFixed(1)}%</strong><small>${fmtNum(x.clicks)} clicks from ${fmtNum(x.seen)} views</small></div>`)}</div>
          <p class="card__hint">${!seat[0].seen && !seat[1].seen ? 'No trip page views in this period yet.' : enough && leader ? `“${h(leader.label)}” gets more clicks. You can keep it and end the test.` : `Wait for about 100 clicks on each before deciding${leader ? `: “${h(leader.label)}” is ahead so far.` : '.'}`}</p>
        </section>
        <div class="grid-2">
          <section class="card"><h2 class="card__title">Most viewed pages</h2>${bars(pages.map((x) => ({ label: pageName(x.d[0]), v: x.m[0] })), pages[0] ? pages[0].m[0] : 0)}</section>
          <section class="card"><h2 class="card__title">How people found you</h2>${bars(channels.map((x) => ({ label: channelNames[x.d[0]] || x.d[0], v: x.m[0] })), sum(channels))}</section>
          <section class="card"><h2 class="card__title">Devices</h2>${bars(devices.map((x) => ({ label: x.d[0] ? x.d[0][0].toUpperCase() + x.d[0].slice(1) : 'Other', v: x.m[0] })), sum(devices))}</section>
          <section class="card"><h2 class="card__title">Countries</h2>${bars(countries.map((x) => ({ label: x.d[0], v: x.m[0] })), sum(countries))}</section>
        </div>`, { actions: ranges });
    } catch (err) {
      page('Analytics', problem(err), { actions: ranges });
    }
  }

  // ---------- Enquiries (the website's forms, kept in a Google Sheet by tools/enquiries/Code.gs) ----------

  const ENQ = { list: null, plunk: false, filter: 'All' };
  const ENQ_STATUSES = ['New', 'Proposal sent', 'Booked', 'Not going ahead'];
  const FORM_LABELS = { corporate: 'Corporate', callback: 'Callback', birthday: 'Birthday offer' };
  const enqConfigured = () => !!(S.settings && S.settings.enquiries && S.settings.enquiries.url && S.settings.ga && S.settings.ga.client);
  const statusTag = (s) => `<span class="state state--${slugify(s)}">${h(s)}</span>`;
  const waNumber = (phone) => String(phone || '').replace(/[^\d]/g, '');
  const firstName = (name) => String(name || '').trim().split(/\s+/)[0];
  // The sheet's Plunk column ("proposal_sent ✓", or "… ✗ reason") in words.
  const PLUNK_WORDS = { enquiry_received: 'thank-you email sent', proposal_sent: 'proposal emailed', booked: 'reminders stopped', not_going_ahead: 'reminders stopped' };
  function plunkNote(p) {
    const m = String(p || '').match(/^(\w+) (✓|✗)\s*(.*)$/);
    if (!m) return '';
    return m[2] === '✓' ? ' Plunk: ' + (PLUNK_WORDS[m[1]] || m[1]) + '.' : ' Plunk couldn’t send: ' + m[3].replace(/\.$/, '') + '.';
  }

  // Every call carries the Google sign-in; the script checks it's a fuyamo.co.za account.
  async function enqApi(body) {
    if (MOCK) return mockEnquiries(body);
    let data;
    try {
      const res = await fetch(S.settings.enquiries.url, { method: 'POST', body: JSON.stringify(Object.assign({ token: GA.token }, body)) });
      data = await res.json();
    } catch (err) {
      throw new Error('Couldn’t reach the enquiries sheet. Check the internet connection and try again.');
    }
    if (data.auth) { GA.token = ''; keepGoogle(); }
    if (!data.ok) throw new Error(data.error || 'The enquiries sheet didn’t answer.');
    return data;
  }
  function parseEnquiry(e) {
    let details = {};
    try { details = JSON.parse(e.details || '{}'); } catch (err) { details = {}; }
    return Object.assign({}, e, { info: details });
  }
  async function loadEnquiries() {
    const data = await enqApi({ action: 'list' });
    ENQ.list = data.enquiries.map(parseEnquiry);
    ENQ.plunk = !!data.plunk;
    return ENQ.list;
  }
  // One line about what they asked for.
  function enqAbout(e) {
    const d = e.info;
    const bits = [d['Company / department'], d['Enquiry type'], d['Destination'], d['Birthday month'] && 'Birthday in ' + d['Birthday month'], d['About'] || d['Message']];
    return bits.filter(Boolean).join(' · ');
  }
  const enqRow = (e) => {
    const when = new Date(e.received);
    return `<li><a href="#/enquiries/${h(e.id)}" class="row">
      <span class="row__date"><strong>${when.getDate() || ''}</strong>${MONTHS[when.getMonth()] || ''}</span>
      <span class="row__text"><strong>${h(e.name)} <em class="tag tag--muted">${h(FORM_LABELS[e.form] || e.form)}</em></strong><small>${h(ago(e.received))} · ${h(enqAbout(e) || e.email || e.phone)}</small></span>
      ${statusTag(e.status)}${icon('chevron', 18)}</a></li>`;
  };
  function googleCard(where, title) {
    return `<h2 class="card__title">${h(title)}</h2><p class="muted">Sign in with your fuyamo.co.za Google account (info@fuyamo.co.za).</p>
      <button class="btn-primary" data-act="gaConnect" data-where="${where}">Sign in with Google</button>`;
  }
  const enqNotReady = () => `<section class="card"><h2 class="card__title">Enquiries</h2><p class="muted">The enquiries sheet isn’t connected yet. See “Enquiries” in the README.</p></section>`;

  async function enquiriesList() {
    page('Enquiries', loading());
    await ensure('settings');
    if (!enqConfigured()) { page('Enquiries', enqNotReady()); return; }
    if (!gaConnected()) { page('Enquiries', `<section class="card">${googleCard('enquiries', 'Enquiries')}</section>`); return; }
    const list = await loadEnquiries();
    const count = (s) => (s === 'All' ? list.length : list.filter((e) => e.status === s).length);
    const draw = () => {
      const shown = ENQ.filter === 'All' ? list : list.filter((e) => e.status === ENQ.filter);
      const seg = `<div class="seg seg--scroll">${each(['All', 'New', 'Proposal sent', 'Booked'], (s) => `<button class="${s === ENQ.filter ? 'is-on' : ''}" data-act="filter" data-value="${h(s)}">${h(s)} <span class="seg__n">${count(s)}</span></button>`)}</div>`;
      page('Enquiries', `${seg}
        <section class="card">${shown.length ? `<ul class="rows">${each(shown, enqRow)}</ul>`
          : `<p class="muted">${list.length ? 'Nothing here.' : 'No enquiries yet. New ones from the website’s forms appear here.'}</p>`}</section>
        ${ENQ.plunk ? '' : '<p class="card__hint">Plunk isn’t connected yet, so customers don’t get automatic emails. Everything else works.</p>'}`,
      { actions: `<button class="btn" data-act="refresh">Refresh</button>` });
    };
    V = { act: { filter(el) { ENQ.filter = el.dataset.value; draw(); }, refresh: () => enquiriesList() }, redraw: draw };
    draw();
  }

  async function enquiryView(id) {
    page('Enquiry', loading(), { back: '#/enquiries' });
    await ensure('settings', 'trips');
    if (!enqConfigured()) { page('Enquiry', enqNotReady(), { back: '#/enquiries' }); return; }
    if (!gaConnected()) { page('Enquiry', `<section class="card">${googleCard('enquiries', 'Enquiry')}</section>`, { back: '#/enquiries' }); return; }
    if (!ENQ.list || !ENQ.list.some((e) => e.id === id)) await loadEnquiries();
    const e = ENQ.list.find((x) => x.id === id);
    if (!e) { page('Enquiry', '<section class="card"><p class="muted">That enquiry wasn’t found.</p></section>', { back: '#/enquiries' }); return; }
    const draft = { proposal: e.proposal, trip: e.trip || e.info['Destination'] || '', notes: e.notes };
    const wa = waNumber(e.phone);
    const proposalText = () => `Hi ${firstName(e.name)}, here's your trip proposal from Fuyamo Travel${draft.trip ? ': ' + draft.trip : ''}.\n${draft.proposal}`;
    const mailto = (subject, body) => `mailto:${encodeURIComponent(e.email)}?subject=${encodeURIComponent(subject)}${body ? '&body=' + encodeURIComponent(body) : ''}`;
    const auto = ENQ.plunk && e.email;

    const draw = () => {
      const d = Object.entries(e.info).filter(([k]) => k !== 'Start the chat');
      const sent = e.status !== 'New';
      page(e.name, `
        <section class="card">
          <div class="card__head"><h2 class="card__title">${h(FORM_LABELS[e.form] || e.form)} ${statusTag(e.status)}</h2><small class="muted">${h(niceDate(e.received))} · ${h(ago(e.received))}</small></div>
          <div class="contact">
            ${e.email ? `<a class="btn" href="${h(mailto('Re: ' + e.subject))}">Email ${h(e.email)}</a>` : ''}
            ${wa ? `<a class="btn" href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp ${h(e.phone)}</a>` : ''}
            ${e.phone ? `<a class="btn" href="tel:${h(e.phone.replace(/[^\d+]/g, ''))}">Call</a>` : ''}
          </div>
          ${d.length ? `<dl class="facts">${each(d, ([k, v]) => `<div><dt>${h(k)}</dt><dd>${/^https?:\/\//.test(v) ? `<a href="${h(v)}" target="_blank" rel="noopener">${h(v.replace(/^https?:\/\//, ''))}</a>` : h(v).replace(/\n/g, '<br>')}</dd></div>`)}</dl>` : ''}
          ${e.news === 'Yes' ? '<p class="card__hint">They asked for trip news by email.</p>' : ''}
        </section>

        <section class="card">
          <h2 class="card__title">Proposal</h2>
          <p class="card__hint">Build the trip on Yamo, then paste its link here. ${auto ? 'Plunk emails it to them and follows up until they book.' : e.email ? 'Plunk isn’t connected yet, so this opens an email for you to send.' : 'They left a number only, so this opens WhatsApp with the link.'}</p>
          <div class="grid-2">
            ${field('Trip', `<input data-k="trip" value="${h(draft.trip)}" placeholder="e.g. Drakensberg team retreat">`)}
            ${field('Yamo link', `<input data-k="proposal" type="url" value="${h(draft.proposal)}" placeholder="https://app.yamo.travel/…">`)}
          </div>
          <div class="btn-row">
            <button class="btn-primary" data-act="propose">${sent && e.proposal ? 'Send again' : 'Send proposal'}</button>
            ${e.proposal ? `<a class="link" href="${h(e.proposal)}" target="_blank" rel="noopener">Open on Yamo</a>` : ''}
          </div>
        </section>

        <section class="card">
          <h2 class="card__title">Status</h2>
          <div class="seg seg--scroll">${each(ENQ_STATUSES, (s) => `<button class="${s === e.status ? 'is-on' : ''}" data-act="setStatus" data-value="${h(s)}">${h(s)}</button>`)}</div>
          <p class="card__hint card__hint--below">${auto ? 'Booked or Not going ahead stops Plunk’s reminders.' : 'Keeps track of where each enquiry is.'}${e.updated ? ` Last changed ${h(ago(e.updated))}${e.updated_by ? ' by ' + h(e.updated_by) : ''}.` : ''}${h(plunkNote(e.plunk))}</p>
          ${field('Notes for the team', `<textarea data-k="notes" rows="3" placeholder="Called them, sent a second option…">${h(draft.notes)}</textarea>`)}
          <button class="btn" data-act="notes">Save notes</button>
        </section>`, { back: '#/enquiries' });
    };

    const update = async (changes, button, done) => {
      const label = button.textContent;
      button.disabled = true; button.textContent = 'Saving…';
      try {
        const r = await enqApi(Object.assign({ action: 'update', id: e.id }, changes));
        Object.assign(e, parseEnquiry(r.enquiry));
        draw();
        toast(done(r));
      } catch (err) {
        toast(err.message, 'error');
        button.disabled = false; button.textContent = label;
      }
    };
    V = {
      redraw: draw,
      fields: draft,
      act: {
        setStatus(el) {
          if (el.dataset.value === e.status) return;
          update({ status: el.dataset.value }, el, (r) => 'Marked as ' + el.dataset.value.toLowerCase() + '.' + (r.plunk && /✓/.test(r.plunk) && /Booked|Not going/.test(el.dataset.value) ? ' Plunk stops the reminders.' : ''));
        },
        notes(el) { update({ notes: draft.notes }, el, () => 'Notes saved.'); },
        propose(el) {
          if (!/^https:\/\/\S+$/.test(draft.proposal)) { toast('Paste the trip’s Yamo link first (it starts with https://).', 'error'); $('[data-k="proposal"]').focus(); return; }
          const again = e.status !== 'New' && e.proposal;
          // Without Plunk, open the message for them to send themselves (opened now, while it still counts as a tap).
          if (!auto) {
            if (e.email) location.href = mailto('Your trip proposal from Fuyamo Travel', proposalText() + '\n\nAny questions, just reply to this email.\n\nFuyamo Travel');
            else if (wa) window.open('https://wa.me/' + wa + '?text=' + encodeURIComponent(proposalText()), '_blank', 'noopener');
          }
          update({ status: 'Proposal sent', proposal: draft.proposal, trip: draft.trip, resend: !!again }, el,
            (r) => (auto ? (/✓/.test(r.plunk || '') ? 'Proposal sent. Plunk emailed ' + e.email + '.' : 'Saved, but Plunk didn’t send it.' + plunkNote(r.plunk)) : 'Marked as proposal sent.'));
        },
      },
    };
    draw();
  }
  // The enquiry's fields aren't part of a saved file, so they fill the view's own draft (no "Unsaved changes" bar).
  document.addEventListener('input', (ev) => {
    const k = ev.target.dataset && ev.target.dataset.k;
    if (k && V.fields) V.fields[k] = ev.target.value;
  });

  // The overview's "New enquiries" card, once signed in to Google.
  async function enqSummary() {
    const box = $('#enq-summary');
    if (!box) return;
    await ensure('settings').catch(() => {});
    if (!enqConfigured() || !gaConnected()) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<h2 class="card__title">New enquiries</h2>' + loading();
    try {
      const fresh = (await loadEnquiries()).filter((e) => e.status === 'New');
      box.innerHTML = `<div class="card__head"><h2 class="card__title">New enquiries${fresh.length ? ` <span class="count">${fresh.length}</span>` : ''}</h2><a href="#/enquiries" class="link">All enquiries →</a></div>
        ${fresh.length ? `<ul class="rows">${each(fresh.slice(0, 5), enqRow)}</ul>` : '<p class="muted">You’re all caught up.</p>'}`;
    } catch (err) { box.innerHTML = `<h2 class="card__title">New enquiries</h2><p class="muted">${h(err.message)}</p>`; }
  }

  // Test mode (?mock): a few made-up enquiries, kept in memory.
  let mockList = null;
  function mockEnquiries(body) {
    if (!mockList) {
      const t = (h) => new Date(Date.now() - h * 3600e3).toISOString();
      mockList = [
        { id: 'EMOCK3', received: t(2), form: 'callback', status: 'New', name: 'Sipho Dlamini', email: '', phone: '+27 82 555 1234', subject: 'WhatsApp callback request: Sipho Dlamini', details: JSON.stringify({ 'Reply by': 'WhatsApp', About: "Hi Fuyamo, I'm interested in Bali 2027", 'Asked from': 'Bali · https://fuyamo.co.za/trips/bali/' }), news: '', proposal: '', trip: '', notes: '', updated: '', updated_by: '', plunk: '' },
        { id: 'EMOCK2', received: t(26), form: 'corporate', status: 'New', name: 'Thandi Mokoena', email: 'thandi@example.co.za', phone: '+27 72 123 4567', subject: 'Corporate enquiry: Team retreat · Acme', details: JSON.stringify({ 'Enquiry type': 'Team retreat', 'Company / department': 'Acme', Destination: 'Drakensberg', 'Team size': '24', 'Preferred dates': 'March 2027', Needs: 'Accommodation, Transfers, Team activities', Message: 'Two nights, mid-week.\nVegetarian options please.' }), news: 'Yes', proposal: '', trip: '', notes: '', updated: '', updated_by: '', plunk: 'enquiry_received ✓' },
        { id: 'EMOCK1', received: t(120), form: 'birthday', status: 'Booked', name: 'Lerato', email: '', phone: '+27 71 000 1111', subject: 'Birthday R500 offer: Lerato (March)', details: JSON.stringify({ 'Birthday month': 'March', 'Trips that month': 'Lesotho (6–8 Mar 2027)' }), news: '', proposal: 'https://app.yamo.travel/t/abc', trip: 'Lesotho', notes: '', updated: t(30), updated_by: 'info@fuyamo.co.za', plunk: '' },
      ];
    }
    if (body.action === 'list') return Promise.resolve({ ok: true, enquiries: clone(mockList), plunk: !new URLSearchParams(location.search).has('noplunk') });
    const row = mockList.find((x) => x.id === body.id);
    const changed = body.status && body.status !== row.status;
    ['status', 'proposal', 'trip', 'notes'].forEach((k) => { if (body[k] !== undefined) row[k] = body[k]; });
    row.updated = new Date().toISOString(); row.updated_by = 'info@fuyamo.co.za';
    const plunk = (changed || body.resend) && row.email ? ({ 'Proposal sent': 'proposal_sent', Booked: 'booked', 'Not going ahead': 'not_going_ahead' }[row.status] || '') + ' ✓' : '';
    if (plunk) row.plunk = plunk;
    return new Promise((resolve) => setTimeout(() => resolve({ ok: true, enquiry: clone(row), plunk }), 300));
  }

  // ----- Settings -----

  async function settingsView() {
    page('Settings', loading());
    await ensure('settings');
    const ga = (S.settings && S.settings.ga) || {};
    page('Settings', `
      <section class="card">
        <h2 class="card__title">${icon('lock', 18)} Change the sign-in code</h2>
        <p class="card__hint">Everyone who uses the admin will need the new code. If someone you don’t trust learned the old one, also replace the GitHub access below.</p>
        <form data-form="code" class="grid-3">
          ${field('Current code', '<input type="password" name="current" autocomplete="current-password" required>')}
          ${field('New code', '<input type="password" name="next" autocomplete="new-password" required>', 'At least 10 characters.')}
          ${field('New code again', '<input type="password" name="again" autocomplete="new-password" required>')}
          <div><button class="btn-primary" type="submit">Change code</button></div>
        </form>
      </section>
      <section class="card">
        <h2 class="card__title">GitHub access</h2>
        <p class="card__hint">The admin saves to GitHub with an access token, kept locked with the sign-in code. Tokens expire (usually after a year). To replace it, make a new one (see “How to make a token” below), paste it here with the current code, then delete the old token on GitHub.</p>
        <form data-form="token" class="grid-3">
          ${field('New GitHub token', '<input type="password" name="token" autocomplete="off" required>')}
          ${field('Sign-in code', '<input type="password" name="code" autocomplete="current-password" required>')}
          <div><button class="btn-primary" type="submit">Replace access</button></div>
        </form>
        ${tokenHelp()}
      </section>
      <section class="card">
        <h2 class="card__title">Google Analytics</h2>
        <p class="card__hint">Shows the site’s Google Analytics in Overview and Analytics. Each person signs in with their own Google account, which needs access to the Analytics property.</p>
        <form data-form="ga" class="grid-2">
          ${field('Analytics property ID', `<input name="property" value="${h(ga.property || '')}" placeholder="e.g. 456789123" inputmode="numeric">`, 'Google Analytics → Admin → Property details. A number, not the G- ID.')}
          ${field('Google sign-in client ID', `<input name="client" value="${h(ga.client || '')}" placeholder="….apps.googleusercontent.com">`, 'From Google Cloud (see below).')}
          <div><button class="btn-primary" type="submit">Save</button></div>
        </form>
        <details class="help"><summary>How to get the client ID</summary><ol>
          <li>Open <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">console.cloud.google.com</a> with your fuyamo.co.za Google account and create a project called “Fuyamo admin”.</li>
          <li>APIs &amp; Services → Library → turn on <strong>Google Analytics Data API</strong>.</li>
          <li>APIs &amp; Services → OAuth consent screen: choose <strong>Internal</strong>, app name “Fuyamo admin”.</li>
          <li>APIs &amp; Services → Credentials → Create credentials → <strong>OAuth client ID</strong> → Web application. Under Authorized JavaScript origins add <code>https://fuyamo.co.za</code>.</li>
          <li>Copy the client ID it shows and paste it above.</li></ol></details>
      </section>
      <section class="card">
        <h2 class="card__title">Enquiries</h2>
        <p class="card__hint">The website’s forms are saved in the “Fuyamo website enquiries” Google Sheet by a small Google script. This is its web app address (Apps Script → Deploy → Manage deployments).</p>
        <form data-form="enq" class="grid-2">
          ${field('Enquiries script address', `<input name="url" type="url" value="${h(((S.settings && S.settings.enquiries) || {}).url || '')}" placeholder="https://script.google.com/macros/s/…/exec">`)}
          <div><button class="btn-primary" type="submit">Save</button></div>
        </form>
      </section>
      <section class="card">
        <h2 class="card__title">This device</h2>
        <button class="btn" data-act="signout">${icon('out', 16)} Sign out</button>
      </section>`);
    V = { act: { signout: signOut } };
  }

  const tokenHelp = () => `<details class="help"><summary>How to make a token</summary><ol>
      <li>On GitHub, open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Settings → Developer settings → Fine-grained tokens → Generate new token</a>.</li>
      <li>Name it “Fuyamo admin”. Set <strong>Resource owner</strong> to <strong>Fuyamo</strong> and the expiration to one year.</li>
      <li>Repository access: <strong>Only select repositories</strong> → Fuyamo-Travel-website.</li>
      <li>Repository permissions: <strong>Contents → Read and write</strong> and <strong>Actions → Read-only</strong>.</li>
      <li>Generate it, copy it and paste it here. Don’t send it to anyone or paste it anywhere else.</li></ol></details>`;

  async function onForm(form) {
    const f = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('button[type=submit]');
    if (form.dataset.form === 'code') {
      if (f.next !== f.again) { toast('The new codes don’t match.', 'error'); return; }
      if (codeProblem(f.next)) { toast(codeProblem(f.next), 'error'); return; }
      try { await unlockToken(await readJson(KEY_PATH), f.current); } catch (err) { toast('The current code isn’t right.', 'error'); return; }
      if (await save([{ path: KEY_PATH, text: json(await lockToken(S.token, f.next)) }], 'Admin: change the sign-in code', btn)) form.reset();
    } else if (form.dataset.form === 'token') {
      try { await unlockToken(await readJson(KEY_PATH), f.code); } catch (err) { toast('The sign-in code isn’t right.', 'error'); return; }
      const old = S.token;
      try { await checkToken(f.token.trim(), true); } catch (err) { S.token = old; toast(err.message, 'error'); return; }
      if (await save([{ path: KEY_PATH, text: json(await lockToken(S.token, f.code)) }], 'Admin: replace GitHub access', btn)) { remember(S.token, kept()); form.reset(); }
    } else if (form.dataset.form === 'ga') {
      const ga = { property: f.property.trim().replace(/^properties\//, ''), client: f.client.trim() };
      if (ga.property && !/^\d+$/.test(ga.property)) { toast('The property ID is a number, like 456789123 (not the G- measurement ID).', 'error'); return; }
      const settings = Object.assign({}, S.settings, { ga });
      if (await save([{ path: SETTINGS_PATH, text: json(settings) }], 'Admin: Google Analytics settings', btn)) { S.settings = settings; GA.token = ''; keepGoogle(); }
    } else if (form.dataset.form === 'enq') {
      const url = f.url.trim();
      if (url && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) { toast('That doesn’t look like an Apps Script web app address (…/exec).', 'error'); return; }
      const settings = Object.assign({}, S.settings, { enquiries: { url } });
      if (await save([{ path: SETTINGS_PATH, text: json(settings) }], 'Admin: enquiries settings', btn)) { S.settings = settings; ENQ.list = null; }
    }
  }

  // ---------- Sign in and first-time setup ----------

  function authPage(html) {
    document.body.className = 'is-auth';
    $('#app').innerHTML = `<div class="auth"><div class="auth__card"><div class="auth__brand">${LOGO}<span>Admin</span></div>${html}</div></div>`;
  }

  async function signInPage(message) {
    authPage(`<form class="auth__form" data-form="signin">
        <h1>Sign in</h1>
        ${message ? `<p class="auth__error" role="alert">${h(message)}</p>` : ''}
        ${field('Code', '<input type="password" name="code" autocomplete="current-password" required autofocus>')}
        <label class="check"><input type="checkbox" name="keep" checked><span>Keep me signed in on this device</span></label>
        <button class="btn-primary btn-block" type="submit">Sign in</button>
        <button class="link-btn" type="button" data-auth="reset">GitHub access expired? Set up again</button>
      </form>`);
    $('input[name=code]').focus();
  }

  function setupPage(again) {
    authPage(`<form class="auth__form" data-form="setup">
        <h1>${again ? 'Set up again' : 'Set up the admin'}</h1>
        <p class="auth__text">${again ? 'Use this when the GitHub access has expired, or to start over with a new code.' : 'Do this once. After that, everyone signs in with the code you choose here.'}</p>
        ${field('GitHub token', '<input type="password" name="token" autocomplete="off" required>', 'It needs Contents: Read and write on Fuyamo-Travel-website.')}
        ${field('Choose a sign-in code', '<input type="password" name="code" autocomplete="new-password" required>', 'At least 10 characters. Three or four random words work well, e.g. “sunset-bilene-dhow-42”.')}
        ${field('The code again', '<input type="password" name="again" autocomplete="new-password" required>')}
        <button class="btn-primary btn-block" type="submit">Set up</button>
        ${again ? '<button class="link-btn" type="button" data-auth="signin">Back to sign in</button>' : ''}
        ${tokenHelp()}
      </form>`);
  }

  async function onAuthForm(form) {
    const f = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('button[type=submit]');
    const busy = (on, label) => { btn.disabled = on; btn.textContent = label; };
    if (form.dataset.form === 'signin') {
      busy(true, 'Checking…');
      let box;
      try { box = await readJson(KEY_PATH, { auth: false }); } catch (err) { busy(false, 'Sign in'); toast(err.status === 404 ? 'The admin isn’t set up yet.' : err.message, 'error'); if (err.status === 404) setupPage(); return; }
      let token;
      try { token = await unlockToken(box, f.code); } catch (err) { busy(false, 'Sign in'); signInPage('That code isn’t right.'); return; }
      try { S.user = await checkToken(token); } catch (err) { busy(false, 'Sign in'); signInPage(err.status === 401 ? 'The GitHub access has expired. Choose “Set up again” below.' : err.message); return; }
      remember(token, !!f.keep);
      enterApp();
    } else if (form.dataset.form === 'setup') {
      if (f.code !== f.again) { toast('The codes don’t match.', 'error'); return; }
      if (codeProblem(f.code)) { toast(codeProblem(f.code), 'error'); return; }
      busy(true, 'Setting up…');
      try {
        S.user = await checkToken(f.token.trim(), true);
        await commit([{ path: KEY_PATH, text: json(await lockToken(S.token, f.code)) }], 'Admin: set up the sign-in code');
      } catch (err) { busy(false, 'Set up'); S.token = ''; toast(err.message, 'error'); return; }
      remember(S.token, true);
      toast('All set. From now on, sign in with your code.');
      enterApp();
    }
  }

  function signOut() {
    forget();
    S.token = ''; S.user = null; GA.token = ''; keepGoogle(); ENQ.list = null;
    ['trips', 'photos', 'faqs', 'reviews', 'posts', 'settings', 'library'].forEach((k) => { S[k] = null; });
    S.dirty = false;
    location.hash = '';
    signInPage();
  }

  // ---------- Routing ----------

  const ROUTES = [
    [/^$/, overview], [/^enquiries$/, enquiriesList], [/^enquiries\/([\w-]+)$/, (m) => enquiryView(m[1])], [/^trips$/, tripsList], [/^trips\/new$/, () => tripEdit(null)], [/^trips\/([\w-]+)$/, (m) => tripEdit(m[1])],
    [/^articles$/, postsList], [/^articles\/new$/, () => postEdit(null)], [/^articles\/([\w-]+)$/, (m) => postEdit(m[1])],
    [/^photos$/, photosView], [/^faqs$/, faqsView], [/^reviews$/, reviewsView], [/^analytics$/, analyticsView], [/^settings$/, settingsView],
  ];
  let shown = location.hash, skipNext = false;

  async function route() {
    if (!S.token) return;
    if (skipNext) { skipNext = false; return; }
    if (S.dirty && !(await confirmBox('Leave without saving?', 'Your changes on this page will be lost.', { ok: 'Leave', danger: true }))) {
      skipNext = true;
      location.hash = shown;
      return;
    }
    S.dirty = false;
    shown = location.hash;
    const path = location.hash.replace(/^#\/?/, '');
    setNav(path);
    V = {};
    const r = ROUTES.find(([re]) => re.test(path));
    try {
      if (r) await r[1](path.match(r[0])); else await overview();
    } catch (err) {
      if (err.status === 401) { signInPage('The GitHub access has expired. Choose “Set up again” below.'); return; }
      page($('#title').textContent || 'Error', problem(err));
      V = { act: { retry: route } };
    }
  }

  function enterApp() {
    shell();
    refreshStatus();
    route();
  }

  // ---------- Events ----------

  document.addEventListener('click', async (e) => {
    const authBtn = e.target.closest('[data-auth]');
    if (authBtn) { if (authBtn.dataset.auth === 'reset') setupPage(true); else signInPage(); return; }
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const name = el.dataset.act;
    if (name === 'signout') { e.preventDefault(); signOut(); return; }
    if (name === 'more') { moreMenu(); return; }
    if (name === 'status') { statusDetails(); return; }
    if (name === 'gaConnect') {
      try { await gaConnect(); } catch (err) { toast(err.message, 'error'); return; }
      if (el.dataset.where === 'overview') { enqSummary(); gaSummary(); } else route();
      return;
    }
    if (name === 'range') { GA.range = +el.dataset.days; analyticsView(); return; }
    if (V.act && V.act[name]) { e.preventDefault(); V.act[name](el, e); }
  });

  const bind = (el) => {
    if (!V.draft || !el.dataset.bind) return;
    const value = el.type === 'checkbox' ? el.checked : el.type === 'number' || el.hasAttribute('data-number') ? (el.value === '' ? '' : Number(el.value)) : el.value;
    setPath(V.draft, el.dataset.bind, value);
    markDirty();
  };
  document.addEventListener('input', (e) => { if (e.target.dataset && e.target.dataset.bind) bind(e.target); });
  document.addEventListener('change', (e) => {
    if (e.target.dataset && e.target.dataset.bind) bind(e.target);
    if (e.target.dataset && e.target.dataset.actFile && V.file) V.file[e.target.dataset.actFile](e.target);
  });
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    if (['signin', 'setup'].includes(form.dataset.form)) onAuthForm(form); else onForm(form);
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- Start ----------

  (async function start() {
    if (!window.crypto || !crypto.subtle) {
      authPage('<p class="auth__text">This browser can’t open the admin. Please use an up-to-date Chrome, Safari or Edge.</p>');
      return;
    }
    let saved = '';
    try { saved = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; } catch (err) { /* no storage */ }
    if (MOCK && !new URLSearchParams(location.search).has('signin')) saved = saved || 'mock'; // ?mock&signin shows the sign-in pages
    if (saved) {
      try { S.user = await checkToken(saved); enterApp(); return; } catch (err) { forget(); }
    }
    authPage(loading());
    try {
      await readJson(KEY_PATH, { auth: false });
      signInPage();
    } catch (err) {
      if (err.status === 404) setupPage(); else signInPage(err.message);
    }
  })();
})();
