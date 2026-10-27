import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { DB } from '../db.js';
import { config } from '../config.js';
import { HttpError, authenticate, me, parse, signToken, type Role } from '../http.js';

function profile(db: DB, id: number) {
  return db
    .prepare(
      `SELECT u.id, u.role, u.center_id AS centerId, u.full_name AS fullName, u.phone, u.login,
              c.name AS centerName
       FROM users u LEFT JOIN centers c ON c.id = u.center_id WHERE u.id = ?`,
    )
    .get(id) as {
    id: number;
    role: Role;
    centerId: number | null;
    fullName: string;
    phone: string | null;
    login: string;
    centerName: string | null;
  };
}

export function authRouter(db: DB) {
  const r = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => config.isTest,
    message: { error: "Juda ko'p urinish. 15 daqiqadan keyin qayta urinib ko'ring" },
  });

  r.post('/login', loginLimiter, (req, res) => {
    const body = parse(z.object({ login: z.string().trim().min(1), password: z.string().min(1) }), req.body);
    const row = db
      .prepare(
        `SELECT u.id, u.password_hash AS hash, u.active, u.center_id AS centerId, c.active AS centerActive
         FROM users u LEFT JOIN centers c ON c.id = u.center_id WHERE u.login = ?`,
      )
      .get(body.login) as { id: number; hash: string; active: number; centerId: number | null; centerActive: number | null } | undefined;

    // Bir xil xabar: login mavjudligini oshkor qilmaslik uchun
    const fail = new HttpError(401, "Login yoki parol noto'g'ri");
    if (!row || !bcrypt.compareSync(body.password, row.hash)) throw fail;
    if (!row.active) throw new HttpError(403, "Hisobingiz bloklangan. Administratorga murojaat qiling");
    if (row.centerId !== null && row.centerActive === 0) throw new HttpError(403, "O'quv markaz faol emas");

    const user = profile(db, row.id);
    const token = signToken({ id: user.id, role: user.role, centerId: user.centerId, fullName: user.fullName });
    res.json({ token, user });
  });

  r.get('/me', authenticate(db), (req, res) => {
    res.json({ user: profile(db, me(req).id) });
  });

  r.post('/change-password', authenticate(db), (req, res) => {
    const body = parse(
      z.object({ oldPassword: z.string().min(1), newPassword: z.string().min(6, 'kamida 6 ta belgi') }),
      req.body,
    );
    const u = me(req);
    const row = db.prepare('SELECT password_hash AS hash FROM users WHERE id = ?').get(u.id) as { hash: string };
    if (!bcrypt.compareSync(body.oldPassword, row.hash)) throw new HttpError(400, "Eski parol noto'g'ri");
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(body.newPassword, 10), u.id);
    res.json({ ok: true });
  });

  return r;
}
