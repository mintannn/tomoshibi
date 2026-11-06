# Tomoshibi — the screens people see

Static pages. No build step, no web fonts, no trackers. The only other host the app talks to is its own back end
(the address in `live.json`, or the AI tool on this computer); the links to Stripe and to World App are opened by the person.

## Start here: `app.html`

**The app.** One page with two surfaces, shown as two tabs: the AI tool's chat, and TOMOSHIBI.

1. The AI tool asks you to put a key into a `.env` file. You answer "use TOMOSHIBI" instead.
2. TOMOSHIBI opens: the key stays here (once) → the permit (key, to, scope, until) → **continue on your Ledger**.
   The Ledger is never drawn inside the page. The page says to pick up the device, and waits.
3. The permit is signed. After that TOMOSHIBI stays out of sight: a routine request simply goes through,
   a heavier one waits for a press, a request outside the signed scope is refused.
4. *Trail* is the week in three numbers. *Flame* is where you light a star on the version you used
   (World confirms you are one real person).

**Words.** The app uses the function names fixed in the README and the journey, one per screen:
(the parts, the functions and the sequences are drawn in [`docs/STRUCTURE.md`](../docs/STRUCTURE.md))

| Screen (bar under the name) | Function | What the screen says |
|---|---|---|
| `CUSTODY`, `PERMIT`, `PERMIT SIGNED` | Custody + Permit | You never hand the key over. You hand over one use of it. |
| `WEIGHT` (quiet, weighing, `STOPPED`) | Weight | On an ordinary day it asks you nothing. No verdict, nothing runs. |
| `PRESS` (`NEEDS_PRESS`, by hand, you said no) | Press | Money cannot move while you are away. |
| `SCOPE + ATTRIBUTION` (`DENIED`) | Scope + Attribution | It did not get anywhere, and it has a name on it. |
| `TRAIL` (tab) | Trail | You can say what was stopped, and whose code tried it. |
| `FLAME` (tab) | Flame | You choose by whose star it is, not by how many. |

The page no longer says *lend*, *light* (for a star), *blocked* or *no verdict*: the permit is **signed**, a star is
**lit**, and the stops are `DENIED`, `NEEDS_PRESS`, `STOPPED`.

Every TOMOSHIBI screen says one thing: a bar under the name states the value in a few words, the headline states the
moment. After each step a green line says what you gained; while something is on its way the screen says what comes next.

| Mode | When | What it means |
|---|---|---|
| live | `broker/demo-agent.mjs` answers on `:8792` (or at `?agent=https://…`) | Requests go through the real Broker. With a Ledger connected, holds happen on the device; without one, a button on the page stands in and every record says so |
| live, hosted | no AI tool on this device, and `live.json` names one | The same, through the hosted copy (`Dockerfile`, `tools/hosted-start.sh`). It has no USB and no wallet key: a Ledger is connected from the browser, or the page's button stands in |
| preview | no AI tool reachable | Answers recorded from the real Broker and 0G (`scenes.json`) are replayed. The bottom bar says so. Nothing is sent |

The dark bar at the bottom is the demo's remote control: it makes the AI tool do something *now* (keys `1` `2` `3` `5`, `R` to start over).
In real life the tool does these on its own. `start.html` opens `app.html`; the earlier pages below are kept.
`?preview=1` keeps the page on the recorded answers whatever is reachable.

`window.tomoshibi` in the console shows the page's own state. `node tools/shots.mjs` renders `assets/tomoshibi-cover.png`
and `assets/shots/*.png` from these screens (sample data, real screens).

## The earlier pages

| Page | What it is |
|---|---|
| `gate.html` | **Your keys.** The console: lend a key to an AI tool on your Ledger, watch each request pass the gate (range, 0G's judgement, your hand), then light your light with World. It shows what the tool process (`broker/demo-agent.mjs`) reports. With no agent it replays `scenes.json`, recorded from the real Broker and 0G, and says so. |
| `index.html` | **The sky.** Every light is an AI tool. *Everyone* shows what a star count shows. *People I know* keeps only the tools that someone you know has lit. |
| `trace.html?thread=0x…` | **The record** of one request, top to bottom, with a QR to open the same record on a phone. |

## The journey (the bar at the top of every page)

| | Step | Where |
|---|---|---|
| 1 | **Choose a tool** — see which tools the people you know really use | computer |
| 2 | **Lend it a key** — plug in the Ledger, read the range, hold the button | Ledger |
| 3 | **Let it work** — it uses the key without holding it; you are asked only when it matters | Ledger, on the desk |
| 4 | **Your light goes on** — one real person, really using it; the next person sees it in step 1 | phone, World |

## Run it

```bash
cd broker && npm install && node src/server.js        # the Broker, on :8787
python3 -m http.server 8790 --directory web           # the pages
```

Open `http://localhost:8790/`. To point at a Broker somewhere else, add `?broker=http://host:port`.

## The gate, live

```bash
cd broker && node demo-agent.mjs        # the AI tool, on :8792. Add the bridge and a Ledger and it signs on the device
```

Open `http://localhost:8790/gate.html`. The tool asks when you press 1–5 in its terminal (or on the page). `scenes.json` is a copy of
`ui/scenes.json` so the hosted page has a recording to replay.

## Where each thing comes from

| Shown on screen | Source |
|---|---|
| Which pseudonyms lit which version of a tool | Broker, `GET /stars/:skill?version=` (`who`) |
| Who those pseudonyms are to you | **This browser only** (`localStorage`). It is never sent anywhere. |
| The 1,284 anonymous stars | Drawn by the page, to show what a sky of bought stars looks like. They are not data. |
| The tools and their ratings | A short list in `sky.js` (`CATALOG`). Example data. |
| Every line of the record | Broker, `GET /trace/:thread`. Nothing is filled in by the page. |

## What it does not do yet (stated on the page too)

- **The three dots.** The Broker ties a light to a real person (World) today. It does not yet
  tie a light to a Ledger approval or to recorded use, so those two dots stay dark.
- **"The tool changes" is a demo button.** In the product the version is the hash of the tool's
  manifest. Here a button bumps the version to show the lights going out.
- **The record is read from the Broker**, which is a point of trust. Only the 0G Storage root and
  transaction can be checked without it.
- **The QR works on one network only.** The record page shows a QR for itself (`qr.js`, written
  here, no library). A phone can follow it only if it can reach this computer and the Broker:
  open the page by the computer's network address, or add `&lan=<address>`.
- If the Broker cannot be reached, the sky shows sample data and says so in the header.

## Where it is hosted

**`https://mintannn.github.io/tomoshibi/` is the address to hand out** (GitHub Pages, repo `mintannn/tomoshibi`,
this folder as it is). `kou-uni.github.io/ethglobal-mumbai/web/` serves the same files from `main` and is the spare.

It has no Broker behind it, so on its own the keys page replays the recording and the sky shows sample
data, and both say so. Point it at a Broker with `?broker=https://…`. The Broker must be HTTPS.

```bash
git push https://github.com/mintannn/tomoshibi.git "$(git subtree split --prefix web HEAD)":refs/heads/main
```
