import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/weekly-hours/',
  test: { include: ['src/**/*.test.ts'] },
});
