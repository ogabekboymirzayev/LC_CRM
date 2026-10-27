import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db.js';
import { assertGroupAccess, assertStudentAccess } from '../access.js';
import { visibleGroupIds } from './groups.js';
import {
  authenticate,
  bad,
  dateStr,
  idParam,
  me,
  monthStr,
  parse,
  requireRole,
  todayStr,
  weekdayOf,
} from '../http.js';

export const STATUSES = ['present', 'absent', 'late', 'excused'] as const;

export interface AttendanceStats {
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  /** Kelgan + kechikkan darslar ulushi (%), sababli yo'qlik hisobga olinmaydi */
  rate: number | null;
}

export function calcStats(rows: Array<{ status: string }>): AttendanceStats {
  const s = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const r of rows) if (r.status in s) s[r.status as keyof typeof s]++;
  const total = s.present + s.absent + s.late + s.excused;
  const counted = s.present + s.absent + s.late;
  return { ...s, total, rate: counted ? Math.round(((s.present + s.late) / counted) * 100) : null };
}

export function attendanceRouter(db: DB) {
  const r = Router();
  r.use(authenticate(db));

  /** Guruhning berilgan kundagi davomat varaqasi. */
  r.get('/', requireRole('admin', 'teacher', 'support_teacher'), (req, res) => {
    const u = me(req);
    const q = parse(z.object({ groupId: z.coerce.number().int().positive(), date: dateStr.default(todayStr()) }), req.query);
    const g = assertGroupAccess(db, u, q.groupId, 'attendance');

    const students = db
      .prepare(
        `SELECT s.id AS studentId, s.full_name AS fullName, a.status, a.note
         FROM group_students gs JOIN users s ON s.id = gs.student_id
         LEFT JOIN attendance a ON a.group_id = gs.group_id AND a.student_id = gs.student_id AND a.date = @date
         WHERE gs.group_id = @groupId AND s.active = 1
           AND gs.joined_at <= @date AND (gs.left_at IS NULL OR gs.left_at >= @date)
         ORDER BY s.full_name`,
      )
      .all({ groupId: q.groupId, date: q.date });
    const lessonDay = !!db
      .prepare('SELECT 1 FROM schedule_slots WHERE group_id = ? AND weekday = ?')
      .get(q.groupId, weekdayOf(q.date));
    res.json({ group: { id: g.id, name: g.name }, date: q.date, lessonDay, students });
  });

  r.put('/', requireRole('admin', 'teacher', 'support_teacher'), (req, res) => {
    const u = me(req);
    const b = parse(
      z.object({
        groupId: z.number().int().positive(),
        date: dateStr,
        records: z
          .array(
            z.object({
              studentId: z.number().int().positive(),
              status: z.enum(STATUSES),
              note: z.string().trim().max(200).nullable().optional(),
            }),
          )
          .min(1)
          .max(200),
      }),
      req.body,
    );
    assertGroupAccess(db, u, b.groupId, 'attendance');
    if (b.date > todayStr()) throw bad("Kelajak sanasi uchun davomat belgilab bo'lmaydi");

    const isMember = db.prepare(
      `SELECT 1 FROM group_students WHERE group_id = ? AND student_id = ? AND joined_at <= ? AND (left_at IS NULL OR left_at >= ?)`,
    );
    const upsert = db.prepare(
      `INSERT INTO attendance (group_id, student_id, date, status, note, marked_by, updated_at)
       VALUES (@groupId, @studentId, @date, @status, @note, @by, datetime('now'))
       ON CONFLICT (group_id, student_id, date)
       DO UPDATE SET status = excluded.status, note = excluded.note, marked_by = excluded.marked_by, updated_at = datetime('now')`,
    );
    db.transaction(() => {
      for (const rec of b.records) {
        if (!isMember.get(b.groupId, rec.studentId, b.date, b.date)) {
          throw bad(`O'quvchi (id ${rec.studentId}) ${b.date} sanasida bu guruhda emas`);
        }
        upsert.run({ groupId: b.groupId, studentId: rec.studentId, date: b.date, status: rec.status, note: rec.note ?? null, by: u.id });
      }
    })();
    res.json({ ok: true, saved: b.records.length });
  });

  /** Guruh bo'yicha oylik hisobot: har bir o'quvchi uchun kelgan/kelmagan soni. */
  r.get('/summary', requireRole('admin', 'teacher', 'support_teacher'), (req, res) => {
    const u = me(req);
    const q = parse(z.object({ groupId: z.coerce.number().int().positive(), month: monthStr }), req.query);
    assertGroupAccess(db, u, q.groupId, 'attendance');
    const rows = db
      .prepare(
        `SELECT s.id AS studentId, s.full_name AS fullName, a.status
         FROM group_students gs JOIN users s ON s.id = gs.student_id
         LEFT JOIN attendance a ON a.group_id = gs.group_id AND a.student_id = gs.student_id AND substr(a.date, 1, 7) = ?
         WHERE gs.group_id = ? AND s.active = 1 AND gs.joined_at <= ? AND (gs.left_at IS NULL OR gs.left_at >= ?)
         ORDER BY s.full_name`,
      )
      .all(q.month, q.groupId, `${q.month}-31`, `${q.month}-01`) as Array<{ studentId: number; fullName: string; status: string | null }>;
    const byStudent = new Map<number, { studentId: number; fullName: string; list: Array<{ status: string }> }>();
    for (const row of rows) {
      if (!byStudent.has(row.studentId)) byStudent.set(row.studentId, { studentId: row.studentId, fullName: row.fullName, list: [] });
      if (row.status) byStudent.get(row.studentId)!.list.push({ status: row.status });
    }
    res.json([...byStudent.values()].map((s) => ({ studentId: s.studentId, fullName: s.fullName, ...calcStats(s.list) })));
  });

  /** O'quvchining davomat tarixi (o'quvchining o'zi, ota-onasi, admin yoki o'qituvchi). */
  r.get('/student/:studentId', (req, res) => {
    const u = me(req);
    const studentId = idParam(req, 'studentId');
    assertStudentAccess(db, u, studentId);
    const q = parse(z.object({ from: dateStr.optional(), to: dateStr.optional() }), req.query);
    const to = q.to ?? todayStr();
    const fromDefault = new Date(new Date(to + 'T00:00:00').getTime() - 90 * 86400000).toISOString().slice(0, 10);
    const from = q.from ?? fromDefault;

    let groupFilter = '';
    if (u.role === 'teacher' || u.role === 'support_teacher') {
      const ids = visibleGroupIds(db, u);
      groupFilter = ` AND a.group_id IN (${ids.length ? ids.join(',') : '0'})`;
    }
    const records = db
      .prepare(
        `SELECT a.date, a.group_id AS groupId, g.name AS groupName, a.status, a.note
         FROM attendance a JOIN groups g ON g.id = a.group_id
         WHERE a.student_id = ? AND a.date BETWEEN ? AND ? ${groupFilter}
         ORDER BY a.date DESC, g.name`,
      )
      .all(studentId, from, to) as Array<{ status: string }>;
    res.json({ from, to, stats: calcStats(records), records });
  });

  return r;
}
