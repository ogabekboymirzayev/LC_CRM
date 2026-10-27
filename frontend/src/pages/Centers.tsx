import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useFetch } from '../hooks';
import { genLogin, genPassword } from '../format';
import { Badge, Button, Card, Empty, ErrorBox, Field, FormError, Input, Loading, Modal, PageHeader, useToast } from '../ui';
import { Credentials } from './Users';

interface Center {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  active: boolean;
  createdAt: string;
  students: number;
  teachers: number;
  groups: number;
}
interface CenterDetail extends Center {
  admins: Array<{ id: number; fullName: string; login: string; phone: string | null; active: number }>;
}
type Creds = { name: string; login: string; password: string };

export default function Centers() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch<Center[]>('/centers');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [creds, setCreds] = useState<Creds | null>(null);

  async function toggle(c: Center) {
    if (c.active && !window.confirm(`"${c.name}" o'quv markazi bloklansinmi? Barcha xodimlar va o'quvchilar tizimga kira olmaydi.`)) return;
    try {
      await api.put(`/centers/${c.id}`, { active: !c.active });
      toast(c.active ? 'Markaz bloklandi' : 'Markaz faollashtirildi');
      reload();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }

  return (
    <>
      <PageHeader title="O'quv markazlar" subtitle="Har bir markaz o'z ma'lumotlari bilan alohida ishlaydi" action={<Button onClick={() => setCreating(true)}>+ Yangi markaz</Button>} />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <Empty title="Hali o'quv markaz yo'q" hint="Markaz va uning administratorini yarating" action={<Button onClick={() => setCreating(true)}>+ Yangi markaz</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((c) => (
            <Card key={c.id} className={c.active ? '' : 'opacity-70'}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">{c.name}</div>
                  <div className="text-sm text-slate-500">{[c.phone, c.address].filter(Boolean).join(' · ') || "Aloqa ma'lumoti yo'q"}</div>
                </div>
                {c.active ? <Badge tone="green">Faol</Badge> : <Badge tone="red">Bloklangan</Badge>}
              </div>
              <div className="mb-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-lg bg-slate-50 py-2"><div className="font-bold">{c.students}</div><div className="text-xs text-slate-500">o'quvchi</div></div>
                <div className="rounded-lg bg-slate-50 py-2"><div className="font-bold">{c.teachers}</div><div className="text-xs text-slate-500">o'qituvchi</div></div>
                <div className="rounded-lg bg-slate-50 py-2"><div className="font-bold">{c.groups}</div><div className="text-xs text-slate-500">guruh</div></div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => setOpenId(c.id)}>Adminlar</Button>
                <Button size="sm" variant="ghost" className={c.active ? 'text-rose-600 hover:bg-rose-50' : ''} onClick={() => toggle(c)}>{c.active ? 'Bloklash' : 'Faollashtirish'}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {creating && <CreateCenter onClose={() => setCreating(false)} onSaved={(c) => { setCreating(false); setCreds(c); reload(); }} />}
      {openId !== null && <CenterAdmins id={openId} onClose={() => setOpenId(null)} onCreds={setCreds} />}
      {creds && <Credentials creds={creds} onClose={() => setCreds(null)} />}
    </>
  );
}

function CreateCenter({ onClose, onSaved }: { onClose: () => void; onSaved: (c: Creds) => void }) {
  const [f, setF] = useState({ name: '', phone: '', address: '', adminFullName: '', adminLogin: '', adminPassword: genPassword(10) });
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/centers', { name: f.name, phone: f.phone || undefined, address: f.address || undefined, adminFullName: f.adminFullName, adminLogin: f.adminLogin, adminPassword: f.adminPassword });
      onSaved({ name: f.adminFullName, login: f.adminLogin, password: f.adminPassword });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Yangi o'quv markaz" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Markaz nomi"><Input value={f.name} onChange={(e) => set('name', e.target.value)} required minLength={2} autoFocus /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telefon"><Input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+998 90 123 45 67" /></Field>
          <Field label="Manzil"><Input value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        </div>
        <div className="space-y-3 rounded-lg bg-slate-50 p-3">
          <div className="text-sm font-medium text-slate-700">Markaz administratori</div>
          <Field label="To'liq ism">
            <Input value={f.adminFullName} onChange={(e) => { set('adminFullName', e.target.value); if (!touched) set('adminLogin', genLogin(e.target.value)); }} required minLength={2} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Login"><Input value={f.adminLogin} onChange={(e) => { setTouched(true); set('adminLogin', e.target.value); }} required minLength={3} autoCapitalize="none" pattern="[A-Za-z0-9._\-]+" title="Faqat lotin harf, raqam va . _ -" /></Field>
            <Field label="Parol"><Input value={f.adminPassword} onChange={(e) => set('adminPassword', e.target.value)} required minLength={6} className="font-mono" /></Field>
          </div>
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Bekor qilish</Button>
          <Button type="submit" loading={busy}>Yaratish</Button>
        </div>
      </form>
    </Modal>
  );
}

function CenterAdmins({ id, onClose, onCreds }: { id: number; onClose: () => void; onCreds: (c: Creds) => void }) {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch<CenterDetail>(`/centers/${id}`);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState(genPassword(10));
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function reset(a: CenterDetail['admins'][number]) {
    if (!window.confirm(`${a.fullName} uchun yangi parol yaratilsinmi?`)) return;
    const pw = genPassword(10);
    try {
      await api.post(`/users/${a.id}/password`, { password: pw });
      onCreds({ name: a.fullName, login: a.login, password: pw });
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    setBusy(true);
    try {
      await api.post('/users', { role: 'admin', centerId: id, fullName: name, login, password });
      onCreds({ name, login, password });
      setAdding(false);
      setName('');
      setLogin('');
      setPassword(genPassword(10));
      reload();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={data ? `${data.name} — adminlar` : 'Adminlar'} onClose={onClose}>
      {loading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {data.admins.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <div className="font-medium">{a.fullName} {!a.active && <Badge tone="red">Bloklangan</Badge>}</div>
                  <div className="text-sm text-slate-500">login: <span className="font-mono">{a.login}</span></div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => reset(a)}>Yangi parol</Button>
              </li>
            ))}
          </ul>
          {adding ? (
            <form onSubmit={add} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
              <Field label="To'liq ism"><Input value={name} onChange={(e) => { setName(e.target.value); setLogin(genLogin(e.target.value)); }} required minLength={2} autoFocus /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Login"><Input value={login} onChange={(e) => setLogin(e.target.value)} required minLength={3} autoCapitalize="none" /></Field>
                <Field label="Parol"><Input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="font-mono" /></Field>
              </div>
              <FormError message={formError} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setAdding(false)}>Bekor qilish</Button>
                <Button type="submit" loading={busy}>Qo'shish</Button>
              </div>
            </form>
          ) : (
            <Button variant="ghost" className="mt-2" onClick={() => setAdding(true)}>+ Yana admin qo'shish</Button>
          )}
        </>
      )}
    </Modal>
  );
}
