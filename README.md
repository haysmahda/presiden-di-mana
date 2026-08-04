# Presiden Di Mana Sekarang?

A website that shows where the President of Indonesia was **last publicly reported** to be,
based on Indonesian news coverage. Not GPS. Not real-time. Just reading the news, automatically.

> **Status: Step 1 of 6.** The website is built and working, but it is showing
> **fake sample data** right now so we can see the design. Real news data arrives in Step 3.

---

## How to look at the website on your computer

You need two things: a terminal window, and a browser.

**1. Open a terminal and go to the project folder:**

```bash
cd ~/presiden-di-mana
```

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

- An orange/amber warning bar at the very top saying **DATA CONTOH** — that's the reminder
  that the locations are fake for now. It disappears automatically once real data is flowing.
- A big headline: *"Presiden di mana sekarang?"* with the answer right underneath.
- A dark map of Indonesia with a **pulsing red dot** on the current location, smaller faded
  dots for previous locations, and a dashed line joining them.
- A **Lokasi Saat Ini** card floating over the map with the confidence score.
- A timeline of recent movements, each with buttons linking to news articles.
- A **Riwayat** page (top-right menu) with filters and statistics.

Try it on your phone too — resize the browser window narrow and everything should stack neatly.

---

## What's in this folder

| File / folder | What it does |
|---|---|
| `index.html` | The main page — map, current location, recent movements |
| `history.html` | The archive page — every recorded location, with filters |
| `assets/styles.css` | All the visual design |
| `assets/util.js` | Shared helpers (Indonesian dates, "3 jam yang lalu", source buttons) |
| `assets/app.js` | Makes the main page work |
| `assets/history.js` | Makes the archive page work |
| `data/locations.json` | **The database.** Right now: fake samples. Later: real news results |
| `data/gazetteer.json` | The list of known places + their coordinates. This one is **real** |

There is no build step, no framework, and nothing to install. It's plain HTML, CSS and
JavaScript, which is the cheapest and most beginner-proof thing to host.

---

## The six steps

- [x] **Step 0 — Setup.** GitHub account and repository.
- [x] **Step 1 — Static prototype.** The site, with fake data, previewable locally. ← *you are here*
- [ ] **Step 2 — The updater script.** Read real RSS feeds, find place names, print results.
- [ ] **Step 3 — Wire it together.** Script writes real data into `locations.json`.
- [ ] **Step 4 — Automate.** GitHub Actions runs it every 2 hours; deploy free.
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
