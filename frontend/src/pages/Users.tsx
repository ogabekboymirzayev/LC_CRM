import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useFetch } from '../hooks';
import { ROLE_LABEL, genLogin, genPassword } from '../format';
import type { Role, UserDetail, UserRow } from '../types';
import { Badge, Button, Card, Empty, ErrorBox, Field, FormError, Input, Loading, Modal, MultiPick, PageHeader, Textarea, useToast } from '../ui';

type Kind = 'students' | 'parents' | 'staff';

const CFG: Record<Kind, { title: string; singular: string; roles: Role[]; add: string; searchHint: string }> = {
  students: { title: "O'quvchilar", singular: "O'quvchi", roles: ['student'], add: "+ O'quvchi qo'shish", searchHint: "Ism, telefon yoki login bo'yicha qidirish" },
  parents: { title: 'Ota-onalar', singular: 'Ota-ona', roles: ['parent'], add: "+ Ota-ona qo'shish", searchHint: "Ism, telefon yoki login bo'yicha qidirish" },
  staff: { title: "O'qituvchilar", singular: "O'qituvchi", roles: ['teacher', 'support_teacher'], add: "+ O'qituvchi qo'shish", searchHint: "Ism, telefon yoki login bo'yicha qidirish" },
};

interface FormState {
  role: Role;
  fullName: string;
  phone: string;
  login: string;
  password: string;
  birthDate: string;
  address: string;
  notes: string;
  parentIds: number[];
  studentIds: number[];
  active: boolean;
}

export default function Users({ kind }: { kind: Kind }) {
  const cfg = CFG[kind];
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload } = useFetch<UserRow[]>('/users');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [creds, setCreds] = useState<{ name: string; login: string; password: string } | null>(null);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);

  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing('new');
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const list = useMemo(() => (data ?? []).filter((u) => cfg.roles.includes(u.role)), [data, cfg]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((u) => [u.fullName, u.phone, u.login].some((v) => v?.toLowerCase().includes(s)));
  }, [list, q]);

  async function toggleActive(u: UserRow) {
    if (u.active && !window.confirm(`${u.fullName} bloklansinmi?${u.role === 'student' ? " O'quvchi barcha guruhlardan chiqariladi." : ''}`)) return;
    try {
      await api.put(`/users/${u.id}`, { active: !u.active });
      toast(u.active ? 'Bloklandi' : 'Faollashtirildi');
      reload();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }

  return (
    <>
      <PageHeader title={cfg.title} subtitle={`Jami: ${list.length} ta`} action={<Button onClick={() => setEditing('new')}>{cfg.add}</Button>} />
      <div className="mb-4">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={cfg.searchHint} type="search" />
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : shown.length === 0 ? (
        <Empty title={q ? 'Hech narsa topilmadi' : `Hali ${cfg.title.toLowerCase()} yo'q`} action={!q && <Button onClick={() => setEditing('new')}>{cfg.add}</Button>} />
      ) : (
        <div className="space-y-2">
          {shown.map((u) => (
            <Card key={u.id} className={u.active ? '' : 'opacity-70'}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {u.role === 'student' ? (
                      <Link to={`/students/${u.id}`} className="font-semibold text-slate-900 hover:text-indigo-700">{u.fullName}</Link>
                    ) : (
                      <span className="font-semibold text-slate-900">{u.fullName}</span>
                    )}
                    {kind === 'staff' && <Badge tone="indigo">{ROLE_LABEL[u.role]}</Badge>}
                    {!u.active && <Badge tone="red">Bloklangan</Badge>}
                  </div>
                  <div className="mt-1 space-y-0.5 text-sm text-slate-500">
                    <div>{u.phone || 'Telefon kiritilmagan'} · login: <span className="font-mono">{u.login}</span></div>
                    {u.role === 'student' && <div>Ota-ona: {u.parentNames || '—'} · Guruhlar: {u.groupsCount}</div>}
                    {u.role === 'parent' && <div>Farzandlari: {u.childNames || '—'}</div>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>Tahrirlash</Button>
                  <Button size="sm" variant="ghost" onClick={() => setResetFor(u)}>Parol</Button>
                  <Button size="sm" variant="ghost" className={u.active ? 'text-rose-600 hover:bg-rose-50' : ''} onClick={() => toggleActive(u)}>
                    {u.active ? 'Bloklash' : 'Faollashtirish'}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <UserForm
          kind={kind}
          user={editing === 'new' ? null : editing}
          allUsers={data ?? []}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            setEditing(null);
            reload();
            if (c) setCreds(c);
            else toast('Saqlandi');
          }}
        />
      )}
      {resetFor && <ResetPassword user={resetFor} onClose={() => setResetFor(null)} onDone={(c) => { setResetFor(null); setCreds(c); }} />}
      {creds && <Credentials creds={creds} onClose={() => setCreds(null)} />}
    </>
  );
}

function UserForm({
  kind,
  user,
  allUsers,
  onClose,
  onSaved,
}: {
  kind: Kind;
  user: UserRow | null;
  allUsers: UserRow[];
  onClose: () => void;
  onSaved: (creds?: { name: string; login: string; password: string }) => void;
}) {
  const cfg = CFG[kind];
  const isNew = !user;
  const detail = useFetch<UserDetail>(user ? `/users/${user.id}` : null);
  const [f, setF] = useState<FormState>({
    role: user?.role ?? cfg.roles[0],
    fullName: user?.fullName ?? '',
    phone: user?.phone ?? '',
    login: user?.login ?? '',
    password: '',
    birthDate: user?.birthDate ?? '',
    address: user?.address ?? '',
    notes: user?.notes ?? '',
    parentIds: [],
    studentIds: [],
    active: user?.active ?? true,
  });
  const [loginTouched, setLoginTouched] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) setF((s) => ({ ...s, password: genPassword() }));
  }, [isNew]);

  useEffect(() => {
    if (detail.data) setF((s) => ({ ...s, parentIds: detail.data!.parents.map((p) => p.id), studentIds: detail.data!.children.map((c) => c.id) }));
  }, [detail.data]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const isStudent = f.role === 'student';
  const isParent = f.role === 'parent';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const common = {
        fullName: f.fullName,
        phone: f.phone || (isNew ? undefined : null),
        birthDate: isStudent ? f.birthDate || (isNew ? undefined : null) : undefined,
        address: isStudent ? f.address || (isNew ? undefined : null) : undefined,
        notes: f.notes || (isNew ? undefined : null),
        parentIds: isStudent ? f.parentIds : undefined,
        studentIds: isParent ? f.studentIds : undefined,
      };
      if (isNew) {
        await api.post('/users', { ...common, role: f.role, login: f.login, password: f.password });
        onSaved({ name: f.fullName, login: f.login, password: f.password });
      } else {
        await api.put(`/users/${user!.id}`, { ...common, login: f.login });
        onSaved();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const parents = allUsers.filter((u) => u.role === 'parent' && u.active).map((u) => ({ id: u.id, label: u.fullName + (u.phone ? ` (${u.phone})` : '') }));
  const students = allUsers.filter((u) => u.role === 'student' && u.active).map((u) => ({ id: u.id, label: u.fullName }));
  const relationsLoading = !isNew && detail.loading;

  return (
    <Modal title={isNew ? `${cfg.singular} qo'shish` : `${user!.fullName} — tahrirlash`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {isNew && kind === 'staff' && (
          <Field label="Lavozim">
            <select value={f.role} onChange={(e) => set('role', e.target.value as Role)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="teacher">O'qituvchi</option>
              <option value="support_teacher">Yordamchi o'qituvchi</option>
            </select>
          </Field>
        )}
        <Field label="To'liq ism">
          <Input
            value={f.fullName}
            onChange={(e) => {
              set('fullName', e.target.value);
              if (isNew && !loginTouched) set('login', genLogin(e.target.value));
            }}
            required
            minLength={2}
            autoFocus
          />
        </Field>
        <Field label="Telefon">
          <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+998 90 123 45 67" inputMode="tel" />
        </Field>
        {isStudent && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tug'ilgan sana"><Input type="date" value={f.birthDate} onChange={(e) => set('birthDate', e.target.value)} /></Field>
            <Field label="Manzil"><Input value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
          </div>
        )}

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="mb-2 text-sm font-medium text-slate-700">Tizimga kirish</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Login">
              <Input value={f.login} onChange={(e) => { setLoginTouched(true); set('login', e.target.value); }} required minLength={3} autoCapitalize="none" pattern="[A-Za-z0-9._@\-]+" title="Faqat lotin harf, raqam va . _ @ -" />
            </Field>
            {isNew && (
              <Field label="Parol">
                <div className="flex gap-2">
                  <Input value={f.password} onChange={(e) => set('password', e.target.value)} required minLength={6} className="font-mono" />
                  <Button type="button" variant="secondary" onClick={() => set('password', genPassword())} title="Yangi parol">↻</Button>
                </div>
              </Field>
            )}
          </div>
        </div>

        {isStudent && (relationsLoading ? <p className="text-sm text-slate-500">Yuklanmoqda…</p> : <MultiPick label="Ota-onalari" options={parents} value={f.parentIds} onChange={(v) => set('parentIds', v)} empty="Avval «Ota-onalar» bo'limida ota-ona qo'shing" />)}
        {isParent && (relationsLoading ? <p className="text-sm text-slate-500">Yuklanmoqda…</p> : <MultiPick label="Farzandlari" options={students} value={f.studentIds} onChange={(v) => set('studentIds', v)} empty="Avval «O'quvchilar» bo'limida o'quvchi qo'shing" />)}

        <Field label="Izoh"><Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Bekor qilish</Button>
          <Button type="submit" loading={busy} disabled={relationsLoading}>Saqlash</Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPassword({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: (c: { name: string; login: string; password: string }) => void }) {
  const [password, setPassword] = useState(genPassword());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`/users/${user.id}/password`, { password });
      onDone({ name: user.fullName, login: user.login, password });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Parolni yangilash — ${user.fullName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Yangi parol" hint="Kamida 6 ta belgi">
          <div className="flex gap-2">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="font-mono" />
            <Button type="button" variant="secondary" onClick={() => setPassword(genPassword())}>↻</Button>
          </div>
        </Field>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Bekor qilish</Button>
          <Button type="submit" loading={busy}>Yangilash</Button>
        </div>
      </form>
    </Modal>
  );
}

export function Credentials({ creds, onClose }: { creds: { name: string; login: string; password: string }; onClose: () => void }) {
  const toast = useToast();
  const text = `Login: ${creds.login}\nParol: ${creds.password}`;
  return (
    <Modal title="Kirish ma'lumotlari" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600"><b>{creds.name}</b> uchun login va parol tayyor. Parol faqat hozir ko'rinadi — uni xavfsiz joyga yozib oling yoki egasiga bering.</p>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-sm">
        <div>Login: <b>{creds.login}</b></div>
        <div>Parol: <b>{creds.password}</b></div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => { navigator.clipboard?.writeText(text).then(() => toast('Nusxalandi'), () => toast("Nusxalab bo'lmadi", 'err')); }}>Nusxalash</Button>
        <Button onClick={onClose}>Tayyor</Button>
      </div>
    </Modal>
  );
}
