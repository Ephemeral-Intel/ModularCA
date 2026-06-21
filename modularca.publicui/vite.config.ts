import { defineConfig } from 'vite';
import plugin from '@vitejs/plugin-react';

const apiTarget = process.env.API_URL || 'https://localhost:5293';

const proxyBase = {
    target: apiTarget,
    changeOrigin: true,
    secure: false,
    headers: {
        'X-Forwarded-Proto': 'https',
    },
};

export default defineConfig({
    plugins: [plugin()],
    base: '/public/',
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
