import { useState, type FormEvent } from 'react';
import { getSupabase, supabaseConfigured } from './supabase';

export function SupabaseSignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = supabaseConfigured();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      window.location.replace('/teacher-assessment');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed. Please try again.');
      setPending(false);
    }
  }

  return (
    <main className="denied" data-reason="SIGNED_OUT">
      <h1>Sign in to Teacher Assessment</h1>
      <p>Use the email and password provided by your assessment coordinator.</p>
      {!configured ? <p role="alert">Sign-in is not configured. Please contact your administrator.</p> : (
        <form className="ta-signin" onSubmit={submit}>
          <label htmlFor="ta-email">Email</label>
          <input id="ta-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} />
          <label htmlFor="ta-password">Password</label>
          <input id="ta-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={pending} />
          {error && <p role="alert">{error}</p>}
          <button className="btn pri" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
        </form>
      )}
      <p className="ta-signin-help">Need access or a password reset? Contact your assessment coordinator.</p>
    </main>
  );
}
