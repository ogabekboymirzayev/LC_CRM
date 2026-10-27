import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';
import { WEEKDAYS, currentMonth, money, monthLabel, shiftMonth, todayStr } from '../format';
import type { GroupDetail, Stats, UserRow } from '../types';
import { Button, Card, ErrorBox, Field, FormError, Input, Loading, Modal, PageHeader, Select, useToast } from '../ui';
import { GroupForm } from './Groups';

export default function GroupDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';
  const canSeeStudents = isAdmin || user?.role === 'teacher' || user?.role === 'support_teacher';
  const { data: g, loading, error, reload } = useFetch<GroupDetail>(`/groups/${id}`);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [month, setMonth] = useState(currentMonth());
  const summary = useFetch<Array<{ studentId: number; fullName: string } & Stats>>(canSeeStudents && g ? `/attendance/summary?groupId=${id}&month=${month}` : null);

  if (loading) return <Loading />;
  if (error || !g) return <ErrorBox message={error || 'Topilmadi'} />;

  const refresh = () => {
    reload();
    summary.reload();
  };

  async function removeStudent(sid: number, name: string) {
    if (!window.confirm(`${name} guruhdan chiqarilsinmi?`)) return;
    try {
      await api.del(`/groups/${g!.id}/students/${sid}`);
      toast('Guruhdan chiqarildi');
      refresh();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }
  async function setActive(active: boolean) {
    if (!active && !window.confirm("Guruh yopilsa, barcha o'quvchilar guruhdan chiqariladi. Davom etasizmi?")) return;
    try {
      await api.put(`/groups/${g!.id}`, { active });
      toast(active ? 'Guruh qayta ochildi' : 'Guruh yopildi');
      refresh();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }

  const slotsByDay = [...g.slots].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));

  return (
    <>
      <Link to="/groups" className="mb-2 inline-block text-sm text-indigo-700">← Guruhlar</Link>
      <PageHeader
        title={g.name}
        subtitle={g.subject ?? undefined}
        action={
          <div className="flex flex-wrap gap-2">
            {canSeeStudents && g.active && <Link to={`/attendance?groupId=${g.id}`} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">Davomat</Link>}
            {isAdmin && <Button variant="secondary" onClick={() => setEditing(true)}>Tahrirlash</Button>}
          </div>
        }
      />
      {!g.active && <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Bu guruh yopilgan.</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Ma'lumotlar">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">O'qituvchi</dt><dd className="text-right font-medium">{g.teacher ? <>{g.teacher.fullName}{g.teacher.phone && <div className="text-xs font-normal text-slate-500">{g.teacher.phone}</div>}</> : '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Yordamchi</dt><dd className="font-medium">{g.supportTeacher?.fullName ?? '—'}</dd></div>
            {(isAdmin || user?.role === 'student' || user?.role === 'parent') && <div className="flex justify-between gap-4"><dt className="text-slate-500">Oylik to'lov</dt><dd className="font-medium">{money(g.monthlyPrice)}</dd></div>}
            {g.startDate && <div className="flex justify-between gap-4"><dt className="text-slate-500">Boshlangan</dt><dd className="font-medium">{g.startDate}</dd></div>}
          </dl>
        </Card>

        <Card title="Dars jadvali">
          {slotsByDay.length === 0 ? (
            <p className="text-sm text-slate-500">Jadval kiritilmagan</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {slotsByDay.map((s, i) => (
                <li key={i} className="flex justify-between gap-3 py-2">
                  <span className="font-medium">{WEEKDAYS[s.weekday - 1]}</span>
                  <span className="text-slate-600">{s.startTime}–{s.endTime}{s.room ? ` · ${s.room}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {canSeeStudents && (
        <Card
          className="mt-5"
          title={`O'quvchilar (${g.students.length})`}
          action={isAdmin && g.active && <Button size="sm" onClick={() => setAdding(true)}>+ Qo'shish</Button>}
        >
          {g.students.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">Guruhda o'quvchi yo'q</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {g.students.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <Link to={`/students/${s.id}`} className="font-medium text-slate-900 hover:text-indigo-700">{s.fullName}</Link>
                    <div className="text-xs text-slate-500">{s.phone ?? 'Telefon yo\'q'} · {s.joinedAt} dan</div>
                  </div>
                  {isAdmin && <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={() => removeStudent(s.id, s.fullName)}>Chiqarish</Button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {canSeeStudents && g.students.length > 0 && (
        <Card
          className="mt-5"
          title="Oylik davomat"
          action={
            <div className="flex items-center gap-1 text-sm">
              <button className="rounded px-2 py-1 hover:bg-slate-100" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Oldingi oy">‹</button>
              <span className="min-w-28 text-center font-medium">{monthLabel(month)}</span>
              <button className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30" disabled={month >= currentMonth()} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Keyingi oy">›</button>
            </div>
          }
        >
          {summary.loading ? (
            <Loading />
          ) : summary.error ? (
            <ErrorBox message={summary.error} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="pb-2 font-medium">O'quvchi</th>
                    <th className="pb-2 text-center font-medium">Keldi</th>
                    <th className="pb-2 text-center font-medium">Kech.</th>
                    <th className="pb-2 text-center font-medium">Kelmadi</th>
                    <th className="pb-2 text-center font-medium">Sababli</th>
                    <th className="pb-2 text-right font-medium">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(summary.data ?? []).map((s) => (
                    <tr key={s.studentId}>
                      <td className="py-2 font-medium">{s.fullName}</td>
                      <td className="py-2 text-center text-emerald-700">{s.present}</td>
                      <td className="py-2 text-center text-amber-700">{s.late}</td>
                      <td className="py-2 text-center text-rose-700">{s.absent}</td>
                      <td className="py-2 text-center text-sky-700">{s.excused}</td>
                      <td className="py-2 text-right font-semibold">{s.rate === null ? '—' : `${s.rate}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {isAdmin && (
        <div className="mt-6">
          {g.active ? (
            <Button variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={() => setActive(false)}>Guruhni yopish</Button>
          ) : (
            <Button variant="secondary" onClick={() => setActive(true)}>Guruhni qayta ochish</Button>
          )}
        </div>
      )}

      {editing && (
        <GroupForm
          group={{ id: g.id, name: g.name, subject: g.subject, teacherId: g.teacher?.id ?? null, supportTeacherId: g.supportTeacher?.id ?? null, monthlyPrice: g.monthlyPrice, startDate: g.startDate, slots: g.slots }}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); toast('Saqlandi'); refresh(); }}
        />
      )}
      {adding && <AddStudent groupId={g.id} existing={g.students.map((s) => s.id)} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); toast("O'quvchi qo'shildi"); refresh(); }} />}
    </>
  );
}

function AddStudent({ groupId, existing, onClose, onSaved }: { groupId: number; existing: number[]; onClose: () => void; onSaved: () => void }) {
  const users = useFetch<UserRow[]>('/users?role=student&active=1');
  const [studentId, setStudentId] = useState('');
  const [joinedAt, setJoinedAt] = useState(todayStr());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const options = (users.data ?? []).filter((u) => !existing.includes(u.id));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`/groups/${groupId}/students`, { studentId: Number(studentId), joinedAt });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Guruhga o'quvchi qo'shish" onClose={onClose}>
      {users.loading ? (
        <Loading />
      ) : options.length === 0 ? (
        <p className="text-sm text-slate-600">Qo'shish mumkin bo'lgan o'quvchi yo'q. Avval <Link to="/students?new=1" className="font-medium text-indigo-700">yangi o'quvchi qo'shing</Link>.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="O'quvchi">
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
              <option value="">— tanlang —</option>
              {options.map((u) => <option key={u.id} value={u.id}>{u.fullName}{u.phone ? ` (${u.phone})` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Guruhga qo'shilgan sana" hint="O'tgan sanani kiritsangiz, davomat va qarz shu sanadan hisoblanadi">
            <Input type="date" value={joinedAt} max={todayStr()} onChange={(e) => setJoinedAt(e.target.value)} required />
          </Field>
          <FormError message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Bekor qilish</Button>
            <Button type="submit" loading={busy}>Qo'shish</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

