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
// Plunk is connected by adding the script property PLUNK_SECRET_KEY (Project Settings → Script properties).
// The key never appears in this file or on the website.

const NOTIFY = 'info@fuyamo.co.za';
const DOMAIN = 'fuyamo.co.za';
const SITE = 'https://fuyamo.co.za';
// The admin's Google sign-in (the same OAuth client as its analytics).
const CLIENT_ID = '27354709460-ah0aumamm32ficarg94evke0qd23qq23.apps.googleusercontent.com';
const PLUNK_API = 'https://next-api.useplunk.com';

const SHEET = 'Enquiries';
const COLUMNS = ['id', 'received', 'form', 'status', 'name', 'email', 'phone', 'subject', 'details', 'news', 'proposal', 'trip', 'notes', 'updated', 'updated_by', 'plunk'];
const HEADINGS = ['ID', 'Received', 'Form', 'Status', 'Name', 'Email', 'Phone', 'Subject', 'Details', 'Trip news', 'Proposal link', 'Trip', 'Notes', 'Updated', 'Updated by', 'Plunk'];
const STATUSES = ['New', 'Proposal sent', 'Booked', 'Not going ahead'];
const FORMS = { corporate: 'Corporate enquiry', callback: 'Callback request', birthday: 'Birthday offer' };
// Plunk events sent when the status changes in the dashboard.
const STATUS_EVENTS = { 'Proposal sent': 'proposal_sent', Booked: 'booked', 'Not going ahead': 'not_going_ahead' };

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
      details: JSON.stringify(details), news: news ? 'Yes' : '', proposal: '', trip: '', notes: '', updated: '', updated_by: '', plunk: '',
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

// The email to info@: the details in a table, a WhatsApp link for numbers, and Reply goes to the customer.
function notify(row, details) {
  const wa = row.phone ? 'https://wa.me/' + row.phone.replace(/[^\d]/g, '') : '';
  const lines = [['Name', esc(row.name)]];
  if (row.email) lines.push(['Email', '<a href="mailto:' + esc(row.email) + '">' + esc(row.email) + '</a>']);
  if (row.phone) lines.push(['Phone', esc(row.phone) + (wa ? ' · <a href="' + esc(wa) + '">WhatsApp them</a>' : '')]);
  Object.keys(details).forEach((k) => { if (k !== 'Start the chat') lines.push([esc(k), esc(details[k]).replace(/\n/g, '<br>')]); });
  if (row.news) lines.push(['Trip news', 'Yes, they asked for trip news by email']);
  const html = '<div style="font:15px/1.5 Arial,sans-serif;color:#111">'
    + '<p style="margin:0 0 12px"><strong>' + esc(FORMS[row.form]) + '</strong> from the website.</p>'
    + '<table cellpadding="8" style="border-collapse:collapse;border:1px solid #e5e5e5">'
    + lines.map((l) => '<tr><td style="border:1px solid #e5e5e5;background:#fafafa;vertical-align:top;white-space:nowrap"><strong>' + l[0] + '</strong></td><td style="border:1px solid #e5e5e5">' + l[1] + '</td></tr>').join('')
    + '</table><p style="margin:16px 0 0"><a href="' + SITE + '/admin/#/enquiries/' + row.id + '">Open it in the Fuyamo admin</a></p></div>';
  const message = { to: NOTIFY, subject: row.subject, htmlBody: html, name: 'Fuyamo website' };
  if (row.email) message.replyTo = row.email;
  MailApp.sendEmail(message);
}

// ---------- The admin dashboard ----------

function admin(body) {
  const who = signedIn(body.token);
  if (!who) return { ok: false, error: 'Please sign in with your fuyamo.co.za Google account again.', auth: true };

  if (body.action === 'list') {
    const list = rows(enquirySheet()).reverse();
    return { ok: true, enquiries: list.slice(0, 1000), plunk: !!plunkKey() };
  }

  if (body.action === 'update') {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    let row, changed;
    try {
      const sheet = enquirySheet(), all = rows(sheet), i = all.findIndex((r) => r.id === body.id);
      if (i < 0) return { ok: false, error: 'That enquiry wasn’t found.' };
      row = all[i];
      const status = STATUSES.indexOf(body.status) >= 0 ? body.status : row.status;
      changed = status !== row.status || (body.resend === true && status === 'Proposal sent');
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
    let plunk = '';
    if (changed && STATUS_EVENTS[row.status] && row.email && plunkKey()) {
      plunk = plunkTrack(row.email, STATUS_EVENTS[row.status], {
        name: row.name, first_name: row.name.split(' ')[0], proposal_link: row.proposal, trip: row.trip,
      }, undefined, row.id + ':' + STATUS_EVENTS[row.status] + ':' + row.updated);
      setCell(row.id, 'plunk', plunk);
      row.plunk = plunk;
    }
    return { ok: true, enquiry: row, plunk };
  }

  return { ok: false, error: 'Unknown request.' };
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
  return PropertiesService.getScriptProperties().getProperty('PLUNK_SECRET_KEY') || '';
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
  console.log('Ready. Plunk is ' + (plunkKey() ? 'connected.' : 'not connected yet (add PLUNK_SECRET_KEY under Project Settings → Script properties).'));
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
