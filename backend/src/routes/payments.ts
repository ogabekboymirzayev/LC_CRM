import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db.js';
import { assertStudentAccess } from '../access.js';
import { centerBilling } from '../billing.js';
import {
  authenticate,
  bad,
  centerOf,
  currentMonth,
  dateStr,
  forbidden,
  idParam,
  me,
  monthStr,
  notFound,
  parse,
  requireRole,
  todayStr,
} from '../http.js';

const METHODS = ['cash', 'card', 'transfer'] as const;

const createSchema = z.object({
  studentId: z.number().int().positive(),
  groupId: z.number().int().positive().nullable().optional(),
  amount: z.number().int().positive("summa 0 dan katta bo'lsin").max(1_000_000_000),
  method: z.enum(METHODS),
  periodMonth: monthStr,
  paidAt: dateStr.optional(),
  note: z.string().trim().max(300).optional(),
});

export function paymentsRouter(db: DB) {
  const r = Router();
  r.use(authenticate(db));

  /** To'lovlar ro'yxati. Admin — markaz bo'yicha, o'quvchi/ota-ona — faqat o'ziniki. */
  r.get('/', (req, res) => {
    const u = me(req);
    if (u.role !== 'admin' && u.role !== 'student' && u.role !== 'parent') throw forbidden();
    const q = parse(
      z.object({
        studentId: z.coerce.number().int().positive().optional(),
        month: monthStr.optional(),
        from: dateStr.optional(),
        to: dateStr.optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      }),
      req.query,
    );

    const where: string[] = ['p.center_id = @centerId'];
    const args: Record<string, unknown> = { centerId: u.centerId, limit: q.limit };
    if (u.role === 'student') {
      where.push('p.student_id = @me');
      args.me = u.id;
    } else if (u.role === 'parent') {
      where.push('p.student_id IN (SELECT student_id FROM parent_students WHERE parent_id = @me)');
      args.me = u.id;
    }
    if (q.studentId) {
      if (u.role !== 'admin') assertStudentAccess(db, u, q.studentId);
      where.push('p.student_id = @studentId');
      args.studentId = q.studentId;
    }
    if (q.month) {
      where.push('p.period_month = @month');
      args.month = q.month;
    }
    if (q.from) {
      where.push('p.paid_at >= @from');
      args.from = q.from;
    }
    if (q.to) {
      where.push('p.paid_at <= @to');
      args.to = q.to;
    }

    const rows = db
      .prepare(
        `SELECT p.id, p.student_id AS studentId, s.full_name AS studentName, p.group_id AS groupId, g.name AS groupName,
                p.amount, p.method, p.period_month AS periodMonth, p.paid_at AS paidAt, p.note,
                cb.full_name AS createdByName
         FROM payments p JOIN users s ON s.id = p.student_id
         LEFT JOIN groups g ON g.id = p.group_id
         LEFT JOIN users cb ON cb.id = p.created_by
         WHERE ${where.join(' AND ')}
         ORDER BY p.paid_at DESC, p.id DESC LIMIT @limit`,
      )
      .all(args);
    res.json(rows);
  });

  r.post('/', requireRole('admin'), (req, res) => {
    const u = me(req);
    const centerId = centerOf(req);
    const b = parse(createSchema, req.body);

    const s = db.prepare("SELECT center_id AS centerId, role FROM users WHERE id = ?").get(b.studentId) as
      | { centerId: number; role: string }
      | undefined;
    if (!s || s.role !== 'student' || s.centerId !== centerId) throw bad("O'quvchi topilmadi");
    if (b.groupId) {
      const g = db.prepare('SELECT center_id AS centerId FROM groups WHERE id = ?').get(b.groupId) as { centerId: number } | undefined;
      if (!g || g.centerId !== centerId) throw bad('Guruh topilmadi');
    }
    const paidAt = b.paidAt ?? todayStr();
    if (paidAt > todayStr()) throw bad("To'lov sanasi kelajakda bo'lishi mumkin emas");

    const info = db
      .prepare(
        `INSERT INTO payments (center_id, student_id, group_id, amount, method, period_month, paid_at, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(centerId, b.studentId, b.groupId ?? null, b.amount, b.method, b.periodMonth, paidAt, b.note ?? null, u.id);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  r.delete('/:id', requireRole('admin'), (req, res) => {
    const centerId = centerOf(req);
    const id = idParam(req);
    const info = db.prepare('DELETE FROM payments WHERE id = ? AND center_id = ?').run(id, centerId);
    if (!info.changes) throw notFound("To'lov topilmadi");
    res.json({ ok: true });
  });

  /** Qarzdorlar ro'yxati (berilgan oy bo'yicha). */
  r.get('/debtors', requireRole('admin'), (req, res) => {
    const centerId = centerOf(req);
    const { month } = parse(z.object({ month: monthStr.default(currentMonth()) }), req.query);
    const rows = centerBilling(db, centerId, month)
      .filter((x) => x.debt > 0)
      .sort((a, b) => b.debt - a.debt);
    res.json({ month, totalDebt: rows.reduce((s, x) => s + x.debt, 0), debtors: rows });
  });

  /** Oy bo'yicha umumiy ko'rsatkichlar. */
  r.get('/summary', requireRole('admin'), (req, res) => {
    const centerId = centerOf(req);
    const { month } = parse(z.object({ month: monthStr.default(currentMonth()) }), req.query);
    const billing = centerBilling(db, centerId, month);
    const byMethod = db
      .prepare(
        `SELECT method, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
         FROM payments WHERE center_id = ? AND period_month = ? GROUP BY method`,
      )
      .all(centerId, month);
    res.json({
      month,
      expected: billing.reduce((s, x) => s + x.expected, 0),
      collected: (byMethod as Array<{ total: number }>).reduce((s, x) => s + x.total, 0),
      debt: billing.reduce((s, x) => s + x.debt, 0),
      debtorsCount: billing.filter((x) => x.debt > 0).length,
      byMethod,
    });
  });

  return r;
}
