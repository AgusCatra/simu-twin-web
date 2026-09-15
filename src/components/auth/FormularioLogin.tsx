'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const LABEL_CLASS =
  'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500';
const INPUT_CLASS =
  'w-full rounded-sm border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60';
const PRIMARY_BTN_CLASS =
  'w-full rounded-sm border border-zinc-100 bg-zinc-100 px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500';

export default function FormularioLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (verificando) return;

    setError(null);
    setVerificando(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(
          authError.message === 'Invalid login credentials'
            ? 'Credenciales inválidas. Verifique email y contraseña.'
            : 'No se pudo iniciar la sesión. Verifique sus credenciales.'
        );
        return;
      }

      router.push('/admin');
      router.refresh();
    } catch {
      setError('No se pudo iniciar la sesión. Verifique sus credenciales.');
    } finally {
      setVerificando(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-sm border border-zinc-800 bg-zinc-900 p-6"
    >
      {error && (
        <div
          role="alert"
          className="mb-5 rounded-sm border border-red-900 bg-red-950 px-3 py-2.5 font-mono text-[11px] tracking-[0.04em] text-red-200"
        >
          {error}
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="email" className={LABEL_CLASS}>
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="username"
          placeholder="admin@ejemplo.gob.ar"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={verificando}
          className={INPUT_CLASS}
        />
      </div>

      <div className="mb-6">
        <label htmlFor="password" className={LABEL_CLASS}>
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={verificando}
          className={INPUT_CLASS}
        />
      </div>

      <button type="submit" disabled={verificando} className={PRIMARY_BTN_CLASS}>
        {verificando ? 'VERIFICANDO CREDENCIALES…' : 'INICIAR SESIÓN'}
      </button>
    </form>
  );
}
