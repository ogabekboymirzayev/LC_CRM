import { Router } from 'express';
import type { DB } from '../db.js';
import { centerBilling, studentMonthBilling } from '../billing.js';
import { authenticate, currentMonth, me, todayStr, weekdayOf } from '../http.js';
import { calcStats } from './attendance.js';
import { visibleGroupIds } from './groups.js';
import { lastMonths } from './students.js';

export function dashboardRouter(db: DB) {
  const r = Router();
  r.use(authenticate(db));

  const count = (sql: string, ...args: unknown[]) => db.prepare(sql).pluck().get(...args) as number;

  function todayLessons(groupIds: number[]) {
    if (!groupIds.length) return [];
    return db
      .prepare(
        `SELECT s.group_id AS groupId, g.name AS groupName, s.start_time AS startTime, s.end_time AS endTime, s.room,
                t.full_name AS teacherName
         FROM schedule_slots s JOIN groups g ON g.id = s.group_id LEFT JOIN users t ON t.id = g.teacher_id
         WHERE g.active = 1 AND s.weekday = ? AND g.id IN (${groupIds.join(',')})
         ORDER BY s.start_time`,
      )
      .all(weekdayOf(todayStr()));
  }

  r.get('/', (req, res) => {
    const u = me(req);
    const month = currentMonth();
    const today = todayStr();
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    switch (u.role) {
      case 'super_admin':
        return res.json({
          role: u.role,
          centers: count('SELECT COUNT(*) FROM centers'),
          activeCenters: count('SELECT COUNT(*) FROM centers WHERE active = 1'),
          admins: count("SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1"),
          teachers: count("SELECT COUNT(*) FROM users WHERE role IN ('teacher','support_teacher') AND active = 1"),
          students: count("SELECT COUNT(*) FROM users WHERE role = 'student' AND active = 1"),
        });

      case 'admin': {
        const c = u.centerId!;
        const billing = centerBilling(db, c, month);
        const collected = count('SELECT COALESCE(SUM(amount),0) FROM payments WHERE center_id = ? AND period_month = ?', c, month);
        const trend = lastMonths(6).map((m) => ({
          month: m,
          collected: count('SELECT COALESCE(SUM(amount),0) FROM payments WHERE center_id = ? AND period_month = ?', c, m),
          expected: centerBilling(db, c, m).reduce((s, x) => s + x.expected, 0),
        }));
        const att = db
          .prepare(
            `SELECT a.status FROM attendance a JOIN groups g ON g.id = a.group_id WHERE g.center_id = ? AND a.date >= ?`,
          )
          .all(c, since30) as Array<{ status: string }>;
        return res.json({
          role: u.role,
          students: count("SELECT COUNT(*) FROM users WHERE center_id = ? AND role = 'student' AND active = 1", c),
          teachers: count("SELECT COUNT(*) FROM users WHERE center_id = ? AND role IN ('teacher','support_teacher') AND active = 1", c),
          parents: count("SELECT COUNT(*) FROM users WHERE center_id = ? AND role = 'parent' AND active = 1", c),
          groups: count('SELECT COUNT(*) FROM groups WHERE center_id = ? AND active = 1', c),
          month,
          expected: billing.reduce((s, x) => s + x.expected, 0),
          collected,
          debt: billing.reduce((s, x) => s + x.debt, 0),
          debtorsCount: billing.filter((x) => x.debt > 0).length,
          attendanceRate30d: calcStats(att).rate,
          trend,
          todayLessons: todayLessons(visibleGroupIds(db, u)),
          recentPayments: db
            .prepare(
              `SELECT p.id, s.full_name AS studentName, p.amount, p.paid_at AS paidAt FROM payments p
               JOIN users s ON s.id = p.student_id WHERE p.center_id = ? ORDER BY p.paid_at DESC, p.id DESC LIMIT 5`,
            )
            .all(c),
        });
      }

      case 'teacher':
      case 'support_teacher': {
        const ids = visibleGroupIds(db, u);
        const lessons = todayLessons(ids) as Array<{ groupId: number }>;
        const marked = new Set(
          ids.length
            ? (db
                .prepare(`SELECT DISTINCT group_id FROM attendance WHERE date = ? AND group_id IN (${ids.join(',')})`)
                .pluck()
                .all(today) as number[])
            : [],
        );
        return res.json({
          role: u.role,
          groups: db.prepare(`SELECT COUNT(*) FROM groups WHERE active = 1 AND id IN (${ids.length ? ids.join(',') : '0'})`).pluck().get(),
          students: ids.length
            ? count(
                `SELECT COUNT(DISTINCT student_id) FROM group_students gs JOIN users s ON s.id = gs.student_id
                 WHERE gs.left_at IS NULL AND s.active = 1 AND gs.group_id IN (${ids.join(',')})`,
              )
            : 0,
          todayLessons: lessons.map((l) => ({ ...l, attendanceMarked: marked.has(l.groupId) })),
        });
      }

      case 'student':
      case 'parent': {
        const kids =
          u.role === 'student'
            ? [{ id: u.id, fullName: u.fullName }]
            : (db
                .prepare(
                  `SELECT s.id, s.full_name AS fullName FROM parent_students ps JOIN users s ON s.id = ps.student_id
                   WHERE ps.parent_id = ? AND s.active = 1 ORDER BY s.full_name`,
                )
                .all(u.id) as Array<{ id: number; fullName: string }>);
        const children = kids.map((k) => {
          const att = db
            .prepare('SELECT status FROM attendance WHERE student_id = ? AND date >= ?')
            .all(k.id, since30) as Array<{ status: string }>;
          return {
            ...k,
            groups: count('SELECT COUNT(*) FROM group_students gs JOIN groups g ON g.id = gs.group_id WHERE gs.student_id = ? AND gs.left_at IS NULL AND g.active = 1', k.id),
            attendanceRate30d: calcStats(att).rate,
            billing: studentMonthBilling(db, k.id, month),
          };
        });
        return res.json({ role: u.role, month, children, todayLessons: todayLessons(visibleGroupIds(db, u)) });
      }
    }
  });

  return r;
}
