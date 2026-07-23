import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the build works both at sscarduzio.github.io/stretching-app/ and locally
export default defineConfig({
  base: './',
  plugins: [react()],
});
