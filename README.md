# Cowboy Mechanics CRM: setup guide

The CRM is a private web app that runs inside your Google account
(admincowboymechanics@gmail.com). It is completely separate from the website.
Only you can open it, because it asks you to sign in with that Google account.

What it does:

- A **Today** page: one to-do list of everything that needs you, color-coded.
  Red means act now (emergencies, leads waiting over a day, overdue follow-ups, unpaid jobs over a week,
  estimates with no answer for a week, appointments not marked done). Amber means today.
- Keeps every client with phone, email, address, vehicles, status, tags, notes, who referred them,
  and a **next step** with a follow-up date so no lead goes cold.
- Tracks **estimates**, checks in with the customer automatically after a few days, and shows your win rate.
- A **Sales** page: money made by month, where customers come from, what sells, best customers and top referrers.
- **Import a list** of clients (for example ones pulled out of old text messages) without creating duplicates.
- Logs every service you do: date, vehicle, mileage, work done, parts, labor, price paid, payment method.
- Shows total spent, number of visits and marks **Repeat** clients.
- Keeps an interaction history (calls, texts, emails, notes, website requests).
- Pulls in your website form requests automatically from the
  "Cowboy Mechanics - Form Submissions" sheet. That sheet is only read, never changed.
  A returning customer is matched by phone or email, so they do not get a duplicate.
- Books appointments straight onto your Google Calendar (with alerts 1 day and 1 hour before).
- Sends automatic emails: appointment reminders, a thank-you follow-up after a
  service, an optional "time for a check-up" reminder, and an optional reply to new website requests.
- Writes the matching texts for you to send from your own phone with one tap (free).
- Emails you a summary of your day every morning at 6 AM.

All the data is saved in a new Google Sheet called **Cowboy Mechanics - CRM**, which the app makes for you.

---

## Step 1. Create the Apps Script project (about 10 minutes)

1. Sign in to Google as **admincowboymechanics@gmail.com**.
2. Go to **https://script.google.com** and click **New project**.
3. Click the title "Untitled project" at the top and name it **Cowboy Mechanics CRM**.
4. **Code.gs**: delete everything in the editor, then copy all of `Code.gs` from
   this folder and paste it in.
5. **Index.html**: click the **+** next to "Files", choose **HTML**, name it `Index`
   (Google adds the `.html`). Delete what is in it, then paste all of `Index.html`.
6. **appsscript.json**: click the gear icon (**Project Settings**) on the left, tick
   **Show "appsscript.json" manifest file in editor**, go back to the editor (the `< >` icon),
   open `appsscript.json` and replace it with `appsscript.json`.
7. Click the save icon.

## Step 2. Run setup once

1. At the top of the editor, pick **setup** from the function dropdown and click **Run**.
2. Google asks for permission. Click **Review permissions**, pick your account.
   You will see "Google hasn't verified this app". That is normal for your own script:
   click **Advanced**, then **Go to Cowboy Mechanics CRM (unsafe)**, then **Allow**.
   (It is your own code, it only asks for your Sheets, Calendar and Gmail.)
3. When it finishes, the log at the bottom shows a link to your new CRM sheet.

## Step 3. Turn it into a web app

1. Click **Deploy** (top right) > **New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Set **Execute as: Me** and **Who has access: Only myself**.
4. Click **Deploy**, then copy the **Web app URL**.
5. Open that URL. That is your CRM. Bookmark it, and on your phone use
   "Add to Home Screen" so it opens like an app.

Your existing website requests show up the first time you open it.

## Step 4. Settings

Open **Settings** in the CRM:

- Add your **Google review link** so thank-you messages ask for a review
  (Google Business Profile > "Ask for reviews" gives you the link).
- Pick which automatic messages you want and when.
- Edit the message wording if you like. Words in curly brackets, like `{firstName}`, are filled in for you.
- Click **Send me a test email** to check email works.
- Click **Save settings**.

## How texting works (free)

Texting costs nothing and needs no extra service. The CRM writes every reminder and
follow-up text for you and puts it in **Texts to send** at the top of the Dashboard.
Open the CRM on your phone, tap **Send**, and your Messages app opens with the
text already filled in. Hit send. It comes from your own number, and the CRM logs it
in that client's history. **Skip** removes a text you don't want to send.

Your 6 AM summary email tells you when texts are waiting. A reminder text for an
appointment that has already passed disappears on its own.

Each client has an **OK to send automatic texts** checkbox. Untick it if someone
asks you to stop texting them.

---

## Everyday use

- **New lead from the website**: it shows on the Dashboard under "New leads to contact".
  Call them, then click **+ Log interaction** and set their status to Contacted or Quoted.
- **Booking**: on the client page click **+ Book appointment**. It goes on your Google Calendar
  and the day before, the customer gets a reminder email and a reminder text shows up for you to send.
- **Finished a job**: on the Appointments page click **Done**, then fill in the service and price.
  The client becomes a Customer. A few days later the thank-you email goes out and the thank-you text shows up in Texts to send.
- **Cancelling**: edit the appointment and set Status to Cancelled. It is removed from your calendar.

Good to know:

- Automatic messages only go to appointments and services from now on, so typing in
  old jobs will not send anyone a surprise message.
- Moving or editing appointments in Google Calendar directly does not update the CRM.
  Make changes in the CRM and they go to the calendar.
- Gmail lets a free account send about 100 automatic emails a day, which is plenty.

## Updating the code later

Paste the new code into the same files, save, then go to **Deploy > Manage deployments**,
click the pencil, choose **Version: New version** and **Deploy**. The URL stays the same.
