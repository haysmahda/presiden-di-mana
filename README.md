# Presiden Di Mana Sekarang?

### → **[haysmahda.github.io/presiden-di-mana](https://haysmahda.github.io/presiden-di-mana/)**

A website that shows where the President of Indonesia was **last publicly reported** to be,
based on Indonesian news coverage. Not GPS. Not real-time. Just reading the news, automatically.

> **Status: Step 4 of 6.** The site is live and runs itself. A robot re-reads the news
> **every 2 hours**, and any new location publishes automatically within a minute or two.
> You don't have to do anything to keep it running.

## The robot

Two things run by themselves on GitHub's servers, for free. You can watch both on the
**Actions** tab of the repository.

| Workflow | When it runs | What it does |
|---|---|---|
| **Perbarui lokasi** | every 2 hours | Reads the feeds, updates `data/locations.json` if something changed |
| **Terbitkan situs** | on every change | Publishes the site to its live address |

**To force an update right now** instead of waiting for the next 2-hour slot:
go to the repo → **Actions** tab → **Perbarui lokasi** in the left sidebar →
**Run workflow** button → **Run workflow**. Give it about a minute.

**If a run fails**, GitHub emails you. Click into the red run on the Actions tab to see
which step broke — the scanner prints the reason in plain language.

Quiet runs make no commit at all. The scanner only writes when a location actually
changes, or when the "last checked" clock is more than 6 hours stale — otherwise the
repository would collect 12 pointless commits a day.

---

## How to look at the website on your computer

You need two things: a terminal window, and a browser.

**1. Open a terminal and go to the project folder:**

```bash
cd ~/presiden-di-mana
```

(You only need this for local development — the live site runs on its own.)

**2. Start a tiny local web server:**

```bash
python3 -m http.server 8000
```

You should see a line like `Serving HTTP on 0.0.0.0 port 8000`. Leave this running.

**3. Open your browser and go to:**

```
http://localhost:8000
```

That's it. You should see the site.

**4. To stop it:** click on the terminal window and press `Ctrl` + `C`.

> **Why can't I just double-click `index.html`?**
> The site loads its data from a separate file, and browsers block that when you open a file
> directly from your hard drive. The little server above is the standard way around it.

### What you should see

- **No** orange warning bar. That bar only appears while the data is fake; now that real
  news is flowing it hides itself. If you ever see it come back, something reset the data.
- A big headline: *"Presiden di mana sekarang?"* with the answer right underneath.
- A dark map of Indonesia with a **pulsing red dot** on the current location, smaller faded
  dots for previous locations, and a dashed line joining them.
- A **Lokasi Saat Ini** card floating over the map with the confidence score.
- A timeline of recent movements, each with buttons linking to news articles.
- A **Riwayat** page (top-right menu) with filters and statistics.

Try it on your phone too — resize the browser window narrow and everything should stack neatly.

---

## How to run the news scanner

This is the robot that reads the news. It **only prints to the screen** — it cannot change
the website or any file, so you can run it as often as you like without breaking anything.

```bash
node scripts/update.js
```

It prints five sections: which feeds it reached, how many articles mentioned the President,
how many named a place it recognises, the locations it found with a confidence score each,
and its single best guess at the bottom.

Useful variations:

| Command | What it does |
|---|---|
| `node scripts/update.js` | Normal run — last 72 hours |
| `node scripts/update.js --hours=168` | Look back a whole week |
| `node scripts/update.js --verbose` | Also show what it *rejected* and why |
| `node scripts/update.js --json` | Machine-readable output |
| `node scripts/update.js --write` | **Actually update the website** (see below) |

### Updating the website with fresh news

```bash
node scripts/update.js --write
```

Without `--write` the script can only look. With `--write` it updates `data/locations.json`,
which is what the website reads. Reload the page in your browser and the new location
is there.

Rules it follows when writing, so it can't quietly wreck your data:

- **Two independent outlets minimum.** A location reported by only one outlet is held
  back and listed as *"Ditahan (baru satu media)"*. It gets published later if a second
  outlet confirms it.
- **Same visit, same pin.** Re-running it doesn't create duplicates — it tops up the
  existing entry with any new articles it found and recalculates the confidence.
- **Confidence can rise but not fall.** Each outlet keeps its best contribution, so a
  later run that happens to see fewer articles won't downgrade a solid location.
- **A quiet run changes nothing.** If it finds no confirmed location it leaves your
  locations alone and only updates the "last checked" time.
- **Running it twice in a row is a no-op.** Verified.

### Where the news comes from

Listed in `scripts/sources.json`, every URL tested and working:
**Sekretariat Kabinet** (official), **Antara** (state news agency, two feeds),
**detikNews**, **CNN Indonesia**, **Tempo**, **Liputan6**.

Three sources from the original plan are deliberately **not** used, and the reason for each
is written into `scripts/sources.json` so nobody adds them back by accident:

- **Kompas** — their `robots.txt` explicitly forbids automated data mining and using their
  content for software, without written permission. That's a no.
- **presidenri.go.id** — the entire site sits behind a Cloudflare bot challenge. Using it
  would mean defeating an anti-bot measure. Setkab covers official activity instead.
- **Tribunnews** — serves its feed to browsers but returns 403 to anything that honestly
  identifies itself as a script. We're not going to pretend to be a browser.

### How it avoids getting the answer wrong

Naively matching place names is badly wrong a lot of the time. Real examples the scanner
caught on its first run, all of which would have put the President in the wrong country:

- *"Jamuan Prabowo untuk PM Thailand di Istana"* — he is **hosting** the Thai PM in Jakarta.
  The scanner detects host-language (`menjamu`, `menyambut`, `menerima kunjungan`) and then
  ignores foreign place names in that article.
- *"Prabowo-PM Thailand Dorong Penyelesaian Konflik Myanmar"* — Myanmar is the **topic**.
  Words like `konflik`, `kerja sama`, `perdamaian` near a place name veto it.
- *"Rute Baru Jakarta-Bangkok"* — a flight route. Hyphenated `X-Y` pairs are vetoed.
- *"PM Thailand"*, *"Dubes Jepang"* — a place after a job title describes a **person**.
- A country name on its own (`Thailand`) can never establish a location, no matter how many
  outlets repeat it. Those live in `weak_aliases` in the gazetteer.

Newspaper datelines are stripped too — nearly every Indonesian article begins
`Jakarta (ANTARA) -`, which would otherwise put him in Jakarta permanently.

## What's in this folder

| File / folder | What it does |
|---|---|
| `index.html` | The main page — map, current location, recent movements |
| `history.html` | The archive page — every recorded location, with filters |
| `assets/styles.css` | All the visual design |
| `assets/util.js` | Shared helpers (Indonesian dates, "3 jam yang lalu", source buttons) |
| `assets/app.js` | Makes the main page work |
| `assets/history.js` | Makes the archive page work |
| `data/locations.json` | **The database.** Real locations, written by the scanner |
| `data/gazetteer.json` | The list of known places + their coordinates. This one is **real** |
| `scripts/update.js` | The news scanner — reads RSS, finds places, scores confidence |
| `scripts/sources.json` | Which feeds to read, how much to trust each, and what we exclude |

There is no build step, no framework, and nothing to install. It's plain HTML, CSS and
JavaScript, which is the cheapest and most beginner-proof thing to host.

---

## The six steps

- [x] **Step 0 — Setup.** GitHub account and repository.
- [x] **Step 1 — Static prototype.** The site, with fake data, previewable locally.
- [x] **Step 2 — The updater script.** Read real RSS feeds, find place names, print results.
- [x] **Step 3 — Wire it together.** Script writes real data into `locations.json`.
- [x] **Step 4 — Automate.** GitHub Actions every 2 hours; live free on GitHub Pages. ← *you are here*
- [ ] **Step 5 — Polish.** Stats, share image, English toggle.

---

## Ground rules built into this project

- Only **publicly reported** information. Never real-time, never GPS.
- Every location links back to the news articles that reported it. Headlines only —
  never the full article text.
- A visible disclaimer in Indonesian and English on every page.
- No predicting future movements, and no private residence details beyond mainstream reporting.
- RSS over scraping; respect `robots.txt` and rate limits.

---

## Credits

Map tiles by [CARTO](https://carto.com/attributions), data by
[OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
Map rendering by [Leaflet](https://leafletjs.com/).

Independent project. Not affiliated with the government of Indonesia or any political party.
