# ROLLBACK — returning to ToSport v1.17.0

This file lets the owner compare the evolved experience with the current one and go back without losing anything.
Everything here was run for real on 2026-10-02; the actual names below are the ones that exist in this clone.

## What was preserved

| Item | Actual value |
| --- | --- |
| Baseline tag | `baseline-v1.17.0-20261002` (annotated) → commit `de87418502fec7747fead61a3e0cd6edb1ba792d` |
| Public deployment | `main` at the same commit (`origin/main` fetched on 2026-10-02: identical). `main` and GitHub Pages are untouched by this work. |
| Implementation branch | `evolution/v2-20261002` (local only, never pushed) |
| Worktrees | baseline: `C:\Users\LiranTelem\sports-trip-baseline` (detached at the tag) · v2: `C:\Users\LiranTelem\sports-trip-v2` (the branch) · original clone `C:\Users\LiranTelem\sports-trip` stays on `main` |
| Uncommitted work at the time | none relevant. Two untracked owner reference files were left alone: `ToSport-logo-color-variants.png.png` (sha256 `b3471d8c…a955a69`), `ToSport-logo-reference.png.png` (sha256 `2fc9ecb0…357c2102`). Ignored/private files (`airports.csv`, `allsportdb_probe.json`, `.claude/`) are not needed to run the site. |
| Generated data in the baseline | `fixtures.js` (generated `2026-09-29T11:15`, 2,776 records, kick-offs to 2027-01-27), `events_*.json`, `cities_cache.json`, `cities_manual.json`, `venues_cache.json`, `logos/`, `comp_logos/`, `flags/`, `airports.js` — all committed, so the tag alone reproduces the site. |

## Run the old version (no dependencies except Python)

```
cd C:\Users\LiranTelem\sports-trip-baseline
py -m http.server 8741
```
open `http://localhost:8741/` (footer shows «גרסה 1.17.0»). Or, from any clone: `git worktree add ../sports-trip-baseline baseline-v1.17.0-20261002`.

## Run the new version

```
cd C:\Users\LiranTelem\sports-trip-v2
py -m http.server 8742
```
open `http://localhost:8742/`. Different ports are different browser origins, so their `localStorage` never mix while
comparing locally. (Development tooling — Playwright — needs `npm install`; the site itself needs nothing.)

## Browser storage

* **Legacy keys (never modified or deleted by v2):** `tripIds_v1` (JSON array of event ids), `filterCtx_v1`
  (`{base, from, to}`), `onboarded_v1` (`"1"`).
* **v2 keys (additive):** see `docs/evolution/PRODUCT_NOTES.md` → *State contract*. First start of v2 writes a
  recoverable copy of the three legacy values to `tosport_legacy_backup_v1` *before* creating the v2 trip document;
  migration is idempotent (re-running changes nothing) and malformed legacy data is reported, not erased.
* **Recovery export/import:** My Trip → «ייצוא גיבוי» downloads a versioned JSON (`tosport-trip-backup`); the same screen
  imports it (size/schema-validated; never silently replaces a non-empty trip — it asks first).
* **Going back to the old UI keeps the old data:** because v2 never touches the legacy keys, the old app on the same
  origin shows the selections it had before. Selections made *only* in v2 are **not** visible to the old app. To carry
  them back, use the export and the snippet in `tools/restore-legacy.md` (paste into DevTools on the old UI's origin):
  it writes `tripIds_v1`/`filterCtx_v1` from the export's `legacy` section. **Limitation:** only event selections that
  exist in the old feed, and the old filters (`base`, `from`, `to`), can be restored; v2-only context (pace, locks,
  exclusions, flexible windows, saved snapshots, ticket state) cannot round-trip through an unchanged v1 app.

## How a future deployment would be reverted (no force-push)

Deploying is a separate, explicit decision and is **not** done by this work. If it is ever done and has to be undone:

1. `git switch main && git revert -m 1 <merge-commit>` (or `git revert <range>`) → normal commit, normal push. GitHub Pages
   redeploys the previous UI. No history rewriting.
2. Data jobs keep working through the revert: both workflows check out `main`, commit only data files, and `git pull --rebase`
   before pushing (see `.github/workflows/*.yml`, concurrency group `data-update`). Scheduled workflows only run from the
   default branch, so nothing on `evolution/v2-20261002` can publish by accident.
3. Browser data of visitors is untouched (legacy keys never written by v2), so a revert does not lose saved trips made before
   the deploy; trips created only after the deploy are recoverable only if the visitor exported them.
4. To keep v2 data compatible while `main` keeps receiving daily data commits: `git merge main` into the branch; on a
   `fixtures.js` conflict take main's file (`git checkout --theirs fixtures.js`) and re-run `py backfill_hebrew.py`.

## Verified on handoff

See `docs/evolution/QA_REPORT.md` → «Rollback proof»: the baseline worktree was relaunched, a saved-trip scenario
(`tripIds_v1` with three events + `filterCtx_v1` for London) was exercised, then v2 was run on top of the same legacy
values and the legacy values were confirmed byte-identical afterwards.
