import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB } from './db.js';
import { config } from './config.js';
import { HttpError } from './http.js';
import { authRouter } from './routes/auth.js';
import { centersRouter } from './routes/centers.js';
import { usersRouter } from './routes/users.js';
import { groupsRouter, scheduleRouter } from './routes/groups.js';
import { attendanceRouter } from './routes/attendance.js';
import { paymentsRouter } from './routes/payments.js';
import { studentsRouter } from './routes/students.js';
import { dashboardRouter } from './routes/dashboard.js';

export function createApp(db: DB) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  if (config.corsOrigin) app.use(cors({ origin: config.corsOrigin.split(',') }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'LC CRM' }));
  app.use('/api/auth', authRouter(db));
  app.use('/api/centers', centersRouter(db));
  app.use('/api/users', usersRouter(db));
  app.use('/api/groups', groupsRouter(db));
  app.use('/api/schedule', scheduleRouter(db));
  app.use('/api/attendance', attendanceRouter(db));
  app.use('/api/payments', paymentsRouter(db));
  app.use('/api/students', studentsRouter(db));
  app.use('/api/dashboard', dashboardRouter(db));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API manzili topilmadi')));

  // Production: build qilingan frontendni xizmat qilish (SPA)
  const here = path.dirname(fileURLToPath(import.meta.url));
  const webDir = [path.resolve(here, '../../frontend/dist'), path.resolve(process.cwd(), '../frontend/dist')].find((p) =>
    fs.existsSync(path.join(p, 'index.html')),
  );
  if (webDir) {
    app.use(express.static(webDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(webDir, 'index.html'));
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    const e = err as { type?: string; status?: number; code?: string; message?: string };
    if (e?.type === 'entity.parse.failed') return res.status(400).json({ error: "Noto'g'ri JSON" });
    if (e?.type === 'entity.too.large') return res.status(413).json({ error: "So'rov juda katta" });
    if (typeof e?.code === 'string' && e.code.startsWith('SQLITE_CONSTRAINT')) {
      return res.status(400).json({ error: "Ma'lumot cheklovga mos kelmadi (takroriy yoki bog'liq yozuv)" });
    }
    console.error('[error]', err);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  });

  return app;
}
