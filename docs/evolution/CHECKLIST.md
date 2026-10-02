# Implementation checklist and progress checkpoint

Branch `evolution/v2-20261002` (worktree `C:\Users\LiranTelem\sports-trip-v2`), baseline tag `baseline-v1.17.0-20261002`.
Source brief: `ToSport-Claude-Code-Product-Evolution-and-Tickets.md` (2026-10-02). **No push, no deploy.**

## Phases

- [x] **A. Baseline and reconciliation** — tag + worktrees, baseline screenshots/behaviour, `ROLLBACK.md`, capability inventory, Playwright (dev-only).
- [x] **B. First vertical slice** — destination + fixed dates → results → detail → add/remove → day-by-day trip → refresh recovery; store/reducer,
      versioned storage + legacy migration, draft filters, i18n extraction, export/import. *Deferred inside B:* map marker clustering, optional
      "legacy delta" notice, baseline session-dialog screenshot.
- [x] **C. Flexible planning and control** — real windows, pace presets, lodging, lock/exclude/replace/regenerate, honest feasibility, tier fairness,
      parser boundary, Plan tab, trip-level replace.
- [x] **D. Tickets (shell)** — provider-neutral adapter, strict matching + review report, offer states, expiry, disclosures, `TICKETS.md`.
      **Live pricing remains OFF (externally blocked).**
- [x] **E. Quality and handoff (local)** — suites, axe/keyboard/reflow, perf sanity, security review, docs reconciliation, rollback proof, QA report,
      Hebrew handoff. *Not done:* Firefox/WebKit runs (browsers not installed here), real-device and assistive-tech checks.

## Checkpoint (latest)

* Branch HEAD: see `git log` on the branch. Last verified: unit 52/52, Python 35/35, Playwright 104/104 (Chromium desktop + Pixel 7 emulation), rollback proof 8/8.
* Commands: `py -m http.server 8742` (v2) / `8741` (baseline worktree); tests per `README.md` "Tests".
* Next actions (owner decisions): review locally → decide on merge/deploy (separate, explicit); supply the ticket inputs listed in `TICKETS.md` §5;
  authorize `npx playwright install firefox webkit` for the cross-engine run; schedule real-device checks.
* Blockers: live ticket pricing (provider entitlement/terms); real-device and screen-reader checks are a human handoff.
