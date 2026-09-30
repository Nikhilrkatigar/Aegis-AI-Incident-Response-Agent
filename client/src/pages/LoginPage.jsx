import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, LogIn, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../lib/auth';
import { Button } from '../components/ui/Button';

// Published in the README on purpose so judges can sign in. Not for real deployments.
const DEMO_PASSWORD = 'payflow-oncall';
const DEMO_ACCOUNTS = [
  { username: 'nikhil', role: 'approver' },
  { username: 'adithya', role: 'approver' },
  { username: 'priya', role: 'responder' },
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const next = params.get('next') || '/incidents';
  const notice = { 'signed-out': 'You are signed out. Your session was revoked on the server.', expired: 'Your session ended. Sign in again to continue.' }[params.get('reason')];

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
    <main className="min-h-screen grid place-items-center p-6">
      <form onSubmit={submit} className="panel w-full max-w-sm p-6" aria-labelledby="login-title">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} strokeWidth={2} className="text-accent" aria-hidden />
          <h1 id="login-title" className="text-[16px] font-semibold">Sign in to Aegis</h1>
        </div>
        <p className="mt-1 text-[13px] text-muted leading-relaxed">
          Incident response for PayFlow. Approvers can approve fixes; responders can investigate and use the Fault Lab.
        </p>
        {notice && <p role="status" className="mt-3 px-3 py-2 rounded-card bg-sunken text-[12.5px] text-ink">{notice}</p>}

        <label htmlFor="username" className="mt-4 block text-[13px] font-medium">Username</label>
        <input id="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-card border border-line bg-surface text-[13.5px]" required />

        <label htmlFor="password" className="mt-3 block text-[13px] font-medium">Password</label>
        <div className="relative mt-1">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full h-9 pl-3 pr-10 rounded-card border border-line bg-surface text-[13.5px]"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 w-9 grid place-items-center text-muted hover:text-ink cursor-pointer rounded-r-card"
          >
            {showPassword ? <EyeOff size={16} strokeWidth={1.75} aria-hidden /> : <Eye size={16} strokeWidth={1.75} aria-hidden />}
          </button>
        </div>

        {error && <p role="alert" className="mt-3 text-[13px] text-danger">{error}</p>}

        <Button type="submit" variant="primary" icon={LogIn} busy={busy} className="mt-4 w-full">Sign in</Button>
        <fieldset className="mt-5 pt-4 border-t border-line">
          <legend className="text-[12px] text-muted pr-2">Demo accounts (hackathon build)</legend>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.username}
                type="button"
                onClick={() => { setUsername(a.username); setPassword(DEMO_PASSWORD); setError(null); }}
                className={`text-left px-2.5 py-2 rounded-card border transition-colors cursor-pointer ${username === a.username ? 'border-accent bg-accent-soft/60' : 'border-line hover:bg-sunken'}`}
              >
                <span className="block text-[12.5px] font-medium">{a.username}</span>
                <span className="block text-[11.5px] text-muted">{a.role}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-muted">Picking one fills the form. Approvers can approve fixes; the responder cannot.</p>
        </fieldset>
      </form>
    </main>
  );
}
