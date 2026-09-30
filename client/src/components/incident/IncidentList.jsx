import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { FlaskConical, Hand } from 'lucide-react';
import { useLive } from '../../lib/live';
import { ago } from '../../lib/format';
import { StatusPill, SeverityTag } from '../ui/Pill';
import { Loading, Empty, ErrorState } from '../ui/States';
import { SegmentedControl } from '../ui/SegmentedControl';

const OPEN = ['investigating', 'awaiting_approval', 'executing', 'verifying', 'needs_human'];
const FILTER_KEY = 'aegis.incidentFilter';
const FILTERS = {
  open: (i) => OPEN.includes(i.status),
  closed: (i) => !OPEN.includes(i.status),
  all: () => true,
};

function storedFilter() {
  try {
    return FILTERS[localStorage.getItem(FILTER_KEY)] ? localStorage.getItem(FILTER_KEY) : 'all';
  } catch {
    return 'all';
  }
}

export function IncidentList() {
  const { incidents, incidentsError, loadIncidents } = useLive();
  const [filter, setFilterState] = useState(storedFilter);
  const setFilter = (f) => {
    setFilterState(f);
    try { localStorage.setItem(FILTER_KEY, f); } catch { /* per-viewer convenience only */ }
  };

  if (incidentsError && !incidents) return <ErrorState message={incidentsError} onRetry={loadIncidents} />;
  if (!incidents) return <Loading label="Loading incidents" rows={6} />;
  if (!incidents.length) {
    return (
      <Empty icon={FlaskConical} title="No incidents yet" action={<NavLinkButton />}>
        PayFlow is healthy. Break something in the Fault Lab and Aegis will pick up the alert.
      </Empty>
    );
  }

  const shown = incidents.filter(FILTERS[filter]);
  const counts = Object.fromEntries(Object.keys(FILTERS).map((k) => [k, incidents.filter(FILTERS[k]).length]));

  return (
    <>
      <div className="px-4 pb-2">
        <SegmentedControl
          label="Filter incidents"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: 'Open', count: counts.open },
            { value: 'closed', label: 'Closed', count: counts.closed },
            { value: 'all', label: 'All', count: counts.all },
          ]}
        />
      </div>
      {!shown.length && (
        <p className="px-4 py-3 text-[13px] text-muted">{filter === 'open' ? 'Nothing open. PayFlow is quiet.' : 'No closed incidents yet.'}</p>
      )}
      <ul className="divide-y divide-line border-t border-line" role="tabpanel" aria-label={`${filter} incidents`}>
        {shown.map((i) => {
          const needsYou = i.status === 'awaiting_approval' || i.status === 'needs_human';
          return (
            <li key={i._id}>
              <NavLink
                to={`/incidents/${i._id}`}
                className={({ isActive }) => `block px-4 py-3 border-l-2 transition-colors ${needsYou ? 'border-l-warn' : 'border-l-transparent'} ${isActive ? 'bg-accent-soft/60' : 'hover:bg-sunken/60'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12.5px] text-ink">{i.number}</span>
                  <SeverityTag severity={i.severity} />
                  <span className="ml-auto text-[12px] text-muted tabular">{ago(i.openedAt)}</span>
                </div>
                <p className="mt-1 text-[13px] leading-snug line-clamp-2">{i.title}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <StatusPill status={i.status} />
                  {needsYou && <Hand size={13} strokeWidth={2} className="text-warn" aria-label="needs a human" />}
                </div>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </>
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
