---
name: commission-run
description: Monthly Lissome commission runbook. Use when asked to run the monthly commission, process a Mindbody payroll export, change staff hurdles, or produce the Talenox payments report. Covers convert, dry-run, verify, live-run, and the Sioban reply.
---

# Commission Run — Monthly Payroll Runbook

Repo: `~/Git/Commission` (branch per month: `YYYYMM-payroll`). Safety default is
dry-run; live Talenox/Drive writes happen only on explicit user request.

## 0. Preflight

1. `git branch --show-current` — expect the `YYYYMM-payroll` branch; create it
   from `master` if missing.
2. Ownership check (mixed `barryg`/`barrygfo` ownership silently blocks writes):
   `find logs .test-output payments data config/staffHurdle.json -not -user "$(whoami)"`.
   Move strays aside (`mv <file> /tmp/`); never `sudo`.
3. Confirm `config/staffHurdle.json` is writable the same way (replace via `mv`,
   not in-place edit, if owned by another user).

## 1. Hurdle changes (if requested)

- Staff are keyed by 3-digit ID (`033` = Tamara). Tiers must be contiguous:
  hurdle2 requires hurdle1, hurdle3 requires hurdle1+2 — a top tier on an empty
  middle tier never triggers, so "18% above 92,000" with only h1 set means
  `hurdle2Level: 92000, hurdle2Rate: 0.18`.
- `staffHurdle.json` is gitignored (local-only); changes are never committed.
- Validate after edit with the loader (`loadStaffHurdlesFromFile` must return
  ok and show the new values).

## 2. Convert the Mindbody export

Mindbody ships HTML masquerading as `.xls`, which the parser cannot read.
Convert with the carried script:

```bash
python3 .agents/skills/commission-run/convert_mindbody.py \
  ~/Downloads/"Payroll Report M-D-YYYY - M-D-YYYY.xls" \
  "data/Payroll Report M-D-YYYY - M-D-YYYY.xlsx"
```

The converter mimics Excel's import (one row per `<tr>`, colspan-aware,
numeric cells as numbers). Verify the output before running:

- Row count sane (~3.5k), width 10, sheet name 31-char truncated.
- Exact markers present: `Rev. per Session`, `Tips:`, `Sales Commission:`.
- Staff headers (`Staff ID #:`) and `Total for ` counts match.
- Spot-check the changed staffer's block by hand.

## 3. Dry run

1. `config/default.json`: point `PAYROLL_WB_FILENAME` at the new file,
   `updateTalenox: false`, `uploadToGDrive: false`. Commit on the month branch.
2. `npm run run:tsx` — expect `Complete (dry run)`.
3. Verify in the fresh `logs/commission-*.log`: the changed staffer's
   General Services Revenue × tier math, plus their rows in
   `payments/Talenox Payments YYYYMM.xlsx`.
4. Reply template for Sioban: change made, revenue → commission figure,
   report ready, dry-run only (no Talenox/Drive touched).

## 4. Live run (explicit request only)

1. Flip `updateTalenox: true`, `uploadToGDrive: true`, commit, `npm run run:tsx`.
2. Confirm in the debug log: `Google Drive upload completed: YYYY/YYYYMM`
   **and** `Complete: Talenox updated` (payroll created + ad-hoc pushed).
3. Report both confirmations plus the headline figures.
