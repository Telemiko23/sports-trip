// Cross-engine run (Firefox + WebKit desktop + WebKit mobile emulation) using the browsers kept in ./.browsers
import { spawnSync } from 'node:child_process';
const r = spawnSync('npx', ['playwright', 'test', '--project=firefox', '--project=webkit', '--project=webkit-mobile', ...process.argv.slice(2)], { stdio: 'inherit', shell: true, env: { ...process.env, PW_ENGINES: 'all' } });
process.exit(r.status ?? 1);
