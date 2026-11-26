import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_MODE, createApiApp, executeSchemaMigration, hasDbUrl } from './server/app.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

async function startServer(): Promise<void> {
  if (hasDbUrl) {
    const migration = await executeSchemaMigration();
    if (migration.ok) {
      console.log('Skema relasional Supabase berhasil diverifikasi/dimigrasi.');
    } else {
      console.warn('Peringatan migrasi otomatis Supabase:', migration.error);
    }
  }

  const app = createApiApp();

  // Vite dev middleware vs static production serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `SMK Prima Unggul server berjalan pada http://localhost:${PORT} [mode: ${APP_MODE}]`,
    );
  });
}

startServer();
