import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../lib/auth';
import { Button } from '../components/ui/Button';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const next = params.get('next') || '/incidents';

  if (user) return <Navigate to={next} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(username.trim(), password);
      toast.success(`Signed in as ${u.name} (${u.role})`);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-56px)] grid place-items-center p-6">
      <form onSubmit={submit} className="panel w-full max-w-sm p-6" aria-labelledby="login-title">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} strokeWidth={2} className="text-accent" aria-hidden />
          <h1 id="login-title" className="text-[16px] font-semibold">Sign in to Aegis</h1>
        </div>
        <p className="mt-1 text-[13px] text-muted leading-relaxed">
          Anyone can watch incidents. Acting on them needs an account: approvers can approve actions, responders can investigate and use the Fault Lab.
        </p>

        <label htmlFor="username" className="mt-4 block text-[13px] font-medium">Username</label>
        <input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-card border border-line bg-surface text-[13.5px]" required />

        <label htmlFor="password" className="mt-3 block text-[13px] font-medium">Password</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-card border border-line bg-surface text-[13.5px]" required />

        {error && <p role="alert" className="mt-3 text-[13px] text-danger">{error}</p>}

        <Button type="submit" variant="primary" icon={LogIn} busy={busy} className="mt-4 w-full">Sign in</Button>
        <p className="mt-3 text-[12px] text-muted">Demo accounts are listed in the project README.</p>
      </form>
    </div>
  );
}
