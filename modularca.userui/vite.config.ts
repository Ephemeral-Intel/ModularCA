import { defineConfig } from 'vite';
import plugin from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [plugin()],
    base: '/user/',
    build: {
        sourcemap: false,
    },
    server: {
        port: 53013,
    }
})
