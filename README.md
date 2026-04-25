# car_listing_dashboard

Personal local dashboard for tracking newest Autoplius car listings based on your filter URL.

## What this project does

- Polls an Autoplius search URL on a schedule.
- Stores a local history of seen listings.
- Highlights newly discovered listings with a **NEW** badge.
- Shows basic listing details (title, price, Autoplius "updated" hint, first seen timestamp).
- Supports manual polling ("Poll now") and live UI updates through server-sent events.

## Stack

- Node.js + Express backend
- Playwright + Cheerio scraper
- Optional Anthropic Claude fallback parser
- Static frontend (HTML/CSS/JS)
- JSON state storage at `data/state.json`

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Install Playwright browser runtime:

   ```bash
   npx playwright install chromium
   ```

   If you are on Windows and still see `Executable doesn't exist...chrome-headless-shell.exe`,
   run:

   ```bash
   npx playwright install
   ```

   Then stop and start the server again (`npm start`).

3. Start the dashboard:

   ```bash
   npm start
   ```

4. Open:

   ```text
   http://localhost:3100
   ```

## Default filter

The default configured search URL is:

```text
https://autoplius.lt/skelbimai/naudoti-automobiliai/bmw/x3-m?year_min=2020&year_max=2022
```

You can change it in the dashboard form and save.

## Configuration options in UI

- **Search URL**: full Autoplius query URL.
- **Poll interval**: seconds between scans (minimum 15 seconds).
- **NEW badge window**: for how many minutes a listing is marked as NEW after first discovery.

## Notes about anti-bot protection

Autoplius may show anti-bot challenges (Cloudflare Turnstile), especially from cloud servers or aggressive polling.

If that happens, this app now reports an explicit error in Status and keeps previous data in memory/history. For best success:

- Run on your local machine/IP.
- Use reasonable polling intervals (for example 60-180 seconds).
- Keep search pages simple and specific.

## Scripts

- `npm start` - run server
- `npm run check` - syntax checks for project JS files
- `npm test` - alias for `npm run check`

## Optional Claude fallback parser

This project supports an optional second-stage parser using Anthropic Claude.

- Primary parser is still deterministic (regex + HTML parsing).
- Claude is used only as a fallback for records with missing fields.
- You can toggle this in UI from **Parser mode**.

### Enable it

Set your API key before starting app:

```bash
export ANTHROPIC_API_KEY="your_api_key_here"
```

Optional model override:

```bash
export ANTHROPIC_MODEL="claude-3-5-haiku-latest"
```

Then run:

```bash
npm start
```

If `ANTHROPIC_API_KEY` is not set, the toggle remains unavailable and deterministic parser is used only.

## Troubleshooting

### Playwright browser missing (Windows/macOS/Linux)

If dashboard status shows a message like:

`Playwright browser is not installed`  
or  
`Executable doesn't exist ... chrome-headless-shell...`

fix it with:

```bash
npx playwright install chromium
```

If the problem persists:

```bash
npx playwright install
```

Then restart the app:

```bash
npm start
```
