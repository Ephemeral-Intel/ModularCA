import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { readFileSync, existsSync } from 'fs';
import { createServer as createHttpsServer } from 'https';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const API_URL = process.env.API_URL || 'https://127.0.0.1:5001';
const PORT = parseInt(process.env.PORT || '8080', 10);

const proxyOptions = {
    target: API_URL,
    changeOrigin: true,
    secure: false,
    xfwd: true,
};

const proxyRoutes = [
    { path: '/.well-known/est', rewrite: { '^/.well-known/est': '/api/v1/est' } },
    { path: '/acme', rewrite: { '^/acme': '/api/v1/acme' } },
    { path: '/crl', rewrite: { '^/crl': '/api/v1/public/crl' } },
    { path: '/ca', rewrite: { '^/ca': '/api/v1/public/ca' } },
    { path: '/ocsp', rewrite: { '^/ocsp': '/api/v1/public/ocsp' } },
    { path: '/tsa', rewrite: { '^/tsa': '/api/v1/public/tsa' } },
    { path: '/est', rewrite: { '^/est': '/api/v1/est' } },
    { path: '/scep', rewrite: { '^/scep': '/api/v1/scep' } },
];

for (const route of proxyRoutes) {
    app.use(route.path, createProxyMiddleware({
        ...proxyOptions,
        pathRewrite: route.rewrite,
    }));
}

const distPath = join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
    const indexPath = join(distPath, 'index.html');
    if (existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Not found — run "npm run build" first');
    }
});

const tlsCert = process.env.TLS_CERT;
const tlsKey = process.env.TLS_KEY;

if (tlsCert && tlsKey) {
    const httpsServer = createHttpsServer(
        { cert: readFileSync(tlsCert), key: readFileSync(tlsKey) },
        app
    );
    httpsServer.listen(PORT, () => {
        console.log(`Public UI (HTTPS) listening on port ${PORT}`);
        console.log(`Proxying protocol requests to ${API_URL}`);
    });
} else {
    app.listen(PORT, () => {
        console.log(`Public UI (HTTP) listening on port ${PORT}`);
        console.log(`Proxying protocol requests to ${API_URL}`);
    });
}
