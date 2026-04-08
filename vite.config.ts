
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  define: {
    'process.env': JSON.stringify({
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
      API_KEY: process.env.API_KEY || '',
      NODE_ENV: process.env.NODE_ENV || 'production',
    }),
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
});
