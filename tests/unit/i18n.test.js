const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I = require('../../js/i18n.js');
const S = require('../../js/store.js');
const { loadSample, model } = require('./helpers.js');

const ROOT = path.join(__dirname, '..', '..');
const FILES = ['app.js', 'js/ui.js', 'js/planview.js', 'js/combo.js', 'js/store.js'].map((f) => path.join(ROOT, f));

test('every literal t()/tn() key used by the UI exists in the Hebrew dictionary (no raw keys on screen)', () => {
  const missing = [];
  FILES.forEach((f) => {
    const src = fs.readFileSync(f, 'utf8');
    const re = /\b(tn?)\(\s*'([a-zA-Z][\w.]*)'\s*[,)]/g;
    let m;
    while ((m = re.exec(src))) {
      const key = m[2];
      const keys = m[1] === 'tn' ? [key + '.one', key + '.other'] : [key];
      keys.forEach((k) => { if (I.DICT.he[k] == null) missing.push(path.basename(f) + ': ' + k); });
    }
  });
  assert.deepEqual(missing, []);
});

test('TRIP_SWAP replaces an entry in place, keeps its lock, refuses duplicates, and undo restores it', () => {
  const M = model(), cat = M.buildCatalog(loadSample());
  const st = S.createStore(S.initialState());
  st.dispatch({ type: 'TRIP_ADD', id: 101, snap: M.snapshotOf(cat.byId[101]) });
  st.dispatch({ type: 'TRIP_ADD', id: 102, snap: M.snapshotOf(cat.byId[102]) });
  st.dispatch({ type: 'TRIP_LOCK', id: 101, locked: true });
  st.dispatch({ type: 'TRIP_SWAP', id: 101, to: 104, snap: M.snapshotOf(cat.byId[104]) });
  assert.deepEqual(st.get().trip.entries.map((e) => e.id), [104, 102]);
  assert.equal(st.get().trip.entries[0].locked, true);
  st.dispatch({ type: 'TRIP_SWAP', id: 104, to: 102 });                        // would duplicate: ignored
  assert.deepEqual(st.get().trip.entries.map((e) => e.id), [104, 102]);
  st.dispatch({ type: 'TRIP_SWAP', id: 104, to: 103, snap: M.snapshotOf(cat.byId[103]) });
  st.dispatch({ type: 'TRIP_UNDO' });
  assert.deepEqual(st.get().trip.entries.map((e) => e.id), [104, 102]);
});
