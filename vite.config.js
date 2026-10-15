import { defineConfig } from 'vite';

// Project site: served from https://samuele95.github.io/enigmista/
// A wrong base here is the #1 cause of a blank black screen on Pages.
export const BASE = '/enigmista/';

export default defineConfig({
  base: BASE,
  define: {
    // Shown on the CP1 page so a live deploy can be matched to its commit.
    __BUILD_ID__: JSON.stringify((process.env.GITHUB_SHA || 'local').slice(0, 7)),
  },
  build: {
    target: 'es2022', // top-level await in main.js
    assetsInlineLimit: 0,
  },
});
