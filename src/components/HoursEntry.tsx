import { useId, useRef, useState } from 'react';
import { Button } from '@radix-ui/themes';
import { formatMinutes, parseHours } from '../lib/time';

type HoursEntryProps = {
  minutes?: number;
  countedBlockMinutes: number;
  inTimeline: boolean;
  onSave: (minutes: number | null) => string | null;
  onClear: () => void;
};

export default function HoursEntry({ minutes, countedBlockMinutes, inTimeline, onSave, onClear }: HoursEntryProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const saved = minutes === undefined ? '' : String(Number((minutes / 60).toFixed(2)));
  const label = inTimeline ? 'Hours without time blocks' : countedBlockMinutes ? 'Additional counted hours' : 'Counted hours';
  const hint = inTimeline ? 'Reduce these hours when you replace them with counted blocks.'
    : countedBlockMinutes ? `${formatMinutes(countedBlockMinutes)} already counted from time blocks. Enter any additional hours.`
    : 'Enter decimal hours, such as 6.5 for 6h 30m.';

  function save(value: string) {
    try {
      const next = parseHours(value);
      const problem = onSave(next);
      if (problem) { setError(problem); return; }
      setDraft(null);
      setError('');
      setNotice(next === null ? 'Hours cleared.' : `${formatMinutes(next)} counted.`);
      if (next === null) {
        if (inTimeline) onClear();
        else input.current?.focus();
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Enter hours from 0 to 24.');
    }
  }

  return <form className={`hours-entry ${inTimeline ? 'in-timeline' : ''}`} onSubmit={event => {
    event.preventDefault();
    save(draft ?? saved);
  }}>
    <label htmlFor={id}>{label}</label>
    <p className="hours-hint" id={`${id}-hint`}>{hint}</p>
    <div className="hours-controls">
      <div className="input-wrap"><input ref={input} id={id} type="text" inputMode="decimal" placeholder="0.0" value={draft ?? saved}
        aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ' ' + id + '-error' : ''}`}
        onChange={event => { setDraft(event.target.value); setError(''); setNotice(''); }} />
        <span aria-hidden="true">h</span></div>
      <Button size="2" variant="soft" type="submit">{inTimeline ? 'Update hours' : 'Save hours'}</Button>
      {minutes !== undefined && <button type="button" className="clear-hours" onClick={() => save('')}>Clear hours</button>}
    </div>
    {error && <p id={`${id}-error`} className="timeline-error" role="alert">{error}</p>}
    <span className="timeline-sr-only" role="status">{notice}</span>
  </form>;
}
