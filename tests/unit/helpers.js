// Loads the sample feed the same way the browser does (a classic script assigning window.TRIP_DATA).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSample() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sample-data.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  return sandbox.window.TRIP_DATA;
}

module.exports = {
  loadSample,
  model: () => require('../../js/model.js'),
  store: () => require('../../js/store.js'),
  planner: () => require('../../planner.js'),
  tickets: () => require('../../js/tickets.js')
};
