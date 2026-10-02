# Implementation checklist and progress checkpoint

Branch `evolution/v2-20261002` (worktree `C:\Users\LiranTelem\sports-trip-v2`), baseline tag `baseline-v1.17.0-20261002`.
Source brief: `ToSport-Claude-Code-Product-Evolution-and-Tickets.md` (2026-10-02). **No push, no deploy.**
Update the "Checkpoint" section after every vertical slice so work can resume from here.

## Phases

- [x] **A. Baseline and reconciliation** — tag + worktrees, baseline screenshots/behaviour (`docs/evolution/screenshots/baseline`),
      `ROLLBACK.md`, capability inventory, Playwright installed (dev-only), provider-access checklist started in `TICKETS.md`.
- [ ] **B. First vertical slice** — destination + fixed dates → results → detail → add/remove → day-by-day trip → refresh recovery;
      store/reducer, versioned trip document + legacy migration, draft filters, i18n extraction, export/import.
- [ ] **C. Flexible planning and control** — real flexible windows, pace presets, lock/exclude/replace, feasibility honesty, tests.
- [ ] **D. Tickets** — provider-neutral adapter, matching + review report, offer states/expiry, disclosures, `TICKETS.md`.
- [ ] **E. Quality and handoff** — Playwright suite (P01–P22), a11y, performance sanity, security review, docs reconciliation,
      rollback proof, QA report, Hebrew handoff.

## Checkpoint (latest)

* Done: phase A (see above).
* Branch HEAD: see `git log` (first commit: baseline docs + tooling).
* Commands: `py -m http.server 8741` (baseline, in the baseline worktree) / `8742` (v2); `node tests/capture/capture.mjs --ui baseline|v2`.
* Next action: phase B — design the store, then restructure the UI around it.
* Blockers: live ticket pricing needs owner-supplied provider access (see `TICKETS.md`); real-device browser checks (Galaxy S24,
  iOS Safari) are a handoff item — emulation is not device evidence.
