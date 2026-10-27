import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { DB } from '../db.js';
import { authenticate, bad, idParam, notFound, parse, requireRole } from '../http.js';

const createSchema = z.object({
  name: z.string().trim().min(2, 'kamida 2 ta belgi'),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  adminFullName: z.string().trim().min(2),
  adminLogin: z.string().trim().min(3, 'kamida 3 ta belgi').regex(/^[A-Za-z0-9._-]+$/, 'faqat lotin harf, raqam, . _ -'),
  adminPassword: z.string().min(6, 'kamida 6 ta belgi'),
  adminPhone: z.string().trim().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  phone: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  active: z.boolean().optional(),
});

/** Faqat super admin: o'quv markazlarni boshqarish. */
export function centersRouter(db: DB) {
  const r = Router();
  r.use(authenticate(db), requireRole('super_admin'));

  const listSql = `
    SELECT c.id, c.name, c.phone, c.address, c.active, c.created_at AS createdAt,
      (SELECT COUNT(*) FROM users u WHERE u.center_id = c.id AND u.role = 'student' AND u.active = 1) AS students,
      (SELECT COUNT(*) FROM users u WHERE u.center_id = c.id AND u.role IN ('teacher','support_teacher') AND u.active = 1) AS teachers,
      (SELECT COUNT(*) FROM groups g WHERE g.center_id = c.id AND g.active = 1) AS groups
    FROM centers c`;

  r.get('/', (_req, res) => {
    const rows = db.prepare(listSql + ' ORDER BY c.id DESC').all() as Array<Record<string, unknown>>;
    res.json(rows.map((c) => ({ ...c, active: !!c.active })));
  });

  r.get('/:id', (req, res) => {
    const id = idParam(req);
    const c = db.prepare(listSql + ' WHERE c.id = ?').get(id) as Record<string, unknown> | undefined;
    if (!c) throw notFound("O'quv markaz topilmadi");
    const admins = db
      .prepare(`SELECT id, full_name AS fullName, login, phone, active FROM users WHERE center_id = ? AND role = 'admin'`)
      .all(id);
    res.json({ ...c, active: !!c.active, admins });
  });

  r.post('/', (req, res) => {
    const b = parse(createSchema, req.body);
    const exists = db.prepare('SELECT 1 FROM users WHERE login = ?').get(b.adminLogin);
    if (exists) throw bad('Bu login band, boshqasini tanlang');

    const tx = db.transaction(() => {
      const c = db
        .prepare('INSERT INTO centers (name, phone, address) VALUES (?, ?, ?)')
        .run(b.name, b.phone ?? null, b.address ?? null);
      const centerId = Number(c.lastInsertRowid);
      db.prepare(
        `INSERT INTO users (center_id, role, full_name, phone, login, password_hash)
         VALUES (?, 'admin', ?, ?, ?, ?)`,
      ).run(centerId, b.adminFullName, b.adminPhone ?? null, b.adminLogin, bcrypt.hashSync(b.adminPassword, 10));
      return centerId;
    });
    const id = tx();
    res.status(201).json({ id });
  });

  r.put('/:id', (req, res) => {
    const id = idParam(req);
    const b = parse(updateSchema, req.body);
    const cur = db.prepare('SELECT * FROM centers WHERE id = ?').get(id) as
      | { name: string; phone: string | null; address: string | null; active: number }
      | undefined;
    if (!cur) throw notFound("O'quv markaz topilmadi");
    db.prepare('UPDATE centers SET name = ?, phone = ?, address = ?, active = ? WHERE id = ?').run(
      b.name ?? cur.name,
      b.phone === undefined ? cur.phone : b.phone,
      b.address === undefined ? cur.address : b.address,
      b.active === undefined ? cur.active : b.active ? 1 : 0,
      id,
    );
    res.json({ ok: true });
  });

  return r;
}
