import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

// Version provenance — single source of truth is the repo-root VERSION file (also read by the .NET
// Directory.Build.props, so backend and UI always report the same version). Bump ./VERSION only.
// Injected as compile-time constants; typed in src/vite-env.d.ts. Vite runs with its working
// directory set to this project folder (both `vite` and the csproj's `vite build`), so the repo root
// is one level up.
function versionDefine(): Record<string, string> {
  const root = resolve(process.cwd(), '..');
  const version = readFileSync(resolve(root, 'VERSION'), 'utf-8').trim();
  let commit = 'unknown';
  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch { /* not a git checkout (e.g. source tarball) — provenance commit stays "unknown" */ }
  return {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  };
}

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  define: versionDefine(),
  build: {
    sourcemap: false,
  },
  server: {
    host: '0.0.0.0',
    port: 3000
  }
});
