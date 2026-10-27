import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { DB } from './db.js';
import { config } from './config.js';

export const ROLES = ['super_admin', 'admin', 'teacher', 'support_teacher', 'student', 'parent'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: number;
  role: Role;
  centerId: number | null;
  fullName: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const bad = (msg: string) => new HttpError(400, msg);
export const forbidden = (msg = "Bu amalga ruxsat yo'q") => new HttpError(403, msg);
export const notFound = (msg = 'Topilmadi') => new HttpError(404, msg);

/** Zod orqali tekshirish; xato bo'lsa 400 qaytaradi (o'zbekcha xabar bilan). */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    const field = first?.path.join('.') || 'maydon';
    throw bad(`Noto'g'ri qiymat: ${field}${first?.message ? ' — ' + first.message : ''}`);
  }
  return r.data;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, role: user.role, centerId: user.centerId, fullName: user.fullName },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn } as jwt.SignOptions,
  );
}

/** Tokenni tekshiradi va foydalanuvchining hozirgi holatini bazadan oladi (bloklangan bo'lsa kirishni to'xtatadi). */
export function authenticate(db: DB) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return next(new HttpError(401, 'Tizimga kiring'));
    try {
      const payload = jwt.verify(header.slice(7), config.jwtSecret) as unknown as { sub: number };
      const row = db
        .prepare(
          `SELECT u.id, u.role, u.center_id AS centerId, u.full_name AS fullName, u.active,
                  c.active AS centerActive
           FROM users u LEFT JOIN centers c ON c.id = u.center_id WHERE u.id = ?`,
        )
        .get(payload.sub) as
        | { id: number; role: Role; centerId: number | null; fullName: string; active: number; centerActive: number | null }
        | undefined;
      if (!row || !row.active) return next(new HttpError(401, 'Hisob faol emas'));
      if (row.centerId !== null && row.centerActive === 0) return next(new HttpError(401, "O'quv markaz faol emas"));
      req.user = { id: row.id, role: row.role, centerId: row.centerId, fullName: row.fullName };
      next();
    } catch {
      next(new HttpError(401, 'Sessiya tugagan, qayta kiring'));
    }
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Tizimga kiring'));
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export function me(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, 'Tizimga kiring');
  return req.user;
}

/** Markazga bog'langan amallar uchun markaz ID sini qaytaradi (super admin bunday amallarni bajarmaydi). */
export function centerOf(req: Request): number {
  const u = me(req);
  if (u.centerId === null) throw forbidden("Bu amal faqat o'quv markaz xodimlari uchun");
  return u.centerId;
}

export function idParam(req: Request, name = 'id'): number {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw bad(`Noto'g'ri ${name}`);
  return n;
}

// ---- Umumiy zod qismlari ----
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD formatida bo‘lsin');
export const monthStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM formatida bo‘lsin');
export const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM formatida bo‘lsin');

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function currentMonth(): string {
  return todayStr().slice(0, 7);
}
/** 1 = Dushanba … 7 = Yakshanba */
export function weekdayOf(date: string): number {
  const d = new Date(date + 'T00:00:00');
  const w = d.getDay();
  return w === 0 ? 7 : w;
}
