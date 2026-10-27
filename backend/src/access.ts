import type { DB } from './db.js';
import { forbidden, notFound, type AuthUser } from './http.js';

export interface GroupRow {
  id: number;
  center_id: number;
  name: string;
  subject: string | null;
  teacher_id: number | null;
  support_teacher_id: number | null;
  monthly_price: number;
  start_date: string | null;
  active: number;
}

export function getGroup(db: DB, id: number): GroupRow {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as GroupRow | undefined;
  if (!g) throw notFound('Guruh topilmadi');
  return g;
}

/**
 * Guruhga kirish huquqi.
 *  - write: guruhni tahrirlash (faqat admin)
 *  - attendance: davomat belgilash (admin, guruhning o'qituvchisi yoki yordamchi o'qituvchisi)
 *  - read: ko'rish (yuqoridagilar + guruh o'quvchilari va ularning ota-onalari)
 */
export function assertGroupAccess(
  db: DB,
  user: AuthUser,
  groupId: number,
  mode: 'read' | 'attendance' | 'write',
): GroupRow {
  const g = getGroup(db, groupId);
  if (user.centerId === null || g.center_id !== user.centerId) throw notFound('Guruh topilmadi');

  if (user.role === 'admin') return g;
  if (mode === 'write') throw forbidden();

  if (user.role === 'teacher' || user.role === 'support_teacher') {
    if (g.teacher_id === user.id || g.support_teacher_id === user.id) return g;
    throw forbidden('Bu guruh sizga biriktirilmagan');
  }

  if (mode === 'read') {
    if (user.role === 'student') {
      const m = db
        .prepare('SELECT 1 FROM group_students WHERE group_id = ? AND student_id = ? AND left_at IS NULL')
        .get(groupId, user.id);
      if (m) return g;
    }
    if (user.role === 'parent') {
      const m = db
        .prepare(
          `SELECT 1 FROM group_students gs JOIN parent_students ps ON ps.student_id = gs.student_id
           WHERE gs.group_id = ? AND ps.parent_id = ? AND gs.left_at IS NULL`,
        )
        .get(groupId, user.id);
      if (m) return g;
    }
  }
  throw forbidden();
}

/** O'quvchi ma'lumotlariga kirish huquqini tekshiradi va o'quvchi qatorini qaytaradi. */
export function assertStudentAccess(db: DB, user: AuthUser, studentId: number) {
  const s = db
    .prepare(
      `SELECT id, center_id AS centerId, full_name AS fullName, phone, login, birth_date AS birthDate,
              address, notes, active, created_at AS createdAt
       FROM users WHERE id = ? AND role = 'student'`,
    )
    .get(studentId) as
    | {
        id: number;
        centerId: number;
        fullName: string;
        phone: string | null;
        login: string;
        birthDate: string | null;
        address: string | null;
        notes: string | null;
        active: number;
        createdAt: string;
      }
    | undefined;
  if (!s || user.centerId === null || s.centerId !== user.centerId) throw notFound("O'quvchi topilmadi");

  switch (user.role) {
    case 'admin':
      return s;
    case 'student':
      if (user.id === studentId) return s;
      break;
    case 'parent': {
      const link = db
        .prepare('SELECT 1 FROM parent_students WHERE parent_id = ? AND student_id = ?')
        .get(user.id, studentId);
      if (link) return s;
      break;
    }
    case 'teacher':
    case 'support_teacher': {
      const link = db
        .prepare(
          `SELECT 1 FROM group_students gs JOIN groups g ON g.id = gs.group_id
           WHERE gs.student_id = ? AND gs.left_at IS NULL
             AND (g.teacher_id = ? OR g.support_teacher_id = ?)`,
        )
        .get(studentId, user.id, user.id);
      if (link) return s;
      break;
    }
  }
  throw forbidden();
}

/** Foydalanuvchi o'z markazida ekanini tekshirib, qatorini qaytaradi. */
export function getCenterUser(db: DB, centerId: number, userId: number, role?: string) {
  const row = db
    .prepare('SELECT id, role, center_id AS centerId, full_name AS fullName FROM users WHERE id = ?')
    .get(userId) as { id: number; role: string; centerId: number | null; fullName: string } | undefined;
  if (!row || row.centerId !== centerId || (role && row.role !== role)) return undefined;
  return row;
}
