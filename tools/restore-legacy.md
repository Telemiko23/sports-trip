# Restore a v2 backup into the old (v1.17.0) UI

Only event selections and the old filters (`base`, `from`, `to`) can be carried back. v2-only data (pace, locks, exclusions,
flexible windows, saved snapshots, ticket state) cannot round-trip through an unchanged v1 app.

1. In the new UI: **הטיול שלי → ייצוא גיבוי** → you get `tosport-trip-backup-….json`.
2. Open the OLD UI on the origin where you want the data (for example `http://localhost:8741/`), open DevTools → Console.
3. Paste this, replacing the placeholder with the file's full text between the backticks, and press Enter:

```js
(function () {
  var text = String.raw`PASTE THE WHOLE BACKUP FILE HERE`;
  var d = JSON.parse(text);
  if (d.format !== 'tosport-trip-backup' || !d.legacy) throw new Error('not a ToSport v2 backup');
  var ids = Array.isArray(d.legacy.tripIds_v1) ? d.legacy.tripIds_v1.filter(function (x) { return Number.isInteger(x) && x > 0; }) : [];
  if (!ids.length) throw new Error('nothing to restore');
  if (localStorage.getItem('tripIds_v1') && !confirm('Replace the selections currently saved in the old UI?')) return;
  localStorage.setItem('tripIds_v1', JSON.stringify(ids));
  if (d.legacy.filterCtx_v1) localStorage.setItem('filterCtx_v1', JSON.stringify(d.legacy.filterCtx_v1));
  localStorage.setItem('onboarded_v1', '1');
  location.reload();
})();
```

The snippet touches only the three legacy keys and never reads or sends anything anywhere else.
