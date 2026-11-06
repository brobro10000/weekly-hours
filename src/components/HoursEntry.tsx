import { useState } from 'react';
import { parseHours } from '../lib/time';

type HoursEntryProps = {
  date: string;
  label: string;
  total?: number;
  description: string;
  onSave: (total: number | null) => string | null;
};

export default function HoursEntry({ date, label, total, description, onSave }: HoursEntryProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');
  const saved = total === undefined ? '' : String(Number((total / 60).toFixed(2)));
  const errorId = `hours-error-${date}`;

  function reset() {
    setDraft(null);
    setError('');
  }

  function save() {
    if (draft === null) return;
    try {
      const problem = onSave(parseHours(draft));
      if (problem) { setError(problem); return; }
      reset();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Enter decimal hours between 0 and 24.');
    }
  }

  return <>
    <div className="input-wrap">
      <input type="text" inputMode="decimal" enterKeyHint="done" aria-label={`Counted hours for ${label}`}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${errorId} ${description}` : description}
        placeholder="—" value={draft ?? saved} onChange={event => { setDraft(event.target.value); setError(''); }}
        onBlur={save} onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') { event.preventDefault(); save(); }
          if (event.key === 'Escape') { event.preventDefault(); reset(); }
        }} />
      <span aria-hidden="true">h</span>
    </div>
    {error && <p id={errorId} className="hours-error" role="alert">{error}</p>}
  </>;
}
