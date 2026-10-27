import type { DB } from './db.js';

/**
 * Hisoblash qoidasi (MVP):
 *  - O'quvchi oyning istalgan kunida guruhda bo'lsa, o'sha oy uchun guruhning to'liq oylik narxi hisoblanadi.
 *  - To'lov `period_month` (qaysi oy uchun) bo'yicha yig'iladi.
 *  - Qarz = kutilgan summa − to'langan summa (manfiy bo'lsa 0).
 */
export interface MonthBilling {
  expected: number;
  paid: number;
  debt: number;
  overpaid: number;
}

const EXPECTED_SQL = `
  SELECT COALESCE(SUM(g.monthly_price), 0)
  FROM group_students gs JOIN groups g ON g.id = gs.group_id
  WHERE gs.student_id = ? AND gs.joined_at <= ? AND (gs.left_at IS NULL OR gs.left_at >= ?)`;
const PAID_SQL = `SELECT COALESCE(SUM(amount), 0) FROM payments WHERE student_id = ? AND period_month = ?`;

export function studentMonthBilling(db: DB, studentId: number, month: string): MonthBilling {
  const expected = db.prepare(EXPECTED_SQL).pluck().get(studentId, `${month}-31`, `${month}-01`) as number;
  const paid = db.prepare(PAID_SQL).pluck().get(studentId, month) as number;
  return {
    expected,
    paid,
    debt: Math.max(expected - paid, 0),
    overpaid: Math.max(paid - expected, 0),
  };
}

export interface DebtorRow {
  studentId: number;
  fullName: string;
  phone: string | null;
  expected: number;
  paid: number;
  debt: number;
}

/** Markazning barcha faol o'quvchilari uchun berilgan oy bo'yicha hisob-kitob. */
export function centerBilling(db: DB, centerId: number, month: string): DebtorRow[] {
  const rows = db
    .prepare(
      `SELECT u.id AS studentId, u.full_name AS fullName, u.phone,
         COALESCE((SELECT SUM(g.monthly_price) FROM group_students gs JOIN groups g ON g.id = gs.group_id
                   WHERE gs.student_id = u.id AND gs.joined_at <= @monthEnd
                     AND (gs.left_at IS NULL OR gs.left_at >= @monthStart)), 0) AS expected,
         COALESCE((SELECT SUM(amount) FROM payments p WHERE p.student_id = u.id AND p.period_month = @month), 0) AS paid
       FROM users u
       WHERE u.center_id = @centerId AND u.role = 'student' AND u.active = 1
       ORDER BY u.full_name`,
    )
    .all({ centerId, month, monthStart: `${month}-01`, monthEnd: `${month}-31` }) as Omit<DebtorRow, 'debt'>[];
  return rows.map((r) => ({ ...r, debt: Math.max(r.expected - r.paid, 0) }));
}
