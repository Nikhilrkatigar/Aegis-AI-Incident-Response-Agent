import { useState } from 'react';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { api } from '../../lib/api';
import { useOnCall } from '../../lib/oncall';
import { Button } from '../ui/Button';

// Mid-run input: anything typed here reaches the agent before its next step.
export function NoteBox({ incident }) {
  const { person } = useOnCall();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const live = incident.status === 'investigating';

  const send = async (e) => {
    e.preventDefault();
    if (text.trim().length < 3) return;
    setBusy(true);
    try {
      const { delivered } = await api.post(`/incidents/${incident._id}/notes`, { author: person, text: text.trim() });
      toast.success(delivered ? 'Sent. The agent will read it before its next step.' : 'Saved to the incident timeline.');
      setText('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} className="flex gap-2 items-center">
      <label htmlFor="agent-note" className="sr-only">Tell Aegis something</label>
      <input
        id="agent-note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        placeholder={live ? 'Tell Aegis something it can’t see, e.g. “Support says only iOS users are affected”' : 'Add a note to the timeline'}
        className="flex-1 h-9 px-3 rounded-card border border-line bg-surface text-[13px] placeholder:text-muted/80"
      />
      <Button type="submit" icon={Send} busy={busy} disabled={text.trim().length < 3}>Send</Button>
    </form>
  );
}
