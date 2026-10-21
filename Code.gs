/**
 * Cowboy Mechanics CRM
 *
 * A Google Apps Script web app. All CRM data lives in a Google Sheet named
 * "Cowboy Mechanics - CRM" that this script creates the first time it runs.
 * Website form leads are copied in from the "Cowboy Mechanics - Form Submissions"
 * sheet, which this script only reads and never changes.
 *
 * Setup steps are in SETUP.md.
 */

// The sheet the website form logs to (read only).
const FORM_SHEET_ID = '1YqgMHve_aPwz1fnH6CvGKrmwMs2-FRGnjz5bNi9UIfk';
const FORM_TAB = 'Submissions';
const TZ = 'America/Los_Angeles';

// Each tab in the CRM sheet: field key -> column header. Order = column order.
const TABLES = {
  Clients: {
    id: 'ID', created: 'Created', firstName: 'First name', lastName: 'Last name',
    phone: 'Phone', email: 'Email', address: 'Address', vehicles: 'Vehicles',
    status: 'Status', source: 'Source', tags: 'Tags', okText: 'OK to text',
    okEmail: 'OK to email', notes: 'Notes', serviceReminderSent: 'Service reminder sent'
  },
  Jobs: {
    id: 'ID', clientId: 'Client ID', date: 'Date', vehicle: 'Vehicle', mileage: 'Mileage',
    category: 'Category', work: 'Work done', partsCost: 'Parts cost', labor: 'Labor',
    total: 'Total paid', payment: 'Payment method', paid: 'Paid', notes: 'Notes',
    followUpSent: 'Follow-up sent'
  },
  Appointments: {
    id: 'ID', clientId: 'Client ID', start: 'Start', end: 'End', service: 'Service',
    vehicle: 'Vehicle', location: 'Location', notes: 'Notes', status: 'Status',
    calendarEventId: 'Calendar event ID', reminderSent: 'Reminder sent'
  },
  Interactions: {
    id: 'ID', clientId: 'Client ID', date: 'Date', type: 'Type', summary: 'Summary'
  },
  // Texts the CRM wrote for you to send from your own phone (free, no texting service needed).
  Outbox: {
    id: 'ID', clientId: 'Client ID', created: 'Created', kind: 'Kind', phone: 'Phone',
    body: 'Message', status: 'Status', expires: 'Expires', sentAt: 'Sent'
  },
  Imported: { id: 'Form row key', imported: 'Imported' }
};

const DATE_FIELDS = ['created', 'date', 'start', 'end', 'reminderSent', 'followUpSent',
  'serviceReminderSent', 'imported', 'expires', 'sentAt'];
const BOOL_FIELDS = ['okText', 'okEmail', 'paid'];
const ID_PREFIX = { Clients: 'C', Jobs: 'J', Appointments: 'A', Interactions: 'I', Outbox: 'T' };

const DEFAULT_SETTINGS = {
  businessName: 'Cowboy Mechanics',
  businessPhone: '(702) 241-1227',
  ownerEmail: '',
  ownerPhone: '',
  calendarId: '',
  reviewLink: '',
  sendEmail: true,
  sendSms: true,
  autoReminders: true,
  reminderHours: 24,
  autoFollowUp: true,
  followUpDays: 3,
  autoServiceReminder: false,
  serviceReminderMonths: 6,
  autoLeadReply: false,
  dailyDigest: true,

  reminderSubject: 'Reminder: your {business} appointment on {date}',
  reminderBody: 'Hi {firstName},\n\nJust a reminder that {business} is scheduled to work on your {vehicle} on {date} at {time}.\nService: {service}\nLocation: {location}\n\nNeed to reschedule? Call or text {phone}.\n\nThanks,\n{business}',
  reminderSms: 'Hi {firstName}, reminder from {business}: we are scheduled for {date} at {time}. Need to reschedule? Call/text {phone}. Reply STOP to opt out.',

  followUpSubject: 'Thanks for choosing {business}',
  followUpBody: 'Hi {firstName},\n\nThanks for trusting us with your {vehicle}. How is it running? If anything feels off, just reply or call {phone}.\n\nIf you were happy with the work, a quick review helps a small business a lot: {reviewLink}\n\nThanks,\nRussell\n{business}',
  followUpSms: 'Hi {firstName}, thanks for choosing {business}! How is your {vehicle} running? Any issues, call/text {phone}. Reviews help a ton: {reviewLink}',

  serviceSubject: 'Time for a check-up on your {vehicle}?',
  serviceBody: 'Hi {firstName},\n\nIt has been a while since we last worked on your {vehicle}. Now is a good time for an oil change or a quick inspection before small problems turn into big ones.\n\nCall or text {phone} to set something up. We come to you.\n\n{business}',
  serviceSms: 'Hi {firstName}, it has been a while since {business} worked on your {vehicle}. Due for a check-up? Call/text {phone}. Reply STOP to opt out.',

  leadSubject: 'We got your request - {business}',
  leadBody: 'Hi {firstName},\n\nThanks for reaching out to {business}. We got your request and Russell will contact you soon. If it is urgent, call {phone}.\n\n{business}',
  leadSms: 'Hi {firstName}, thanks for contacting {business}! We got your request and will reach out soon. Urgent? Call {phone}.'
};

const KIND_LABEL = {
  reminder: 'Appointment reminder', followUp: 'Follow-up', service: 'Service reminder', lead: 'Lead auto-reply'
};

/* ---------------------------------------------------------------- web app */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Cowboy Mechanics CRM')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setFaviconUrl('https://cowboy-mechanics.com/favicon-32.png');
}

/** Run this once from the Apps Script editor. Creates the CRM sheet and the automatic triggers. */
function setup() {
  crmSpreadsheet_();
  Object.keys(TABLES).forEach(sheet_);
  installAutomations();
  Logger.log('CRM sheet: ' + crmSpreadsheet_().getUrl());
}

/* --------------------------------------------------- functions the page calls */

function getData(sync) {
  let syncError = '';
  if (sync) {
    try { syncFormLeads(); } catch (e) { syncError = String(e.message || e); }
  }
  const data = readAll_();
  data.syncError = syncError;
  return data;
}

function saveClient(rec) {
  return withLock_(() => {
    if (!rec.id) {
      rec.created = now_();
      if (!rec.status) rec.status = 'New lead';
      if (!rec.source) rec.source = 'Added by hand';
    }
    saveRecord_('Clients', rec);
    return readAll_();
  });
}

function deleteClient(id) {
  return withLock_(() => {
    readTable_('Appointments').filter(a => a.clientId === id).forEach(a => {
      deleteCalendarEvent_(a.calendarEventId);
      deleteRecord_('Appointments', a.id);
    });
    ['Jobs', 'Interactions', 'Outbox'].forEach(t =>
      readTable_(t).filter(r => r.clientId === id).forEach(r => deleteRecord_(t, r.id)));
    deleteRecord_('Clients', id);
    return readAll_();
  });
}

function saveJob(rec) {
  return withLock_(() => {
    saveRecord_('Jobs', rec);
    // Anyone we have done work for is a customer.
    const client = findRecord_('Clients', rec.clientId);
    if (client && client.status !== 'Customer') {
      client.status = 'Customer';
      saveRecord_('Clients', client);
    }
    return readAll_();
  });
}

function deleteJob(id) {
  return withLock_(() => { deleteRecord_('Jobs', id); return readAll_(); });
}

function saveAppointment(rec) {
  return withLock_(() => {
    const isNew = !rec.id;
    const client = findRecord_('Clients', rec.clientId);
    if (!rec.end && rec.start) {
      rec.end = fmt_(new Date(parseDate_(rec.start).getTime() + 2 * 3600 * 1000));
    }
    if (!rec.status) rec.status = 'Scheduled';
    const old = isNew ? null : findRecord_('Appointments', rec.id);
    // A new time means the customer should get a fresh reminder.
    if (old && old.start !== rec.start) rec.reminderSent = '';
    rec.calendarEventId = syncCalendar_(rec, client);
    saveRecord_('Appointments', rec);
    if (isNew && client) {
      logInteraction_(client.id, 'Appointment', 'Booked ' + (rec.service || 'appointment') + ' for ' + prettyDateTime_(rec.start));
    }
    return readAll_();
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

function saveInteraction(rec) {
  return withLock_(() => {
    if (!rec.date) rec.date = now_();
    saveRecord_('Interactions', rec);
    return readAll_();
  });
}

function deleteInteraction(id) {
  return withLock_(() => { deleteRecord_('Interactions', id); return readAll_(); });
}

/**
 * Sends a one-off email to a client and logs it. For a text, the page opens your
 * phone's Messages app and this only logs it.
 */
function sendMessage(clientId, channel, subject, body) {
  const client = findRecord_('Clients', clientId);
  if (!client) throw new Error('Client not found');
  const s = settings_();
  if (channel === 'sms') {
    logInteraction_(clientId, 'Text sent', body);
  } else {
    if (!client.email) throw new Error('This client has no email address');
    sendEmail_(client.email, subject || s.businessName, body);
    logInteraction_(clientId, 'Email sent', (subject ? subject + ': ' : '') + body);
  }
  return readAll_();
}

/** Marks a text from the "Texts to send" list as Sent or Skipped. */
function markText(id, status) {
  return withLock_(() => {
    const t = findRecord_('Outbox', id);
    if (!t || t.status !== 'Pending') return readAll_();
    t.status = status === 'Sent' ? 'Sent' : 'Skipped';
    t.sentAt = now_();
    saveRecord_('Outbox', t);
    if (t.status === 'Sent') logInteraction_(t.clientId, 'Text sent', (KIND_LABEL[t.kind] || 'Text') + '. ' + t.body);
    return readAll_();
  });
}

function getSettings() {
  const s = settings_();
  s.automationsOn = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'runAutomations');
  s.crmSheetUrl = crmSpreadsheet_().getUrl();
  return s;
}

function saveSettings(input) {
  const s = settings_();
  Object.keys(DEFAULT_SETTINGS).forEach(k => {
    if (!(k in input)) return;
    const def = DEFAULT_SETTINGS[k];
    s[k] = typeof def === 'boolean' ? input[k] === true || input[k] === 'true'
      : typeof def === 'number' ? Number(input[k]) || def
      : String(input[k]);
  });
  PropertiesService.getScriptProperties().setProperty('settings', JSON.stringify(s));
  return getSettings();
}

function sendTest() {
  sendEmail_(ownerEmail_(settings_()), 'Test email from your CRM', 'Emails from your Cowboy Mechanics CRM are working.');
  return true;
}

/** Creates the timed triggers: automations every hour and a morning summary email. */
function installAutomations() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['runAutomations', 'dailyDigest'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runAutomations').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('dailyDigest').timeBased().atHour(6).everyDays(1).inTimezone(TZ).create();
  return getSettings();
}

/* ------------------------------------------------------------ form leads */

/** Copies new rows from the website form sheet into the CRM. Returns how many were added. */
function syncFormLeads() {
  return withLock_(() => {
    const sh = SpreadsheetApp.openById(FORM_SHEET_ID).getSheetByName(FORM_TAB);
    if (!sh) return 0;
    const values = sh.getDataRange().getValues();
    if (values.length < 2) return 0;
    const head = values[0].map(h => String(h).trim().toLowerCase());
    const col = name => head.indexOf(name);
    const get = (row, name) => { const i = col(name); return i < 0 ? '' : row[i]; };

    const done = {};
    readTable_('Imported').forEach(r => { done[r.id] = true; });
    const clients = readTable_('Clients');
    const s = settings_();
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
      const isNewClient = !client;
      if (!client) {
        client = {
          created: fmt_(when), firstName: String(get(row, 'first name')).trim(),
          lastName: String(get(row, 'last name')).trim(), phone: phone, email: email,
          address: String(get(row, 'service address')).trim(), vehicles: '', status: 'New lead',
          source: 'Website form', tags: '', okText: true, okEmail: true, notes: ''
        };
        saveRecord_('Clients', client);
        clients.push(client);
      } else {
        // Fill in anything we did not have yet.
        let changed = false;
        [['phone', phone], ['email', email], ['address', String(get(row, 'service address')).trim()],
          ['lastName', String(get(row, 'last name')).trim()]].forEach(([k, v]) => {
          if (v && !client[k]) { client[k] = v; changed = true; }
        });
        if (changed) saveRecord_('Clients', client);
      }

      const emergency = String(get(row, 'emergency')).toUpperCase() === 'YES';
      const preferred = get(row, 'preferred date');
      const summary = [
        emergency ? 'EMERGENCY.' : '',
        get(row, 'category') ? 'Category: ' + get(row, 'category') + '.' : '',
        preferred ? 'Preferred date: ' + (preferred instanceof Date ? prettyDate_(preferred) : preferred) + '.' : '',
        String(get(row, 'details')).trim()
      ].filter(String).join(' ');
      saveRecord_('Interactions', {
        clientId: client.id, date: fmt_(when),
        type: isNewClient ? 'Website form' : 'Website form (returning)', summary: summary
      });

      // Only auto-reply to fresh requests, never to old rows on the first import.
      if (s.autoLeadReply && Date.now() - when.getTime() < 24 * 3600 * 1000) {
        autoMessage_(client, 'lead', {});
      }

      saveRecord_('Imported', { id: key, imported: now_() });
      done[key] = true;
      added++;
    });
    return added;
  });
}

function matchClient_(clients, phone, email) {
  const p = digits_(phone).slice(-10);
  const e = String(email || '').trim().toLowerCase();
  return clients.find(c =>
    (p.length === 10 && digits_(c.phone).slice(-10) === p) ||
    (e && String(c.email || '').trim().toLowerCase() === e)) || null;
}

/* ----------------------------------------------------------- automations */

/** Runs every hour: pulls in form leads, sends reminders and follow-ups. */
function runAutomations() {
  try { syncFormLeads(); } catch (e) { Logger.log('Form sync failed: ' + e); }
  withLock_(runAutomations_);
}

function runAutomations_() {
  const s = settings_();
  const now = Date.now();
  readTable_('Outbox').forEach(t => {
    if (t.status === 'Pending' && t.expires && parseDate_(t.expires).getTime() < now) {
      t.status = 'Expired';
      saveRecord_('Outbox', t);
    }
  });
  const HOUR = 3600 * 1000, DAY = 24 * HOUR;
  const clients = {};
  readTable_('Clients').forEach(c => { clients[c.id] = c; });

  if (s.autoReminders) {
    readTable_('Appointments').forEach(a => {
      if (a.status !== 'Scheduled' || a.reminderSent || !a.start) return;
      const start = parseDate_(a.start).getTime();
      if (start <= now || start - now > s.reminderHours * HOUR) return;
      const c = clients[a.clientId];
      if (c) {
        autoMessage_(c, 'reminder', { expires: a.start,
          date: prettyDate_(a.start), time: prettyTime_(a.start), service: a.service || 'Service',
          location: a.location || c.address || '', vehicle: a.vehicle || firstVehicle_(c)
        });
      }
      a.reminderSent = now_();
      saveRecord_('Appointments', a);
    });
  }

  const jobs = readTable_('Jobs');
  if (s.autoFollowUp) {
    jobs.forEach(j => {
      if (j.followUpSent || !j.date) return;
      const due = parseDate_(j.date).getTime() + s.followUpDays * DAY;
      if (due > now) return;
      const c = clients[j.clientId];
      // Skip jobs that are more than a week past due (old history typed in later).
      if (c && now - due < 7 * DAY) {
        autoMessage_(c, 'followUp', { vehicle: j.vehicle || firstVehicle_(c), service: j.work || j.category || '' });
      }
      j.followUpSent = now_();
      saveRecord_('Jobs', j);
    });
  }

  if (s.autoServiceReminder) {
    const lastJob = {};
    jobs.forEach(j => {
      if (!j.date) return;
      if (!lastJob[j.clientId] || j.date > lastJob[j.clientId].date) lastJob[j.clientId] = j;
    });
    Object.keys(lastJob).forEach(id => {
      const c = clients[id], j = lastJob[id];
      if (!c) return;
      const due = addMonths_(parseDate_(j.date), s.serviceReminderMonths).getTime();
      const alreadySent = c.serviceReminderSent && c.serviceReminderSent > j.date;
      if (due > now || alreadySent || now - due > 30 * DAY) return;
      autoMessage_(c, 'service', { vehicle: j.vehicle || firstVehicle_(c) });
      c.serviceReminderSent = now_();
      saveRecord_('Clients', c);
    });
  }
}

/** Morning email to you: today's appointments and new leads. */
function dailyDigest() {
  const s = settings_();
  if (!s.dailyDigest) return;
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const yesterday = Utilities.formatDate(new Date(Date.now() - 24 * 3600 * 1000), TZ, "yyyy-MM-dd'T'HH:mm");
  const clients = {};
  readTable_('Clients').forEach(c => { clients[c.id] = c; });
  const appts = readTable_('Appointments')
    .filter(a => a.status === 'Scheduled' && String(a.start).slice(0, 10) === today)
    .sort((a, b) => a.start < b.start ? -1 : 1);
  const leads = readTable_('Clients').filter(c => c.status === 'New lead');
  const fresh = readTable_('Interactions').filter(i => String(i.type).indexOf('Website form') === 0 && i.date >= yesterday);
  const texts = readTable_('Outbox').filter(t => t.status === 'Pending');
  if (!appts.length && !fresh.length && !leads.length && !texts.length) return;

  const lines = ['Good morning! Here is your day.', ''];
  lines.push('TODAY\'S APPOINTMENTS (' + appts.length + ')');
  if (!appts.length) lines.push('  None');
  appts.forEach(a => {
    const c = clients[a.clientId] || {};
    lines.push('  ' + prettyTime_(a.start) + '  ' + fullName_(c) + '  ' + (a.service || '') +
      (c.phone ? '  ' + c.phone : '') + (a.location || c.address ? '  @ ' + (a.location || c.address) : ''));
  });
  lines.push('', 'NEW WEBSITE REQUESTS SINCE YESTERDAY (' + fresh.length + ')');
  if (!fresh.length) lines.push('  None');
  fresh.forEach(i => lines.push('  ' + fullName_(clients[i.clientId] || {}) + ': ' + i.summary));
  lines.push('', 'Leads still marked "New lead": ' + leads.length);
  if (texts.length) lines.push('Texts waiting for you to send: ' + texts.length + ' (open the CRM Dashboard)');
  MailApp.sendEmail(ownerEmail_(s), 'Your day - ' + prettyDate_(today), lines.join('\n'), { name: s.businessName + ' CRM' });
}

function autoMessage_(client, kind, vars) {
  const s = settings_();
  const v = Object.assign({
    firstName: client.firstName || 'there', name: fullName_(client), business: s.businessName,
    phone: s.businessPhone, reviewLink: s.reviewLink, vehicle: firstVehicle_(client),
    location: client.address || '', service: '', date: '', time: ''
  }, vars);
  if (!v.vehicle) v.vehicle = 'vehicle';
  const sent = [];
  let text = '';
  if (s.sendEmail && client.email && client.okEmail !== false) {
    try {
      text = fill_(s[kind + 'Body'], v);
      sendEmail_(client.email, fill_(s[kind + 'Subject'], v), text);
      sent.push('email');
    } catch (e) { logInteraction_(client.id, 'Note', 'Auto email failed: ' + e.message); }
  }
  if (sent.length) logInteraction_(client.id, 'Auto email', KIND_LABEL[kind] + ' sent. ' + text);
  // Texts are not sent by the CRM. They wait in "Texts to send" for one tap on your phone.
  if (s.sendSms && e164_(client.phone) && client.okText !== false) {
    saveRecord_('Outbox', {
      clientId: client.id, created: now_(), kind: kind, phone: e164_(client.phone),
      body: fill_(s[kind + 'Sms'], v), status: 'Pending', expires: v.expires || ''
    });
    sent.push('text queued');
  }
  return sent;
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
  const title = (appt.service || 'Appointment') + ' - ' + fullName_(c);
  const desc = [
    c.phone ? 'Phone: ' + c.phone : '', c.email ? 'Email: ' + c.email : '',
    appt.vehicle ? 'Vehicle: ' + appt.vehicle : '', appt.notes ? 'Notes: ' + appt.notes : '',
    '', 'Added from the Cowboy Mechanics CRM'
  ].filter((l, i, a) => l || i === a.length - 2).join('\n');
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
    .setFontWeight('bold').setBackground('#23211f').setFontColor('#eae7e4');
  sh.setFrozenRows(1);
  Object.keys(TABLES[name]).forEach((k, i) => {
    const range = sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1);
    if (DATE_FIELDS.indexOf(k) >= 0) range.setNumberFormat('m/d/yyyy h:mm am/pm');
    else if (['phone', 'id', 'clientId'].indexOf(k) >= 0) range.setNumberFormat('@');
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

function readAll_() {
  return {
    clients: readTable_('Clients'),
    jobs: readTable_('Jobs'),
    appointments: readTable_('Appointments'),
    interactions: readTable_('Interactions'),
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
  if (!rec.id) rec.id = ID_PREFIX[name] + '-' + Utilities.getUuid().slice(0, 8);
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

function logInteraction_(clientId, type, summary) {
  saveRecord_('Interactions', { clientId: clientId, date: now_(), type: type, summary: summary });
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

function addMonths_(d, n) {
  const out = new Date(d.getTime());
  out.setMonth(out.getMonth() + n);
  return out;
}

function digits_(v) { return String(v || '').replace(/\D/g, ''); }

function e164_(v) {
  let d = digits_(v);
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d.length === 10 ? '+1' + d : '';
}

function fullName_(c) {
  return [c.firstName, c.lastName].filter(String).join(' ') || 'Unnamed client';
}

function firstVehicle_(c) {
  return String(c.vehicles || '').split('\n').map(v => v.trim()).filter(String)[0] || '';
}
