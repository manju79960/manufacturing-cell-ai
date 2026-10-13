import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// This repository is published at /manufacturing-cell-ai/ on GitHub Pages.
export default defineConfig({
  plugins: [react()],
  base: '/manufacturing-cell-ai/',
});
