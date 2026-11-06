# Tomoshibi — the screens people see

Two static pages. No build step, no web fonts, no trackers, no third-party requests.

| Page | What it is |
|---|---|
| `index.html` | **The sky.** Every light is an AI tool. *Everyone* shows what a star count shows. *People I know* keeps only the tools that someone you know has lit. |
| `trace.html?thread=0x…` | **The record** of one request, top to bottom, with a QR to open the same record on a phone. |

## Run it

```bash
cd broker && npm install && node src/server.js        # the Broker, on :8787
python3 -m http.server 8790 --directory web           # the pages
```

Open `http://localhost:8790/`. To point at a Broker somewhere else, add `?broker=http://host:port`.

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
