import { defineConfig } from 'vite';

// GitHub Pages serves the site from https://<user>.github.io/territory-war/
const REPO = 'territory-war';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/' + REPO + '/' : '/',
  test: {
    include: ['test/**/*.test.js']
  }
}));
