# Turkey Turkey

A one-phone web app for Thanksgiving bowling. It shuffles everyone onto lanes for each match, tracks how many games each person bowled, and splits the bill.

## What it does

- **Deals each match.** Lanes stay as even as possible (22 people on 4 lanes → 6 · 6 · 5 · 5). Each deal tries to put you with people you haven't bowled with yet, without just swapping half of one lane with half of another.
- **Avoids repeat lanes.** Nobody bowls the same lane number twice in a row, when it can be avoided. (You can turn this off in Setup.)
- **Keeps "never together" pairs apart**, in every format.
- **Looks after newcomers.** Mark someone as a newcomer, pick who they know, and they'll bowl with one of those people for their first 2 games (the number is adjustable).
- **Pairs games.** Every lane gets an even number of bowlers so everyone has a partner. With an odd head count, one group becomes a trio. Pairs games count as ½ game on the bill.
- **People come and go.** Check people in and out on the People tab. Add someone to a match that's already going, swap or move anyone, or sit someone out.
- **Settle up.** Enter the bill and each person's share is worked out from their games. The shares add up to the exact total, and you can share a summary to the group chat.
- **Flexible lanes.** Use 1 to 6+ lanes with your own numbers (e.g. 17–20), and turn them on or off during the night.

## Where the data lives (free, no account)

Everything is saved in the phone's browser storage (`localStorage`). Nothing is sent anywhere.

- **Add it to your Home Screen** (Safari → Share → Add to Home Screen). It then opens full screen, works with bad bowling-alley Wi-Fi, and Safari won't clear its data for going unused.
- Use **Setup → Back up** to save a `.json` file to Files or AirDrop it to yourself, and **Restore** to load it back.
- **Setup → Start a new night** keeps your people, who-knows-who and never-together pairs for next year, and clears games, check-ins and the bill.

> This repo is public if you host it on GitHub Pages's free plan, so the roster is deliberately **not** stored in the repo. Names and never-together pairs stay on your phone.

## Hosting on GitHub Pages

There's no build step. The repo root is the site.

1. Push this repo to GitHub.
2. Go to **Settings → Pages**. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch to `main`, folder `/ (root)`.
3. Open `https://<your-user>.github.io/turkey-turkey/` on your iPhone, then Share → **Add to Home Screen**.

## Developing

```bash
npm start   # serves on http://localhost:8080 (python3 http.server)
npm test    # node --test: dealing rules, bill split, backups
```

- `js/engine.js` — pure logic: lane sizes, the dealer (simulated annealing over swaps, scored by the rules below), game totals and bill split.
- `js/store.js` — localStorage, backups, new night.
- `js/app.js` — the UI (vanilla JS, no framework).
- `sw.js` — offline support (network first, cache fallback).
- `tools/make-icons.mjs` — regenerates the PNG icons.

### How a deal is scored

Each candidate lineup gets a cost, and the dealer keeps the cheapest one it finds. When several lineups tie for cheapest, it picks one of them at random.

| Rule | Cost |
| --- | --- |
| A never-together pair on one lane | 1,000,000 |
| A newcomer (still in their buddy games) without someone they know on their lane (or as their partner, in pairs) | 10,000 |
| Same lane number as that person's previous match | 120 |
| Two people who already shared a lane *c* times | 10 × *c*² |
| …and they were together in the very last match | +6 |
| Two people who were already partners (pairs games) | 40 per time |

There's a trade-off between avoiding repeat lanes and mixing people. With 22 people over 6 matches on 4 lanes, avoiding repeats means the group covers about 189 of the 231 possible pairings. Turning that rule off raises it to about 208; a blind shuffle gets about 178.
