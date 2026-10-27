import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { DB } from '../db.js';
import {
  ROLES,
  authenticate,
  bad,
  dateStr,
  forbidden,
  idParam,
  me,
  notFound,
  parse,
  requireRole,
  todayStr,
  type Role,
} from '../http.js';

const STAFF_AND_MEMBERS: Role[] = ['teacher', 'support_teacher', 'student', 'parent'];

const loginField = z
  .string()
  .trim()
  .min(3, 'kamida 3 ta belgi')
  .regex(/^[A-Za-z0-9._@-]+$/, 'faqat lotin harf, raqam va . _ @ -');

const createSchema = z.object({
  role: z.enum(ROLES),
  centerId: z.number().int().positive().optional(),
  fullName: z.string().trim().min(2, 'kamida 2 ta belgi'),
  phone: z.string().trim().optional(),
  login: loginField,
  password: z.string().min(6, 'kamida 6 ta belgi'),
  birthDate: dateStr.optional(),
  address: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  parentIds: z.array(z.number().int().positive()).max(10).optional(),
  studentIds: z.array(z.number().int().positive()).max(20).optional(),
});

const updateSchema = z.object({
  fullName: z.string().trim().min(2).optional(),
  phone: z.string().trim().nullable().optional(),
  login: loginField.optional(),
  birthDate: dateStr.nullable().optional(),
  address: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  active: z.boolean().optional(),
  parentIds: z.array(z.number().int().positive()).max(10).optional(),
  studentIds: z.array(z.number().int().positive()).max(20).optional(),
});

interface UserRow {
  id: number;
  role: Role;
  centerId: number | null;
  fullName: string;
  phone: string | null;
  login: string;
  birthDate: string | null;
  address: string | null;
  notes: string | null;
  active: number;
  createdAt: string;
}

const COLS = `u.id, u.role, u.center_id AS centerId, u.full_name AS fullName, u.phone, u.login,
  u.birth_date AS birthDate, u.address, u.notes, u.active, u.created_at AS createdAt`;

export function usersRouter(db: DB) {
  const r = Router();
  r.use(authenticate(db), requireRole('super_admin', 'admin'));

  /** Faqat shu markazdagi, kerakli rolga ega foydalanuvchilar ekanini tekshiradi. */
  function assertRelated(ids: number[], role: 'parent' | 'student', centerId: number) {
    for (const id of new Set(ids)) {
      const row = db.prepare('SELECT role, center_id AS centerId FROM users WHERE id = ?').get(id) as
        | { role: string; centerId: number | null }
        | undefined;
      if (!row || row.role !== role || row.centerId !== centerId) {
        throw bad(role === 'parent' ? `Ota-ona topilmadi (id ${id})` : `O'quvchi topilmadi (id ${id})`);
      }
    }
  }

  function setParents(studentId: number, parentIds: number[]) {
    db.prepare('DELETE FROM parent_students WHERE student_id = ?').run(studentId);
    const ins = db.prepare('INSERT OR IGNORE INTO parent_students (parent_id, student_id) VALUES (?, ?)');
    for (const pid of new Set(parentIds)) ins.run(pid, studentId);
  }
  function setChildren(parentId: number, studentIds: number[]) {
    db.prepare('DELETE FROM parent_students WHERE parent_id = ?').run(parentId);
    const ins = db.prepare('INSERT OR IGNORE INTO parent_students (parent_id, student_id) VALUES (?, ?)');
    for (const sid of new Set(studentIds)) ins.run(parentId, sid);
  }

  r.get('/', (req, res) => {
    const u = me(req);
    const q = parse(
      z.object({
        role: z.enum(ROLES).optional(),
        q: z.string().trim().optional(),
        active: z.enum(['0', '1']).optional(),
        centerId: z.coerce.number().int().positive().optional(),
      }),
      req.query,
    );

    const where: string[] = [];
    const args: Record<string, unknown> = {};
    if (u.role === 'super_admin') {
      where.push(`u.role = 'admin'`);
      if (q.centerId) {
        where.push('u.center_id = @centerId');
        args.centerId = q.centerId;
      }
    } else {
      where.push('u.center_id = @centerId', `u.role IN ('teacher','support_teacher','student','parent')`);
      args.centerId = u.centerId;
      if (q.role) {
        where.push('u.role = @role');
        args.role = q.role;
      }
    }
    if (q.active) {
      where.push('u.active = @active');
      args.active = Number(q.active);
    }
    if (q.q) {
      where.push('(u.full_name LIKE @like OR u.phone LIKE @like OR u.login LIKE @like)');
      args.like = `%${q.q}%`;
    }

    const rows = db
      .prepare(
        `SELECT ${COLS},
           c.name AS centerName,
           (SELECT group_concat(p.full_name, ', ') FROM parent_students ps JOIN users p ON p.id = ps.parent_id
              WHERE ps.student_id = u.id) AS parentNames,
           (SELECT group_concat(s.full_name, ', ') FROM parent_students ps JOIN users s ON s.id = ps.student_id
              WHERE ps.parent_id = u.id) AS childNames,
           (SELECT COUNT(*) FROM group_students gs WHERE gs.student_id = u.id AND gs.left_at IS NULL) AS groupsCount
         FROM users u LEFT JOIN centers c ON c.id = u.center_id
         WHERE ${where.join(' AND ')}
         ORDER BY u.active DESC, u.full_name
         LIMIT 1000`,
      )
      .all(args) as Array<UserRow & Record<string, unknown>>;
    res.json(rows.map((x) => ({ ...x, active: !!x.active })));
  });

  r.get('/:id', (req, res) => {
    const u = me(req);
    const id = idParam(req);
    const row = db.prepare(`SELECT ${COLS} FROM users u WHERE u.id = ?`).get(id) as UserRow | undefined;
    if (!row) throw notFound('Foydalanuvchi topilmadi');
    const allowed =
      u.role === 'super_admin' ? row.role === 'admin' : row.centerId === u.centerId && row.role !== 'admin' && row.role !== 'super_admin';
    if (!allowed) throw notFound('Foydalanuvchi topilmadi');

    const parents = db
      .prepare(
        `SELECT p.id, p.full_name AS fullName, p.phone FROM parent_students ps JOIN users p ON p.id = ps.parent_id
         WHERE ps.student_id = ?`,
      )
      .all(id);
    const children = db
      .prepare(
        `SELECT s.id, s.full_name AS fullName, s.phone FROM parent_students ps JOIN users s ON s.id = ps.student_id
         WHERE ps.parent_id = ?`,
      )
      .all(id);
    const groups =
      row.role === 'student'
        ? db
            .prepare(
              `SELECT g.id, g.name FROM group_students gs JOIN groups g ON g.id = gs.group_id
               WHERE gs.student_id = ? AND gs.left_at IS NULL`,
            )
            .all(id)
        : row.role === 'teacher' || row.role === 'support_teacher'
          ? db
              .prepare('SELECT id, name FROM groups WHERE (teacher_id = ? OR support_teacher_id = ?) AND active = 1')
              .all(id, id)
          : [];
    res.json({ ...row, active: !!row.active, parents, children, groups });
  });

  r.post('/', (req, res) => {
    const actor = me(req);
    const b = parse(createSchema, req.body);

    let centerId: number;
    if (actor.role === 'super_admin') {
      if (b.role !== 'admin') throw forbidden("Super admin faqat markaz administratorini yaratadi");
      if (!b.centerId) throw bad('centerId majburiy');
      const c = db.prepare('SELECT 1 FROM centers WHERE id = ?').get(b.centerId);
      if (!c) throw bad("O'quv markaz topilmadi");
      centerId = b.centerId;
    } else {
      if (!STAFF_AND_MEMBERS.includes(b.role)) throw forbidden("Bu rolni yaratishga ruxsat yo'q");
      centerId = actor.centerId!;
    }

    if (db.prepare('SELECT 1 FROM users WHERE login = ?').get(b.login)) throw bad('Bu login band, boshqasini tanlang');
    if (b.role === 'student' && b.parentIds?.length) assertRelated(b.parentIds, 'parent', centerId);
    if (b.role === 'parent' && b.studentIds?.length) assertRelated(b.studentIds, 'student', centerId);

    const id = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO users (center_id, role, full_name, phone, login, password_hash, birth_date, address, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          centerId,
          b.role,
          b.fullName,
          b.phone ?? null,
          b.login,
          bcrypt.hashSync(b.password, 10),
          b.birthDate ?? null,
          b.address ?? null,
          b.notes ?? null,
        );
      const newId = Number(info.lastInsertRowid);
      if (b.role === 'student' && b.parentIds?.length) setParents(newId, b.parentIds);
      if (b.role === 'parent' && b.studentIds?.length) setChildren(newId, b.studentIds);
      return newId;
    })();
    res.status(201).json({ id });
  });

  r.put('/:id', (req, res) => {
    const actor = me(req);
    const id = idParam(req);
    const b = parse(updateSchema, req.body);
    const cur = db.prepare(`SELECT ${COLS} FROM users u WHERE u.id = ?`).get(id) as UserRow | undefined;
    if (!cur) throw notFound('Foydalanuvchi topilmadi');

    const allowed =
      actor.role === 'super_admin'
        ? cur.role === 'admin'
        : cur.centerId === actor.centerId && cur.role !== 'admin' && cur.role !== 'super_admin';
    if (!allowed) throw notFound('Foydalanuvchi topilmadi');
    if (b.active === false && id === actor.id) throw bad("O'zingizni bloklay olmaysiz");

    if (b.login && b.login.toLowerCase() !== cur.login.toLowerCase()) {
      if (db.prepare('SELECT 1 FROM users WHERE login = ? AND id <> ?').get(b.login, id)) throw bad('Bu login band');
    }
    if (cur.role === 'student' && b.parentIds) assertRelated(b.parentIds, 'parent', cur.centerId!);
    if (cur.role === 'parent' && b.studentIds) assertRelated(b.studentIds, 'student', cur.centerId!);

    db.transaction(() => {
      db.prepare(
        `UPDATE users SET full_name = ?, phone = ?, login = ?, birth_date = ?, address = ?, notes = ?, active = ? WHERE id = ?`,
      ).run(
        b.fullName ?? cur.fullName,
        b.phone === undefined ? cur.phone : b.phone,
        b.login ?? cur.login,
        b.birthDate === undefined ? cur.birthDate : b.birthDate,
        b.address === undefined ? cur.address : b.address,
        b.notes === undefined ? cur.notes : b.notes,
        b.active === undefined ? cur.active : b.active ? 1 : 0,
        id,
      );
      if (cur.role === 'student' && b.parentIds) setParents(id, b.parentIds);
      if (cur.role === 'parent' && b.studentIds) setChildren(id, b.studentIds);
      // Bloklangan o'quvchi guruhlardan chiqariladi (qarz hisoblanmasligi uchun)
      if (cur.role === 'student' && b.active === false) {
        db.prepare('UPDATE group_students SET left_at = ? WHERE student_id = ? AND left_at IS NULL').run(todayStr(), id);
      }
    })();
    res.json({ ok: true });
  });

  r.post('/:id/password', (req, res) => {
    const actor = me(req);
    const id = idParam(req);
    const b = parse(z.object({ password: z.string().min(6, 'kamida 6 ta belgi') }), req.body);
    const cur = db.prepare('SELECT role, center_id AS centerId FROM users WHERE id = ?').get(id) as
      | { role: Role; centerId: number | null }
      | undefined;
    const allowed =
      !!cur &&
      (actor.role === 'super_admin'
        ? cur.role === 'admin'
        : cur.centerId === actor.centerId && cur.role !== 'admin' && cur.role !== 'super_admin');
    if (!allowed) throw notFound('Foydalanuvchi topilmadi');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(b.password, 10), id);
    res.json({ ok: true });
  });

  return r;
}
