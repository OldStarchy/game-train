/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo>/; hash routing handles the rest.
export default defineConfig({
	base: '/game-train/',
	plugins: [react()],
	test: {
		environment: 'node',
		include: ['src/**/*.test.{ts,tsx}', 'supabase/tests/**/*.test.ts'],
	},
});
