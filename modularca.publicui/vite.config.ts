import { defineConfig } from 'vite';
import plugin from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const apiTarget = process.env.API_URL || 'https://localhost:5293';

const proxyBase = {
    target: apiTarget,
    changeOrigin: true,
    secure: false,
    headers: {
        'X-Forwarded-Proto': 'https',
    },
};

// Version provenance — single source of truth is the repo-root VERSION file (also read by the .NET
// Directory.Build.props). Injected as compile-time constants; typed in src/vite-env.d.ts. Bump ./VERSION only.
function versionDefine(): Record<string, string> {
    const root = resolve(process.cwd(), '..');
    const version = readFileSync(resolve(root, 'VERSION'), 'utf-8').trim();
    let commit = 'unknown';
    try {
        commit = execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch { /* not a git checkout — provenance commit stays "unknown" */ }
    return {
        __APP_VERSION__: JSON.stringify(version),
        __APP_COMMIT__: JSON.stringify(commit),
        __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    };
}

export default defineConfig({
    plugins: [plugin()],
    base: '/public/',
    define: versionDefine(),
    build: {
        sourcemap: false,
    },
    server: {
        port: 53017,
        proxy: {
            '/acme': {
                ...proxyBase,
                rewrite: (path: string) => path.replace(/^\/acme/, '/api/v1/acme'),
            },
            '/crl': {
                ...proxyBase,
                rewrite: (path: string) => path.replace(/^\/crl/, '/api/v1/public/crl'),
            },
            '/ca': {
                ...proxyBase,
                rewrite: (path: string) => path.replace(/^\/ca/, '/api/v1/public/ca'),
            },
            '/ocsp': {
                ...proxyBase,
                rewrite: (path: string) => path.replace(/^\/ocsp/, '/api/v1/public/ocsp'),
            },
            '/tsa': {
                ...proxyBase,
                rewrite: (path: string) => path.replace(/^\/tsa/, '/api/v1/public/tsa'),
            },
            '/est': {
                ...proxyBase,
                rewrite: (path: string) => path.replace(/^\/est/, '/api/v1/est'),
            },
            '/scep': {
                ...proxyBase,
                rewrite: (path: string) => path.replace(/^\/scep/, '/api/v1/scep'),
            },
            '/.well-known/est': {
                ...proxyBase,
                rewrite: (path: string) => path.replace(/^\/.well-known\/est/, '/api/v1/est'),
            },
        },
    },
});
