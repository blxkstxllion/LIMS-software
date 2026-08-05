import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Lightning CSS (this Vite version's built-in CSS minifier) rewrites
    // `@media (max-width: Npx)` into the newer range syntax `@media (width<=Npx)`
    // as a size optimization by default. That syntax only works in Safari 16.4+
    // (Mar 2023) — on an older iOS Safari the whole rule is invalid and silently
    // dropped, which is exactly what broke the mobile-responsive layout on an
    // iPhone 7 (max iOS 15). Explicit `targets` config didn't reliably override this
    // in this Vite version, so minification is disabled outright for CSS — the
    // stylesheet here is a few KB, the size cost of skipping minification is
    // negligible, and this guarantees the syntax actually written is what ships.
    cssMinify: false,
  },
})
