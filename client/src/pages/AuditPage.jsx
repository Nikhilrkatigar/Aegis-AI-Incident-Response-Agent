import { useCallback, useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { api } from '../lib/api';
import { Loading, Empty, ErrorState } from '../components/ui/States';

const fmt = (t) => new Date(t).toISOString().replace('T', ' ').slice(0, 19);

export default function AuditPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.get('/audit').then((d) => { setRows(d); setError(null); }).catch((e) => setError(e.message)), []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="max-w-6xl px-6 py-5">
      <h1 className="text-[18px] font-semibold">Audit log</h1>
      <p className="mt-1 text-[13px] text-muted">Every approval, rejection, executed action and lab change, newest first. Times in UTC.</p>
      <div className="mt-4 panel overflow-x-auto">
        {error && !rows && <ErrorState message={error} onRetry={load} />}
        {!rows && !error && <Loading label="Loading audit log" rows={8} />}
        {rows && !rows.length && <Empty icon={ScrollText} title="Nothing recorded yet">Approvals, actions and Fault Lab changes will show up here.</Empty>}
        {rows?.length > 0 && (
          <table className="w-full text-[13px]">
            <thead className="text-left text-[12px] text-muted border-b border-line">
              <tr>
                <th className="font-medium px-4 py-2">Time</th>
                <th className="font-medium px-4 py-2">Actor</th>
                <th className="font-medium px-4 py-2">Event</th>
                <th className="font-medium px-4 py-2">Incident</th>
                <th className="font-medium px-4 py-2">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r._id} className="align-top">
                  <td className="px-4 py-2 font-mono text-[12px] text-muted whitespace-nowrap tabular">{fmt(r.at)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{r.actor}</td>
                  <td className="px-4 py-2 font-mono text-[12px] whitespace-nowrap">{r.action}</td>
                  <td className="px-4 py-2 font-mono text-[12px] whitespace-nowrap">{r.incident || '—'}</td>
                  <td className="px-4 py-2 text-muted">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
