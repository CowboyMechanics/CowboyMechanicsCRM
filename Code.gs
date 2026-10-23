/**
 * Cowboy Mechanics CRM
 *
 * A Google Apps Script web app. All CRM data lives in a Google Sheet named
 * "Cowboy Mechanics - CRM" that this script creates the first time it runs.
 * Website form requests are copied in from the "Cowboy Mechanics - Form Submissions"
 * sheet, which this script only reads and never changes.
 *
 * Russell's phone talks to the CRM in two ways (setup steps are in README.md):
 *  - MacroDroid (free Android app) emails missed calls and texts to this Gmail account,
 *    and its "log last call" shortcut opens the CRM with the caller's number filled in.
 *  - ntfy (free Android app) shows alerts the CRM sends: new website requests and call-back reminders.
 */

// The sheet the website form logs to (read only).
const FORM_SHEET_ID = '1YqgMHve_aPwz1fnH6CvGKrmwMs2-FRGnjz5bNi9UIfk';
const FORM_TAB = 'Submissions';
const TZ = 'America/Los_Angeles';
const PHOTO_FOLDER = 'Cowboy Mechanics CRM Photos';

// Each tab in the CRM sheet: field key -> column header. Order = column order.
const TABLES = {
  Clients: {
    id: 'ID', created: 'Added', firstName: 'First name', lastName: 'Last name', phone: 'Phone',
    email: 'Email', address: 'Address', vehicles: 'Vehicles', source: 'How they found you',
    notes: 'Notes', okText: 'OK to text', okEmail: 'OK to email'
  },
  // Calls, missed calls, texts and website requests Russell still has to get back to.
  Calls: {
    id: 'ID', created: 'Received', clientId: 'Client ID', phone: 'Phone', name: 'Name', vehicle: 'Vehicle',
    reason: 'Reason', source: 'How they reached out', requestedDay: 'Day they asked for', status: 'Status',
    remind1h: 'Remind in 1 hour', remind3h: 'Remind in 3 hours', remindHourly: 'Remind every hour',
    lastReminded: 'Last reminded', closed: 'Checked off'
  },
  Appointments: {
    id: 'ID', clientId: 'Client ID', start: 'Start', end: 'End', reason: 'Reason', vehicle: 'Vehicle',
    location: 'Location', notes: 'Notes', status: 'Status', calendarEventId: 'Calendar event ID',
    reminderSent: 'Reminder sent'
  },
  // Each time Russell works on a car.
  Visits: {
    id: 'ID', clientId: 'Client ID', date: 'Date', vehicle: 'Vehicle', reason: 'Reason', work: 'Services done',
    products: 'Products used', charged: 'Charged', notes: 'Notes', followUpOn: 'Follow up on',
    followUpNote: 'Follow-up note', followUpDone: 'Follow-up done', thankYouSent: 'Thank-you sent'
  },
  Photos: { id: 'ID', clientId: 'Client ID', created: 'Added', fileId: 'Drive file ID', caption: 'Caption', thumb: 'Thumbnail' },
  History: { id: 'ID', clientId: 'Client ID', date: 'Date', type: 'Type', summary: 'Summary' },
  Marketing: { id: 'ID', created: 'Added', text: 'To do', done: 'Done', doneAt: 'Done on' },
  // Texts the CRM wrote for Russell to send from his own phone with one tap.
  Outbox: {
    id: 'ID', clientId: 'Client ID', created: 'Created', kind: 'Kind', phone: 'Phone',
    body: 'Message', status: 'Status', expires: 'Expires', sentAt: 'Sent'
  },
  Imported: { id: 'Form row key', imported: 'Imported' }
};

const DATE_FIELDS = ['created', 'start', 'end', 'reminderSent', 'date', 'followUpOn', 'thankYouSent',
  'lastReminded', 'closed', 'doneAt', 'expires', 'sentAt', 'imported'];
const BOOL_FIELDS = ['okText', 'okEmail', 'remind1h', 'remind3h', 'remindHourly', 'followUpDone', 'done'];
const ID_PREFIX = { Clients: 'C', Calls: 'K', Appointments: 'A', Visits: 'V', Photos: 'P', History: 'H', Marketing: 'M', Outbox: 'T' };

const DEFAULT_SETTINGS = {
  businessName: 'Cowboy Mechanics',
  businessPhone: '(702) 241-1227',
  ownerEmail: '',
  calendarId: '',
  reviewLink: '',
  ntfyTopic: '',
  phoneCode: '',
  quietStart: 21,
  quietEnd: 7,
  autoRemind1h: true,
  autoRemindHourly: true,
  sendEmail: true,
  sendSms: true,
  autoReminders: true,
  reminderHours: 24,
  autoThankYou: true,
  thankYouDays: 3,
  dailyDigest: true,
  autoReplyText: 'Hey, this is Russell with Cowboy Mechanics. I\'m under a car right now and will get back to you as soon as I can. Feel free to text me your vehicle\'s year, make and model and what\'s going on with it.',

  reminderSubject: 'Reminder: your {business} appointment on {date}',
  reminderBody: 'Hi {firstName},\n\nJust a reminder that {business} is scheduled to work on your {vehicle} on {date} at {time}.\nLocation: {location}\n\nNeed to reschedule? Call or text {phone}.\n\nThanks,\n{business}',
  reminderSms: 'Hi {firstName}, reminder from {business}: we are scheduled for {date} at {time}. Need to reschedule? Call/text {phone}.',

  thankYouSubject: 'Thanks for choosing {business}',
  thankYouBody: 'Hi {firstName},\n\nThanks for trusting us with your {vehicle}. How is it running? If anything feels off, just reply or call {phone}.\n\nIf you were happy with the work, a quick review helps a small business a lot: {reviewLink}\n\nThanks,\nRussell\n{business}',
  thankYouSms: 'Hi {firstName}, thanks for choosing {business}! How is your {vehicle} running? Any issues, call/text {phone}. Reviews help a ton: {reviewLink}'
};

const KIND_LABEL = { reminder: 'Appointment reminder', thankYou: 'Thank-you' };

/* ---------------------------------------------------------------- web app */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Cowboy Mechanics CRM')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setFaviconUrl('https://cowboy-mechanics.com/favicon-32.png');
}

/** Run this once from the Apps Script editor. Creates the CRM sheet, codes and automatic triggers. */
function setup() {
  crmSpreadsheet_();
  Object.keys(TABLES).forEach(sheet_);
  const s = settings_();
  if (!s.ntfyTopic) s.ntfyTopic = 'cowboy-crm-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  if (!s.phoneCode) s.phoneCode = Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  saveSettings_(s);
  installAutomations();
  Logger.log('CRM sheet: ' + crmSpreadsheet_().getUrl());
  Logger.log('Alert topic for the ntfy app: ' + s.ntfyTopic);
  Logger.log('Phone code for MacroDroid: ' + s.phoneCode);
}

/* --------------------------------------------------- functions the page calls */

function getData(sync) {
  let syncError = '';
  if (sync) {
    try { syncFormLeads(); } catch (e) { syncError = String(e.message || e); }
    try { syncPhoneInbox(); } catch (e) { syncError = syncError || String(e.message || e); }
  }
  const data = readAll_();
  data.syncError = syncError;
  return data;
}

function saveClient(rec) {
  return withLock_(() => {
    if (!rec.firstName && !rec.lastName) throw new Error('Add their name');
    if (!digits_(rec.phone)) throw new Error('Add their phone number');
    if (!rec.id) {
      const dupe = matchClient_(readTable_('Clients'), rec.phone, rec.email);
      if (dupe) throw new Error(fullName_(dupe) + ' already has that phone number or email.');
      rec.created = now_();
      if (!rec.source) rec.source = 'Added by hand';
      if (rec.okText === undefined) rec.okText = true;
      if (rec.okEmail === undefined) rec.okEmail = true;
    }
    saveRecord_('Clients', rec);
    const data = readAll_();
    data.savedId = rec.id;
    return data;
  });
}

function deleteClient(id) {
  return withLock_(() => {
    readTable_('Appointments').filter(a => a.clientId === id).forEach(a => {
      deleteCalendarEvent_(a.calendarEventId);
      deleteRecord_('Appointments', a.id);
    });
    readTable_('Photos').filter(p => p.clientId === id).forEach(p => {
      try { DriveApp.getFileById(p.fileId).setTrashed(true); } catch (e) { /* already gone */ }
      deleteRecord_('Photos', p.id);
    });
    ['Visits', 'History', 'Outbox', 'Calls'].forEach(t =>
      readTable_(t).filter(r => r.clientId === id).forEach(r => deleteRecord_(t, r.id)));
    deleteRecord_('Clients', id);
    return readAll_();
  });
}

/**
 * Logs a call Russell just took (or one that came in on its own).
 * If that number already has an open call, it is updated instead of added twice.
 */
function logCall(rec) {
  return withLock_(() => {
    const call = upsertCall_(Object.assign({ source: 'Call' }, rec));
    // A call Russell typed in with a name goes straight into his clients.
    if (!call.clientId && call.name && digits_(call.phone)) {
      const parts = String(call.name).trim().split(/\s+/);
      const c = { created: now_(), firstName: parts.shift(), lastName: parts.join(' '), phone: call.phone,
        vehicles: call.vehicle || '', source: 'Phone call', okText: true, okEmail: true };
      saveRecord_('Clients', c);
      call.clientId = c.id;
      saveRecord_('Calls', call);
    }
    if (call.clientId) logHistory_(call.clientId, call.source, call.reason || 'Called');
    return readAll_();
  });
}

/** Checks a call off the to-do list. */
function closeCall(id) {
  return withLock_(() => {
    const call = findRecord_('Calls', id);
    if (call && call.status === 'Open') {
      call.status = 'Done';
      call.closed = now_();
      saveRecord_('Calls', call);
      if (call.clientId) logHistory_(call.clientId, 'Got back to them', call.reason || '');
    }
    return readAll_();
  });
}

function saveAppointment(rec) {
  return withLock_(() => {
    const isNew = !rec.id;
    // Booking someone new: add them to the clients, or use the existing client with the same phone or email.
    let booked = null;
    if (!rec.clientId && rec.newClient) {
      const nc = rec.newClient;
      if (!nc.firstName || !digits_(nc.phone)) throw new Error('Add their name and phone number');
      let c = matchClient_(readTable_('Clients'), nc.phone, nc.email);
      booked = { existing: !!c };
      if (!c) c = { created: now_(), source: nc.source || 'Added by hand', okText: true, okEmail: true };
      ['firstName', 'lastName', 'phone', 'email', 'address', 'vehicles'].forEach(k => { if (nc[k] && !c[k]) c[k] = nc[k]; });
      saveRecord_('Clients', c);
      rec.clientId = c.id;
      booked.name = fullName_(c);
    }
    const callId = rec.callId;
    delete rec.newClient;
    delete rec.callId;
    const client = findRecord_('Clients', rec.clientId);
    if (!client) throw new Error('Pick a client');
    if (!rec.end && rec.start) rec.end = fmt_(new Date(parseDate_(rec.start).getTime() + 2 * 3600 * 1000));
    if (!rec.status) rec.status = 'Scheduled';
    const old = isNew ? null : findRecord_('Appointments', rec.id);
    if (old && old.start !== rec.start) rec.reminderSent = '';
    rec.calendarEventId = syncCalendar_(rec, client);
    saveRecord_('Appointments', rec);
    if (isNew) logHistory_(client.id, 'Booked', (rec.reason || 'Appointment') + ' for ' + prettyDateTime_(rec.start));
    // Booking from a call checks that call off.
    if (callId) {
      const call = findRecord_('Calls', callId);
      if (call && call.status === 'Open') {
        call.status = 'Booked';
        call.closed = now_();
        call.clientId = client.id;
        saveRecord_('Calls', call);
      }
    }
    const data = readAll_();
    data.booked = booked;
    return data;
  });
}

function deleteAppointment(id) {
  return withLock_(() => {
    const a = findRecord_('Appointments', id);
    if (a) deleteCalendarEvent_(a.calendarEventId);
    deleteRecord_('Appointments', id);
    return readAll_();
  });
}

/** Saves a job Russell did. If it came from an appointment, that appointment is marked done. */
function saveVisit(rec, appointmentId) {
  return withLock_(() => {
    if (!rec.clientId) throw new Error('Pick a client');
    const isNew = !rec.id;
    saveRecord_('Visits', rec);
    if (isNew) logHistory_(rec.clientId, 'Job done', [rec.reason, rec.work].filter(String).join(': ') || 'Visit',
      /^\d{4}-\d{2}-\d{2}$/.test(String(rec.date)) ? rec.date + 'T12:00' : '');
    if (appointmentId) {
      const a = findRecord_('Appointments', appointmentId);
      if (a && a.status !== 'Completed') {
        a.status = 'Completed';
        saveRecord_('Appointments', a);
      }
    }
    return readAll_();
  });
}

function deleteVisit(id) {
  return withLock_(() => { deleteRecord_('Visits', id); return readAll_(); });
}

function finishFollowUp(visitId) {
  return withLock_(() => {
    const v = findRecord_('Visits', visitId);
    if (v) {
      v.followUpDone = true;
      saveRecord_('Visits', v);
      logHistory_(v.clientId, 'Followed up', v.followUpNote || 'Follow-up');
    }
    return readAll_();
  });
}

function saveNote(rec) {
  return withLock_(() => {
    if (!rec.date) rec.date = now_();
    saveRecord_('History', rec);
    return readAll_();
  });
}

function deleteNote(id) {
  return withLock_(() => { deleteRecord_('History', id); return readAll_(); });
}

function saveMarketing(rec) {
  return withLock_(() => {
    if (!rec.id) rec.created = now_();
    rec.doneAt = rec.done ? (rec.doneAt || now_()) : '';
    saveRecord_('Marketing', rec);
    return readAll_();
  });
}

function deleteMarketing(id) {
  return withLock_(() => { deleteRecord_('Marketing', id); return readAll_(); });
}

/** Marks a ready-made text as sent (Russell sent it from his phone) or skipped. */
function markText(id, status) {
  return withLock_(() => {
    const t = findRecord_('Outbox', id);
    if (!t || t.status !== 'Pending') return readAll_();
    t.status = status === 'Sent' ? 'Sent' : 'Skipped';
    t.sentAt = now_();
    saveRecord_('Outbox', t);
    if (t.status === 'Sent') logHistory_(t.clientId, 'Text sent', (KIND_LABEL[t.kind] || 'Text') + '. ' + t.body);
    return readAll_();
  });
}

/** Sends an email to a client and logs it. For a text, the page opens Messages and this only logs it. */
function sendMessage(clientId, channel, subject, body) {
  const client = findRecord_('Clients', clientId);
  if (!client) throw new Error('Client not found');
  if (channel === 'sms') {
    logHistory_(clientId, 'Text sent', body);
  } else {
    if (!client.email) throw new Error('This client has no email address');
    sendEmail_(client.email, subject || settings_().businessName, body);
    logHistory_(clientId, 'Email sent', (subject ? subject + ': ' : '') + body);
  }
  return readAll_();
}

/* ----------------------------------------------------------------- photos */

function getPhotos(clientId) {
  return readTable_('Photos').filter(p => p.clientId === clientId)
    .sort((a, b) => String(b.created).localeCompare(String(a.created)));
}

/** Saves a photo to Google Drive. The page shrinks it first and sends a small thumbnail along. */
function uploadPhoto(clientId, dataUrl, fileName, thumb, caption) {
  const client = findRecord_('Clients', clientId);
  if (!client) throw new Error('Client not found');
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('That file is not a photo');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], fileName || 'photo.jpg');
  const file = clientFolder_(client).createFile(blob);
  return withLock_(() => {
    saveRecord_('Photos', { clientId: clientId, created: now_(), fileId: file.getId(), caption: caption || '', thumb: thumb });
    return getPhotos(clientId);
  });
}

/** Full-size photo for viewing in the CRM. */
function getPhoto(photoId) {
  const p = findRecord_('Photos', photoId);
  if (!p) throw new Error('Photo not found');
  const blob = DriveApp.getFileById(p.fileId).getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

function deletePhoto(photoId) {
  return withLock_(() => {
    const p = findRecord_('Photos', photoId);
    if (!p) return [];
    try { DriveApp.getFileById(p.fileId).setTrashed(true); } catch (e) { /* already gone */ }
    deleteRecord_('Photos', photoId);
    return getPhotos(p.clientId);
  });
}

function clientFolder_(client) {
  const roots = DriveApp.getFoldersByName(PHOTO_FOLDER);
  const root = roots.hasNext() ? roots.next() : DriveApp.createFolder(PHOTO_FOLDER);
  const name = fullName_(client) + ' (' + client.id + ')';
  const found = root.getFoldersByName(name);
  return found.hasNext() ? found.next() : root.createFolder(name);
}

/* --------------------------------------------------------------- settings */

function getSettings() {
  const s = settings_();
  s.automationsOn = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'runAutomations');
  s.crmSheetUrl = crmSpreadsheet_().getUrl();
  s.appUrl = ScriptApp.getService().getUrl() || '';
  s.ownerEmailShown = ownerEmail_(s);
  return s;
}

function saveSettings(input) {
  const s = settings_();
  Object.keys(DEFAULT_SETTINGS).forEach(k => {
    if (!(k in input)) return;
    const def = DEFAULT_SETTINGS[k];
    s[k] = typeof def === 'boolean' ? input[k] === true || input[k] === 'true'
      : typeof def === 'number' ? (input[k] === '' ? def : Number(input[k]))
      : String(input[k]);
  });
  saveSettings_(s);
  return getSettings();
}

function sendTest(kind) {
  const s = settings_();
  if (kind === 'alert') {
    if (!s.ntfyTopic) throw new Error('Run setup first so the alert topic is made');
    alert_('Test alert from your CRM', 'Alerts are working. You will get these for new website requests and call-back reminders.', '', true);
  } else {
    sendEmail_(ownerEmail_(s), 'Test email from your CRM', 'Emails from your Cowboy Mechanics CRM are working.');
  }
  return true;
}

/** Checks for new calls, texts and website requests every 5 minutes, plus a morning summary email. */
function installAutomations() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['runAutomations', 'dailyDigest'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runAutomations').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('dailyDigest').timeBased().atHour(6).everyDays(1).inTimezone(TZ).create();
  return getSettings();
}

/* ------------------------------------------------------- incoming requests */

/** Copies new rows from the website form sheet into the CRM and alerts Russell. */
function syncFormLeads() {
  return withLock_(() => {
    const sh = SpreadsheetApp.openById(FORM_SHEET_ID).getSheetByName(FORM_TAB);
    if (!sh) return 0;
    const values = sh.getDataRange().getValues();
    if (values.length < 2) return 0;
    const head = values[0].map(h => String(h).trim().toLowerCase());
    const get = (row, name) => { const i = head.indexOf(name); return i < 0 ? '' : row[i]; };

    const done = {};
    readTable_('Imported').forEach(r => { done[r.id] = true; });
    const clients = readTable_('Clients');
    let added = 0;

    values.slice(1).forEach(row => {
      const submitted = get(row, 'submitted');
      const phone = String(get(row, 'phone')).trim();
      const email = String(get(row, 'email')).trim();
      if (!submitted && !phone && !email) return;
      const when = submitted instanceof Date ? submitted : (submitted ? new Date(submitted) : new Date());
      const key = [fmt_(when), digits_(phone), email.toLowerCase()].join('|');
      if (done[key]) return;

      let client = matchClient_(clients, phone, email);
      const first = String(get(row, 'first name')).trim(), last = String(get(row, 'last name')).trim();
      const address = String(get(row, 'service address')).trim();
      if (!client) {
        client = { created: fmt_(when), firstName: first, lastName: last, phone: phone, email: email,
          address: address, vehicles: '', source: 'Website form', okText: true, okEmail: true, notes: '' };
        clients.push(client);
      } else {
        [['phone', phone], ['email', email], ['address', address], ['lastName', last]].forEach(([k, v]) => {
          if (v && !client[k]) client[k] = v;
        });
      }
      saveRecord_('Clients', client);

      const emergency = String(get(row, 'emergency')).toUpperCase() === 'YES';
      const preferred = get(row, 'preferred date');
      const category = String(get(row, 'category')).trim();
      const details = String(get(row, 'details')).trim();
      const reason = [emergency ? 'EMERGENCY.' : '', category ? category + '.' : '', details].filter(String).join(' ');
      const fresh = Date.now() - when.getTime() < 24 * 3600 * 1000;
      const s = settings_();
      // Old rows from before the CRM existed go in the history only, not the to-do list.
      if (fresh) {
        upsertCall_({ created: fmt_(when), clientId: client.id, phone: phone, name: fullName_(client), reason: reason,
          source: 'Website', requestedDay: preferred instanceof Date ? fmt_(preferred).slice(0, 10) : String(preferred || ''),
          remind1h: s.autoRemind1h, remindHourly: s.autoRemindHourly });
        alert_((emergency ? 'EMERGENCY ' : '') + 'Website request: ' + fullName_(client), reason, phone, emergency);
      }
      logHistory_(client.id, 'Website form', reason + (preferred ? ' Asked for: ' + (preferred instanceof Date ? prettyDate_(preferred) : preferred) + '.' : ''), fmt_(when));

      saveRecord_('Imported', { id: key, imported: now_() });
      done[key] = true;
      added++;
    });
    return added;
  });
}

/**
 * Reads the emails MacroDroid sends from Russell's phone for missed calls and texts.
 * Subject: "CRM <code> missed <number>" or "CRM <code> text <number>", body = the text message.
 */
function syncPhoneInbox() {
  const s = settings_();
  if (!s.phoneCode) return 0;
  const threads = GmailApp.search('subject:"CRM ' + s.phoneCode + '" newer_than:3d -label:crm-logged', 0, 50);
  if (!threads.length) return 0;
  const label = GmailApp.getUserLabelByName('crm-logged') || GmailApp.createLabel('crm-logged');
  let added = 0;
  withLock_(() => {
    const clients = readTable_('Clients');
    threads.forEach(th => {
      th.getMessages().forEach(msg => {
        const m = msg.getSubject().match(new RegExp('CRM\\s+' + s.phoneCode + '\\s+(missed|text)\\s+(.+)', 'i'));
        if (!m) return;
        const phone = m[2].trim();
        const isText = m[1].toLowerCase() === 'text';
        const body = msg.getPlainBody().trim().slice(0, 1000);
        const client = matchClient_(clients, phone, '');
        upsertCall_({
          created: fmt_(msg.getDate()), clientId: client ? client.id : '', phone: phone,
          name: client ? fullName_(client) : '', source: isText ? 'Text' : 'Missed call',
          reason: isText ? 'Text: ' + body : '', remind1h: s.autoRemind1h, remindHourly: s.autoRemindHourly
        });
        if (client) logHistory_(client.id, isText ? 'Text received' : 'Missed call', isText ? body : 'Missed call', fmt_(msg.getDate()));
        added++;
      });
      th.addLabel(label).markRead().moveToArchive();
    });
  });
  return added;
}

/** Adds a call to the to-do list, or adds to the open call from the same number. */
function upsertCall_(rec) {
  const p = digits_(rec.phone).slice(-10);
  const open = p.length === 10 && readTable_('Calls').find(c => c.status === 'Open' && digits_(c.phone).slice(-10) === p);
  if (open && !rec.id) {
    if (rec.reason && String(open.reason).indexOf(rec.reason) < 0) open.reason = [open.reason, rec.reason].filter(String).join('\n');
    ['name', 'vehicle', 'clientId', 'requestedDay'].forEach(k => { if (rec[k]) open[k] = rec[k]; });
    // A fresh call from Russell resets the reminders he picked.
    if (rec.source === 'Call') {
      ['remind1h', 'remind3h', 'remindHourly'].forEach(k => { open[k] = !!rec[k]; });
      open.created = now_();
      open.lastReminded = '';
    }
    saveRecord_('Calls', open);
    return open;
  }
  if (!rec.created) rec.created = now_();
  rec.status = 'Open';
  if (!rec.clientId) {
    const c = matchClient_(readTable_('Clients'), rec.phone, '');
    if (c) { rec.clientId = c.id; if (!rec.name) rec.name = fullName_(c); }
  }
  saveRecord_('Calls', rec);
  return rec;
}

function matchClient_(clients, phone, email) {
  const p = digits_(phone).slice(-10);
  const e = String(email || '').trim().toLowerCase();
  return clients.find(c =>
    (p.length === 10 && digits_(c.phone).slice(-10) === p) ||
    (e && String(c.email || '').trim().toLowerCase() === e)) || null;
}

/* ----------------------------------------------------------- automations */

/** Runs every 5 minutes. */
function runAutomations() {
  try { syncFormLeads(); } catch (e) { Logger.log('Form sync failed: ' + e); }
  try { syncPhoneInbox(); } catch (e) { Logger.log('Phone inbox failed: ' + e); }
  withLock_(runAutomations_);
}

function runAutomations_() {
  const s = settings_();
  const now = Date.now();
  const HOUR = 3600 * 1000, DAY = 24 * HOUR;
  const clients = {};
  readTable_('Clients').forEach(c => { clients[c.id] = c; });

  // Call-back reminders to Russell's phone, never during quiet hours.
  if (!isQuiet_(s)) {
    readTable_('Calls').forEach(c => {
      if (c.status !== 'Open') return;
      const due = nextReminder_(c);
      if (!due || due > now) return;
      const waited = Math.round((now - parseDate_(c.created).getTime()) / HOUR);
      alert_('Call back ' + (c.name || prettyPhone_(c.phone)),
        [c.source, c.reason, 'Waiting ' + (waited < 1 ? 'under an hour' : waited + (waited === 1 ? ' hour' : ' hours'))].filter(String).join('. '),
        c.phone, waited >= 3);
      c.lastReminded = now_();
      saveRecord_('Calls', c);
    });
  }

  readTable_('Outbox').forEach(t => {
    if (t.status === 'Pending' && t.expires && parseDate_(t.expires).getTime() < now) {
      t.status = 'Expired';
      saveRecord_('Outbox', t);
    }
  });

  if (s.autoReminders) {
    readTable_('Appointments').forEach(a => {
      if (a.status !== 'Scheduled' || a.reminderSent || !a.start) return;
      const start = parseDate_(a.start).getTime();
      if (start <= now || start - now > s.reminderHours * HOUR) return;
      const c = clients[a.clientId];
      if (c) {
        autoMessage_(c, 'reminder', { expires: a.start, date: prettyDate_(a.start), time: prettyTime_(a.start),
          location: a.location || c.address || '', vehicle: a.vehicle || firstVehicle_(c) });
      }
      a.reminderSent = now_();
      saveRecord_('Appointments', a);
    });
  }

  if (s.autoThankYou) {
    readTable_('Visits').forEach(v => {
      if (v.thankYouSent || !v.date) return;
      const due = parseDate_(v.date).getTime() + s.thankYouDays * DAY;
      if (due > now) return;
      const c = clients[v.clientId];
      // Skip jobs typed in long after the fact.
      if (c && now - due < 7 * DAY) autoMessage_(c, 'thankYou', { vehicle: v.vehicle || firstVehicle_(c) });
      v.thankYouSent = now_();
      saveRecord_('Visits', v);
    });
  }
}

/** When the next call-back reminder is due (ms), or 0 if none. */
function nextReminder_(c) {
  const HOUR = 3600 * 1000;
  const start = parseDate_(c.created).getTime();
  const last = c.lastReminded ? parseDate_(c.lastReminded).getTime() : start;
  const times = [];
  if (c.remind1h) times.push(start + HOUR);
  if (c.remind3h) times.push(start + 3 * HOUR);
  if (c.remindHourly) times.push(start + (Math.floor((last - start) / HOUR) + 1) * HOUR);
  const next = times.filter(t => t > last).sort((a, b) => a - b)[0];
  return next || 0;
}

function isQuiet_(s) {
  const h = Number(Utilities.formatDate(new Date(), TZ, 'H'));
  const a = Number(s.quietStart), b = Number(s.quietEnd);
  return a === b ? false : a > b ? (h >= a || h < b) : (h >= a && h < b);
}

/** Morning email: today's appointments and everything still waiting on a call back. */
function dailyDigest() {
  const s = settings_();
  if (!s.dailyDigest) return;
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const clients = {};
  readTable_('Clients').forEach(c => { clients[c.id] = c; });
  const appts = readTable_('Appointments')
    .filter(a => a.status === 'Scheduled' && String(a.start).slice(0, 10) === today)
    .sort((a, b) => a.start < b.start ? -1 : 1);
  const calls = readTable_('Calls').filter(c => c.status === 'Open');
  if (!appts.length && !calls.length) return;

  const lines = ['Good morning! Here is your day.', '', 'TODAY\'S APPOINTMENTS (' + appts.length + ')'];
  if (!appts.length) lines.push('  None');
  appts.forEach(a => {
    const c = clients[a.clientId] || {};
    lines.push('  ' + prettyTime_(a.start) + '  ' + fullName_(c) + '  ' + (a.reason || '') +
      (c.phone ? '  ' + prettyPhone_(c.phone) : '') + (a.location || c.address ? '  @ ' + (a.location || c.address) : ''));
  });
  lines.push('', 'STILL NEED A CALL BACK (' + calls.length + ')');
  if (!calls.length) lines.push('  None');
  calls.forEach(c => lines.push('  ' + (c.name || prettyPhone_(c.phone)) + '  ' + prettyPhone_(c.phone) + (c.reason ? ': ' + c.reason : '')));
  MailApp.sendEmail(ownerEmail_(s), 'Your day - ' + prettyDate_(today), lines.join('\n'), { name: s.businessName + ' CRM' });
}

function autoMessage_(client, kind, vars) {
  const s = settings_();
  const v = Object.assign({
    firstName: client.firstName || 'there', name: fullName_(client), business: s.businessName,
    phone: s.businessPhone, reviewLink: s.reviewLink, vehicle: firstVehicle_(client),
    location: client.address || '', date: '', time: ''
  }, vars);
  if (!v.vehicle) v.vehicle = 'vehicle';
  if (s.sendEmail && client.email && client.okEmail !== false) {
    try {
      const body = fill_(s[kind + 'Body'], v);
      sendEmail_(client.email, fill_(s[kind + 'Subject'], v), body);
      logHistory_(client.id, 'Auto email', KIND_LABEL[kind] + ' sent. ' + body);
    } catch (e) { logHistory_(client.id, 'Note', 'Auto email failed: ' + e.message); }
  }
  // Texts wait on the to-do list for one tap on Russell's phone.
  if (s.sendSms && e164_(client.phone) && client.okText !== false) {
    saveRecord_('Outbox', { clientId: client.id, created: now_(), kind: kind, phone: e164_(client.phone),
      body: fill_(s[kind + 'Sms'], v), status: 'Pending', expires: v.expires || '' });
  }
}

/** Fills {placeholders}. A sentence whose placeholder is empty (like a blank review link) is dropped. */
function fill_(tpl, vars) {
  const value = k => vars[k] === undefined || vars[k] === null ? '' : String(vars[k]);
  const hasEmpty = text => (text.match(/\{(\w+)\}/g) || []).some(m => !value(m.slice(1, -1)));
  return String(tpl || '').split('\n').map(line => {
    if (!hasEmpty(line)) return line;
    const kept = line.split(/(?<=[.!?])\s+/).filter(sentence => !hasEmpty(sentence)).join(' ');
    return kept || null;
  }).filter(l => l !== null).join('\n').replace(/\{(\w+)\}/g, (m, k) => value(k));
}

/* ------------------------------------------------------------------ alerts */

/** Sends an alert to Russell's phone through the free ntfy app. Tapping it calls the customer. */
function alert_(title, message, phone, urgent) {
  const s = settings_();
  if (!s.ntfyTopic) return;
  const tel = e164_(phone);
  const headers = { Title: ascii_(title), Priority: urgent ? 'high' : 'default', Tags: urgent ? 'rotating_light' : 'wrench' };
  const app = ScriptApp.getService().getUrl();
  const actions = [];
  if (tel) { headers.Click = 'tel:' + tel; actions.push('view, Call, tel:' + tel); }
  if (app) actions.push('view, Open CRM, ' + app);
  if (actions.length) headers.Actions = actions.join('; ');
  try {
    UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(s.ntfyTopic), {
      method: 'post', payload: String(message || title) + (tel ? '\n' + prettyPhone_(phone) : ''),
      headers: headers, muteHttpExceptions: true
    });
  } catch (e) { Logger.log('Alert failed: ' + e); }
}

// Alert titles travel in a header, which only allows plain characters.
function ascii_(s) { return String(s || '').replace(/[^\x20-\x7E]/g, '').slice(0, 120); }

/* --------------------------------------------------------------- calendar */

function calendar_() {
  const id = settings_().calendarId;
  return (id && CalendarApp.getCalendarById(id)) || CalendarApp.getDefaultCalendar();
}

function syncCalendar_(appt, client) {
  let ev = null;
  if (appt.calendarEventId) {
    try { ev = calendar_().getEventById(appt.calendarEventId); } catch (e) { ev = null; }
  }
  if (appt.status === 'Cancelled') {
    if (ev) ev.deleteEvent();
    return '';
  }
  const c = client || {};
  const title = (appt.reason || 'Appointment') + ' - ' + fullName_(c);
  const desc = [
    c.phone ? 'Phone: ' + prettyPhone_(c.phone) : '', c.email ? 'Email: ' + c.email : '',
    appt.vehicle ? 'Vehicle: ' + appt.vehicle : '', appt.notes ? 'Notes: ' + appt.notes : '',
    'Added from the Cowboy Mechanics CRM'
  ].filter(String).join('\n');
  const start = parseDate_(appt.start), end = parseDate_(appt.end);
  const location = appt.location || c.address || '';
  if (ev) {
    ev.setTitle(title);
    ev.setTime(start, end);
    ev.setLocation(location);
    ev.setDescription(desc);
  } else {
    ev = calendar_().createEvent(title, start, end, { location: location, description: desc });
  }
  ev.removeAllReminders();
  ev.addPopupReminder(60);
  ev.addPopupReminder(24 * 60);
  return ev.getId();
}

function deleteCalendarEvent_(id) {
  if (!id) return;
  try {
    const ev = calendar_().getEventById(id);
    if (ev) ev.deleteEvent();
  } catch (e) { /* already gone */ }
}

/* ------------------------------------------------------------------ email */

function sendEmail_(to, subject, body) {
  const s = settings_();
  MailApp.sendEmail({ to: to, subject: subject, body: body, name: s.businessName, replyTo: ownerEmail_(s) });
}

/* ------------------------------------------------------------ sheet helpers */

function crmSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('crmSheetId');
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.create('Cowboy Mechanics - CRM');
  props.setProperty('crmSheetId', ss.getId());
  return ss;
}

function sheet_(name) {
  const ss = crmSpreadsheet_();
  let sh = ss.getSheetByName(name);
  if (sh) return sh;
  const headers = Object.keys(TABLES[name]).map(k => TABLES[name][k]);
  sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#dbe4ef').setFontColor('#1f2a37');
  sh.setFrozenRows(1);
  Object.keys(TABLES[name]).forEach((k, i) => {
    const range = sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1);
    if (DATE_FIELDS.indexOf(k) >= 0) range.setNumberFormat('m/d/yyyy h:mm am/pm');
    else if (['phone', 'id', 'clientId', 'requestedDay', 'fileId'].indexOf(k) >= 0) range.setNumberFormat('@');
  });
  const blank = ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1) ss.deleteSheet(blank);
  return sh;
}

function readTable_(name) {
  const keys = Object.keys(TABLES[name]);
  return sheet_(name).getDataRange().getValues().slice(1)
    .filter(r => r[0] !== '')
    .map(r => {
      const o = {};
      keys.forEach((k, i) => {
        const v = r[i];
        o[k] = v instanceof Date ? fmt_(v) : (v === undefined ? '' : v);
        if (k === 'id' || k === 'clientId' || k === 'phone') o[k] = String(o[k]);
      });
      return o;
    });
}

/** Everything the page shows. Photos load per client, so they are not included here. */
function readAll_() {
  return {
    clients: readTable_('Clients'),
    calls: readTable_('Calls'),
    appointments: readTable_('Appointments'),
    visits: readTable_('Visits'),
    history: readTable_('History'),
    marketing: readTable_('Marketing'),
    outbox: readTable_('Outbox')
  };
}

function findRecord_(name, id) {
  return readTable_(name).find(r => r.id === id) || null;
}

function findRow_(sh, id) {
  const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(r => String(r[0]));
  const i = ids.indexOf(String(id));
  return i > 0 ? i + 1 : 0;
}

function saveRecord_(name, rec) {
  const sh = sheet_(name);
  const keys = Object.keys(TABLES[name]);
  if (!rec.id) rec.id = (ID_PREFIX[name] || 'X') + '-' + Utilities.getUuid().slice(0, 8);
  const row = keys.map(k => {
    const v = rec[k];
    if (DATE_FIELDS.indexOf(k) >= 0) return v ? parseDate_(v) : '';
    if (BOOL_FIELDS.indexOf(k) >= 0) return v === true || v === 'true' || v === 'TRUE';
    return v === undefined || v === null ? '' : v;
  });
  const r = findRow_(sh, rec.id);
  if (r) sh.getRange(r, 1, 1, keys.length).setValues([row]);
  else sh.appendRow(row);
  return rec;
}

function deleteRecord_(name, id) {
  const sh = sheet_(name);
  const r = findRow_(sh, id);
  if (r) sh.deleteRow(r);
}

function logHistory_(clientId, type, summary, date) {
  if (!clientId) return;
  saveRecord_('History', { clientId: clientId, date: date || now_(), type: type, summary: summary });
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  const mine = !lock.hasLock();
  if (mine) lock.waitLock(30000);
  try { return fn(); } finally { if (mine) lock.releaseLock(); }
}

/* ------------------------------------------------------------ small helpers */

function settings_() {
  const raw = PropertiesService.getScriptProperties().getProperty('settings');
  return Object.assign({}, DEFAULT_SETTINGS, raw ? JSON.parse(raw) : {});
}

function saveSettings_(s) {
  PropertiesService.getScriptProperties().setProperty('settings', JSON.stringify(s));
}

function ownerEmail_(s) {
  return s.ownerEmail || Session.getEffectiveUser().getEmail();
}

// Dates travel between the sheet and the page as "yyyy-MM-ddTHH:mm" in Las Vegas time.
function fmt_(d) { return Utilities.formatDate(d, TZ, "yyyy-MM-dd'T'HH:mm"); }
function now_() { return fmt_(new Date()); }

function parseDate_(v) {
  if (v instanceof Date) return v;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Utilities.parseDate(s + ' 00:00', TZ, 'yyyy-MM-dd HH:mm');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return Utilities.parseDate(s.replace('T', ' '), TZ, 'yyyy-MM-dd HH:mm');
  return new Date(s);
}

function prettyDate_(v) { return Utilities.formatDate(parseDate_(v), TZ, 'EEE, MMM d'); }
function prettyTime_(v) { return Utilities.formatDate(parseDate_(v), TZ, 'h:mm a'); }
function prettyDateTime_(v) { return prettyDate_(v) + ' at ' + prettyTime_(v); }

function digits_(v) { return String(v || '').replace(/\D/g, ''); }

function e164_(v) {
  let d = digits_(v);
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d.length === 10 ? '+1' + d : '';
}

function prettyPhone_(v) {
  const d = digits_(v).replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : String(v || '');
}

function fullName_(c) {
  return [c.firstName, c.lastName].filter(String).join(' ') || 'Unnamed client';
}

function firstVehicle_(c) {
  return String(c.vehicles || '').split('\n').map(v => v.trim()).filter(String)[0] || '';
}
