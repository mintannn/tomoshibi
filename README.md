# Tomoshibi — the screens people see

Three static pages. No build step, no web fonts, no trackers, no third-party requests.

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

## Hosted copy

`https://mintannn.github.io/tomoshibi/` serves this folder as it is (GitHub Pages, repo `mintannn/tomoshibi`).
It has no Broker behind it, so on its own it shows sample data and says so. Point it at one with
`?broker=https://…`. The Broker must be HTTPS: an https page cannot call an http one.

```bash
git push https://github.com/mintannn/tomoshibi.git "$(git subtree split --prefix web HEAD)":refs/heads/main
```
