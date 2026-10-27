import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useFetch } from '../hooks';
import { STATUS_LABEL, STATUS_STYLE, dateLabel, todayStr } from '../format';
import type { AttStatus, GroupRow } from '../types';
import { Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader, Select, useToast } from '../ui';

interface Sheet {
  group: { id: number; name: string };
  date: string;
  lessonDay: boolean;
  students: Array<{ studentId: number; fullName: string; status: AttStatus | null; note: string | null }>;
}

const ORDER: AttStatus[] = ['present', 'late', 'absent', 'excused'];

export default function Attendance() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const groups = useFetch<GroupRow[]>('/groups');
  const active = useMemo(() => (groups.data ?? []).filter((g) => g.active), [groups.data]);
  const groupId = Number(params.get('groupId')) || active[0]?.id || 0;
  const [date, setDate] = useState(params.get('date') || todayStr());

  const sheet = useFetch<Sheet>(groupId ? `/attendance?groupId=${groupId}&date=${date}` : null);
  const [marks, setMarks] = useState<Record<number, { status: AttStatus | null; note: string }>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sheet.data) return;
    setMarks(Object.fromEntries(sheet.data.students.map((s) => [s.studentId, { status: s.status, note: s.note ?? '' }])));
    setDirty(false);
  }, [sheet.data]);

  function pickGroup(id: string) {
    if (dirty && !window.confirm("Saqlanmagan o'zgarishlar bor. Guruhni almashtirasizmi?")) return;
    params.set('groupId', id);
    setParams(params, { replace: true });
  }
  function pickDate(d: string) {
    if (dirty && !window.confirm("Saqlanmagan o'zgarishlar bor. Sanani almashtirasizmi?")) return;
    setDate(d);
  }
  function mark(id: number, status: AttStatus) {
    setMarks((m) => ({ ...m, [id]: { ...m[id], status } }));
    setDirty(true);
  }
  function markAll(status: AttStatus) {
    setMarks((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, status }])));
    setDirty(true);
  }

  const students = sheet.data?.students ?? [];
  const markedCount = students.filter((s) => marks[s.studentId]?.status).length;

  async function save() {
    const records = students
      .filter((s) => marks[s.studentId]?.status)
      .map((s) => ({ studentId: s.studentId, status: marks[s.studentId].status, note: marks[s.studentId].note.trim() || null }));
    if (!records.length) return toast("Kamida bitta o'quvchini belgilang", 'err');
    setBusy(true);
    try {
      await api.put('/attendance', { groupId, date, records });
      toast(`Davomat saqlandi (${records.length} ta)`);
      setDirty(false);
      sheet.reload();
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Davomat" subtitle="Guruh va sanani tanlang, har bir o'quvchini belgilang" />
      {groups.loading ? (
        <Loading />
      ) : groups.error ? (
        <ErrorBox message={groups.error} onRetry={groups.reload} />
      ) : active.length === 0 ? (
        <Empty title="Faol guruh yo'q" hint="Davomat belgilash uchun avval guruh yarating" />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Field label="Guruh">
              <Select value={groupId} onChange={(e) => pickGroup(e.target.value)}>
                {active.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </Field>
            <Field label="Sana">
              <Input type="date" value={date} max={todayStr()} onChange={(e) => e.target.value && pickDate(e.target.value)} />
            </Field>
          </div>

          {sheet.loading ? (
            <Loading />
          ) : sheet.error ? (
            <ErrorBox message={sheet.error} onRetry={sheet.reload} />
          ) : sheet.data && (
            <>
              {!sheet.data.lessonDay && (
                <div className="mb-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {dateLabel(date)} kuni bu guruhning dars jadvali yo'q. Baribir belgilashingiz mumkin.
                </div>
              )}
              {students.length === 0 ? (
                <Empty title="Bu sanada guruhda o'quvchi yo'q" hint="O'quvchilarni guruh sahifasidan qo'shing" />
              ) : (
                <Card
                  title={`${sheet.data.group.name} — ${dateLabel(date)}`}
                  action={<span className="text-sm text-slate-500">{markedCount}/{students.length}</span>}
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-500">Hammasini:</span>
                    {ORDER.map((st) => (
                      <button key={st} onClick={() => markAll(st)} className={`rounded-md border px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[st]}`}>{STATUS_LABEL[st]}</button>
                    ))}
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {students.map((s, i) => {
                      const cur = marks[s.studentId];
                      return (
                        <li key={s.studentId} className="py-3">
                          <div className="mb-2 font-medium text-slate-900">{i + 1}. {s.fullName}</div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {ORDER.map((st) => (
                              <button
                                key={st}
                                onClick={() => mark(s.studentId, st)}
                                aria-pressed={cur?.status === st}
                                className={`rounded-lg border px-1 py-2.5 text-xs font-medium transition sm:text-sm ${cur?.status === st ? STATUS_STYLE[st] + ' ring-2 ring-offset-1 ring-current' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                              >
                                {STATUS_LABEL[st]}
                              </button>
                            ))}
                          </div>
                          {(cur?.status === 'absent' || cur?.status === 'excused' || cur?.note) && (
                            <Input
                              className="mt-2"
                              placeholder="Izoh (masalan: kasal)"
                              maxLength={200}
                              value={cur?.note ?? ''}
                              onChange={(e) => { setMarks((m) => ({ ...m, [s.studentId]: { ...m[s.studentId], note: e.target.value } })); setDirty(true); }}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="sticky bottom-0 -mx-4 -mb-4 mt-2 flex items-center justify-between gap-3 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
                    <span className={`text-sm ${dirty ? 'text-amber-600' : 'text-slate-500'}`}>{dirty ? "Saqlanmagan o'zgarishlar bor" : markedCount ? 'Saqlangan' : 'Hali belgilanmagan'}</span>
                    <Button onClick={save} loading={busy} disabled={!dirty && markedCount > 0}>Saqlash</Button>
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
