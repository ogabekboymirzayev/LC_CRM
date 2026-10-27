import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { ROLE_LABEL } from '../format';
import { Button, Card, Field, FormError, Input, PageHeader, useToast } from '../ui';

export default function Account() {
  const { user } = useAuth();
  const toast = useToast();
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) return setError("Yangi parol kamida 6 ta belgi bo'lsin");
    if (newPassword !== repeat) return setError('Yangi parollar bir xil emas');
    setBusy(true);
    try {
      await api.post('/auth/change-password', { oldPassword, newPassword });
      toast("Parol o'zgartirildi");
      setOld('');
      setNew('');
      setRepeat('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;
  return (
    <>
      <PageHeader title="Mening hisobim" />
      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Ma'lumotlar">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Ism</dt><dd className="font-medium">{user.fullName}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Rol</dt><dd className="font-medium">{ROLE_LABEL[user.role]}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Login</dt><dd className="font-medium">{user.login}</dd></div>
            {user.phone && <div className="flex justify-between gap-4"><dt className="text-slate-500">Telefon</dt><dd className="font-medium">{user.phone}</dd></div>}
            {user.centerName && <div className="flex justify-between gap-4"><dt className="text-slate-500">O'quv markaz</dt><dd className="font-medium">{user.centerName}</dd></div>}
          </dl>
        </Card>
        <Card title="Parolni o'zgartirish">
          <form onSubmit={submit} className="space-y-3">
            <Field label="Eski parol"><Input type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} autoComplete="current-password" required /></Field>
            <Field label="Yangi parol" hint="Kamida 6 ta belgi"><Input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} autoComplete="new-password" required /></Field>
            <Field label="Yangi parolni takrorlang"><Input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required /></Field>
            <FormError message={error} />
            <Button type="submit" loading={busy}>Saqlash</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
