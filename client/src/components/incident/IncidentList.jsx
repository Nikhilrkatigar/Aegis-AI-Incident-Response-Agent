import { NavLink } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { useLive } from '../../lib/live';
import { ago } from '../../lib/format';
import { StatusPill, SeverityTag } from '../ui/Pill';
import { Loading, Empty, ErrorState } from '../ui/States';

export function IncidentList() {
  const { incidents, incidentsError, loadIncidents } = useLive();

  if (incidentsError && !incidents) return <ErrorState message={incidentsError} onRetry={loadIncidents} />;
  if (!incidents) return <Loading label="Loading incidents" rows={6} />;
  if (!incidents.length) {
    return (
      <Empty icon={FlaskConical} title="No incidents yet" action={<NavLinkButton />}>
        PayFlow is healthy. Break something in the Fault Lab and Aegis will pick up the alert.
      </Empty>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {incidents.map((i) => (
        <li key={i._id}>
          <NavLink
            to={`/incidents/${i._id}`}
            className={({ isActive }) => `block px-4 py-3 transition-colors ${isActive ? 'bg-accent-soft/60' : 'hover:bg-sunken/60'}`}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12.5px] text-ink">{i.number}</span>
              <SeverityTag severity={i.severity} />
              <span className="ml-auto text-[12px] text-muted tabular">{ago(i.openedAt)}</span>
            </div>
            <p className="mt-1 text-[13px] leading-snug line-clamp-2">{i.title}</p>
            <div className="mt-1.5">
              <StatusPill status={i.status} />
            </div>
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function NavLinkButton() {
  return (
    <NavLink to="/lab" className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-card bg-accent text-on-accent text-[13px] font-medium">
      <FlaskConical size={15} strokeWidth={1.75} aria-hidden />
      Open Fault Lab
    </NavLink>
  );
}
