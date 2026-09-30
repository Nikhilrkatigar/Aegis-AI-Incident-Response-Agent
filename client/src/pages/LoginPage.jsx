import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ShieldCheck, LogIn, Eye, EyeOff, BellRing, FileText, GitCommitHorizontal, History, Lightbulb, Hand, CircleCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../lib/auth';
import { Button } from '../components/ui/Button';
import { ThemeToggle } from '../components/ThemeToggle';

// Published in the README on purpose so judges can sign in. Not for real deployments.
const DEMO_PASSWORD = 'payflow-oncall';
const DEMO_ACCOUNTS = [
  { username: 'nikhil', role: 'approver' },
  { username: 'adithya', role: 'approver' },
  { username: 'priya', role: 'responder' },
];

// One run of the bad-deployment scenario, as the trace shows it.
const SAMPLE_RUN = [
  { at: '02:14:07', icon: BellRing, label: 'Alert', text: 'payment 5xx rate 38.2%, SLO is 1%', tone: 'text-danger' },
  { at: '02:14:09', icon: FileText, label: 'Logs', text: 'pg-pool TimeoutError: max=5, waiting=44' },
  { at: '02:14:11', icon: GitCommitHorizontal, label: 'Change', text: 'payment v2.14.0 set db.pool.max 50 → 5' },
  { at: '02:14:12', icon: History, label: 'Memory', text: 'Matches INC-0987, fixed by rollback' },
  { at: '02:14:16', icon: Lightbulb, label: 'Cause', text: 'Bad deployment · 91% confidence' },
  { at: '02:14:18', icon: Hand, label: 'Approval', text: 'Roll back payment to v2.13.2 · nikhil approved', tone: 'text-warn' },
  { at: '02:15:49', icon: CircleCheck, label: 'Verified', text: '5xx back to 0.4% after 90 s', tone: 'text-ok' },
];

const EASE = [0.22, 1, 0.36, 1];

// payment 5xx rate (%) every 15 s from 02:11:00 to 02:17:00, same run as above.
const ERROR_RATE = [0.4, 0.3, 0.5, 0.4, 0.4, 0.3, 0.4, 0.5, 0.4, 6.8, 21.5, 33.9, 38.2, 37.6, 38.4, 29.1, 12.7, 4.2, 1.1, 0.6, 0.4, 0.5, 0.4, 0.3, 0.4];
const CHART = { w: 520, h: 84, max: 40 };
const x = (i) => (i / (ERROR_RATE.length - 1)) * CHART.w;
const y = (v) => CHART.h - 6 - (v / CHART.max) * (CHART.h - 18);
const LINE = ERROR_RATE.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

function ErrorRateChart() {
  const marks = [
    { i: 8.3, label: 'v2.14.0 deployed', tone: 'var(--color-muted)' },
    { i: 13.2, label: 'rollback approved', tone: 'var(--color-accent)' },
  ];
  return (
    <figure className="px-4 pt-3 pb-1 border-b border-line">
      <figcaption className="flex items-baseline justify-between text-[11.5px] text-muted">
        <span>payment · 5xx rate</span>
        <span className="tabular">peak 38.4%</span>
      </figcaption>
      <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} className="mt-1 w-full h-auto overflow-visible" role="img" aria-label="payment 5xx rate: flat near 0.4%, spikes to 38% after v2.14.0 deploys, back to 0.4% after the rollback">
        <path d={`${LINE} L${CHART.w},${CHART.h} L0,${CHART.h} Z`} fill="var(--color-danger-soft)" />
        {marks.map((m) => (
          <g key={m.label}>
            <line x1={x(m.i)} x2={x(m.i)} y1="10" y2={CHART.h} stroke={m.tone} strokeDasharray="3 3" strokeWidth="1" />
            <text x={x(m.i) + 5} y="10" fontSize="10.5" fill={m.tone} fontFamily="var(--font-sans)">{m.label}</text>
          </g>
        ))}
        <motion.path
          d={LINE}
          fill="none"
          stroke="var(--color-danger)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, delay: 0.2, ease: 'easeOut' }}
        />
      </svg>
    </figure>
  );
}

function SampleRun() {
  return (
    <div className="panel overflow-hidden">
      <div className="px-4 h-10 flex items-center justify-between border-b border-line">
        <span className="font-mono text-[12px] text-ink">INC-1041 · payment</span>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ok">
          <span aria-hidden className="size-1.5 rounded-full bg-ok" />
          resolved in 1m 42s
        </span>
      </div>
      <ErrorRateChart />
      <ol className="px-4 py-3 space-y-2.5">
        {SAMPLE_RUN.map(({ at, icon: Icon, label, text, tone }, i) => (
          <motion.li
            key={at + label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.3 + i * 0.08, ease: EASE }}
            className="grid grid-cols-[64px_16px_72px_1fr] items-center gap-2 text-[12.5px]"
          >
            <span className="font-mono text-[11.5px] text-muted tabular">{at}</span>
            <Icon size={14} strokeWidth={1.75} className={tone || 'text-muted'} aria-hidden />
            <span className="text-muted">{label}</span>
            <span className="text-ink truncate" title={text}>{text}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

function BrandPanel() {
  return (
    <section className="hidden lg:flex flex-col justify-between gap-10 p-12 xl:p-16 bg-sunken dot-grid border-r border-line" aria-label="About Aegis">
      <div className="flex items-center gap-2">
        <ShieldCheck size={20} strokeWidth={2} className="text-accent" aria-hidden />
        <span className="font-semibold tracking-tight text-[16px]">Aegis</span>
        <span className="text-[12.5px] text-muted">by Team Endgame</span>
      </div>

      <div className="max-w-[520px]">
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="text-[30px] leading-[1.2] font-semibold tracking-tight text-balance"
        >
          From first alert to verified fix, with a human on every risky call.
        </motion.h2>
        <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
          Aegis reads PayFlow's logs, deploys, metrics and past incidents, names the likely cause with its evidence,
          asks before it acts, and checks that the fix actually worked.
        </p>
        <div className="mt-8">
          <SampleRun />
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-6 max-w-[520px]">
        {[
          ['8/8', 'root causes found in the benchmark'],
          ['7/8', 'rule baseline, fooled by the misleading alert'],
          ['37/37', 'evidence facts traced to tool output'],
        ].map(([value, label]) => (
          <div key={label}>
            <dt className="sr-only">{label}</dt>
            <dd className="text-[20px] font-semibold tabular text-ink">{value}</dd>
            <dd className="mt-0.5 text-[12px] leading-snug text-muted">{label}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

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

  const input = 'w-full h-10 px-3 rounded-card border border-line bg-surface text-[14px] transition-colors hover:border-muted/50 focus:border-accent';

  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <BrandPanel />

      <main className="relative flex flex-col items-center justify-center p-6 sm:p-10">
        <ThemeToggle className="absolute top-4 right-4" />

        <motion.form
          onSubmit={submit}
          aria-labelledby="login-title"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="w-full max-w-[380px]"
        >
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <ShieldCheck size={20} strokeWidth={2} className="text-accent" aria-hidden />
            <span className="font-semibold tracking-tight text-[16px]">Aegis</span>
            <span className="text-[12.5px] text-muted">the AI incident response agent</span>
          </div>

          <h1 id="login-title" className="text-[24px] font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-[13.5px] text-muted leading-relaxed">
            On call for PayFlow. Approvers can approve fixes; responders investigate and use the Fault Lab.
          </p>
          {notice && <p role="status" className="mt-4 px-3 py-2 rounded-card bg-sunken border border-line text-[12.5px] text-ink">{notice}</p>}

          <label htmlFor="username" className="mt-6 block text-[13px] font-medium">Username</label>
          <input id="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} className={`mt-1.5 ${input}`} required />

          <label htmlFor="password" className="mt-4 block text-[13px] font-medium">Password</label>
          <div className="relative mt-1.5">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${input} pr-10`}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 w-10 grid place-items-center text-muted hover:text-ink cursor-pointer rounded-r-card"
            >
              {showPassword ? <EyeOff size={16} strokeWidth={1.75} aria-hidden /> : <Eye size={16} strokeWidth={1.75} aria-hidden />}
            </button>
          </div>

          {error && <p role="alert" className="mt-3 text-[13px] text-danger">{error}</p>}

          <Button type="submit" variant="primary" icon={LogIn} busy={busy} className="mt-5 w-full h-10">Sign in</Button>

          <fieldset className="mt-8">
            <legend className="w-full flex items-center gap-3 text-[12px] text-muted">
              Demo accounts
              <span aria-hidden className="flex-1 h-px bg-line" />
            </legend>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map((a) => {
                const picked = username === a.username;
                return (
                  <button
                    key={a.username}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => { setUsername(a.username); setPassword(DEMO_PASSWORD); setError(null); }}
                    className={`text-left px-3 py-2.5 rounded-card border transition-colors cursor-pointer ${picked ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-sunken'}`}
                  >
                    <span className="block text-[13px] font-medium">{a.username}</span>
                    <span className={`block text-[11.5px] ${picked ? 'text-accent' : 'text-muted'}`}>{a.role}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 text-[12px] text-muted leading-relaxed">Picking one fills the form. Approvers can approve fixes; the responder cannot.</p>
          </fieldset>
        </motion.form>
      </main>
    </div>
  );
}
