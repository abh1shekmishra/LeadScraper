# Agent setup

Everything the autonomous agent needs, in order. All of it is free except the
Anthropic API (pay-as-you-go, a few dollars a month at the default limits).

Create a file named `.env.local` in the project folder (copy `.env.example`)
and fill it in as you go.

## Required

### 1. Anthropic API key (drafting, gig scoring, previews)
1. Go to https://console.anthropic.com and sign in.
2. **Settings → Billing**: add credit (prepaid; $5 lasts a long time on Haiku).
3. **Settings → API Keys → Create Key**, name it `LeadScraper`, copy it.
4. In `.env.local`: `ANTHROPIC_API_KEY=sk-ant-...`

### 2. Google PageSpeed API key (the "scored 23/100" check)
1. Go to https://console.cloud.google.com and create a project (any name).
2. **APIs & Services → Library**, search **PageSpeed Insights API**, click **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**. Copy it.
4. Optional but good: click the key, **Restrict key → PageSpeed Insights API**.
5. In `.env.local`: `PAGESPEED_API_KEY=...`

No billing account is needed. Without the key Google rejects the calls and the
check is skipped.

### 3. Gmail App Password (sending email + reading replies)
1. Go to https://myaccount.google.com/security and turn on **2-Step Verification**.
2. Go to https://myaccount.google.com/apppasswords, name it `LeadScraper`, **Create**.
3. Copy the 16-character password (spaces don't matter).
4. In `.env.local`:
   ```
   GMAIL_USER=you@gmail.com
   GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
   ```

### 4. Your details in `src/agent/config.ts`
- `CONFIG.fromName`: the name on your emails.
- `POSTAL_ADDRESS` in `.env.local` (not in code, so it never reaches GitHub):
  any postal address you can receive mail at (a PO box is fine). US law requires
  it in cold email; US emails stay queued until set.
- `PROFILE.portfolioUrl`: a link to your work. Gig replies include it.
- `PROFILE.skills`: keep it to what's true; Claude won't claim more.

### 5. Build and test the Maps scraper
The official 1.18.2 Windows release fails with "unexpected page type"
(gosom/google-maps-scraper#322). `bin\src` holds its source with the one-line fix.
1. Install Go from https://go.dev/dl/ (Windows .msi, defaults), then open a NEW terminal.
2. Run `build-scraper.cmd` (project folder). It creates `bin\google-maps-scraper.exe`.
3. Test once (the first run also downloads the browser it drives):
   ```
   cd /d C:\Users\Admin\Desktop\LeadScraper\bin && google-maps-scraper.exe -input q.txt -results out.json -json -depth 1 -email -exit-on-inactivity 5m
   ```
   `out.json` should list businesses. Delete it afterwards.

### 6. Link WhatsApp (first agent start only)
Start the agent (below). Its window prints a QR code. On your phone:
**WhatsApp → Settings → Linked devices → Link a device**, scan it. Later starts
log in by themselves (session saved in `data/wa-session`).

## Optional

### 7. Cloudflare Pages (free concept preview sites)
1. Sign up at https://dash.cloudflare.com (free plan).
2. **Account ID**: on the dashboard home, open **Workers & Pages**; the
   Account ID is in the right sidebar. Copy it.
3. **API token**: profile icon → **My Profile → API Tokens → Create Token →
   Custom token**. Permission: **Account → Cloudflare Pages → Edit**. Create, copy.
4. In `.env.local`:
   ```
   CLOUDFLARE_API_TOKEN=...
   CLOUDFLARE_ACCOUNT_ID=...
   ```
5. Create the project once (in the project folder):
   ```
   npx -y wrangler@4 pages project create leadscraper-previews --production-branch main
   ```
   If it says the name is taken, pick another and put it in `PREVIEWS.project`
   in `src/agent/config.ts`. Previews then live at
   `https://<project>.pages.dev/<business>/`.

### 8. Phone alerts for replies and great gigs (ntfy)
1. Install the **ntfy** app (Android / iOS).
2. Tap **+**, server `ntfy.sh`, topic: a long random name only you know,
   e.g. `ls-7f3k9q2m8x1v5b4n`.
3. In `.env.local`: `NTFY_TOPIC=ls-7f3k9q2m8x1v5b4n`

## Start

Double-click **`start-agent.cmd`**. It opens the dashboard, the agent, and
http://localhost:3000/queue. Keep the PC on and awake while it runs.

- **Shadow mode (default)**: nothing is sent until you press **Approve** in `/queue`.
- **Autonomous**: once you trust the drafts, set `autonomous: true` in
  `src/agent/config.ts` and restart. Follow-ups and new drafts then send on their own.
- Stop: press Ctrl+C in the agent window. Progress is saved; starting again resumes.
