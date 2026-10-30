/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH задаётся при деплое на GitHub Pages: /<repo>/
const base = process.env.BASE_PATH ?? '/';

// Номер сборки: зашивается в код и кладётся в version.json — по расхождению приложение узнаёт об обновлении
const buildId = Date.now().toString(36);

/**
 * Политика безопасности страницы (CSP) в собранном index.html: скрипты только свои и два встроенных (по хешу),
 * запросы данных только на свой сервер. Если на страницу попадёт чужой скрипт (XSS), браузер его не выполнит
 * и не отправит токен на чужой адрес. GitHub Pages не позволяет задать заголовки, поэтому через <meta>.
 */
function csp(): Plugin {
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1] ?? '').digest('base64')}'`);
        const api = process.env.VITE_API_BASE ? new URL(process.env.VITE_API_BASE).origin : '';
        const policy = [
          "default-src 'none'",
          `script-src 'self' ${inline.join(' ')}`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          `connect-src 'self' ${api}`.trim(),
          "manifest-src 'self'",
          "worker-src 'self'",
          "base-uri 'none'",
          "form-action 'self'",
          "object-src 'none'",
        ].join('; ');
        return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
      },
    },
  };
}

export default defineConfig({
  base,
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  // iOS Safari 15+: синтаксис понижается до поддерживаемого
  build: { target: ['es2020', 'safari15', 'chrome100', 'firefox100'] },
  plugins: [
    react(),
    csp(),
    {
      name: 'emit-version',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: buildId }) });
      },
    },
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/core/sw',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: { globPatterns: ['**/*.{js,css,html,woff,woff2,png,svg,ico}'] },
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'PIXEL PLANNER — 8-битный ежедневник',
        short_name: 'PIXEL PLAN',
        description: 'Ежедневник, привычки и статистика в стиле 8-битных игр',
        lang: 'ru',
        theme_color: '#0b0a1a',
        background_color: '#0b0a1a',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  // В разработке API отдаёт локальный сервер: `npm run dev:api` (порт 8787)
  server: { proxy: { '/api': 'http://localhost:8787' } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server-node/src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
});
