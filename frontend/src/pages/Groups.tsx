import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';
import { WEEKDAYS, money, slotsSummary } from '../format';
import type { GroupRow, Slot, UserRow } from '../types';
import { Badge, Button, Empty, ErrorBox, Field, FormError, Input, Loading, Modal, PageHeader, Select, useToast } from '../ui';

export default function Groups() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload } = useFetch<GroupRow[]>('/groups');
  const [creating, setCreating] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isAdmin && params.get('new') === '1') {
      setCreating(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams, isAdmin]);

  const list = (data ?? []).filter((g) => showClosed || g.active);
  const closedCount = (data ?? []).filter((g) => !g.active).length;

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Guruhlar' : 'Guruhlarim'}
        subtitle={`Faol guruhlar: ${(data ?? []).filter((g) => g.active).length} ta`}
        action={isAdmin && <Button onClick={() => setCreating(true)}>+ Yangi guruh</Button>}
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : list.length === 0 ? (
        <Empty title="Guruhlar yo'q" hint={isAdmin ? "Birinchi guruhni yarating: o'qituvchi, narx va dars jadvalini belgilang" : "Sizga hali guruh biriktirilmagan"} action={isAdmin && <Button onClick={() => setCreating(true)}>+ Yangi guruh</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((g) => (
            <Link key={g.id} to={`/groups/${g.id}`} className={`block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 ${g.active ? '' : 'opacity-60'}`}>
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="font-semibold text-slate-900">{g.name}</div>
                {g.active ? <Badge tone="green">{g.studentsCount} o'quvchi</Badge> : <Badge tone="gray">Yopilgan</Badge>}
              </div>
              {g.subject && <div className="text-sm text-slate-500">{g.subject}</div>}
              <div className="mt-2 space-y-0.5 text-sm text-slate-600">
                <div>👨‍🏫 {g.teacherName ?? "O'qituvchi biriktirilmagan"}{g.supportTeacherName ? ` + ${g.supportTeacherName}` : ''}</div>
                <div>🕒 {slotsSummary(g.slots)}</div>
                {isAdmin && <div>💳 {money(g.monthlyPrice)} / oy</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
      {closedCount > 0 && (
        <button onClick={() => setShowClosed((s) => !s)} className="mt-4 text-sm font-medium text-indigo-700">
          {showClosed ? 'Yopilgan guruhlarni yashirish' : `Yopilgan guruhlarni ko'rsatish (${closedCount})`}
        </button>
      )}
      {creating && (
        <GroupForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            toast('Guruh yaratildi');
            reload();
          }}
        />
      )}
    </>
  );
}

const DEFAULT_SLOT: Slot = { weekday: 1, startTime: '15:00', endTime: '16:30', room: '' };

export interface GroupFormInitial {
  id: number;
  name: string;
  subject: string | null;
  teacherId: number | null;
  supportTeacherId: number | null;
  monthlyPrice: number;
  startDate: string | null;
  slots: Slot[];
}

export function GroupForm({ group, onClose, onSaved }: { group?: GroupFormInitial; onClose: () => void; onSaved: () => void }) {
  const users = useFetch<UserRow[]>('/users');
  const [name, setName] = useState(group?.name ?? '');
  const [subject, setSubject] = useState(group?.subject ?? '');
  const [teacherId, setTeacherId] = useState(group?.teacherId ? String(group.teacherId) : '');
  const [supportId, setSupportId] = useState(group?.supportTeacherId ? String(group.supportTeacherId) : '');
  const [price, setPrice] = useState(group ? String(group.monthlyPrice) : '');
  const [startDate, setStartDate] = useState(group?.startDate ?? '');
  const [slots, setSlots] = useState<Slot[]>(group?.slots.length ? group.slots.map((s) => ({ ...s, room: s.room ?? '' })) : [{ ...DEFAULT_SLOT }]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const teachers = (users.data ?? []).filter((u) => u.role === 'teacher' && u.active);
  const supports = (users.data ?? []).filter((u) => u.role === 'support_teacher' && u.active);

  const setSlot = (i: number, patch: Partial<Slot>) => setSlots((s) => s.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  function preset(days: number[]) {
    const base = slots[0] ?? DEFAULT_SLOT;
    setSlots(days.map((d) => ({ weekday: d, startTime: base.startTime, endTime: base.endTime, room: base.room ?? '' })));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = {
        name,
        subject: subject || null,
        teacherId: teacherId ? Number(teacherId) : null,
        supportTeacherId: supportId ? Number(supportId) : null,
        monthlyPrice: Number(price),
        startDate: startDate || null,
        slots: slots.map((s) => ({ weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, room: s.room || null })),
      };
      if (group) await api.put(`/groups/${group.id}`, body);
      else await api.post('/groups', body);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={group ? 'Guruhni tahrirlash' : 'Yangi guruh'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Guruh nomi"><Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoFocus placeholder="Masalan: Ingliz tili A1" /></Field>
          <Field label="Fan / yo'nalish"><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ingliz tili" /></Field>
          <Field label="O'qituvchi">
            <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">— tanlanmagan —</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
            </Select>
          </Field>
          <Field label="Yordamchi o'qituvchi">
            <Select value={supportId} onChange={(e) => setSupportId(e.target.value)}>
              <option value="">— yo'q —</option>
              {supports.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
            </Select>
          </Field>
          <Field label="Oylik to'lov (so'm)"><Input type="number" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} required placeholder="400000" inputMode="numeric" /></Field>
          <Field label="Boshlanish sanasi"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700">Dars jadvali</span>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="secondary" onClick={() => preset([1, 3, 5])}>Du · Chor · Ju</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => preset([2, 4, 6])}>Se · Pay · Sha</Button>
            </div>
          </div>
          <div className="space-y-2">
            {slots.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr] gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[1.3fr_1fr_1fr_1fr_auto]">
                <Select value={s.weekday} onChange={(e) => setSlot(i, { weekday: Number(e.target.value) })} aria-label="Hafta kuni" className="col-span-3 sm:col-span-1">
                  {WEEKDAYS.map((d, k) => <option key={d} value={k + 1}>{d}</option>)}
                </Select>
                <Input type="time" value={s.startTime} onChange={(e) => setSlot(i, { startTime: e.target.value })} required aria-label="Boshlanishi" />
                <Input type="time" value={s.endTime} onChange={(e) => setSlot(i, { endTime: e.target.value })} required aria-label="Tugashi" />
                <Input value={s.room ?? ''} onChange={(e) => setSlot(i, { room: e.target.value })} placeholder="Xona" aria-label="Xona" />
                <Button type="button" variant="ghost" className="text-rose-600" onClick={() => setSlots((x) => x.filter((_, k) => k !== i))} aria-label="O'chirish">✕</Button>
              </div>
            ))}
          </div>
          <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => setSlots((s) => [...s, { ...DEFAULT_SLOT, weekday: Math.min(7, (s[s.length - 1]?.weekday ?? 0) + 1) }])}>+ Dars kuni qo'shish</Button>
        </div>

        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Bekor qilish</Button>
          <Button type="submit" loading={busy}>Saqlash</Button>
        </div>
      </form>
    </Modal>
  );
}

