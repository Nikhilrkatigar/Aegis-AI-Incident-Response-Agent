import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Radar } from 'lucide-react';
import { useLive } from '../lib/live';
import { IncidentList } from '../components/incident/IncidentList';
import { IncidentHeader } from '../components/incident/IncidentHeader';
import { Trace } from '../components/incident/Trace';
import { Diagnosis } from '../components/incident/Diagnosis';
import { ApprovalCard } from '../components/incident/ApprovalCard';
import { Hypotheses } from '../components/incident/Hypotheses';
import { NoteBox } from '../components/incident/NoteBox';
import { ServiceHealth } from '../components/ServiceHealth';
import { Loading, Empty, ErrorState } from '../components/ui/States';

const OPEN = ['investigating', 'awaiting_approval', 'executing', 'verifying', 'needs_human'];

function PanelTitle({ children }) {
  return <h2 className="px-4 pt-4 pb-1 text-[12px] uppercase tracking-wide text-muted font-medium">{children}</h2>;
}

function IncidentDetail({ id }) {
  const { details, loadIncident } = useLive();
  const [error, setError] = useState(null);
  const data = details[id];

  useEffect(() => {
    setError(null);
    loadIncident(id).catch((e) => setError(e.message));
  }, [id, loadIncident]);

  if (error && !data) return <ErrorState message={error} onRetry={() => loadIncident(id).catch((e) => setError(e.message))} />;
  if (!data) return <Loading label="Loading incident" rows={8} />;

  const { incident, steps } = data;
  const working = ['investigating', 'executing', 'verifying'].includes(incident.status);
  return (
    <>
      <IncidentHeader incident={incident} stepCount={steps.length} />
      <div className="px-6 py-4 space-y-4">
        <Diagnosis incident={incident} />
        <section aria-labelledby="trace-title">
          <h2 id="trace-title" className="text-[12px] uppercase tracking-wide text-muted font-medium mb-1">Reasoning trace</h2>
          <Trace key={id} steps={steps} openedAt={incident.openedAt} />
          {working && (
            <p className="ml-[82px] py-2 text-[13px] text-muted" role="status">
              {incident.status === 'investigating' ? 'Agent is working…' : incident.status === 'verifying' ? 'Watching the services…' : 'Running the action…'}
            </p>
          )}
        </section>
        {OPEN.includes(incident.status) && <NoteBox incident={incident} />}
      </div>
    </>
  );
}

export default function IncidentsPage() {
  const { id } = useParams();
  const { incidents, details } = useLive();

  if (!id && incidents?.length) return <Navigate to={`/incidents/${incidents[0]._id}`} replace />;
  const current = id && details[id];

  return (
    <div className="grid grid-cols-[260px_1fr_340px] h-[calc(100vh-56px)]">
      <section className="border-r border-line overflow-y-auto" aria-label="Incidents">
        <PanelTitle>Incidents</PanelTitle>
        <IncidentList />
      </section>

      <section className="overflow-y-auto bg-surface min-w-0" aria-label="Incident detail">
        {id ? (
          <IncidentDetail id={id} />
        ) : (
          <Empty icon={Radar} title="Watching PayFlow">
            Alerts on error rate, latency and failed logins are checked every 5 seconds. When one fires, Aegis opens an incident here and starts investigating.
          </Empty>
        )}
      </section>

      <aside className="border-l border-line overflow-y-auto" aria-label="Context">
        {current && <ApprovalCard incident={current.incident} />}
        {current && (
          <>
            <PanelTitle>Hypotheses</PanelTitle>
            <Hypotheses steps={current.steps} mode={current.incident.mode} />
          </>
        )}
        <PanelTitle>Services · last 15 min</PanelTitle>
        <ServiceHealth />
      </aside>
    </div>
  );
}
