import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { ensureSuperAdmin } from '../src/bootstrap.js';
import { config } from '../src/config.js';
import { currentMonth, todayStr } from '../src/http.js';

const db = openDb(':memory:');
ensureSuperAdmin(db);
const app = createApp(db);

const PW = 'Secret123';
type Tok = string;

async function login(loginName: string, password = PW): Promise<Tok> {
  const r = await request(app).post('/api/auth/login').send({ login: loginName, password });
  expect(r.status, `login ${loginName}: ${JSON.stringify(r.body)}`).toBe(200);
  return r.body.token;
}
const get = (t: Tok, url: string) => request(app).get(url).set('Authorization', `Bearer ${t}`);
const post = (t: Tok, url: string, body: object) => request(app).post(url).set('Authorization', `Bearer ${t}`).send(body);
const put = (t: Tok, url: string, body: object) => request(app).put(url).set('Authorization', `Bearer ${t}`).send(body);
const del = (t: Tok, url: string) => request(app).delete(url).set('Authorization', `Bearer ${t}`);

/** Eng so'nggi o'tgan hafta kuni (1=Du … 7=Ya) sanasi (bugungi kundan oldingi yoki bugun) */
function lastDateWithWeekday(wd: number): string {
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 86400000);
    const w = d.getDay() === 0 ? 7 : d.getDay();
    if (w === wd) return d.toISOString().slice(0, 10);
  }
  throw new Error('unreachable');
}

const ids: Record<string, number> = {};
let sa: Tok, admin: Tok, teacher: Tok, teacher2: Tok, support: Tok, student: Tok, student2: Tok, parent: Tok;

describe('LC CRM API', () => {
  beforeAll(async () => {
    sa = await login(config.superAdminLogin, config.superAdminPassword);
  });

  describe('Autentifikatsiya', () => {
    it("noto'g'ri parolni rad etadi", async () => {
      const r = await request(app).post('/api/auth/login').send({ login: config.superAdminLogin, password: 'xato' });
      expect(r.status).toBe(401);
    });
    it('mavjud bo‘lmagan loginga ham bir xil xabar beradi', async () => {
      const r = await request(app).post('/api/auth/login').send({ login: 'yoq_odam', password: 'xato' });
      expect(r.status).toBe(401);
      expect(r.body.error).toMatch(/Login yoki parol/);
    });
    it('tokensiz himoyalangan manzilga kirishni rad etadi', async () => {
      expect((await request(app).get('/api/dashboard')).status).toBe(401);
      expect((await request(app).get('/api/groups').set('Authorization', 'Bearer yaroqsiz')).status).toBe(401);
    });
    it('validatsiya xatosi 400 qaytaradi', async () => {
      expect((await request(app).post('/api/auth/login').send({})).status).toBe(400);
    });
    it("noto'g'ri JSON 400 qaytaradi", async () => {
      const r = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad');
      expect(r.status).toBe(400);
    });
  });

  describe("Markaz va foydalanuvchilarni yaratish", () => {
    it('super admin markaz va admin yaratadi', async () => {
      const r = await post(sa, '/api/centers', {
        name: 'Alfa markaz',
        adminFullName: 'Alfa Admin',
        adminLogin: 'alfa_admin',
        adminPassword: PW,
      });
      expect(r.status).toBe(201);
      ids.center = r.body.id;
      admin = await login('alfa_admin');
    });
    it('takroriy admin loginini rad etadi', async () => {
      const r = await post(sa, '/api/centers', { name: 'X', adminFullName: 'Y Y', adminLogin: 'ALFA_ADMIN', adminPassword: PW });
      expect(r.status).toBe(400);
    });
    it('admin markazlarni boshqara olmaydi', async () => {
      expect((await get(admin, '/api/centers')).status).toBe(403);
      expect((await post(admin, '/api/centers', {})).status).toBe(403);
    });
    it("admin o'qituvchi, yordamchi, o'quvchi va ota-ona yaratadi", async () => {
      const mk = async (key: string, body: object) => {
        const r = await post(admin, '/api/users', { password: PW, ...body });
        expect(r.status, JSON.stringify(r.body)).toBe(201);
        ids[key] = r.body.id;
      };
      await mk('teacher', { role: 'teacher', fullName: 'Ustoz Bir', login: 'ustoz1', phone: '+998901111111' });
      await mk('teacher2', { role: 'teacher', fullName: 'Ustoz Ikki', login: 'ustoz2' });
      await mk('support', { role: 'support_teacher', fullName: 'Yordamchi Bir', login: 'yordam1' });
      await mk('parent', { role: 'parent', fullName: 'Ota Bir', login: 'ota1', phone: '+998902222222' });
      await mk('student', { role: 'student', fullName: 'Talaba Bir', login: 'talaba1', parentIds: [ids.parent] });
      await mk('student2', { role: 'student', fullName: 'Talaba Ikki', login: 'talaba2' });
      teacher = await login('ustoz1');
      teacher2 = await login('ustoz2');
      support = await login('yordam1');
      parent = await login('ota1');
      student = await login('talaba1');
      student2 = await login('talaba2');
    });
    it('admin admin yarata olmaydi', async () => {
      const r = await post(admin, '/api/users', { role: 'admin', fullName: 'Yangi Admin', login: 'yangi_admin', password: PW });
      expect(r.status).toBe(403);
    });
    it("ota-ona-o'quvchi bog'lanishi saqlanadi", async () => {
      const r = await get(admin, `/api/users/${ids.student}`);
      expect(r.body.parents).toHaveLength(1);
      expect(r.body.parents[0].fullName).toBe('Ota Bir');
      const p = await get(admin, `/api/users/${ids.parent}`);
      expect(p.body.children[0].fullName).toBe('Talaba Bir');
    });
    it('ro‘yxat rol va qidiruv bo‘yicha filtrlanadi', async () => {
      const r = await get(admin, '/api/users?role=student&q=Bir');
      expect(r.status).toBe(200);
      expect(r.body).toHaveLength(1);
      expect(r.body[0].parentNames).toBe('Ota Bir');
    });
    it("o'qituvchi foydalanuvchilar ro'yxatini ko'ra olmaydi", async () => {
      expect((await get(teacher, '/api/users')).status).toBe(403);
    });
  });

  describe('Guruhlar va dars jadvali', () => {
    it('guruh yaratadi (jadval bilan)', async () => {
      const r = await post(admin, '/api/groups', {
        name: 'Ingliz tili',
        subject: 'Ingliz tili',
        teacherId: ids.teacher,
        supportTeacherId: ids.support,
        monthlyPrice: 400000,
        slots: [
          { weekday: 1, startTime: '10:00', endTime: '11:30', room: '101' },
          { weekday: 3, startTime: '10:00', endTime: '11:30', room: '101' },
        ],
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      ids.group = r.body.id;
    });
    it("o'qituvchi band bo'lsa to'qnashuvni rad etadi", async () => {
      const r = await post(admin, '/api/groups', {
        name: 'Boshqa',
        teacherId: ids.teacher,
        monthlyPrice: 100000,
        slots: [{ weekday: 1, startTime: '11:00', endTime: '12:00', room: '202' }],
      });
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/band/);
    });
    it('xona band bo‘lsa rad etadi', async () => {
      const r = await post(admin, '/api/groups', {
        name: 'Boshqa',
        teacherId: ids.teacher2,
        monthlyPrice: 100000,
        slots: [{ weekday: 1, startTime: '10:30', endTime: '12:00', room: '101' }],
      });
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/xonasi/);
    });
    it('keyingi soatdagi dars to‘qnashuv hisoblanmaydi', async () => {
      const r = await post(admin, '/api/groups', {
        name: 'Matematika',
        teacherId: ids.teacher2,
        monthlyPrice: 300000,
        slots: [
          { weekday: 1, startTime: '11:30', endTime: '13:00', room: '101' },
          { weekday: 2, startTime: '15:00', endTime: '16:00', room: '102' },
        ],
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      ids.group2 = r.body.id;
    });
    it('tugash vaqti boshlanishidan oldin bo‘lsa rad etadi', async () => {
      const r = await post(admin, '/api/groups', {
        name: 'Xato',
        monthlyPrice: 1,
        slots: [{ weekday: 4, startTime: '12:00', endTime: '11:00' }],
      });
      expect(r.status).toBe(400);
    });
    it("o'quvchilarni guruhga qo'shadi va takroriy qo'shishni rad etadi", async () => {
      const longAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      expect((await post(admin, `/api/groups/${ids.group}/students`, { studentId: ids.student, joinedAt: longAgo })).status).toBe(201);
      expect((await post(admin, `/api/groups/${ids.group}/students`, { studentId: ids.student2, joinedAt: longAgo })).status).toBe(201);
      const future = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10);
      expect((await post(admin, `/api/groups/${ids.group}/students`, { studentId: ids.parent, joinedAt: future })).status).toBe(400);
      expect((await post(admin, `/api/groups/${ids.group}/students`, { studentId: ids.student })).status).toBe(400);
      expect((await post(admin, `/api/groups/${ids.group}/students`, { studentId: ids.teacher })).status).toBe(400);
    });
    it("o'qituvchi faqat o'z guruhlarini ko'radi", async () => {
      const t1 = await get(teacher, '/api/groups');
      expect(t1.body.map((g: { id: number }) => g.id)).toEqual([ids.group]);
      const t2 = await get(teacher2, '/api/groups');
      expect(t2.body.map((g: { id: number }) => g.id)).toEqual([ids.group2]);
      expect((await get(teacher2, `/api/groups/${ids.group}`)).status).toBe(403);
      const sup = await get(support, '/api/groups');
      expect(sup.body.map((g: { id: number }) => g.id)).toEqual([ids.group]);
    });
    it("o'quvchi va ota-ona faqat tegishli guruhni ko'radi, a'zolar ro'yxatisiz", async () => {
      const s = await get(student, '/api/groups');
      expect(s.body).toHaveLength(1);
      const d = await get(student, `/api/groups/${ids.group}`);
      expect(d.status).toBe(200);
      expect(d.body.students).toEqual([]);
      expect((await get(parent, `/api/groups/${ids.group}`)).status).toBe(200);
      expect((await get(parent, `/api/groups/${ids.group2}`)).status).toBe(403);
      expect((await post(student, '/api/groups', { name: 'Xaker', monthlyPrice: 1 })).status).toBe(403);
    });
    it('jadval roliga qarab qaytadi', async () => {
      const t = await get(teacher, '/api/schedule');
      expect(t.body).toHaveLength(2);
      const p = await get(parent, '/api/schedule');
      expect(p.body).toHaveLength(2);
      expect(p.body[0].studentNames).toEqual(['Talaba Bir']);
      const s2 = await get(student2, '/api/schedule');
      expect(s2.body).toHaveLength(2);
    });
    it('guruh narxi va jadvalini tahrirlaydi', async () => {
      const r = await put(admin, `/api/groups/${ids.group2}`, { monthlyPrice: 320000 });
      expect(r.status).toBe(200);
      const g = await get(admin, `/api/groups/${ids.group2}`);
      expect(g.body.monthlyPrice).toBe(320000);
      expect(g.body.slots).toHaveLength(2);
    });
  });

  describe('Davomat', () => {
    let date: string;
    beforeAll(() => {
      date = lastDateWithWeekday(1);
    });
    it("o'qituvchi davomat varaqasini oladi va dars kuni ekanini biladi", async () => {
      const r = await get(teacher, `/api/attendance?groupId=${ids.group}&date=${date}`);
      expect(r.status).toBe(200);
      expect(r.body.lessonDay).toBe(true);
      expect(r.body.students).toHaveLength(2);
      expect(r.body.students[0].status).toBeNull();
    });
    it('biriktirilmagan o‘qituvchi davomat belgilay olmaydi', async () => {
      const r = await put(teacher2, '/api/attendance', {
        groupId: ids.group,
        date,
        records: [{ studentId: ids.student, status: 'present' }],
      });
      expect(r.status).toBe(403);
    });
    it('o‘quvchi davomat belgilay olmaydi', async () => {
      const r = await put(student, '/api/attendance', { groupId: ids.group, date, records: [{ studentId: ids.student, status: 'present' }] });
      expect(r.status).toBe(403);
    });
    it('davomatni saqlaydi va qayta saqlaganda yangilaydi', async () => {
      const save = (status1: string) =>
        put(teacher, '/api/attendance', {
          groupId: ids.group,
          date,
          records: [
            { studentId: ids.student, status: status1 },
            { studentId: ids.student2, status: 'absent', note: 'Kasal' },
          ],
        });
      expect((await save('present')).status).toBe(200);
      expect((await save('late')).status).toBe(200);
      const r = await get(teacher, `/api/attendance?groupId=${ids.group}&date=${date}`);
      const byId = Object.fromEntries(r.body.students.map((s: { studentId: number; status: string }) => [s.studentId, s.status]));
      expect(byId[ids.student]).toBe('late');
      expect(byId[ids.student2]).toBe('absent');
      expect(db.prepare('SELECT COUNT(*) FROM attendance').pluck().get()).toBe(2);
    });
    it('yordamchi o‘qituvchi ham belgilay oladi', async () => {
      const r = await put(support, '/api/attendance', { groupId: ids.group, date, records: [{ studentId: ids.student, status: 'present' }] });
      expect(r.status).toBe(200);
    });
    it('kelajak sanasini rad etadi', async () => {
      const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      const r = await put(teacher, '/api/attendance', { groupId: ids.group, date: future, records: [{ studentId: ids.student, status: 'present' }] });
      expect(r.status).toBe(400);
    });
    it('guruhda bo‘lmagan o‘quvchini rad etadi', async () => {
      const r = await put(teacher, '/api/attendance', { groupId: ids.group, date, records: [{ studentId: ids.parent, status: 'present' }] });
      expect(r.status).toBe(400);
    });
    it("noto'g'ri holatni rad etadi", async () => {
      const r = await put(teacher, '/api/attendance', { groupId: ids.group, date, records: [{ studentId: ids.student, status: 'yoq' }] });
      expect(r.status).toBe(400);
    });
    it("o'quvchi, ota-ona va admin tarixni ko'radi; begona o'quvchi ko'rmaydi", async () => {
      const s = await get(student, `/api/attendance/student/${ids.student}`);
      expect(s.status).toBe(200);
      expect(s.body.stats.present).toBe(1);
      expect(s.body.records).toHaveLength(1);
      expect((await get(parent, `/api/attendance/student/${ids.student}`)).status).toBe(200);
      expect((await get(admin, `/api/attendance/student/${ids.student}`)).status).toBe(200);
      expect((await get(student2, `/api/attendance/student/${ids.student}`)).status).toBe(403);
      expect((await get(parent, `/api/attendance/student/${ids.student2}`)).status).toBe(403);
      expect((await get(teacher2, `/api/attendance/student/${ids.student}`)).status).toBe(403);
    });
    it('oylik hisobot hisoblaydi', async () => {
      const month = date.slice(0, 7);
      const r = await get(admin, `/api/attendance/summary?groupId=${ids.group}&month=${month}`);
      expect(r.status).toBe(200);
      const s2 = r.body.find((x: { studentId: number }) => x.studentId === ids.student2);
      expect(s2.absent).toBe(1);
      expect(s2.rate).toBe(0);
    });
  });

  describe("To'lovlar", () => {
    const month = currentMonth();
    it("admin to'lov kiritadi", async () => {
      const r = await post(admin, '/api/payments', {
        studentId: ids.student,
        groupId: ids.group,
        amount: 400000,
        method: 'cash',
        periodMonth: month,
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      ids.payment = r.body.id;
      expect(
        (await post(admin, '/api/payments', { studentId: ids.student2, amount: 150000, method: 'card', periodMonth: month, note: 'Qisman' })).status,
      ).toBe(201);
    });
    it("noto'g'ri to'lovlarni rad etadi", async () => {
      const base = { studentId: ids.student, method: 'cash', periodMonth: month };
      expect((await post(admin, '/api/payments', { ...base, amount: 0 })).status).toBe(400);
      expect((await post(admin, '/api/payments', { ...base, amount: -5 })).status).toBe(400);
      expect((await post(admin, '/api/payments', { ...base, amount: 10.5 })).status).toBe(400);
      expect((await post(admin, '/api/payments', { ...base, amount: 5, periodMonth: '2026-13' })).status).toBe(400);
      expect((await post(admin, '/api/payments', { ...base, amount: 5, method: 'bitcoin' })).status).toBe(400);
      expect((await post(admin, '/api/payments', { ...base, amount: 5, studentId: ids.teacher })).status).toBe(400);
      const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
      expect((await post(admin, '/api/payments', { ...base, amount: 5, paidAt: future })).status).toBe(400);
    });
    it("faqat admin to'lov kirita oladi, o'qituvchi to'lovlarni ko'ra olmaydi", async () => {
      expect((await post(teacher, '/api/payments', { studentId: ids.student, amount: 1, method: 'cash', periodMonth: month })).status).toBe(403);
      expect((await post(parent, '/api/payments', { studentId: ids.student, amount: 1, method: 'cash', periodMonth: month })).status).toBe(403);
      expect((await get(teacher, '/api/payments')).status).toBe(403);
    });
    it("o'quvchi va ota-ona faqat o'zining to'lovlarini ko'radi", async () => {
      const s = await get(student, '/api/payments');
      expect(s.body).toHaveLength(1);
      expect(s.body[0].amount).toBe(400000);
      const p = await get(parent, '/api/payments');
      expect(p.body).toHaveLength(1);
      expect((await get(student, `/api/payments?studentId=${ids.student2}`)).status).toBe(403);
      expect((await get(admin, '/api/payments')).body).toHaveLength(2);
    });
    it('qarzdorlarni to‘g‘ri hisoblaydi', async () => {
      const r = await get(admin, `/api/payments/debtors?month=${month}`);
      expect(r.status).toBe(200);
      expect(r.body.debtors).toHaveLength(1);
      expect(r.body.debtors[0]).toMatchObject({ studentId: ids.student2, expected: 400000, paid: 150000, debt: 250000 });
      expect(r.body.totalDebt).toBe(250000);
    });
    it("umumiy ko'rsatkichlar", async () => {
      const r = await get(admin, `/api/payments/summary?month=${month}`);
      expect(r.body).toMatchObject({ expected: 800000, collected: 550000, debt: 250000, debtorsCount: 1 });
    });
    it("to'lovni o'chiradi va qarz qayta hisoblanadi", async () => {
      expect((await del(admin, `/api/payments/${ids.payment}`)).status).toBe(200);
      expect((await del(admin, `/api/payments/${ids.payment}`)).status).toBe(404);
      const r = await get(admin, `/api/payments/debtors?month=${month}`);
      expect(r.body.debtors).toHaveLength(2);
    });
  });

  describe("O'quvchi profili (overview)", () => {
    it("o'quvchi o'z profilini ko'radi — jadval, davomat, to'lov", async () => {
      const r = await get(student, `/api/students/${ids.student}/overview`);
      expect(r.status).toBe(200);
      expect(r.body.groups).toHaveLength(1);
      expect(r.body.slots).toHaveLength(2);
      expect(r.body.parents[0].fullName).toBe('Ota Bir');
      expect(r.body.money.currentMonth.expected).toBe(400000);
      expect(r.body.money.months).toHaveLength(6);
      expect(r.body.attendance.stats.total).toBeGreaterThan(0);
    });
    it("o'qituvchi to'lov ma'lumotini ko'rmaydi", async () => {
      const r = await get(teacher, `/api/students/${ids.student}/overview`);
      expect(r.status).toBe(200);
      expect(r.body.money).toBeNull();
      expect((await get(teacher2, `/api/students/${ids.student}/overview`)).status).toBe(403);
    });
    it('begona o‘quvchi/ota-ona kira olmaydi', async () => {
      expect((await get(student2, `/api/students/${ids.student}/overview`)).status).toBe(403);
      expect((await get(parent, `/api/students/${ids.student2}/overview`)).status).toBe(403);
      expect((await get(parent, `/api/students/${ids.student}/overview`)).status).toBe(200);
    });
    it('/mine rolga qarab qaytadi', async () => {
      expect((await get(parent, '/api/students/mine')).body).toEqual([{ id: ids.student, fullName: 'Talaba Bir' }]);
      expect((await get(student, '/api/students/mine')).body).toEqual([{ id: ids.student, fullName: 'Talaba Bir' }]);
    });
  });

  describe('Dashboard', () => {
    it('har bir rol uchun ishlaydi', async () => {
      const a = await get(admin, '/api/dashboard');
      expect(a.status).toBe(200);
      expect(a.body).toMatchObject({ students: 2, teachers: 3, parents: 1, groups: 2 });
      expect(a.body.trend).toHaveLength(6);
      const s = await get(sa, '/api/dashboard');
      expect(s.body.centers).toBe(1);
      const t = await get(teacher, '/api/dashboard');
      expect(t.body).toMatchObject({ groups: 1, students: 2 });
      const p = await get(parent, '/api/dashboard');
      expect(p.body.children).toHaveLength(1);
      expect(p.body.children[0].billing.expected).toBe(400000);
      const st = await get(student, '/api/dashboard');
      expect(st.body.children[0].groups).toBe(1);
      expect((await get(support, '/api/dashboard')).status).toBe(200);
    });
  });

  describe('Markazlararo izolyatsiya', () => {
    let admin2: Tok;
    it('ikkinchi markaz birinchisining ma‘lumotini ko‘rmaydi', async () => {
      const c = await post(sa, '/api/centers', { name: 'Beta', adminFullName: 'Beta Admin', adminLogin: 'beta_admin', adminPassword: PW });
      expect(c.status).toBe(201);
      admin2 = await login('beta_admin');
      expect((await get(admin2, '/api/users')).body).toHaveLength(0);
      expect((await get(admin2, '/api/groups')).body).toHaveLength(0);
      expect((await get(admin2, `/api/groups/${ids.group}`)).status).toBe(404);
      expect((await get(admin2, `/api/users/${ids.student}`)).status).toBe(404);
      expect((await get(admin2, `/api/students/${ids.student}/overview`)).status).toBe(404);
      expect((await put(admin2, `/api/users/${ids.student}`, { fullName: 'Hack Hack' })).status).toBe(404);
      expect((await post(admin2, `/api/users/${ids.student}/password`, { password: 'hacked123' })).status).toBe(404);
      expect((await del(admin2, `/api/payments/${ids.payment}`)).status).toBe(404);
      expect((await get(admin2, '/api/payments')).body).toHaveLength(0);
      expect((await get(admin2, `/api/attendance?groupId=${ids.group}`)).status).toBe(404);
    });
    it("boshqa markaz o'quvchisini guruh/to'lovga qo'sha olmaydi", async () => {
      const g = await post(admin2, '/api/groups', { name: 'Beta guruh', monthlyPrice: 1000 });
      expect(g.status).toBe(201);
      expect((await post(admin2, `/api/groups/${g.body.id}/students`, { studentId: ids.student })).status).toBe(400);
      expect((await post(admin2, '/api/payments', { studentId: ids.student, amount: 5, method: 'cash', periodMonth: currentMonth() })).status).toBe(400);
      const u = await post(admin2, '/api/users', { role: 'student', fullName: 'Beta Talaba', login: 'beta_t', password: PW, parentIds: [ids.parent] });
      expect(u.status).toBe(400);
    });
    it('login butun tizimda yagona', async () => {
      const r = await post(admin2, '/api/users', { role: 'student', fullName: 'Dublikat', login: 'TALABA1', password: PW });
      expect(r.status).toBe(400);
    });
  });

  describe('Bloklash va parol', () => {
    it("o'quvchi bloklansa kira olmaydi va guruhdan chiqadi", async () => {
      const r = await put(admin, `/api/users/${ids.student2}`, { active: false });
      expect(r.status).toBe(200);
      expect((await request(app).post('/api/auth/login').send({ login: 'talaba2', password: PW })).status).toBe(403);
      expect((await get(student2, '/api/dashboard')).status).toBe(401); // eski token ham ishlamaydi
      const g = await get(admin, `/api/groups/${ids.group}`);
      expect(g.body.students).toHaveLength(1);
    });
    it("admin /users orqali o'zini (yoki boshqa adminni) o'zgartira olmaydi", async () => {
      const me = await get(admin, '/api/auth/me');
      expect((await put(admin, `/api/users/${me.body.user.id}`, { active: false })).status).toBe(404);
      expect((await get(admin, '/api/auth/me')).status).toBe(200);
    });
    it('super admin faqat adminlarni tahrirlaydi, boshqa rollarni emas', async () => {
      const adminId = (await get(admin, '/api/auth/me')).body.user.id;
      expect((await put(sa, `/api/users/${adminId}`, { fullName: 'Alfa Admin 2' })).status).toBe(200);
      expect((await put(sa, `/api/users/${ids.student}`, { fullName: 'Hack Hack' })).status).toBe(404);
    });
    it('admin parolni tiklaydi', async () => {
      expect((await post(admin, `/api/users/${ids.teacher}/password`, { password: 'Yangi12345' })).status).toBe(200);
      expect((await request(app).post('/api/auth/login').send({ login: 'ustoz1', password: PW })).status).toBe(401);
      await login('ustoz1', 'Yangi12345');
      expect((await post(admin, `/api/users/${ids.teacher}/password`, { password: '123' })).status).toBe(400);
    });
    it('foydalanuvchi o‘z parolini almashtiradi', async () => {
      expect((await post(parent, '/api/auth/change-password', { oldPassword: 'xato', newPassword: 'Yangi12345' })).status).toBe(400);
      expect((await post(parent, '/api/auth/change-password', { oldPassword: PW, newPassword: 'Yangi12345' })).status).toBe(200);
      await login('ota1', 'Yangi12345');
    });
    it('markaz bloklansa, xodimlari kira olmaydi', async () => {
      expect((await put(sa, `/api/centers/${ids.center}`, { active: false })).status).toBe(200);
      expect((await get(admin, '/api/dashboard')).status).toBe(401);
      expect((await request(app).post('/api/auth/login').send({ login: 'alfa_admin', password: PW })).status).toBe(403);
      await put(sa, `/api/centers/${ids.center}`, { active: true });
      expect((await get(admin, '/api/dashboard')).status).toBe(200);
    });
  });

  describe('Guruhni yopish', () => {
    it("yopilgan guruh ro'yxatda nofaol ko'rinadi va jadvaldan chiqadi", async () => {
      expect((await put(admin, `/api/groups/${ids.group2}`, { active: false })).status).toBe(200);
      const list = await get(admin, '/api/groups');
      expect(list.body.find((g: { id: number }) => g.id === ids.group2).active).toBe(false);
      // yopilgan guruh jadvaldan chiqadi
      expect((await get(teacher2, '/api/schedule')).body).toHaveLength(0);
    });
    it('sana helperlari', () => {
      expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
