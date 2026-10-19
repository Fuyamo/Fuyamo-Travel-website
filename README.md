# Fuyamo Travel website

## The admin: fuyamo.co.za/admin

Use the admin for everyday changes, from any computer or phone:

- **Travel Talk:** write, edit or remove articles, with photos.
- **Trips:** prices, deposits, departure dates with their Yamo links, what's included, extras and photos. Add a new trip, or hide one without deleting it.
- **Photos, FAQs & reviews:** every section's photos (page headers, intro pills, Why cards, Moments, About, Services and the rest), the questions and answers, and the Google reviews with your rating and review count.

Photos can be any size, including straight from a phone. The site turns them upright and shrinks them.

**Saving publishes.** Each save is stored on GitHub (github.com/Fuyamo/Fuyamo-Travel-website). GitHub then rebuilds the site and uploads it to Afrihost, and the change is live about 3 minutes later. The repository's **Actions** tab shows each publish; a red cross means it didn't go through, and the log says why. Every earlier version is kept on GitHub, so any change can be undone.

**Signing in:** on the admin's sign-in screen, choose "Sign In Using Access Token" and paste a GitHub access token. To make one: on GitHub, go to Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token. Set the owner to **Fuyamo**, limit it to the **Fuyamo-Travel-website** repository, and give it **Contents: Read and write**. The admin remembers the token on that device. When it expires, make a new one.

**Analytics:** fuyamo.co.za/admin/analytics has the dashboard and links to Google Analytics and Search Console.

## What's in this folder

- **`site/`**: the website itself (pages are generated into it).
- **`content/`**, **`posts/`** and **`photos/`**: trips, FAQs, reviews, articles and photos. The admin edits these.
- **`site/js/content.js`**: contact and bank details, page titles and descriptions, and the wording of each section. Ask your developer for changes here.
- **`build.command`**: rebuilds the pages on this Mac to preview changes before they go live. GitHub runs the same build when publishing.
- **`.github/workflows/publish.yml`**: the automatic publishing to Afrihost.

The handoff zip and the reference images next to `site/` stay on this computer and aren't on GitHub.

## Going live (replacing the WordPress site)

1. In the Afrihost control panel, **back up the WordPress site**, then remove its files from the website folder (`public_html`). Don't change DNS or email settings: your email runs on Google and must stay as it is.
2. On GitHub, under the repository's Settings → Secrets and variables → Actions, add three secrets: `FTP_SERVER` (e.g. `ftp.fuyamo.co.za`), `FTP_USERNAME` and `FTP_PASSWORD`, from Afrihost's FTP details. If the website folder isn't `public_html/`, add a variable `FTP_DIR` with its path.
3. In the repository's **Actions** tab, run **Publish website**. It uploads the whole site, including the hidden `.htaccess` file. That file sends visitors to https://fuyamo.co.za, shows the "Page not found" page, and forwards the old WordPress addresses.
4. **Activate the forms:** send one enquiry from the live site, then click "Activate Form" in the email FormSubmit sends to info@fuyamo.co.za. Then test the corporate form, the "Leave your number" card and the birthday popup (`fuyamo.co.za/?offer`).
5. Open Google Analytics → **Reports → Realtime** and check that your own visit shows up.
6. Add the site to Google Search Console and submit `https://fuyamo.co.za/sitemap.xml` (see "Search engines" below).
7. On your phone, open a trip and check three things: "Reserve seat" opens the right Yamo trip, "Trip details" downloads the PDF, and Share works.

## Writing articles without the admin

Articles are Markdown files in `posts/`. `tools/post-template.md` shows the format. The file name becomes the web address: `visa-tips.md` is published at `fuyamo.co.za/travel-talk/visa-tips/`.

## Other edits

- **Trip details PDFs:** each trip page has a "Trip details" download. The PDF is `site/assets/trips/fuyamo-<year>-<key>.pdf`, for example `fuyamo-2027-bali.pdf`. The year comes from the trip's first date, and the key is the trip's web address. To update one, replace the file with the same name. The build lists any trip whose PDF is missing.
- **Yamo booking links:** each departure in the admin (Trips) has its own Yamo link. Paste it from Yamo (`app.yamo.travel/t/…`). `ref=fuyamo-site` is added automatically, so Yamo can see the visit came from the website.
- **Address:** `SITE.url` in `content.js` is set to https://fuyamo.co.za. Link previews and `sitemap.xml` use it.
- **Client logos (Corporate page band):** add the logo to `site/assets/logos/` as a PNG with a transparent background, about 112px tall, and add a line to `CLIENTS` in `content.js` with its name, file name and pixel width and height. The band sizes every logo to a similar weight automatically.

## Enquiry form, "Leave your number" card and birthday popup

Three things on the site send enquiries to info@fuyamo.co.za through [FormSubmit](https://formsubmit.co), a free form-to-email service, so no server is needed:

- **The Corporate page enquiry form.** If sending fails, the "Email us instead" button opens the visitor's email app with the enquiry already written.
- **The "Leave your number" card.** It opens from the WhatsApp buttons (menu, floating button, Contact page cards and similar) and from the home search when someone types a place we don't run a trip to. Visitors leave their name and a WhatsApp number or email. The email you receive includes the page they were on and a "Start the chat" link that opens WhatsApp with them. If JavaScript is off, those buttons open WhatsApp directly as before.
- **The birthday offer popup.** "Travel on your birthday. Get R500 off." asks for a birthday month, name and WhatsApp number, then lists the trips departing that month. It appears once, after someone has browsed for a bit (not on the Corporate or Contact pages). After "No thanks" it stays away for 14 days, and once claimed it doesn't come back. Add `?offer` to any address (e.g. `fuyamo.co.za/?offer`) to open it straight away, which is handy for social posts.

**Before launch, activate it once.** Send one test from the live site. FormSubmit then emails an "Activate Form" link to info@fuyamo.co.za. Click it, and everything is delivered from then on. Anything sent before activation isn't delivered.

To use a different inbox, change `forms` in `SITE` in `content.js` and publish. FormSubmit asks the new inbox to activate again.

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
