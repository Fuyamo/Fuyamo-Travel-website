/** @OnlyCurrentDoc  (the script may only open the spreadsheet it's attached to) */

// Fuyamo website enquiries.
//
// This runs in Google Apps Script, attached to the "Fuyamo website enquiries" Google Sheet in info@fuyamo.co.za's
// Drive. The website's forms post here: each one is saved as a row in the sheet, emailed to info@ (Reply goes straight
// to the customer) and, when Plunk is connected, passed to Plunk so its workflows can email the customer.
// The admin dashboard reads and updates the rows, signed in with a fuyamo.co.za Google account.
//
// To change it: edit this file in the project, paste it over Code.gs in the Apps Script editor, then
// Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy. The web address stays the same.
//
// Plunk is connected by adding the script property PLUNK_PUBLIC_KEY (Project Settings → Script properties): Plunk's
// public key (pk_…), the only key its event endpoint accepts. It stays here, not on the website, so nobody else can
// fire Fuyamo's events.
//
// Yamo (the "Send to Yamo" button in the admin) uses the script property YAMO_API_KEY: an Agency OS API key
// (yamo_sk_…, Agency OS → Settings → Integrations). It's secret, so it only ever lives here.

const NOTIFY = 'info@fuyamo.co.za';
const DOMAIN = 'fuyamo.co.za';
const SITE = 'https://fuyamo.co.za';
// The admin's Google sign-in (the same OAuth client as its analytics).
const CLIENT_ID = '27354709460-ah0aumamm32ficarg94evke0qd23qq23.apps.googleusercontent.com';
const PLUNK_API = 'https://next-api.useplunk.com';
const YAMO_API = 'https://api.yamo.travel/agency-api/v1';

const SHEET = 'Enquiries';
const COLUMNS = ['id', 'received', 'form', 'status', 'name', 'email', 'phone', 'subject', 'details', 'news', 'proposal', 'trip', 'notes', 'updated', 'updated_by', 'plunk', 'yamo', 'yamo_status'];
const HEADINGS = ['ID', 'Received', 'Form', 'Status', 'Name', 'Email', 'Phone', 'Subject', 'Details', 'Trip news', 'Proposal link', 'Trip', 'Notes', 'Updated', 'Updated by', 'Plunk', 'Yamo enquiry', 'Yamo status'];
const STATUSES = ['New', 'Proposal sent', 'Booked', 'Not going ahead'];
const FORMS = { corporate: 'Corporate enquiry', callback: 'Callback request', birthday: 'Birthday offer' };
// Plunk events sent when the status changes in the dashboard. Corporate enquiries get a PDF quote rather than a Yamo
// proposal, so "Proposal sent" is quote_sent for them (its own workflow and emails).
const STATUS_EVENTS = { 'Proposal sent': 'proposal_sent', Booked: 'booked', 'Not going ahead': 'not_going_ahead' };
// Partnerships and opportunities (a corporate form type) aren't quoted, so their status changes email nobody.
function statusEvent(row) {
  if (row.form === 'corporate') {
    let type = '';
    try { type = JSON.parse(row.details || '{}')['Enquiry type'] || ''; } catch (err) { /* no details */ }
    if (type === 'Partnerships') return '';
    if (row.status === 'Proposal sent') return 'quote_sent';
  }
  return STATUS_EVENTS[row.status];
}

// ---------- Web requests ----------

function doGet() {
  return ContentService.createTextOutput('Fuyamo enquiries is running.');
}

function doPost(e) {
  let body = {}, isJson = false;
  try {
    if (e.postData && e.postData.contents && /^\s*\{/.test(e.postData.contents)) { body = JSON.parse(e.postData.contents); isJson = true; }
    else body = e.parameter || {};
  } catch (err) {
    return reply({ ok: false, error: 'Unreadable request.' });
  }
  try {
    if (body.action) return reply(admin(body));
    const result = receive(body);
    if (isJson) return reply(result);
    // The enquiry form without JavaScript: a plain thank-you page with a way back.
    return HtmlService.createHtmlOutput('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<div style="font:16px/1.5 system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;text-align:center">'
      + (result.ok ? '<h1 style="font-size:24px">Thank you. We’ve got your enquiry.</h1><p>A consultant will reply by email within one working day.</p>'
        : '<h1 style="font-size:24px">That didn’t go through.</h1><p>' + esc(result.error) + '</p>')
      + '<p><a href="' + SITE + '/corporate/' + (result.ok ? '?sent=1#enquire' : '#enquire') + '" target="_top">Back to Fuyamo Travel</a></p></div>')
      .setTitle('Fuyamo Travel');
  } catch (err) {
    console.error(err);
    return reply({ ok: false, error: isJson ? 'Something went wrong. Please try again.' : String(err) });
  }
}

function reply(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- A form from the website ----------

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max || 2000);
const isEmail = (v) => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(v);

function receive(body) {
  // Bots fill in the hidden "_honey" field: say thanks and drop it.
  if (clean(body._honey)) return { ok: true };
  const keys = Object.keys(body);
  if (keys.length > 40 || JSON.stringify(body).length > 20000) return { ok: false, error: 'That message is too long.' };

  const form = FORMS[body._form] ? body._form : 'corporate';
  const name = clean(body.name, 120);
  const email = clean(body.email, 200).toLowerCase();
  const phone = clean(body.WhatsApp || body.whatsapp || body.Phone || body.phone, 40);
  if (!name) return { ok: false, error: 'Please add your name.' };
  if (email && !isEmail(email)) return { ok: false, error: 'Please check your email address.' };
  if (!email && !phone) return { ok: false, error: 'Please add an email address or a number.' };

  // Everything else the form sent, with readable labels ("Company / department": "…").
  const skip = ['name', 'email', 'whatsapp', 'phone', 'WhatsApp', 'Phone'];
  const details = {};
  keys.forEach((k) => { if (k.charAt(0) !== '_' && skip.indexOf(k) < 0 && clean(body[k])) details[clean(k, 60)] = clean(body[k]); });
  const subject = clean(body._subject, 150).replace(/[\r\n]+/g, ' ') || FORMS[form] + ': ' + name;
  const news = body._news === true || body._news === 'yes' || body._news === 'on';

  // A burst of submissions (a bot getting past the hidden field) stops after 30 in 10 minutes.
  const cache = CacheService.getScriptCache();
  const burst = +(cache.get('burst') || 0);
  if (burst >= 30) return { ok: false, error: 'Too many messages right now. Please try again in a few minutes, or WhatsApp us.' };
  cache.put('burst', String(burst + 1), 600);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let row, before;
  try {
    const sheet = enquirySheet();
    before = email ? rows(sheet).filter((r) => r.email === email) : [];
    row = {
      id: 'E' + Date.now().toString(36).toUpperCase() + ('0' + Math.floor(Math.random() * 1296).toString(36).toUpperCase()).slice(-2),
      received: new Date().toISOString(), form, status: 'New', name, email, phone, subject,
      details: JSON.stringify(details), news: news ? 'Yes' : '', proposal: '', trip: '', notes: '', updated: '', updated_by: '', plunk: '', yamo: '', yamo_status: '',
    };
    sheet.appendRow(COLUMNS.map((c) => safeCell(row[c])));
  } finally {
    lock.releaseLock();
  }

  // The row is saved, so the visitor gets their thank-you even if the email to info@ fails (it shows in the dashboard).
  try { notify(row, details); } catch (err) { console.error('Email to ' + NOTIFY + ' failed: ' + err); }

  // Plunk: at most one "enquiry_received" per address every 6 hours, so nobody can use the form to flood an inbox.
  if (email && plunkKey() && !cache.get('plunk:' + email)) {
    cache.put('plunk:' + email, '1', 21600);
    // New contacts only get trip news if they ticked the box; someone who said yes before keeps their choice.
    const saidYes = before.some((r) => r.news === 'Yes');
    const result = plunkTrack(email, 'enquiry_received', {
      name, first_name: name.split(' ')[0], enquiry_type: FORMS[form], enquiry_about: details['Enquiry type'] || details['About'] || details['Destination'] || '',
    }, news ? true : saidYes ? undefined : false);
    setCell(row.id, 'plunk', result);
  }
  return { ok: true, id: row.id };
}

// The email to info@: who it is and what they want at the top, one-tap buttons for the way they asked to be
// contacted (Reply goes straight to them too), then the rest of the details. Email-safe: tables and inline styles.
function notify(row, details) {
  const d = Object.assign({}, details);
  const first = row.name.split(' ')[0];
  const wa = row.phone ? 'https://wa.me/' + row.phone.replace(/[^\d]/g, '') : '';
  const partner = row.form === 'corporate' && d['Enquiry type'] === 'Partnerships';
  const wantsWhatsApp = /whatsapp/i.test(d['Reply by'] || '') || (!row.email && !!wa);

  // The headline: what kind of enquiry, and one line about what they want.
  const kind = partner ? 'Partnership enquiry' : row.form === 'corporate' ? 'Corporate enquiry'
    : row.form === 'birthday' ? 'Birthday offer' : wantsWhatsApp ? 'Callback request · WhatsApp' : 'Callback request · email';
  const about = row.form === 'corporate'
    ? [d['Company / department'], partner ? '' : d['Enquiry type']].filter(Boolean).join(' · ')
    : row.form === 'birthday' ? (d['Birthday month'] ? 'Birthday in ' + d['Birthday month'] : '')
    : d['About'] || d['Destination'] || '';
  const used = ['Start the chat', 'Reply by', 'Asked from', 'Message', 'WhatsApp'];
  if (d['Destination'] && about.toLowerCase().indexOf(String(d['Destination']).toLowerCase()) >= 0) used.push('Destination'); // already in the headline
  if (row.form === 'corporate') used.push('Company / department', 'Enquiry type');
  else if (row.form === 'birthday') used.push('Birthday month');
  else used.push('About');

  // Where they were on the site: "Home page", "Bali", "Corporate"…
  const from = String(d['Asked from'] || '');
  const fromUrl = (from.match(/https?:\/\/\S+/) || [''])[0];
  let fromName = from.replace(fromUrl, '').replace(/\s*·\s*$/, '').split(' · ')[0].trim();
  if (/^https?:\/\/[^/]+\/?$/.test(fromUrl) || /^Fuyamo Travel$/.test(fromName)) fromName = 'the home page';
  if (!fromName && row.form === 'corporate') fromName = 'the corporate page';

  const when = Utilities.formatDate(new Date(row.received), 'Africa/Johannesburg', 'd MMM yyyy, HH:mm');
  const button = (href, label, primary) => '<a href="' + esc(href) + '" style="display:inline-block;margin:0 8px 8px 0;padding:12px 20px;border-radius:999px;'
    + (primary ? 'background:#FFBE41;color:#111111;' : 'background:#ffffff;color:#111111;border:1px solid #D9D4CB;')
    + 'font:bold 15px/1 Arial,sans-serif;text-decoration:none">' + label + '</a>';
  const mail = row.email ? 'mailto:' + row.email + '?subject=' + encodeURIComponent('Re: ' + row.subject) : '';
  // Corporate forms ask for a phone number (not necessarily WhatsApp): that one gets a Call button.
  const phoneOnly = row.form === 'corporate';
  const buttons = [
    wantsWhatsApp && wa && !phoneOnly ? button(wa, 'WhatsApp ' + esc(first), true) : '',
    mail ? button(mail, 'Email ' + esc(first), !wantsWhatsApp || !wa || phoneOnly) : '',
    row.phone && phoneOnly ? button('tel:' + row.phone.replace(/[^\d+]/g, ''), 'Call', false) : '',
    !wantsWhatsApp && wa && !phoneOnly ? button(wa, 'WhatsApp', false) : '',
    button(SITE + '/admin/#/enquiries/' + row.id, 'Open in the admin', false),
  ].join('');

  const rows = [];
  if (row.email) rows.push(['Email', '<a href="mailto:' + esc(row.email) + '" style="color:#111111">' + esc(row.email) + '</a>']);
  if (row.phone) rows.push([phoneOnly ? 'Phone' : 'WhatsApp', esc(row.phone)]);
  Object.keys(d).forEach((k) => { if (used.indexOf(k) < 0 && d[k]) rows.push([esc(k), esc(d[k]).replace(/\n/g, '<br>')]); });
  const detail = rows.map((r) => '<tr><td style="padding:10px 0;border-top:1px solid #EEEAE3;width:38%;vertical-align:top;font:12px/1.4 Arial,sans-serif;color:#7A756C;text-transform:uppercase;letter-spacing:.06em">' + r[0]
    + '</td><td style="padding:10px 0;border-top:1px solid #EEEAE3;vertical-align:top;font:15px/1.45 Arial,sans-serif;color:#111111">' + r[1] + '</td></tr>').join('');
  const message = d['Message'] ? '<tr><td style="padding:0 28px 8px"><div style="padding:14px 16px;border-radius:12px;background:#F4F2ED;font:15px/1.5 Arial,sans-serif;color:#111111">'
    + '&ldquo;' + esc(d['Message']).replace(/\n/g, '<br>') + '&rdquo;</div></td></tr>' : '';
  const notes = [
    fromName ? 'Sent from ' + (fromUrl ? '<a href="' + esc(fromUrl) + '" style="color:#7A756C">' + esc(fromName) + '</a>' : esc(fromName)) : '',
    row.news ? 'wants trip news by email' : '',
  ].filter(Boolean).join(' · ');

  const html = '<div style="margin:0;padding:24px 12px;background:#F4F2ED">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;border-collapse:separate">'
    + '<tr><td style="padding:26px 28px 6px;font:12px/1.4 Arial,sans-serif;color:#7A756C;text-transform:uppercase;letter-spacing:.08em">' + esc(kind) + ' · ' + esc(when) + '</td></tr>'
    + '<tr><td style="padding:0 28px;font:bold 26px/1.2 Arial,sans-serif;color:#111111">' + esc(row.name) + '</td></tr>'
    + (about ? '<tr><td style="padding:4px 28px 0;font:17px/1.4 Arial,sans-serif;color:#3D3A35">' + esc(about) + '</td></tr>' : '')
    + '<tr><td style="padding:18px 28px 10px">' + buttons + '</td></tr>'
    + message
    + (detail ? '<tr><td style="padding:6px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + detail + '</table></td></tr>' : '')
    + '<tr><td style="padding:14px 28px 24px;font:13px/1.5 Arial,sans-serif;color:#7A756C">' + (notes ? notes + '.<br>' : '') + (row.email ? 'Reply to this email to answer ' + esc(first) + ' directly.' : esc(first) + ' left a WhatsApp number only, so reply on WhatsApp.') + '</td></tr>'
    + '</table></div>';
  const mailMessage = { to: NOTIFY, subject: row.subject, htmlBody: html, name: 'Fuyamo website' };
  if (row.email) mailMessage.replyTo = row.email;
  MailApp.sendEmail(mailMessage);
}

// ---------- The admin dashboard ----------

function admin(body) {
  const who = signedIn(body.token);
  if (!who) return { ok: false, error: 'Please sign in with your fuyamo.co.za Google account again.', auth: true };

  if (body.action === 'list') {
    const list = rows(enquirySheet()).reverse();
    return { ok: true, enquiries: list.slice(0, 1000), plunk: !!plunkKey(), yamo: !!yamoKey() };
  }

  if (body.action === 'update') {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    let row, changed, resendOnly;
    try {
      const sheet = enquirySheet(), all = rows(sheet), i = all.findIndex((r) => r.id === body.id);
      if (i < 0) return { ok: false, error: 'That enquiry wasn’t found.' };
      row = all[i];
      const status = STATUSES.indexOf(body.status) >= 0 ? body.status : row.status;
      // "Send again" on a proposal that's already out only emails it again: the reminders already running carry on,
      // so nobody gets two sets of them.
      resendOnly = body.resend === true && row.status === 'Proposal sent' && status === 'Proposal sent';
      changed = status !== row.status || resendOnly;
      row.status = status;
      if (body.proposal !== undefined) row.proposal = clean(body.proposal, 500);
      if (row.proposal && !/^https:\/\//.test(row.proposal)) return { ok: false, error: 'The proposal link should start with https://' };
      if (body.trip !== undefined) row.trip = clean(body.trip, 120);
      if (body.notes !== undefined) row.notes = clean(body.notes, 5000);
      row.updated = new Date().toISOString();
      row.updated_by = who;
      sheet.getRange(i + 2, 1, 1, COLUMNS.length).setValues([COLUMNS.map((c) => safeCell(row[c]))]);
    } finally {
      lock.releaseLock();
    }
    // Moving to Proposal sent, Booked or Not going ahead tells Plunk, so its workflows email the customer.
    // An enquiry that's with Yamo had its proposal emailed by Yamo, so "Proposal sent" only starts Plunk's reminders.
    const event = resendOnly ? (row.form === 'corporate' ? 'quote_resent' : 'proposal_resent')
      : row.yamo && row.status === 'Proposal sent' ? 'yamo_proposal_sent' : statusEvent(row);
    const plunk = changed && event ? tellPlunk(row, event) : '';
    return { ok: true, enquiry: row, plunk };
  }

  // Send the enquiry to Yamo's Agency OS (Tailored → Requests), to build and send the proposal there.
  if (body.action === 'yamo_send') {
    if (!yamoKey()) return { ok: false, error: 'Yamo isn’t connected yet. Add YAMO_API_KEY under Project Settings → Script properties.' };
    const row = rows(enquirySheet()).find((r) => r.id === body.id);
    if (!row) return { ok: false, error: 'That enquiry wasn’t found.' };
    const f = body.fields || {};
    const party = Math.round(+f.partySize);
    const payload = { fullName: row.name.slice(0, 120), destination: clean(f.destination, 200), partySize: party, externalRef: row.id };
    if (payload.fullName.length < 2) return { ok: false, error: 'Yamo needs a name of at least 2 letters.' };
    if (!payload.destination) return { ok: false, error: 'Add where they want to go.' };
    if (!(party >= 1 && party <= 20)) return { ok: false, error: 'Yamo takes 1 to 20 travellers per enquiry.' };
    if (row.email) payload.email = row.email;
    const phone = intlPhone(row.phone);
    if (phone) payload.phone = phone;
    if (!payload.email && !payload.phone) return { ok: false, error: 'Yamo needs an email address or a phone number with its country code.' };
    if (clean(f.dates)) payload.datesLabel = clean(f.dates, 120);
    if (+f.budget > 0) payload.budgetCents = Math.round(+f.budget * 100);
    const chips = (Array.isArray(f.chips) ? f.chips : []).map((c) => clean(c, 40)).filter(Boolean).slice(0, 12);
    if (chips.length) payload.preferenceChips = chips;
    if (clean(f.brief)) payload.brief = clean(f.brief, 2000);
    const res = yamoCall('post', '/enquiries', payload);
    if (!res.ok) return res;
    setCell(row.id, 'yamo', res.enquiry.id);
    setCell(row.id, 'yamo_status', res.enquiry.status || 'new');
    return { ok: true, yamo: res.enquiry };
  }

  // Where the enquiry is on Yamo (being built, proposal sent, accepted, booked…), and the enquiry brought up to date.
  if (body.action === 'yamo_status') {
    if (!yamoKey()) return { ok: false, error: 'Yamo isn’t connected yet.' };
    const row = rows(enquirySheet()).find((r) => r.id === body.id);
    if (!row || !row.yamo) return { ok: false, error: 'This enquiry hasn’t been sent to Yamo.' };
    const res = yamoCall('get', '/enquiries/' + encodeURIComponent(row.yamo));
    if (!res.ok) return res;
    const changed = applyYamo(row, res.enquiry);
    return { ok: true, yamo: res.enquiry, enquiry: row, changed: !!changed };
  }

  // Settings: is the Yamo key working, and for which agency?
  if (body.action === 'yamo_ping') {
    if (!yamoKey()) return { ok: false, error: 'Yamo isn’t connected yet. Add YAMO_API_KEY under Project Settings → Script properties.' };
    const res = yamoCall('get', '/ping');
    const a = res.ok ? res.raw.agency || res.raw.data || res.raw : {};
    return res.ok ? { ok: true, agency: String(a.name || a.slug || res.raw.name || res.raw.slug || 'your agency') } : res;
  }

  return { ok: false, error: 'Unknown request.' };
}

// Tells Plunk about a status change (its workflows email the customer). proposal_status stays on the contact, so the
// follow-up workflows can check it before each reminder. Returns the note for the sheet's Plunk column.
function tellPlunk(row, event) {
  if (!row.email || !plunkKey()) return '';
  let company = '';
  try { company = JSON.parse(row.details || '{}')['Company / department'] || ''; } catch (err) { /* no details */ }
  const plunk = plunkTrack(row.email, event, {
    name: row.name, first_name: row.name.split(' ')[0], proposal_link: row.proposal, trip: row.trip, proposal_status: row.status, company,
  }, undefined, row.id + ':' + event + ':' + row.updated);
  setCell(row.id, 'plunk', plunk);
  row.plunk = plunk;
  return plunk;
}

function writeRow(row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = enquirySheet(), i = rows(sheet).findIndex((r) => r.id === row.id);
    if (i >= 0) sheet.getRange(i + 2, 1, 1, COLUMNS.length).setValues([COLUMNS.map((c) => safeCell(row[c]))]);
  } finally {
    lock.releaseLock();
  }
}

// ---------- Yamo ----------

// Brings an open enquiry up to date with Yamo, so the customer only ever hears from one place:
// - Yamo emailed the proposal → "Proposal sent", and Plunk starts the reminders only (yamo_proposal_sent).
// - They booked → "Booked"; they declined or it was closed → "Not going ahead" (either stops the reminders).
// Returns the new status, or '' when nothing changed.
// Yamo's own status is kept in the "Yamo status" column (new, building, sent, opened, changes, accepted, declined,
// booked), so the admin's list shows where each request is on Yamo. "opened" is Yamo's "sent" once the client has
// opened the proposal (Yamo records when).
function applyYamo(row, y) {
  if (!y) return '';
  const opened = y.status === 'sent' && y.proposal && y.proposal.openedAt;
  const yamoStatus = y.bookingId ? 'booked' : opened ? 'opened' : String(y.status || '');
  let dirty = yamoStatus !== row.yamo_status;
  row.yamo_status = yamoStatus;
  let status = row.status, event = '';
  if (row.status === 'New' || row.status === 'Proposal sent') {
    if (y.bookingId) { status = 'Booked'; event = 'booked'; }
    else if (y.status === 'declined' || y.closed) { status = 'Not going ahead'; event = 'not_going_ahead'; }
    else if (row.status === 'New' && (y.proposal || ['sent', 'changes', 'accepted'].indexOf(y.status) >= 0)) { status = 'Proposal sent'; event = 'yamo_proposal_sent'; }
  }
  if (status !== row.status) {
    row.status = status;
    const url = y.proposal && y.proposal.url ? String(y.proposal.url) : '';
    if (url && !row.proposal) row.proposal = /^https:\/\//.test(url) ? url : 'https://' + url.replace(/^\/+|^http:\/\//, '');
    row.updated = new Date().toISOString();
    row.updated_by = 'Yamo';
    dirty = true;
  }
  if (dirty) writeRow(row);
  if (event) tellPlunk(row, event);
  return event ? status : '';
}

// Runs every hour (Apps Script → Triggers): checks each open enquiry that was sent to Yamo, so reminders stop as soon
// as someone books, even if nobody opens the admin.
function syncYamo() {
  if (!yamoKey()) return;
  rows(enquirySheet()).filter((r) => r.yamo && (r.status === 'New' || r.status === 'Proposal sent')).slice(0, 100).forEach((row) => {
    const res = yamoCall('get', '/enquiries/' + encodeURIComponent(row.yamo));
    const changed = res.ok ? applyYamo(row, res.enquiry) : '';
    if (changed) console.log(row.id + ' → ' + changed);
    else if (!res.ok) console.error(row.id + ': ' + res.error);
  });
}

function yamoKey() {
  return PropertiesService.getScriptProperties().getProperty('YAMO_API_KEY') || '';
}

// Calls Yamo's Agency API. Returns { ok: true, enquiry } (only the parts the admin shows) or { ok: false, error }.
function yamoCall(method, path, payload) {
  const options = { method, headers: { Authorization: 'Bearer ' + yamoKey() }, muteHttpExceptions: true };
  if (payload) { options.contentType = 'application/json'; options.payload = JSON.stringify(payload); }
  let res;
  try { res = UrlFetchApp.fetch(YAMO_API + path, options); } catch (err) { return { ok: false, error: 'Couldn’t reach Yamo. Try again in a minute.' }; }
  const code = res.getResponseCode();
  let data = {};
  try { data = JSON.parse(res.getContentText()); } catch (err) { /* not JSON */ }
  if (code >= 200 && code < 300) {
    const e = data.enquiry || data, p = e.proposal;
    return { ok: true, raw: data, enquiry: {
      id: e.id, status: e.status, closed: !!e.closed, tripId: e.tripId || '', bookingId: e.bookingId || '', updatedAt: e.updatedAt || '',
      proposal: p ? { url: p.url || '', sentAt: p.sentAt || '', openedAt: p.openedAt || '' } : null,
    } };
  }
  const messages = {
    401: 'Yamo didn’t accept the API key. It may be mistyped or revoked: check YAMO_API_KEY.',
    403: 'Yamo refused: your plan may not include tailored trips (Growth plan and up), or the agency is suspended.',
    404: 'Yamo doesn’t have this enquiry.',
    429: 'Yamo is busy. Try again in a minute.',
  };
  return { ok: false, error: messages[code] || 'Yamo said: ' + String(data.message || 'error ' + code).slice(0, 200) };
}

// "072 123 4567", "+27 72 123 4567" or "0027…" become "+27721234567", so Yamo can use WhatsApp.
function intlPhone(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('00')) d = '+' + d.slice(2);
  if (d.startsWith('+')) return /^\+\d{8,15}$/.test(d) ? d : '';
  if (d.startsWith('27') && d.length === 11) return '+' + d;
  if (d.startsWith('0') && d.length === 10) return '+27' + d.slice(1);
  return /^\d{9}$/.test(d) ? '+27' + d : '';
}

// The dashboard sends its Google access token. Google confirms who it belongs to; only fuyamo.co.za accounts,
// signed in through the admin's own Google client, are let in. Checked tokens are remembered for 5 minutes.
function signedIn(token) {
  if (!token || typeof token !== 'string' || token.length > 4096) return '';
  const cache = CacheService.getScriptCache();
  const key = 'tok:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  const known = cache.get(key);
  if (known) return known;
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo', { method: 'post', payload: { access_token: token }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return '';
  const info = JSON.parse(res.getContentText());
  const email = String(info.email || '').toLowerCase();
  const ok = (info.aud === CLIENT_ID || info.azp === CLIENT_ID) && String(info.email_verified) === 'true'
    && email.slice(-(DOMAIN.length + 1)) === '@' + DOMAIN && +info.expires_in > 0;
  if (!ok) return '';
  cache.put(key, email, Math.min(300, +info.expires_in));
  return email;
}

// ---------- Plunk ----------

function plunkKey() {
  return PropertiesService.getScriptProperties().getProperty('PLUNK_PUBLIC_KEY') || '';
}

// Tracks an event for a contact. Returns a short note for the sheet: "enquiry_received ✓" or what went wrong.
function plunkTrack(email, event, data, subscribed, idempotency) {
  const body = { email, event, data: {} };
  Object.keys(data).forEach((k) => { if (data[k]) body.data[k] = data[k]; });
  if (subscribed !== undefined) body.subscribed = subscribed;
  const headers = { Authorization: 'Bearer ' + plunkKey() };
  if (idempotency) headers['Idempotency-Key'] = idempotency.slice(0, 200);
  try {
    const res = UrlFetchApp.fetch(PLUNK_API + '/v1/track', {
      method: 'post', contentType: 'application/json', headers, payload: JSON.stringify(body), muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code >= 200 && code < 300) return event + ' ✓';
    if (code === 409) return event + ' ✓ (already sent)';
    let message = 'HTTP ' + code;
    try { const r = JSON.parse(res.getContentText()); message = (r.error && (r.error.message || r.error)) || r.message || message; } catch (err) { /* not JSON */ }
    return event + ' ✗ ' + String(message).slice(0, 150);
  } catch (err) {
    return event + ' ✗ ' + String(err).slice(0, 150);
  }
}

// ---------- The sheet ----------

// Run this once from the editor (Run → setup): it creates the Enquiries tab and asks for the permissions the script needs.
function setup() {
  enquirySheet();
  console.log('Ready. Plunk is ' + (plunkKey() ? 'connected.' : 'not connected yet (add PLUNK_PUBLIC_KEY under Project Settings → Script properties).'));
}

function enquirySheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(SHEET);
  if (!sheet) {
    sheet = book.getSheets().length === 1 && book.getSheets()[0].getLastRow() === 0 ? book.getSheets()[0].setName(SHEET) : book.insertSheet(SHEET);
    sheet.getRange(1, 1, 1, HEADINGS.length).setValues([HEADINGS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Plain text throughout, so dates, numbers and "+27…" stay exactly as sent.
    sheet.getRange(1, 1, sheet.getMaxRows(), COLUMNS.length).setNumberFormat('@');
  } else if (sheet.getRange(1, COLUMNS.length).getValue() !== HEADINGS[COLUMNS.length - 1]) {
    // A column added since the sheet was made (e.g. "Yamo enquiry"): add its heading and plain-text format.
    sheet.getRange(1, 1, 1, HEADINGS.length).setValues([HEADINGS]).setFontWeight('bold');
    sheet.getRange(1, 1, sheet.getMaxRows(), COLUMNS.length).setNumberFormat('@');
  }
  return sheet;
}

function rows(sheet) {
  const n = sheet.getLastRow() - 1;
  if (n < 1) return [];
  return sheet.getRange(2, 1, n, COLUMNS.length).getDisplayValues().map((r) => {
    const o = {};
    COLUMNS.forEach((c, i) => { o[c] = r[i]; });
    return o;
  }).filter((r) => r.id);
}

function setCell(id, column, value) {
  const sheet = enquirySheet(), ids = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), 1).getValues();
  const i = ids.findIndex((r) => r[0] === id);
  if (i >= 0) sheet.getRange(i + 2, COLUMNS.indexOf(column) + 1).setValue(safeCell(value));
}

// Text that starts like a formula (=, +, -, @) is stored as plain text, never run by the sheet.
function safeCell(v) {
  const s = v == null ? '' : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
