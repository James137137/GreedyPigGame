import { spawnSync } from 'node:child_process';
import { defineConfig } from 'vite';

const commit = spawnSync('git', ['log', '-1', '--format=%cI'], { encoding: 'utf8' });
const committedAt = commit.stdout?.trim();

export default defineConfig({
  define: {
    __LAST_EDITED__: JSON.stringify(committedAt || new Date().toISOString()),
    __HAS_COMMIT_TIME__: JSON.stringify(Boolean(committedAt)),
  },
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } },
  },
});
