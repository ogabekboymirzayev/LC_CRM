import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';
import { METHOD_LABEL, STATUS_LABEL, STATUS_STYLE, WEEKDAYS, dateLabel, money, monthLabel } from '../format';
import type { StudentOverview } from '../types';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Stat, Tabs } from '../ui';

type Tab = 'overview' | 'attendance' | 'payments';

export default function StudentProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch<StudentOverview>(`/students/${id}/overview`);
  const kids = useFetch<Array<{ id: number; fullName: string }>>(user?.role === 'parent' ? '/students/mine' : null);
  const [tab, setTab] = useState<Tab>('overview');

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'Topilmadi'} onRetry={reload} />;

  const { student, parents, groups, slots, attendance, money: m } = data;
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Umumiy' },
    { id: 'attendance', label: 'Davomat' },
    ...(m ? [{ id: 'payments' as Tab, label: "To'lovlar" }] : []),
  ];
  const backTo = user?.role === 'admin' ? '/students' : user?.role === 'teacher' || user?.role === 'support_teacher' ? '/groups' : null;

  return (
    <>
      {backTo && <Link to={backTo} className="mb-2 inline-block text-sm text-indigo-700">← Orqaga</Link>}
      {user?.role === 'parent' && (kids.data?.length ?? 0) > 1 && (
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {kids.data!.map((k) => (
            <Link key={k.id} to={`/students/${k.id}`} className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium ${k.id === student.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
              {k.fullName}
            </Link>
          ))}
        </div>
      )}
      <PageHeader title={student.fullName} subtitle={[student.phone, student.birthDate && `Tug'ilgan: ${dateLabel(student.birthDate)}`].filter(Boolean).join(' · ') || undefined} action={!student.active ? <Badge tone="red">Bloklangan</Badge> : undefined} />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Guruhlar" value={groups.length} />
            <Stat label={`Davomat (${attendance.days} kun)`} value={attendance.stats.rate === null ? '—' : `${attendance.stats.rate}%`} sub={`${attendance.stats.total} ta dars belgilangan`} />
            {m && <Stat label={monthLabel(m.currentMonth.month).split(' ')[0]} value={m.currentMonth.expected === 0 ? '—' : m.currentMonth.debt > 0 ? money(m.currentMonth.debt) : "To'langan"} tone={m.currentMonth.debt > 0 ? 'red' : m.currentMonth.expected > 0 ? 'green' : undefined} sub={m.currentMonth.debt > 0 ? 'qarz' : undefined} />}
            {m && <Stat label="Umumiy qarz (6 oy)" value={money(m.totalDebt)} tone={m.totalDebt > 0 ? 'red' : undefined} />}
          </div>

          <Card title="Guruhlar va dars jadvali">
            {groups.length === 0 ? (
              <p className="text-sm text-slate-500">Hech qaysi guruhga biriktirilmagan</p>
            ) : (
              <div className="space-y-4">
                {groups.map((g) => (
                  <div key={g.id}>
                    <Link to={`/groups/${g.id}`} className="font-semibold text-slate-900 hover:text-indigo-700">{g.name}</Link>
                    <div className="text-sm text-slate-500">
                      {g.teacherName ?? "O'qituvchi yo'q"}{g.supportTeacherName ? ` + ${g.supportTeacherName}` : ''}{m ? ` · ${money(g.monthlyPrice)}/oy` : ''}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {slots.filter((s) => s.groupId === g.id).map((s, i) => (
                        <span key={i} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">{WEEKDAYS[s.weekday - 1]} {s.startTime}–{s.endTime}{s.room ? ` · ${s.room}` : ''}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Ota-onalar">
            {parents.length === 0 ? (
              <p className="text-sm text-slate-500">Ota-ona biriktirilmagan</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {parents.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 py-2">
                    <span className="font-medium">{p.fullName}</span>
                    {p.phone ? <a href={`tel:${p.phone.replace(/\s/g, '')}`} className="text-indigo-700">{p.phone}</a> : <span className="text-slate-400">—</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'attendance' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Keldi" value={attendance.stats.present} tone="green" />
            <Stat label="Kechikdi" value={attendance.stats.late} />
            <Stat label="Kelmadi" value={attendance.stats.absent} tone={attendance.stats.absent > 0 ? 'red' : undefined} />
            <Stat label="Sababli" value={attendance.stats.excused} />
          </div>
          <Card title={`Oxirgi darslar (${attendance.days} kun ichida)`}>
            {attendance.recent.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">Davomat hali belgilanmagan</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {attendance.recent.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <div className="font-medium">{dateLabel(r.date)}</div>
                      <div className="text-xs text-slate-500">{r.groupName}{r.note ? ` · ${r.note}` : ''}</div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'payments' && m && (
        <div className="space-y-5">
          <Card title="Oylar bo'yicha holat">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="pb-2 font-medium">Oy</th>
                    <th className="pb-2 text-right font-medium">Kerak</th>
                    <th className="pb-2 text-right font-medium">To'langan</th>
                    <th className="pb-2 text-right font-medium">Holat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...m.months].reverse().map((r) => (
                    <tr key={r.month}>
                      <td className="py-2 font-medium">{monthLabel(r.month)}</td>
                      <td className="py-2 text-right">{r.expected ? money(r.expected) : '—'}</td>
                      <td className="py-2 text-right">{r.paid ? money(r.paid) : '—'}</td>
                      <td className="py-2 text-right">
                        {r.expected === 0 && r.paid === 0 ? <span className="text-slate-400">—</span> : r.debt > 0 ? <Badge tone="red">Qarz {money(r.debt)}</Badge> : <Badge tone="green">To'langan</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="To'lovlar tarixi">
            {m.payments.length === 0 ? (
              <Empty title="Hali to'lov qilinmagan" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {m.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <div className="font-medium">{dateLabel(p.paidAt)}</div>
                      <div className="text-xs text-slate-500">{monthLabel(p.periodMonth)} uchun · {METHOD_LABEL[p.method]}{p.groupName ? ` · ${p.groupName}` : ''}{p.note ? ` · ${p.note}` : ''}</div>
                    </div>
                    <span className="font-semibold text-emerald-600">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
