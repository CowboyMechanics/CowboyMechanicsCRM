# Cowboy Mechanics CRM

A private app for Russell that keeps track of every call, text, website request,
appointment and client, so nothing slips through the cracks. It runs inside the
**admincowboymechanics@gmail.com** Google account and is separate from the website.
Only that account can open it.

## What it does

- **Home** is a to-do list of everything to get back to: calls he logged, missed calls,
  texts, website requests, follow-ups and thank-you texts. Tap the circle to check one off.
  Anything waiting 3 hours or more turns red. Next to it: today's appointments, the next
  7 days, the 3 newest website requests, and a marketing to-do list.
- **Log a call** (the big + button): right after hanging up, type or say the name, vehicle
  and what they need, and pick reminders: in 1 hour, in 3 hours, or every hour until it is
  checked off. The phone buzzes with an alert, and tapping it calls the customer back.
- **Missed calls and texts** get an automatic text from Russell's phone, and they land on the to-do list.
- **Website requests** land on the to-do list, with the day they asked for, and Russell gets an alert.
- **Calendar**: a month view with name and time on each day. Tap an appointment for the address,
  directions, phone and notes. Tap a day to book it. Everything booked goes on Google Calendar.
- **Clients**: only name and phone are required. Each client has their jobs (reason, services done,
  products used, what he charged, notes), a photo gallery, appointments, history and "last contacted".
- **Automatic messages**: a reminder the day before an appointment and a thank-you after a job,
  by email on their own, and as a text ready for one tap on the to-do list.
- **6 AM email** with the day's appointments and everyone still waiting on a call back.

All data is saved in a Google Sheet called **Cowboy Mechanics - CRM**, and photos in a Google Drive
folder called **Cowboy Mechanics CRM Photos**. The website's form sheet is only read, never changed.

Everything here is free. The phone part uses two free Android apps: **ntfy** (alerts) and
**MacroDroid** (auto-reply texts and the "log last call" button).

---

## Part 1. Set up the CRM (on a computer, about 15 minutes)

1. Sign in to Google as **admincowboymechanics@gmail.com**.
2. Go to **script.google.com**, click **New project**, and rename it **Cowboy Mechanics CRM**.
3. Copy in the 3 files from this repo. On GitHub, each file's **Copy raw file** button copies it all.
   - **Code.gs**: delete what is in the editor and paste `Code.gs`.
   - **Index**: click **+** next to Files, choose **HTML**, name it `Index`, delete what is inside, paste `Index.html`.
   - **appsscript.json**: click the gear (**Project Settings**), tick **Show "appsscript.json" manifest file**,
     go back to the editor, open `appsscript.json` and replace it with this repo's version.
   - Click save.
4. Pick **setup** in the dropdown at the top and click **Run**. Allow the permissions it asks for
   (on "Google hasn't verified this app", click **Advanced**, then **Go to Cowboy Mechanics CRM**).
5. Click **Deploy > New deployment**, gear icon, **Web app**. Set **Execute as: Me** and
   **Who has access: Only myself**. Click **Deploy** and copy the **Web app URL**. That is the CRM.
6. On Russell's phone, open that link in Chrome (signed in as admincowboymechanics@gmail.com),
   tap **⋮ > Add to Home screen**.
7. In the CRM, open **Settings**, add the Google review link, check the wording, and **Save**.

## Part 2. Alerts on the phone with ntfy (5 minutes)

1. Install **ntfy** from the Play Store.
2. In the CRM, go to **Settings > Your phone** and copy the **Alert topic**.
3. In ntfy tap **+**, paste the topic, and tap **Subscribe**.
4. In the CRM tap **Send me a test alert**. It should pop up on the phone.

Alerts are quiet from 9 PM to 7 AM (you can change that in Settings). The topic name works like a
password, so don't share it.

## Part 3. Auto-replies and "log last call" with MacroDroid (20 minutes)

Install **MacroDroid** from the Play Store and allow the permissions it asks for (phone, SMS,
contacts). The free version allows 5 macros, and you need 4. In **Settings > Your phone** in the CRM
you'll find the **phone code** and the **email** the steps below use. In MacroDroid, the **...**
button next to a text box inserts values like the caller's number.

**Macro 1: Missed call auto-reply**
- Trigger: **Call Missed**, from numbers **not in contacts**.
- Action: **Send SMS** to the caller's number (`{call_number}`), with the auto-reply text from CRM Settings.
- Action: **Send Email** to the CRM email, subject `CRM <phone code> missed {call_number}`.

**Macro 2: Text auto-reply**
- Trigger: **SMS Received**, from numbers **not in contacts**.
- Action: **Send SMS** to the sender (`[Incoming SMS Num]`), with the auto-reply text.
- Action: **Send Email** to the CRM email, subject `CRM <phone code> text {sms_number}`, body `{sms_message}`.

**Macro 3: Remember the last caller**
- Trigger: **Call Ended**.
- Action: **Set Variable**, a global text variable named `lastCaller`, set to `{call_number}`.

**Macro 4: Log last call button**
- Trigger: none (choose **Empty trigger**).
- Action: **Open Website**: the "CRM link" from CRM Settings with the `lastCaller` variable added at the end.
- Then add it to the home screen: long-press the home screen, **Widgets > MacroDroid > Macro shortcut**,
  and pick this macro. Name it **Log call**.

Test each one: call the phone from another number and don't answer, then text it, then tap the
**Log call** button after a call. Missed calls and texts show up on the to-do list within 5 minutes.

Tips:
- Save regular customers to the phone's contacts so they don't get the auto-reply every time they text.
- Only text people who contacted you first. The auto-reply is a reply, not marketing.

## Day to day

1. **Morning**: read the 6 AM email, open the CRM, work down the to-do list.
2. **After every call**: tap **+**, fill in what they need, pick a reminder.
3. **Book it**: tap **Book** on the to-do item. It goes on Google Calendar and checks the call off.
4. **After the job**: tap **Done, log job** on the appointment and fill in services, products and price.
   Add before and after photos on the client's page.
5. **Thank-you**: a few days later it is ready on the to-do list. Tap **Send text**.

## Updating the code later

Paste the new code into the same files, save, then **Deploy > Manage deployments**, click the pencil,
choose **Version: New version**, and **Deploy**. The link stays the same.
