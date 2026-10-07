import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' keeps asset paths relative, so the build works on Vercel
// and when the dist/ folder is opened from any sub-path.
export default defineConfig({
  plugins: [react()],
  base: './',
});
