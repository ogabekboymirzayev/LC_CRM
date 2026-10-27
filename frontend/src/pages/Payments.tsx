import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useFetch } from '../hooks';
import { METHOD_LABEL, currentMonth, dateLabel, money, monthLabel, shiftMonth, todayStr } from '../format';
import type { PaymentRow, UserDetail, UserRow } from '../types';
import { Badge, Button, Card, Empty, ErrorBox, Field, FieldGroup, FormError, Input, Loading, Modal, PageHeader, Select, Stat, Tabs, Textarea, useToast } from '../ui';

interface Debtor {
  studentId: number;
  fullName: string;
  phone: string | null;
  expected: number;
  paid: number;
  debt: number;
}

export default function Payments() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'payments' | 'debtors'>(params.get('tab') === 'debtors' ? 'debtors' : 'payments');
  const [month, setMonth] = useState(currentMonth());
  const [form, setForm] = useState<{ studentId?: number } | null>(null);

  const summary = useFetch<{ expected: number; collected: number; debt: number; debtorsCount: number; byMethod: Array<{ method: PaymentRow['method']; total: number; count: number }> }>(`/payments/summary?month=${month}`);
  const list = useFetch<PaymentRow[]>(`/payments?month=${month}`);
  const debtors = useFetch<{ totalDebt: number; debtors: Debtor[] }>(`/payments/debtors?month=${month}`);

  useEffect(() => {
    if (params.get('new') === '1') {
      setForm({});
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const reloadAll = () => {
    summary.reload();
    list.reload();
    debtors.reload();
  };

  async function remove(p: PaymentRow) {
    if (!window.confirm(`${p.studentName} — ${money(p.amount)} to'lovi o'chirilsinmi? Bu qarzni qayta hisoblaydi.`)) return;
    try {
      await api.del(`/payments/${p.id}`);
      toast("To'lov o'chirildi");
      reloadAll();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }

  const s = summary.data;
  const pct = s && s.expected ? Math.min(100, Math.round((s.collected / s.expected) * 100)) : 0;

  return (
    <>
      <PageHeader title="To'lovlar" action={<Button onClick={() => setForm({})}>+ To'lov qabul qilish</Button>} />

      <div className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:justify-start">
        <button className="rounded-md px-3 py-1.5 text-lg hover:bg-slate-100" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Oldingi oy">‹</button>
        <span className="min-w-36 text-center font-semibold">{monthLabel(month)}</span>
        <button className="rounded-md px-3 py-1.5 text-lg hover:bg-slate-100 disabled:opacity-30" disabled={month >= shiftMonth(currentMonth(), 1)} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Keyingi oy">›</button>
      </div>

      {summary.error ? (
        <ErrorBox message={summary.error} onRetry={summary.reload} />
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Kutilgan" value={s ? money(s.expected) : '…'} />
          <Stat label="Yig'ilgan" value={s ? money(s.collected) : '…'} tone="green" sub={s ? `${pct}%` : undefined} />
          <Stat label="Qarz" value={s ? money(s.debt) : '…'} tone={s && s.debt > 0 ? 'red' : undefined} />
          <Stat label="Qarzdorlar" value={s ? s.debtorsCount : '…'} sub="o'quvchi" />
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'payments', label: "To'lovlar" },
          { id: 'debtors', label: `Qarzdorlar${debtors.data ? ` (${debtors.data.debtors.length})` : ''}` },
        ]}
      />

      {tab === 'payments' ? (
        list.loading ? (
          <Loading />
        ) : list.error ? (
          <ErrorBox message={list.error} onRetry={list.reload} />
        ) : !list.data || list.data.length === 0 ? (
          <Empty title={`${monthLabel(month)} uchun to'lov yo'q`} action={<Button onClick={() => setForm({})}>+ To'lov qabul qilish</Button>} />
        ) : (
          <div className="space-y-2">
            {list.data.map((p) => (
              <Card key={p.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/students/${p.studentId}`} className="font-semibold text-slate-900 hover:text-indigo-700">{p.studentName}</Link>
                    <div className="mt-0.5 text-sm text-slate-500">
                      {dateLabel(p.paidAt)} · {METHOD_LABEL[p.method]}{p.groupName ? ` · ${p.groupName}` : ''}
                    </div>
                    {p.note && <div className="mt-0.5 text-sm text-slate-500">📝 {p.note}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-emerald-600">{money(p.amount)}</span>
                    <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={() => remove(p)} aria-label="O'chirish">O'chirish</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : debtors.loading ? (
        <Loading />
      ) : debtors.error ? (
        <ErrorBox message={debtors.error} onRetry={debtors.reload} />
      ) : !debtors.data || debtors.data.debtors.length === 0 ? (
        <Empty title="Qarzdor yo'q 🎉" hint={`${monthLabel(month)} uchun hamma to'lagan`} />
      ) : (
        <div className="space-y-2">
          {debtors.data.debtors.map((d) => (
            <Card key={d.studentId}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link to={`/students/${d.studentId}`} className="font-semibold text-slate-900 hover:text-indigo-700">{d.fullName}</Link>
                  <div className="mt-0.5 text-sm text-slate-500">{d.phone ?? 'Telefon yo\'q'} · to'langan {money(d.paid)} / {money(d.expected)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="red">Qarz: {money(d.debt)}</Badge>
                  <Button size="sm" onClick={() => setForm({ studentId: d.studentId })}>To'lov</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {form && (
        <PaymentForm
          month={month}
          initialStudentId={form.studentId}
          debtors={debtors.data?.debtors ?? []}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            toast("To'lov qabul qilindi");
            reloadAll();
          }}
        />
      )}
    </>
  );
}

function PaymentForm({
  month,
  initialStudentId,
  debtors,
  onClose,
  onSaved,
}: {
  month: string;
  initialStudentId?: number;
  debtors: Debtor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const students = useFetch<UserRow[]>('/users?role=student&active=1');
  const [studentId, setStudentId] = useState(initialStudentId ? String(initialStudentId) : '');
  const detail = useFetch<UserDetail>(studentId ? `/users/${studentId}` : null);
  const [groupId, setGroupId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentRow['method']>('cash');
  const [periodMonth, setPeriodMonth] = useState(month);
  const [paidAt, setPaidAt] = useState(todayStr());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Tanlangan o'quvchining qarzini summaga avtomatik qo'yish
  useEffect(() => {
    if (!studentId) return;
    const d = debtors.find((x) => x.studentId === Number(studentId));
    setAmount(d && periodMonth === month ? String(d.debt) : '');
    setGroupId('');
  }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/payments', {
        studentId: Number(studentId),
        groupId: groupId ? Number(groupId) : null,
        amount: Number(amount),
        method,
        periodMonth,
        paidAt,
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="To'lov qabul qilish" onClose={onClose}>
      {students.loading ? (
        <Loading />
      ) : (students.data ?? []).length === 0 ? (
        <p className="text-sm text-slate-600">Avval <Link to="/students?new=1" className="font-medium text-indigo-700">o'quvchi qo'shing</Link>.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="O'quvchi">
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} required autoFocus={!initialStudentId}>
              <option value="">— tanlang —</option>
              {(students.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.fullName}{u.phone ? ` (${u.phone})` : ''}</option>)}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Summa (so'm)">
              <Input type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} required inputMode="numeric" autoFocus={!!initialStudentId} />
            </Field>
            <Field label="Qaysi oy uchun">
              <Input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} required />
            </Field>
          </div>
          <FieldGroup label="To'lov usuli">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(METHOD_LABEL) as Array<PaymentRow['method']>).map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setMethod(m)}
                  aria-pressed={method === m}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium ${method === m ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600' : 'border-slate-300 bg-white text-slate-600'}`}
                >
                  {METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          </FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="To'lov sanasi"><Input type="date" value={paidAt} max={todayStr()} onChange={(e) => setPaidAt(e.target.value)} required /></Field>
            <Field label="Guruh (ixtiyoriy)">
              <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={!studentId}>
                <option value="">— umumiy —</option>
                {(detail.data?.groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Izoh"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
          <FormError message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Bekor qilish</Button>
            <Button type="submit" loading={busy}>Qabul qilish</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
