# Fuyamo Travel website

## The admin: fuyamo.co.za/admin

The Fuyamo dashboard, for everyday changes from any computer or phone:

- **Overview:** visitors, the next departures, recent changes and whether the latest save is live yet.
- **Trips:** prices, deposits, departure dates with their Yamo links, what's included, extras, photos and the trip details PDF. Add a trip, or hide one without deleting it.
- **Articles:** write, edit or remove Travel Talk articles, with photos.
- **Photos:** every section's photos: page headers, intro pills, Why cards, Moments, About, Services and the rest.
- **FAQs** and **Reviews** (with your Google rating and review count).
- **Analytics:** visitors, top pages, how people found the site, devices, countries and the "Reserve seat" vs "Secure seat" result.

Photos can be any size, straight from a phone. The site shrinks them and turns them upright.

**Saving publishes.** Each save goes to GitHub (github.com/Fuyamo/Fuyamo-Travel-website). GitHub rebuilds the site in about 2 minutes, and the hosting picks up the new version within 5 minutes, so changes are live 5–10 minutes after saving. The status at the top of the admin shows where a change is: building, going live or live. Every earlier version is kept on GitHub, so any change can be undone.

**Signing in** is with the team's code. The first time, the admin asks for a GitHub token and a code. The token is stored on GitHub locked with the code (`admin/key.json`), so after that people only need the code. Settings has "Change the sign-in code" and "Replace GitHub access" for when the token expires (about once a year).

**Analytics** needs a one-time Google setup (Settings → Google Analytics explains the steps). After that, each person sees the numbers by signing in with a Google account that has access to the site's Google Analytics.

## What's in this folder

- **`site/`**: the website itself (pages are generated into it).
- **`content/`**, **`posts/`** and **`photos/`**: trips, FAQs, reviews, articles and photos. The admin edits these.
- **`site/admin/`**: the admin itself (`admin.js`, `admin.css`).
- **`site/js/content.js`**: contact and bank details, page titles and descriptions, and the wording of each section. Ask your developer for changes here.
- **`build.command`**: rebuilds the pages on this Mac to preview changes before they go live. GitHub runs the same build when publishing.
- **`.github/workflows/publish.yml`**: the automatic publishing to Afrihost.

The handoff zip and the reference images next to `site/` stay on this computer and aren't on GitHub.

## How publishing works

1. A save in the admin (or a push to the `main` branch) starts **Publish website** on GitHub (`.github/workflows/publish.yml`). It builds the pages on a Mac and puts the finished site on the `live` branch.
2. On Afrihost, a cron job (cPanel → Cron Jobs) runs `/home/fuyamamk/fuyamo-deploy.sh` every 5 minutes. When `live` has changed, it copies the new version into `public_html` and adds a line to `/home/fuyamamk/fuyamo-deploy.log`. A copy of the script is in `tools/fuyamo-deploy.sh`.

No passwords are stored anywhere for this. To publish again without changing anything, run **Publish website** from the Actions tab.

The old WordPress site was backed up (`backup-10.19.2026_14-58-08_fuyamamk.tar.gz` in the hosting home folder) and its files moved to `/home/fuyamamk/wordpress-old`. Once you're sure you don't need them, delete that folder and the `fuyamamk_wp141` database in cPanel.

## After launch

1. **Test the forms:** send the corporate form, the "Leave your number" card and the birthday popup (`fuyamo.co.za/?offer`). Each should arrive at info@fuyamo.co.za and in the admin under Enquiries.
2. Open Google Analytics → **Reports → Realtime** and check that your own visit shows up.
3. Add the site to Google Search Console and submit `https://fuyamo.co.za/sitemap.xml` (see "Search engines" below).
4. On your phone, open a trip and check three things: "Reserve seat" opens the right Yamo trip, "Trip details" downloads the PDF, and Share works.

## Writing articles without the admin

Articles are Markdown files in `posts/`. `tools/post-template.md` shows the format. The file name becomes the web address: `visa-tips.md` is published at `fuyamo.co.za/travel-talk/visa-tips/`.

## Other edits

- **Trip details PDFs:** each trip page has a "Trip details" download. The PDF is `site/assets/trips/fuyamo-<year>-<key>.pdf`, for example `fuyamo-2027-bali.pdf`. The year comes from the trip's first date, and the key is the trip's web address. To update one, replace the file with the same name. The build lists any trip whose PDF is missing.
- **Yamo booking links:** each departure in the admin (Trips) has its own Yamo link. Paste it from Yamo (`app.yamo.travel/t/…`). `ref=fuyamo-site` is added automatically, so Yamo can see the visit came from the website.
- **Address:** `SITE.url` in `content.js` is set to https://fuyamo.co.za. Link previews and `sitemap.xml` use it.
- **Client logos (Corporate page band):** add the logo to `site/assets/logos/` as a PNG with a transparent background, about 112px tall, and add a line to `CLIENTS` in `content.js` with its name, file name and pixel width and height. The band sizes every logo to a similar weight automatically.

## Enquiry form, "Leave your number" card and birthday popup

Three things on the site send enquiries. Each one is saved in the **Fuyamo website enquiries** Google Sheet (in info@fuyamo.co.za's Drive), emailed to info@fuyamo.co.za (Reply goes straight to the customer) and listed in the admin under **Enquiries**:

- **The Corporate page enquiry form.** If sending fails, the "Email us instead" button opens the visitor's email app with the enquiry already written.
- **The "Leave your number" card.** It opens from the WhatsApp buttons (menu, floating button, Contact page cards and similar) and from the home search when someone types a place we don't run a trip to. Visitors leave their name and a WhatsApp number or email. The email you receive includes the page they were on and a "Start the chat" link that opens WhatsApp with them. If JavaScript is off, those buttons open WhatsApp directly as before.
- **The birthday offer popup.** "Travel on your birthday. Get R500 off." asks for a birthday month, name and WhatsApp number, then lists the trips departing that month. It appears once, after someone has browsed for a bit (not on the Corporate or Contact pages). After "No thanks" it stays away for 14 days, and once claimed it doesn't come back. Add `?offer` to any address (e.g. `fuyamo.co.za/?offer`) to open it straight away, which is handy for social posts.

The corporate form and the email option of the "Leave your number" card have an optional **Email me trip news and offers** tick box. Only people who tick it are subscribed to Plunk's marketing emails (POPIA).

### How it works

- **The script:** `tools/enquiries/Code.gs` runs in Google Apps Script, attached to the sheet (Extensions → Apps Script, project "Fuyamo enquiries", running as info@fuyamo.co.za). The website posts to its web app address, which is `forms.endpoint` in `content.js` and `enquiries.url` in `admin/settings.json`. To change the script, paste the new Code.gs into the editor, then Deploy → Manage deployments → edit (pencil) → Version: **New version** → Deploy. The address stays the same.
- **Spam:** a hidden field catches simple bots, and more than 30 messages in 10 minutes are refused.
- **In the admin:** Enquiries lists everything, newest first. Open one to email, WhatsApp or call them, paste the Yamo link of the trip you built and press **Send proposal**, set the status (New, Proposal sent, Booked, Not going ahead) and keep notes. It uses the same Google sign-in as Analytics, and only fuyamo.co.za accounts get in.
- **The sheet itself** can be opened, sorted and filtered like any spreadsheet. Don't rename the Enquiries tab or reorder its columns.

### Plunk (emails to customers)

The script tells [Plunk](https://useplunk.com) about each enquiry that has an email address, and about status changes, as events. Plunk's workflows then send the emails. It uses Plunk's public key (`pk_…`, the only key Plunk's event endpoint accepts), stored as the script property `PLUNK_PUBLIC_KEY` (Apps Script → Project Settings → Script properties). It's kept there rather than on the website, so nobody else can fire Fuyamo's events.

| Event | When | Data for the email (`{{ name }}` etc.) |
|---|---|---|
| `enquiry_received` | A form with an email address arrives (at most once per address every 6 hours) | `name`, `first_name`, `enquiry_type`, `enquiry_about` |
| `proposal_sent` | **Send proposal** in the admin (group trips: a Yamo link) | `name`, `first_name`, `trip`, `proposal_link`, `proposal_status` |
| `quote_sent` | **Send quote** in the admin (corporate enquiries: a link to the PDF quote) | same, plus `company` |
| `booked` | Status set to Booked | same |
| `not_going_ahead` | Status set to Not going ahead | same |

Workflows in Plunk: **Enquiry reply** (`enquiry_received` → the Enquiry received email) and **Proposal follow-up** (`proposal_sent` → Your proposal, then after 3 days and again after 7 more, a reminder only while the contact's `proposal_status` is still "Proposal sent"; Booked or Not going ahead in the admin stops them), and **Quote follow-up** (`quote_sent` → Your quote, Quote reminder, Quote last follow-up, the same way).

Corporate quotes: make the PDF, put it in Google Drive (Share → General access: Anyone with the link → Viewer), and paste that link into the enquiry's Quote card.

Use **Transactional** templates for replies and proposals (they reach everyone who enquired) and **Marketing** templates only for trip news (they skip people who didn't tick the box or who unsubscribed). The sheet's Plunk column shows what was sent, or why it failed.

## Button test: "Reserve seat" or "Secure seat"

Each trip page's main button (in the booking card and the bar pinned to the bottom on phones) has two labels being tested against each other. Visitors are split 50/50 and keep the same label on every visit. Google Analytics counts the views and clicks (`analytics.ga4` in `content.js`). It only runs on fuyamo.co.za itself, so previews don't count.

**Reading the result:** in Google Analytics, go to **Reports → Engagement → Events**.

| Event | What it counts |
|---|---|
| `seen_reserve_seat`, `seen_secure_seat` | Trip page views for each label |
| `click_reserve_seat`, `click_secure_seat` | Clicks on that label |

Divide each label's clicks by its views. The higher one converts better. Wait for at least 100 clicks per label before deciding, because small numbers swing a lot.

Every click also adds `cta=reserve_seat` or `cta=secure_seat` to the Yamo link, so if Yamo records it you can see which label led to paid deposits.

**Ending the test:** in `content.js`, keep only the winning label, e.g. `seatButton: ['Secure seat']`, and publish. Clicks are still counted under that label.

Analytics records visits and clicks without names or numbers. Mention Google Analytics in your privacy notice.

## Search engines

Every page is written out in full, with its own title, description, link-preview image and Google structured data. Trips are marked up as trips with prices and dates, articles as blog posts, the FAQ as an FAQ, and the business as a travel agency with its address. After going live:

1. Add the site to [Google Search Console](https://search.google.com/search-console) and submit `https://fuyamo.co.za/sitemap.xml`.
2. Make sure your Google Business Profile has the same name, address and phone number as the site.
3. Publish articles regularly. Each one is another way for people to find you.

## Previewing on this Mac

Run `build.command`, then open `site/index.html` in your browser. Links between pages work straight from disk.
