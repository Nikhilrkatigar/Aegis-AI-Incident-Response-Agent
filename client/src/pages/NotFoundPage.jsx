import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogIn, SearchX, ShieldCheck, Siren } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Button } from '../components/ui/Button';
import { ThemeToggle } from '../components/ThemeToggle';

// Written like one of Aegis's own diagnoses, because that is the voice of the product.
export default function NotFoundPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="h-14 px-5 flex items-center gap-2 border-b border-line bg-surface">
        <ShieldCheck size={18} strokeWidth={2} className="text-accent" aria-hidden />
        <span className="font-semibold tracking-tight text-[15px]">Aegis</span>
        <ThemeToggle className="ml-auto" />
      </header>

      <main className="flex-1 grid place-items-center p-6">
        <div className="w-full max-w-[520px]">
          <p className="font-mono text-[12.5px] text-muted tabular">HTTP 404</p>
          <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-tight">This page doesn't exist</h1>

          <div className="mt-6 panel">
            <div className="px-4 h-10 flex items-center gap-2 border-b border-line text-[12.5px]">
              <SearchX size={14} strokeWidth={1.75} className="text-warn" aria-hidden />
              <span className="font-medium">Diagnosis</span>
              <span className="ml-auto text-muted">route lookup</span>
            </div>
            <dl className="px-4 py-3 grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-[13px]">
              <dt className="text-muted">Requested</dt>
              <dd className="font-mono text-[12.5px] text-ink break-all">{pathname}</dd>
              <dt className="text-muted">Cause</dt>
              <dd className="text-ink">No route matches this address. The link may be mistyped or out of date.</dd>
              <dt className="text-muted">Action</dt>
              <dd className="text-ink">None taken. Nothing was changed on PayFlow.</dd>
            </dl>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              to={user ? '/incidents' : '/login'}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-card bg-accent text-on-accent border border-accent hover:bg-accent-hover hover:border-accent-hover font-medium transition-colors"
            >
              {user ? <Siren size={15} strokeWidth={1.75} aria-hidden /> : <LogIn size={15} strokeWidth={1.75} aria-hidden />}
              {user ? 'Go to incidents' : 'Go to sign in'}
            </Link>
            <Button icon={ArrowLeft} onClick={() => navigate(-1)}>Go back</Button>
          </div>
        </div>
      </main>
    </div>
  );
}
