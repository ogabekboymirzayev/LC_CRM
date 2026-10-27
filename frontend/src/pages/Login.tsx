import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { Button, Field, FormError, Input } from '../ui';

export default function Login() {
  const { login } = useAuth();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(name.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white shadow-lg">LC</div>
          <h1 className="text-2xl font-bold text-slate-900">LC CRM</h1>
          <p className="mt-1 text-sm text-slate-500">O'quv markazlar uchun boshqaruv tizimi</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Field label="Login">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" autoCapitalize="none" autoFocus required />
          </Field>
          <Field label="Parol">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          <FormError message={error} />
          <Button type="submit" loading={busy} className="w-full">
            Kirish
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">Login va parolni o'quv markaz administratoridan oling</p>
      </div>
    </div>
  );
}
