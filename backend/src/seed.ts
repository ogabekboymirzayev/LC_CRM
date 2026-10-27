/**
 * Demo ma'lumotlar: `npm run seed`
 * Barcha demo foydalanuvchilar paroli: Demo12345
 */
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { openDb, type DB } from './db.js';
import { ensureSuperAdmin } from './bootstrap.js';
import { currentMonth, todayStr } from './http.js';

const PASSWORD = 'Demo12345';

export function seedDemo(db: DB): boolean {
  if (db.prepare("SELECT 1 FROM users WHERE login = 'demo_admin'").get()) return false;
  const hash = bcrypt.hashSync(PASSWORD, 10);

  db.transaction(() => {
    const center = Number(
      db
        .prepare("INSERT INTO centers (name, phone, address) VALUES ('Demo o''quv markaz', '+998 90 123 45 67', 'Toshkent, Chilonzor')")
        .run().lastInsertRowid,
    );
    const user = (role: string, fullName: string, login: string, phone: string | null = null) =>
      Number(
        db
          .prepare('INSERT INTO users (center_id, role, full_name, phone, login, password_hash) VALUES (?, ?, ?, ?, ?, ?)')
          .run(center, role, fullName, phone, login, hash).lastInsertRowid,
      );

    user('admin', 'Dilshod Karimov', 'demo_admin', '+998 90 111 11 11');
    const t1 = user('teacher', 'Aziza Rahimova', 'demo_teacher', '+998 90 222 22 22');
    const t2 = user('teacher', 'Jasur Aliyev', 'demo_teacher2', '+998 90 222 22 33');
    const s1 = user('support_teacher', 'Malika Yusupova', 'demo_support', '+998 90 333 33 33');

    const students = [
      user('student', 'Ali Valiyev', 'demo_student', '+998 91 000 00 01'),
      user('student', 'Madina Karimova', 'demo_student2', '+998 91 000 00 02'),
      user('student', 'Sardor Tursunov', 'demo_student3', '+998 91 000 00 03'),
      user('student', 'Nilufar Ergasheva', 'demo_student4', '+998 91 000 00 04'),
      user('student', 'Bekzod Olimov', 'demo_student5', '+998 91 000 00 05'),
      user('student', 'Zarina Abdullayeva', 'demo_student6', '+998 91 000 00 06'),
    ];
    const p1 = user('parent', 'Vali Valiyev', 'demo_parent', '+998 93 000 00 01');
    const p2 = user('parent', 'Gulnora Karimova', 'demo_parent2', '+998 93 000 00 02');
    const link = db.prepare('INSERT INTO parent_students (parent_id, student_id) VALUES (?, ?)');
    link.run(p1, students[0]);
    link.run(p2, students[1]);
    link.run(p2, students[3]);

    const group = (name: string, subject: string, teacher: number, support: number | null, price: number) =>
      Number(
        db
          .prepare(
            `INSERT INTO groups (center_id, name, subject, teacher_id, support_teacher_id, monthly_price, start_date)
             VALUES (?, ?, ?, ?, ?, ?, date('now', '-60 days'))`,
          )
          .run(center, name, subject, teacher, support, price).lastInsertRowid,
      );
    const g1 = group('Ingliz tili A1', 'Ingliz tili', t1, s1, 400_000);
    const g2 = group('Matematika 9-sinf', 'Matematika', t2, null, 350_000);

    const slot = db.prepare('INSERT INTO schedule_slots (group_id, weekday, start_time, end_time, room) VALUES (?, ?, ?, ?, ?)');
    for (const wd of [1, 3, 5]) slot.run(g1, wd, '15:00', '16:30', '101-xona');
    for (const wd of [2, 4, 6]) slot.run(g2, wd, '17:00', '18:30', '102-xona');

    const join = db.prepare("INSERT INTO group_students (group_id, student_id, joined_at) VALUES (?, ?, date('now', '-45 days'))");
    [0, 1, 2, 3].forEach((i) => join.run(g1, students[i]));
    [3, 4, 5].forEach((i) => join.run(g2, students[i]));

    // Oxirgi 2 haftalik davomat
    const att = db.prepare(
      'INSERT OR IGNORE INTO attendance (group_id, student_id, date, status, marked_by) VALUES (?, ?, ?, ?, ?)',
    );
    const statuses = ['present', 'present', 'present', 'late', 'absent', 'excused'];
    for (let d = 1; d <= 14; d++) {
      const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
      const wd = ((new Date(date + 'T00:00:00').getDay() + 6) % 7) + 1;
      if ([1, 3, 5].includes(wd)) [0, 1, 2, 3].forEach((i, k) => att.run(g1, students[i], date, statuses[(d + k) % statuses.length], t1));
      if ([2, 4, 6].includes(wd)) [3, 4, 5].forEach((i, k) => att.run(g2, students[i], date, statuses[(d + k) % statuses.length], t2));
    }

    // To'lovlar: joriy oy — ba'zilari to'lagan, ba'zilari qarzdor
    const pay = db.prepare(
      `INSERT INTO payments (center_id, student_id, group_id, amount, method, period_month, paid_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT id FROM users WHERE login = 'demo_admin'))`,
    );
    const m = currentMonth();
    pay.run(center, students[0], g1, 400_000, 'cash', m, todayStr());
    pay.run(center, students[1], g1, 400_000, 'card', m, todayStr());
    pay.run(center, students[2], g1, 200_000, 'transfer', m, todayStr());
    pay.run(center, students[4], g2, 350_000, 'cash', m, todayStr());
  })();
  return true;
}

if (process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1])) {
  const db = openDb(config.dbPath);
  ensureSuperAdmin(db);
  console.log(seedDemo(db) ? `Demo ma'lumotlar yaratildi (parol: ${PASSWORD})` : "Demo ma'lumotlar allaqachon mavjud");
  db.close();
}
