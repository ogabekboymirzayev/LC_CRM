import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db.js';
import { assertGroupAccess, getCenterUser } from '../access.js';
import {
  authenticate,
  bad,
  centerOf,
  dateStr,
  idParam,
  me,
  parse,
  requireRole,
  timeStr,
  todayStr,
  type AuthUser,
} from '../http.js';

const slotSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  startTime: timeStr,
  endTime: timeStr,
  room: z.string().trim().max(50).nullable().optional(),
});
type Slot = z.infer<typeof slotSchema>;

const groupBase = {
  name: z.string().trim().min(2, 'kamida 2 ta belgi'),
  subject: z.string().trim().nullable().optional(),
  teacherId: z.number().int().positive().nullable().optional(),
  supportTeacherId: z.number().int().positive().nullable().optional(),
  monthlyPrice: z.number().int().min(0).max(1_000_000_000),
  startDate: dateStr.nullable().optional(),
  slots: z.array(slotSchema).max(14).optional(),
};
const createSchema = z.object(groupBase);
const updateSchema = createSchema.partial().extend({ active: z.boolean().optional() });

const overlaps = (a: Slot, b: { startTime: string; endTime: string }) => a.startTime < b.endTime && b.startTime < a.endTime;

/** Foydalanuvchi ko'ra oladigan guruhlar ID lari. */
export function visibleGroupIds(db: DB, user: AuthUser): number[] {
  if (user.centerId === null) return [];
  const q = (sql: string, ...args: unknown[]) => (db.prepare(sql).pluck().all(...args) as number[]);
  switch (user.role) {
    case 'admin':
      return q('SELECT id FROM groups WHERE center_id = ?', user.centerId);
    case 'teacher':
    case 'support_teacher':
      return q('SELECT id FROM groups WHERE center_id = ? AND (teacher_id = ? OR support_teacher_id = ?)', user.centerId, user.id, user.id);
    case 'student':
      return q('SELECT group_id FROM group_students WHERE student_id = ? AND left_at IS NULL', user.id);
    case 'parent':
      return q(
        `SELECT DISTINCT gs.group_id FROM group_students gs JOIN parent_students ps ON ps.student_id = gs.student_id
         WHERE ps.parent_id = ? AND gs.left_at IS NULL`,
        user.id,
      );
    default:
      return [];
  }
}

export function groupsRouter(db: DB) {
  const r = Router();
  r.use(authenticate(db));

  function slotsOf(groupIds: number[]) {
    if (!groupIds.length) return new Map<number, Array<Record<string, unknown>>>();
    const rows = db
      .prepare(
        `SELECT id, group_id AS groupId, weekday, start_time AS startTime, end_time AS endTime, room
         FROM schedule_slots WHERE group_id IN (${groupIds.join(',')}) ORDER BY weekday, start_time`,
      )
      .all() as Array<{ groupId: number } & Record<string, unknown>>;
    const map = new Map<number, Array<Record<string, unknown>>>();
    for (const s of rows) {
      if (!map.has(s.groupId)) map.set(s.groupId, []);
      map.get(s.groupId)!.push(s);
    }
    return map;
  }

  /** Bir xil o'qituvchi yoki xona bo'yicha vaqt to'qnashuvini tekshiradi. */
  function assertNoConflicts(
    centerId: number,
    groupId: number | null,
    teacherId: number | null,
    supportId: number | null,
    slots: Slot[],
  ) {
    // Guruh ichidagi to'qnashuv
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].endTime <= slots[i].startTime) throw bad("Dars tugash vaqti boshlanishidan keyin bo'lishi kerak");
      for (let j = i + 1; j < slots.length; j++) {
        if (slots[i].weekday === slots[j].weekday && overlaps(slots[i], slots[j])) {
          throw bad('Guruh jadvalida vaqtlar bir-biriga to‘g‘ri kelmoqda');
        }
      }
    }
    const others = db
      .prepare(
        `SELECT s.weekday, s.start_time AS startTime, s.end_time AS endTime, s.room, g.name,
                g.teacher_id AS teacherId, g.support_teacher_id AS supportId
         FROM schedule_slots s JOIN groups g ON g.id = s.group_id
         WHERE g.center_id = ? AND g.active = 1 AND (? IS NULL OR g.id <> ?)`,
      )
      .all(centerId, groupId, groupId) as Array<{
      weekday: number;
      startTime: string;
      endTime: string;
      room: string | null;
      name: string;
      teacherId: number | null;
      supportId: number | null;
    }>;
    for (const s of slots) {
      for (const o of others) {
        if (o.weekday !== s.weekday || !overlaps(s, o)) continue;
        if (teacherId && o.teacherId === teacherId) throw bad(`O'qituvchi shu vaqtda "${o.name}" guruhida band`);
        if (supportId && o.supportId === supportId) throw bad(`Yordamchi o'qituvchi shu vaqtda "${o.name}" guruhida band`);
        if (s.room && o.room && s.room.toLowerCase() === o.room.toLowerCase()) {
          throw bad(`"${s.room}" xonasi shu vaqtda "${o.name}" guruhi bilan band`);
        }
      }
    }
  }

  function checkStaff(centerId: number, teacherId?: number | null, supportId?: number | null) {
    if (teacherId && !getCenterUser(db, centerId, teacherId, 'teacher')) throw bad("O'qituvchi topilmadi");
    if (supportId && !getCenterUser(db, centerId, supportId, 'support_teacher')) throw bad("Yordamchi o'qituvchi topilmadi");
  }

  function saveSlots(groupId: number, slots: Slot[]) {
    db.prepare('DELETE FROM schedule_slots WHERE group_id = ?').run(groupId);
    const ins = db.prepare('INSERT INTO schedule_slots (group_id, weekday, start_time, end_time, room) VALUES (?, ?, ?, ?, ?)');
    for (const s of slots) ins.run(groupId, s.weekday, s.startTime, s.endTime, s.room || null);
  }

  r.get('/', (req, res) => {
    const u = me(req);
    const ids = visibleGroupIds(db, u);
    if (!ids.length) return res.json([]);
    const rows = db
      .prepare(
        `SELECT g.id, g.name, g.subject, g.teacher_id AS teacherId, t.full_name AS teacherName,
                g.support_teacher_id AS supportTeacherId, st.full_name AS supportTeacherName,
                g.monthly_price AS monthlyPrice, g.start_date AS startDate, g.active,
                (SELECT COUNT(*) FROM group_students gs JOIN users s ON s.id = gs.student_id
                   WHERE gs.group_id = g.id AND gs.left_at IS NULL AND s.active = 1) AS studentsCount
         FROM groups g
         LEFT JOIN users t ON t.id = g.teacher_id
         LEFT JOIN users st ON st.id = g.support_teacher_id
         WHERE g.id IN (${ids.join(',')})
         ORDER BY g.active DESC, g.name`,
      )
      .all() as Array<{ id: number; active: number } & Record<string, unknown>>;
    const slots = slotsOf(rows.map((g) => g.id));
    res.json(rows.map((g) => ({ ...g, active: !!g.active, slots: slots.get(g.id) ?? [] })));
  });

  r.get('/:id', (req, res) => {
    const u = me(req);
    const id = idParam(req);
    const g = assertGroupAccess(db, u, id, 'read');
    const teacher = g.teacher_id
      ? db.prepare('SELECT id, full_name AS fullName, phone FROM users WHERE id = ?').get(g.teacher_id)
      : null;
    const support = g.support_teacher_id
      ? db.prepare('SELECT id, full_name AS fullName, phone FROM users WHERE id = ?').get(g.support_teacher_id)
      : null;

    // Faqat admin va o'qituvchilar to'liq ro'yxatni ko'radi; o'quvchi/ota-ona faqat o'z bolalarini
    let students: unknown[] = [];
    if (u.role === 'admin' || u.role === 'teacher' || u.role === 'support_teacher') {
      students = db
        .prepare(
          `SELECT s.id, s.full_name AS fullName, s.phone, gs.joined_at AS joinedAt
           FROM group_students gs JOIN users s ON s.id = gs.student_id
           WHERE gs.group_id = ? AND gs.left_at IS NULL AND s.active = 1 ORDER BY s.full_name`,
        )
        .all(id);
    }
    res.json({
      id: g.id,
      name: g.name,
      subject: g.subject,
      monthlyPrice: g.monthly_price,
      startDate: g.start_date,
      active: !!g.active,
      teacher,
      supportTeacher: support,
      students,
      slots: slotsOf([id]).get(id) ?? [],
    });
  });

  r.post('/', requireRole('admin'), (req, res) => {
    const centerId = centerOf(req);
    const b = parse(createSchema, req.body);
    checkStaff(centerId, b.teacherId, b.supportTeacherId);
    const slots = b.slots ?? [];
    assertNoConflicts(centerId, null, b.teacherId ?? null, b.supportTeacherId ?? null, slots);
    const id = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO groups (center_id, name, subject, teacher_id, support_teacher_id, monthly_price, start_date)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(centerId, b.name, b.subject ?? null, b.teacherId ?? null, b.supportTeacherId ?? null, b.monthlyPrice, b.startDate ?? null);
      const gid = Number(info.lastInsertRowid);
      saveSlots(gid, slots);
      return gid;
    })();
    res.status(201).json({ id });
  });

  r.put('/:id', requireRole('admin'), (req, res) => {
    const u = me(req);
    const id = idParam(req);
    const cur = assertGroupAccess(db, u, id, 'write');
    const b = parse(updateSchema, req.body);

    const teacherId = b.teacherId === undefined ? cur.teacher_id : b.teacherId;
    const supportId = b.supportTeacherId === undefined ? cur.support_teacher_id : b.supportTeacherId;
    checkStaff(cur.center_id, teacherId, supportId);

    const existingSlots = (slotsOf([id]).get(id) ?? []) as unknown as Slot[];
    const slots = b.slots ?? existingSlots;
    const active = b.active === undefined ? !!cur.active : b.active;
    if (active) assertNoConflicts(cur.center_id, id, teacherId, supportId, slots);

    db.transaction(() => {
      db.prepare(
        `UPDATE groups SET name = ?, subject = ?, teacher_id = ?, support_teacher_id = ?, monthly_price = ?, start_date = ?, active = ?
         WHERE id = ?`,
      ).run(
        b.name ?? cur.name,
        b.subject === undefined ? cur.subject : b.subject,
        teacherId,
        supportId,
        b.monthlyPrice ?? cur.monthly_price,
        b.startDate === undefined ? cur.start_date : b.startDate,
        active ? 1 : 0,
        id,
      );
      if (b.slots) saveSlots(id, b.slots);
      // Guruh yopilsa, barcha o'quvchilar chiqariladi
      if (!active && cur.active) {
        db.prepare('UPDATE group_students SET left_at = ? WHERE group_id = ? AND left_at IS NULL').run(todayStr(), id);
      }
    })();
    res.json({ ok: true });
  });

  r.post('/:id/students', requireRole('admin'), (req, res) => {
    const u = me(req);
    const id = idParam(req);
    const g = assertGroupAccess(db, u, id, 'write');
    if (!g.active) throw bad('Guruh yopilgan');
    const { studentId, joinedAt } = parse(
      z.object({ studentId: z.number().int().positive(), joinedAt: dateStr.optional() }),
      req.body,
    );
    const joined = joinedAt ?? todayStr();
    if (joined > todayStr()) throw bad("Qo'shilgan sana kelajakda bo'lishi mumkin emas");
    const s = db.prepare('SELECT center_id AS centerId, role, active FROM users WHERE id = ?').get(studentId) as
      | { centerId: number; role: string; active: number }
      | undefined;
    if (!s || s.role !== 'student' || s.centerId !== g.center_id) throw bad("O'quvchi topilmadi");
    if (!s.active) throw bad("O'quvchi bloklangan");

    const cur = db.prepare('SELECT id, left_at AS leftAt FROM group_students WHERE group_id = ? AND student_id = ?').get(id, studentId) as
      | { id: number; leftAt: string | null }
      | undefined;
    if (cur && !cur.leftAt) throw bad("O'quvchi allaqachon shu guruhda");
    if (cur) {
      db.prepare('UPDATE group_students SET left_at = NULL, joined_at = ? WHERE id = ?').run(joined, cur.id);
    } else {
      db.prepare('INSERT INTO group_students (group_id, student_id, joined_at) VALUES (?, ?, ?)').run(id, studentId, joined);
    }
    res.status(201).json({ ok: true });
  });

  r.delete('/:id/students/:studentId', requireRole('admin'), (req, res) => {
    const u = me(req);
    const id = idParam(req);
    const studentId = idParam(req, 'studentId');
    assertGroupAccess(db, u, id, 'write');
    const info = db
      .prepare('UPDATE group_students SET left_at = ? WHERE group_id = ? AND student_id = ? AND left_at IS NULL')
      .run(todayStr(), id, studentId);
    if (!info.changes) throw bad("O'quvchi bu guruhda emas");
    res.json({ ok: true });
  });

  return r;
}

/** Dars jadvali: foydalanuvchi roliga qarab o'z darslari (hafta kunlari bo'yicha). */
export function scheduleRouter(db: DB) {
  const r = Router();
  r.use(authenticate(db));

  r.get('/', (req, res) => {
    const u = me(req);
    const ids = visibleGroupIds(db, u);
    if (!ids.length) return res.json([]);
    const rows = db
      .prepare(
        `SELECT s.id, s.group_id AS groupId, g.name AS groupName, g.subject, s.weekday,
                s.start_time AS startTime, s.end_time AS endTime, s.room, t.full_name AS teacherName
         FROM schedule_slots s JOIN groups g ON g.id = s.group_id
         LEFT JOIN users t ON t.id = g.teacher_id
         WHERE g.active = 1 AND g.id IN (${ids.join(',')})
         ORDER BY s.weekday, s.start_time`,
      )
      .all() as Array<{ groupId: number } & Record<string, unknown>>;

    if (u.role === 'parent') {
      const kids = db
        .prepare(
          `SELECT gs.group_id AS groupId, s.full_name AS fullName FROM group_students gs
           JOIN parent_students ps ON ps.student_id = gs.student_id JOIN users s ON s.id = gs.student_id
           WHERE ps.parent_id = ? AND gs.left_at IS NULL`,
        )
        .all(u.id) as Array<{ groupId: number; fullName: string }>;
      return res.json(
        rows.map((row) => ({
          ...row,
          studentNames: kids.filter((k) => k.groupId === row.groupId).map((k) => k.fullName),
        })),
      );
    }
    res.json(rows);
  });

  return r;
}
