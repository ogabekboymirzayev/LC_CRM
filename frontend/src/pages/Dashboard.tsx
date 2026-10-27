import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';
import { MONTHS_SHORT, dateLabel, money, monthLabel } from '../format';
import type { Billing } from '../types';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Stat } from '../ui';

interface TodayLesson {
  groupId: number;
  groupName: string;
  startTime: string;
  endTime: string;
  room: string | null;
  teacherName: string | null;
  attendanceMarked?: boolean;
}

function TodayLessons({ lessons, canMark }: { lessons: TodayLesson[]; canMark?: boolean }) {
  return (
    <Card title="Bugungi darslar">
      {lessons.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">Bugun dars yo'q</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {lessons.map((l, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <Link to={`/groups/${l.groupId}`} className="font-medium text-slate-900 hover:text-indigo-700">{l.groupName}</Link>
                <div className="text-sm text-slate-500">
                  {l.startTime}–{l.endTime}
                  {l.room ? ` · ${l.room}` : ''}
                  {l.teacherName ? ` · ${l.teacherName}` : ''}
                </div>
              </div>
              {canMark &&
                (l.attendanceMarked ? (
                  <Badge tone="green">Davomat belgilangan</Badge>
                ) : (
                  <Link to={`/attendance?groupId=${l.groupId}`} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
                    Davomat belgilash
                  </Link>
                ))}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TrendChart({ data }: { data: Array<{ month: string; collected: number; expected: number }> }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.collected, d.expected]));
  return (
    <div>
      <div className="flex h-40 items-end gap-2 sm:gap-4">
        {data.map((d) => (
          <div key={d.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div className="flex h-full w-full items-end justify-center gap-1">
              <div className="w-full max-w-[18px] rounded-t bg-slate-300" style={{ height: `${(d.expected / max) * 100}%` }} title={`Kutilgan: ${money(d.expected)}`} />
              <div className="w-full max-w-[18px] rounded-t bg-indigo-500" style={{ height: `${(d.collected / max) * 100}%` }} title={`Yig'ilgan: ${money(d.collected)}`} />
            </div>
            <span className="text-[11px] text-slate-500">{MONTHS_SHORT[Number(d.month.slice(5)) - 1]}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-300" /> Kutilgan</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-500" /> Yig'ilgan</span>
      </div>
    </div>
  );
}

function AdminDash() {
  const { data, loading, error, reload } = useFetch<{
    students: number; teachers: number; parents: number; groups: number; month: string;
    expected: number; collected: number; debt: number; debtorsCount: number; attendanceRate30d: number | null;
    trend: Array<{ month: string; collected: number; expected: number }>;
    todayLessons: TodayLesson[];
    recentPayments: Array<{ id: number; studentName: string; amount: number; paidAt: string }>;
  }>('/dashboard');
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error} onRetry={reload} />;
  const pct = data.expected ? Math.min(100, Math.round((data.collected / data.expected) * 100)) : 0;

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link to="/students"><Stat label="O'quvchilar" value={data.students} /></Link>
        <Link to="/staff"><Stat label="O'qituvchilar" value={data.teachers} /></Link>
        <Link to="/groups"><Stat label="Guruhlar" value={data.groups} /></Link>
        <Stat label="Davomat (30 kun)" value={data.attendanceRate30d === null ? '—' : `${data.attendanceRate30d}%`} />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <Link to="/payments?new=1" className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">+ To'lov qabul qilish</Link>
        <Link to="/attendance" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Davomat</Link>
        <Link to="/students?new=1" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">+ Yangi o'quvchi</Link>
        <Link to="/groups?new=1" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">+ Yangi guruh</Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`${monthLabel(data.month)} — to'lovlar`} action={<Link to="/payments" className="text-sm font-medium text-indigo-700">Batafsil</Link>}>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><div className="text-xs text-slate-500">Kutilgan</div><div className="font-bold">{money(data.expected)}</div></div>
            <div><div className="text-xs text-slate-500">Yig'ilgan</div><div className="font-bold text-emerald-600">{money(data.collected)}</div></div>
            <div><div className="text-xs text-slate-500">Qarz</div><div className="font-bold text-rose-600">{money(data.debt)}</div></div>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>{pct}% yig'ildi</span>
            <Link to="/payments?tab=debtors" className="font-medium text-rose-600">{data.debtorsCount} ta qarzdor →</Link>
          </div>
        </Card>
        <TodayLessons lessons={data.todayLessons} />
        <Card title="Oxirgi 6 oy">
          <TrendChart data={data.trend} />
        </Card>
        <Card title="Oxirgi to'lovlar">
          {data.recentPayments.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">Hali to'lov yo'q</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div><div className="font-medium">{p.studentName}</div><div className="text-xs text-slate-500">{dateLabel(p.paidAt)}</div></div>
                  <div className="font-semibold text-emerald-600">+{money(p.amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function SuperDash() {
  const { data, loading, error, reload } = useFetch<{ centers: number; activeCenters: number; admins: number; teachers: number; students: number }>('/dashboard');
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="O'quv markazlar" value={data.centers} sub={`${data.activeCenters} ta faol`} />
        <Stat label="Administratorlar" value={data.admins} />
        <Stat label="O'qituvchilar" value={data.teachers} />
        <Stat label="O'quvchilar" value={data.students} />
      </div>
      <Link to="/centers" className="inline-block rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">O'quv markazlarni boshqarish</Link>
    </>
  );
}

function TeacherDash() {
  const { data, loading, error, reload } = useFetch<{ groups: number; students: number; todayLessons: TodayLesson[] }>('/dashboard');
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Link to="/groups"><Stat label="Guruhlarim" value={data.groups} /></Link>
        <Stat label="O'quvchilarim" value={data.students} />
      </div>
      <TodayLessons lessons={data.todayLessons} canMark />
    </>
  );
}

function FamilyDash() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch<{
    month: string;
    children: Array<{ id: number; fullName: string; groups: number; attendanceRate30d: number | null; billing: Billing }>;
    todayLessons: TodayLesson[];
  }>('/dashboard');
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <>
      {data.children.length === 0 ? (
        <Empty title="Farzandlar biriktirilmagan" hint="O'quv markaz administratoriga murojaat qiling" />
      ) : (
        <div className="mb-5 grid gap-4 md:grid-cols-2">
          {data.children.map((c) => (
            <Link key={c.id} to={`/students/${c.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-semibold text-slate-900">{user?.role === 'student' ? 'Mening natijalarim' : c.fullName}</div>
                <span className="text-sm font-medium text-indigo-700">Batafsil →</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><div className="text-xs text-slate-500">Guruhlar</div><div className="text-lg font-bold">{c.groups}</div></div>
                <div><div className="text-xs text-slate-500">Davomat</div><div className="text-lg font-bold">{c.attendanceRate30d === null ? '—' : `${c.attendanceRate30d}%`}</div></div>
                <div>
                  <div className="text-xs text-slate-500">{monthLabel(data.month).split(' ')[0]}</div>
                  {c.billing.debt > 0 ? <div className="text-lg font-bold text-rose-600">{money(c.billing.debt)}</div> : c.billing.expected > 0 ? <div className="text-lg font-bold text-emerald-600">To'langan</div> : <div className="text-lg font-bold">—</div>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <TodayLessons lessons={data.todayLessons} />
    </>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <>
      <PageHeader title={`Salom, ${user.fullName.split(' ')[0]}!`} subtitle={user.centerName ?? undefined} />
      {user.role === 'super_admin' && <SuperDash />}
      {user.role === 'admin' && <AdminDash />}
      {(user.role === 'teacher' || user.role === 'support_teacher') && <TeacherDash />}
      {(user.role === 'student' || user.role === 'parent') && <FamilyDash />}
    </>
  );
}
