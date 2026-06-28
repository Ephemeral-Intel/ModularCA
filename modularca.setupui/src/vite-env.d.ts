/// <reference types="vite/client" />

// Injected at build time from the repo-root VERSION file (see vite.config.ts `define`).
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_TIME__: string;
