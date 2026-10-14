# Print Bridge

Relays print jobs from Mad Krapow (Vercel-hosted) to a network thermal printer
(raw ESC/POS over TCP 9100) on the restaurant LAN. Vercel serverless cannot
reach a LAN printer and browsers cannot open raw TCP — this dependency-free
Node agent is the delivery path, mirroring how Hubbo POS prints from its device.

## Setup

1. Find the printer's LAN IP (printer self-test page or DHCP leases).
2. On an always-on machine in the same LAN (POS laptop, mini PC, Raspberry Pi),
   create env config:

```bash
APP_URL=https://your-app.vercel.app        # or http://localhost:3000 in dev
PRINT_BRIDGE_SECRET=<same value as the app's PRINT_BRIDGE_SECRET>
PRINTER_HOST=192.168.1.100
PRINTER_PORT=9100
BRIDGE_PORT=7420                           # localhost manual-print endpoint
POLL_MS=4000                               # auto-print poll interval
BRIDGE_TOKEN=optional-token                # require it on /print from pages
```

3. Run: `node scripts/print-bridge/print-bridge.mjs`
4. Health check: `curl http://127.0.0.1:7420/health`

## How it works

- **Auto-print** — the bridge polls `GET {APP_URL}/api/print/jobs/claim` every
  `POLL_MS`. The app selects unprinted counter/GrabFood orders from the last
  24 h, renders ESC/POS bytes server-side, and claims each job exactly once by
  inserting an `order_events` marker (`printed_kitchen_docket`,
  `printed_receipt`, `printed_grabfood_ticket`) — Hubbo's already-printed
  dedup pattern. Job matrix: GrabFood orders print a GrabFood ticket; counter
  orders print a kitchen docket + receipt (cash receipts also kick the cash
  drawer via ESC p).
- **Manual prints** — the `/pos` and admin kitchen pages POST to
  `http://127.0.0.1:{BRIDGE_PORT}/print {order_id, type}`; the bridge renders
  via `POST /api/print/jobs/render` (REPRINT watermark by default) and sends
  the bytes. Printer failures surface to the page immediately. Chrome exempts
  `http://localhost` from mixed-content blocking, so this works from the
  HTTPS app.
- **Retries** — auto-print failures go to a local retry queue (5 attempts) for
  transient printer outages; exhausted jobs are logged loudly. Manual prints
  fail fast to the caller instead.

## Semantics / caveats

- A claimed job that exhausts retries will not auto-reprint (the printed
  marker is already set) — reprint manually from the kitchen/POS page.
- Only one bridge should run against one app environment (claim markers are
  inserted at claim time; two bridges could double-print under a race).
- The bridge binds to `127.0.0.1` only — it is not reachable from the LAN.
