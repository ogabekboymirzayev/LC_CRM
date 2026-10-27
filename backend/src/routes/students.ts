import { Router } from 'express';
import type { DB } from '../db.js';
import { assertStudentAccess } from '../access.js';
import { studentMonthBilling } from '../billing.js';
import { authenticate, currentMonth, idParam, me, todayStr } from '../http.js';
import { calcStats } from './attendance.js';
import { visibleGroupIds } from './groups.js';

/** Oxirgi N oyning "YYYY-MM" ro'yxati (eskisidan yangisiga). */
export function lastMonths(n: number, from = currentMonth()): string[] {
  const [y, m] = from.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export function studentsRouter(db: DB) {
  const r = Router();
  r.use(authenticate(db));

  /** O'quvchi uchun — o'zi; ota-ona uchun — farzandlari. */
  r.get('/mine', (req, res) => {
    const u = me(req);
    if (u.role === 'student') {
      return res.json([{ id: u.id, fullName: u.fullName }]);
    }
    if (u.role === 'parent') {
      return res.json(
        db
          .prepare(
            `SELECT s.id, s.full_name AS fullName FROM parent_students ps JOIN users s ON s.id = ps.student_id
             WHERE ps.parent_id = ? AND s.active = 1 ORDER BY s.full_name`,
          )
          .all(u.id),
      );
    }
    res.json([]);
  });

  /** O'quvchining to'liq profili: guruhlar, jadval, davomat, to'lovlar. */
  r.get('/:id/overview', (req, res) => {
    const u = me(req);
    const id = idParam(req);
    const s = assertStudentAccess(db, u, id);
    const canSeeMoney = u.role === 'admin' || u.role === 'student' || u.role === 'parent';

    const myGroupIds = visibleGroupIds(db, u);
    const groups = db
      .prepare(
        `SELECT g.id, g.name, g.subject, g.monthly_price AS monthlyPrice, t.full_name AS teacherName,
                st.full_name AS supportTeacherName, gs.joined_at AS joinedAt
         FROM group_students gs JOIN groups g ON g.id = gs.group_id
         LEFT JOIN users t ON t.id = g.teacher_id LEFT JOIN users st ON st.id = g.support_teacher_id
         WHERE gs.student_id = ? AND gs.left_at IS NULL AND g.active = 1
         ORDER BY g.name`,
      )
      .all(id) as Array<{ id: number } & Record<string, unknown>>;
    const visible = u.role === 'admin' || u.role === 'student' || u.role === 'parent' ? groups : groups.filter((g) => myGroupIds.includes(g.id));

    const slots = visible.length
      ? db
          .prepare(
            `SELECT group_id AS groupId, weekday, start_time AS startTime, end_time AS endTime, room
             FROM schedule_slots WHERE group_id IN (${visible.map((g) => g.id).join(',')}) ORDER BY weekday, start_time`,
          )
          .all()
      : [];

    const to = todayStr();
    const from = new Date(new Date(to + 'T00:00:00').getTime() - 90 * 86400000).toISOString().slice(0, 10);
    const att = db
      .prepare(
        `SELECT a.date, g.name AS groupName, a.status, a.note FROM attendance a JOIN groups g ON g.id = a.group_id
         WHERE a.student_id = ? AND a.date BETWEEN ? AND ?
           ${u.role === 'teacher' || u.role === 'support_teacher' ? `AND a.group_id IN (${myGroupIds.length ? myGroupIds.join(',') : '0'})` : ''}
         ORDER BY a.date DESC`,
      )
      .all(id, from, to) as Array<{ status: string }>;

    const parents = db
      .prepare(
        `SELECT p.id, p.full_name AS fullName, p.phone FROM parent_students ps JOIN users p ON p.id = ps.parent_id
         WHERE ps.student_id = ? AND p.active = 1`,
      )
      .all(id);

    let money: unknown = null;
    if (canSeeMoney) {
      const months = lastMonths(6).map((m) => ({ month: m, ...studentMonthBilling(db, id, m) }));
      const payments = db
        .prepare(
          `SELECT p.id, p.amount, p.method, p.period_month AS periodMonth, p.paid_at AS paidAt, p.note, g.name AS groupName
           FROM payments p LEFT JOIN groups g ON g.id = p.group_id
           WHERE p.student_id = ? ORDER BY p.paid_at DESC, p.id DESC LIMIT 50`,
        )
        .all(id);
      money = {
        currentMonth: months[months.length - 1],
        totalDebt: months.reduce((sum, m) => sum + m.debt, 0),
        months,
        payments,
      };
    }

    res.json({
      student: { ...s, active: !!s.active },
      parents,
      groups: visible,
      slots,
      attendance: { stats: calcStats(att), recent: att.slice(0, 20), days: 90 },
      money,
    });
  });

  return r;
}
