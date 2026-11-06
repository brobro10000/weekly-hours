import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@radix-ui/themes';
import { formatClock, parseClock, validateEvent } from '../lib/schedule';
import { formatMinutes, parseDateKey, parseHours } from '../lib/time';
import type { EditScope, TimeCategory, TimeEvent } from '../lib/schedule-types';
import './DayTimeline.css';

type DayTimelineProps = {
  date: string;
  events: TimeEvent[];
  legacyMinutes: number | undefined;
  onSave: (event: TimeEvent, occurrenceDate?: string, scope?: EditScope) => string | null;
  onDelete: (id: string, date: string, scope: EditScope) => string | null;
  onLegacyChange: (minutes: number | null) => string | null;
};

const categories: { value: TimeCategory; label: string; detail: string }[] = [
  { value: 'counted', label: 'Counted', detail: 'Toward your weekly target' },
  { value: 'related', label: 'Related', detail: 'Work-related, not counted' },
  { value: 'away', label: 'Away from desk', detail: 'Not counted' },
];
const weekdays = [
  { day: 1, short: 'M', label: 'Monday' }, { day: 2, short: 'T', label: 'Tuesday' },
  { day: 3, short: 'W', label: 'Wednesday' }, { day: 4, short: 'T', label: 'Thursday' },
  { day: 5, short: 'F', label: 'Friday' }, { day: 6, short: 'S', label: 'Saturday' },
  { day: 0, short: 'S', label: 'Sunday' },
];
const categoryName = (category: TimeCategory) => categories.find(item => item.value === category)!.label;
const hoursText = (minutes: number | undefined) => minutes === undefined ? '' : String(Number((minutes / 60).toFixed(2)));

function recurrenceText(event: TimeEvent) {
  if (!event.recurrence) return null;
  const days = weekdays.filter(item => event.recurrence!.weekdays.includes(item.day)).map(item => item.label.slice(0, 3));
  return `${event.recurrence.intervalWeeks === 1 ? 'Weekly' : `Every ${event.recurrence.intervalWeeks} weeks`} · ${days.join(', ')}`;
}

export default function DayTimeline({ date, events, legacyMinutes, onSave, onDelete, onLegacyChange }: DayTimelineProps) {
  const id = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const deletionHeading = useRef<HTMLHeadingElement>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TimeEvent | null>(null);
  const [deleting, setDeleting] = useState<TimeEvent | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TimeCategory>('counted');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [eventDate, setEventDate] = useState(date);
  const [repeat, setRepeat] = useState(false);
  const [interval, setInterval] = useState('1');
  const [repeatDays, setRepeatDays] = useState<number[]>([parseDateKey(date).getDay()]);
  const [until, setUntil] = useState('');
  const [scope, setScope] = useState<EditScope>('occurrence');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [legacyDraft, setLegacyDraft] = useState(hoursText(legacyMinutes));
  const [legacyError, setLegacyError] = useState<string | null>(null);
  const legacyFocused = useRef(false);
  const singleOccurrence = Boolean(editing?.recurrence) && scope === 'occurrence';
  const totals = events.reduce((result, event) => {
    result[event.category] += event.end - event.start;
    return result;
  }, { counted: legacyMinutes ?? 0, related: 0, away: 0 });

  useEffect(() => {
    if (formOpen) titleInput.current?.focus();
  }, [formOpen, editing?.id]);

  useEffect(() => {
    if (deleting) deletionHeading.current?.focus();
  }, [deleting]);

  useEffect(() => {
    if (!legacyFocused.current) setLegacyDraft(hoursText(legacyMinutes));
  }, [legacyMinutes]);

  function returnFocus() {
    requestAnimationFrame(() => addButton.current?.focus());
  }

  function closeEditor() {
    setFormOpen(false);
    setEditing(null);
    setDeleting(null);
    setError(null);
    returnFocus();
  }

  function openEditor(event?: TimeEvent) {
    setEditing(event ?? null);
    setDeleting(null);
    setTitle(event?.title ?? '');
    setCategory(event?.category ?? 'counted');
    const freeStart = events.length ? Math.min(1380, Math.max(...events.map(item => item.end))) : 540;
    setStart(formatClock(event?.start ?? freeStart));
    setEnd(formatClock(event?.end ?? Math.min(freeStart + 60, 1440)));
    setEventDate(event?.date ?? date);
    setRepeat(Boolean(event?.recurrence));
    setInterval(String(event?.recurrence?.intervalWeeks ?? 1));
    setRepeatDays(event?.recurrence?.weekdays ?? [parseDateKey(date).getDay()]);
    setUntil(event?.recurrence?.until ?? '');
    setScope('occurrence');
    setError(null);
    setNotice('');
    setFormOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startMinutes = parseClock(start.trim());
    const endMinutes = parseClock(end.trim());
    if (startMinutes === null || endMinutes === null) {
      setError('Use 24-hour times like 09:00 and 17:30. Midnight at the end of the day is 24:00.');
      return;
    }
    const candidate: TimeEvent = {
      id: editing?.id ?? crypto.randomUUID(),
      title: title.trim() || categoryName(category),
      category,
      date: singleOccurrence || (!repeat && !editing?.recurrence) ? date : eventDate,
      start: startMinutes,
      end: endMinutes,
      recurrence: repeat && !singleOccurrence
        ? { weekdays: [...repeatDays], intervalWeeks: Number(interval), until: until || null } : null,
      excludedDates: repeat && !singleOccurrence ? editing?.excludedDates ?? [] : [],
    };
    const problem = validateEvent(candidate) || onSave(candidate, editing?.recurrence ? date : undefined, scope);
    if (problem) { setError(problem); return; }
    setNotice(`${candidate.title} saved.`);
    closeEditor();
  }

  function confirmDelete() {
    if (!deleting) return;
    const problem = onDelete(deleting.id, date, scope);
    if (problem) { setError(problem); return; }
    setNotice(deleting.recurrence && scope === 'occurrence' ? 'Occurrence removed.' : 'Event removed.');
    closeEditor();
  }

  function updateLegacy(clear = false) {
    try {
      const problem = onLegacyChange(clear ? null : parseHours(legacyDraft));
      if (problem) { setLegacyError(problem); return; }
      setLegacyError(null);
      setNotice(clear ? 'Earlier logged hours cleared.' : 'Earlier logged hours updated.');
      if (clear) returnFocus();
    } catch {
      setLegacyError('Enter decimal hours from 0 to 24, such as 6.5, or clear this earlier total.');
    }
  }

  return <div className="day-timeline" onKeyDown={event => {
    if (event.key === 'Escape' && (formOpen || deleting)) { event.preventDefault(); closeEditor(); }
  }}>
    <div className="timeline-heading">
      <div><h2>A full view of your day</h2><p>00:00–24:00 · Only green time counts toward your target.</p></div>
      <Button size="1" variant="soft" ref={addButton} onClick={() => openEditor()} aria-expanded={formOpen && !editing}>
        <span aria-hidden="true">+</span> Add event
      </Button>
    </div>

    <div className="timeline-scroll">
      <div className="timeline-visual" aria-hidden="true">
        <div className="timeline-ruler">{[0, 3, 6, 9, 12, 15, 18, 21, 24].map(hour =>
          <span key={hour} style={{ left: `${hour / 24 * 100}%` }}>{String(hour).padStart(2, '0')}:00</span>)}</div>
        <div className="timeline-track">
          {Array.from({ length: 25 }, (_, hour) => <span className="timeline-hour-mark" key={hour}
            style={{ left: `${hour / 24 * 100}%` }} />)}
          {events.map(event => <button key={event.id} tabIndex={-1} type="button"
            className={`timeline-block category-${event.category}`}
            style={{ left: `${event.start / 1440 * 100}%`, width: `${(event.end - event.start) / 1440 * 100}%` }}
            title={`${event.title} · ${formatClock(event.start)}–${formatClock(event.end)} · ${categoryName(event.category)}`}
            onClick={() => openEditor(event)}><span>{event.title}</span></button>)}
        </div>
      </div>
    </div>

    <dl className="timeline-totals" aria-label="Time categories">
      {categories.map(item => <div key={item.value} className={`category-${item.value}`}>
        <dt><span className="category-dot" aria-hidden="true" />{item.label}</dt><dd>{formatMinutes(totals[item.value])}</dd>
      </div>)}
    </dl>

    {events.length === 0 ? <p className="timeline-empty">No time blocks yet. Add an event to shape your day.</p>
      : <ul className="timeline-event-list" aria-label="Events for this day">
        {events.map(event => <li key={event.id} className={`timeline-event category-${event.category}`}>
          <span className="event-category-bar" aria-hidden="true" />
          <div className="event-information"><span className="event-title">{event.title}</span>
            <span className="event-meta">{formatClock(event.start)}–{formatClock(event.end)}
              <span aria-hidden="true"> · </span>{categoryName(event.category)}
              <span aria-hidden="true"> · </span>{formatMinutes(event.end - event.start)}</span>
            {event.recurrence && <span className="event-repeat"><span aria-hidden="true">↻ </span>{recurrenceText(event)}</span>}
          </div>
          <div className="event-actions">
            <button type="button" aria-label={`Edit ${event.title}`} onClick={() => openEditor(event)}>Edit</button>
            <button type="button" aria-label={`Delete ${event.title}`} onClick={() => {
              setDeleting(event); setScope('occurrence'); setFormOpen(false); setError(null); setNotice('');
            }}>Delete</button>
          </div>
        </li>)}
      </ul>}

    {formOpen && <form className="event-form" onSubmit={submit} aria-labelledby={`${id}-form-heading`} noValidate>
      <div className="event-form-heading"><h3 id={`${id}-form-heading`}>{editing ? 'Edit event' : 'New event'}</h3>
        <span>Times use a 24-hour clock</span></div>

      {editing?.recurrence && <fieldset className="scope-options"><legend>Apply changes to</legend>
        <label><input type="radio" name={`${id}-scope`} value="occurrence" checked={scope === 'occurrence'}
          onChange={() => setScope('occurrence')} />This occurrence</label>
        <label><input type="radio" name={`${id}-scope`} value="series" checked={scope === 'series'}
          onChange={() => setScope('series')} />Entire series</label>
        {scope === 'series' && <p>Updates the repeating schedule, including earlier dates.
          Individually edited occurrences keep their changes.</p>}
      </fieldset>}

      <label className="timeline-field" htmlFor={`${id}-title`}>Event title <span className="optional-label">(optional)</span>
        <input ref={titleInput} id={`${id}-title`} value={title} maxLength={100} placeholder="What are you working on?"
          onChange={event => setTitle(event.target.value)} />
      </label>

      <fieldset className="category-options"><legend>Time category</legend><div>
        {categories.map(item => <label key={item.value}
          className={`category-choice category-${item.value} ${category === item.value ? 'selected' : ''}`}>
          <input type="radio" name={`${id}-category`} checked={category === item.value} value={item.value}
            onChange={() => setCategory(item.value)} />
          <span><strong>{item.label}</strong><small>{item.detail}</small></span>
        </label>)}
      </div></fieldset>

      <div className="time-fields">
        <label className="timeline-field" htmlFor={`${id}-start`}>Start time
          <input id={`${id}-start`} type="text" inputMode="text" placeholder="09:00" autoComplete="off"
            value={start} onChange={event => setStart(event.target.value)} aria-describedby={`${id}-clock-help`} />
        </label>
        <span className="time-fields-arrow" aria-hidden="true">→</span>
        <label className="timeline-field" htmlFor={`${id}-end`}>End time
          <input id={`${id}-end`} type="text" inputMode="text" placeholder="17:00" autoComplete="off"
            value={end} onChange={event => setEnd(event.target.value)} aria-describedby={`${id}-clock-help`} />
        </label>
      </div>
      <p className="form-help" id={`${id}-clock-help`}>For example, 09:00–17:30. Use 24:00 for the end of the day.
        Split overnight work across two days.</p>

      {!singleOccurrence && <div className="repeat-settings">
        <label className="repeat-toggle"><input type="checkbox" checked={repeat}
          onChange={event => {
            setRepeat(event.target.checked);
            if (!event.target.checked && !editing?.recurrence) setEventDate(date);
          }} />Repeat weekly</label>
        {!repeat && editing?.recurrence && <label className="timeline-field" htmlFor={`${id}-oneoff-date`}>Date
          <input id={`${id}-oneoff-date`} type="date" value={eventDate}
            onChange={event => setEventDate(event.target.value)} />
        </label>}
        {repeat && <div className="repeat-fields">
          <label className="timeline-field repeat-interval" htmlFor={`${id}-interval`}>Repeat every (weeks)
            <input id={`${id}-interval`} type="number" min="1" max="12" step="1" value={interval}
              onChange={event => setInterval(event.target.value)} />
          </label>
          <fieldset className="weekday-options"><legend>On these days</legend><div>
            {weekdays.map(item => <label key={item.day} className={repeatDays.includes(item.day) ? 'selected' : ''}>
              <input type="checkbox" aria-label={item.label} checked={repeatDays.includes(item.day)}
                onChange={() => setRepeatDays(current => current.includes(item.day)
                  ? current.filter(day => day !== item.day) : [...current, item.day])} />
              <span aria-hidden="true">{item.short}</span>
            </label>)}
          </div></fieldset>
          <div className="recurrence-date-fields">
            <label className="timeline-field" htmlFor={`${id}-date`}>Starts on
              <input id={`${id}-date`} type="date" value={eventDate} onChange={event => setEventDate(event.target.value)} />
            </label>
            <label className="timeline-field" htmlFor={`${id}-until`}>Ends on <span className="optional-label">(optional)</span>
              <input id={`${id}-until`} type="date" value={until} min={eventDate}
                onChange={event => setUntil(event.target.value)} />
            </label>
          </div>
          <p className="form-help">Leave the end date blank to keep repeating. Holidays stay included.</p>
        </div>}
      </div>}

      {error && <p className="timeline-error" role="alert">{error}</p>}
      <div className="event-form-actions"><Button type="submit" size="2">Save event</Button>
        <Button type="button" size="2" variant="ghost" color="gray" onClick={closeEditor}>Cancel</Button></div>
    </form>}

    {deleting && <div className="event-delete-panel" role="group" aria-labelledby={`${id}-delete-heading`}>
      <h3 id={`${id}-delete-heading`} ref={deletionHeading} tabIndex={-1}>Delete {deleting.title}?</h3>
      {deleting.recurrence ? <fieldset className="scope-options"><legend>Remove</legend>
        <label><input type="radio" name={`${id}-delete-scope`} checked={scope === 'occurrence'}
          onChange={() => setScope('occurrence')} />This occurrence</label>
        <label><input type="radio" name={`${id}-delete-scope`} checked={scope === 'series'}
          onChange={() => setScope('series')} />Entire series</label>
        {scope === 'series' && <p>This removes all occurrences, including earlier dates.</p>}
      </fieldset> : <p>This time block will be removed from the day.</p>}
      {error && <p className="timeline-error" role="alert">{error}</p>}
      <div className="event-form-actions"><Button size="2" color="red" onClick={confirmDelete}>Confirm delete</Button>
        <Button size="2" variant="ghost" color="gray" onClick={closeEditor}>Cancel</Button></div>
    </div>}

    {legacyMinutes !== undefined && <div className="legacy-hours">
      <div><h3>Earlier logged hours</h3><p>Kept in your counted total, without clock times.
        Clear these hours when replacing them with time blocks.</p></div>
      <div className="legacy-controls"><label className="timeline-field" htmlFor={`${id}-legacy`}>
        <span className="timeline-sr-only">Earlier logged hours</span>
        <input id={`${id}-legacy`} type="text" inputMode="decimal" value={legacyDraft}
          onFocus={() => { legacyFocused.current = true; }} onBlur={() => { legacyFocused.current = false; }}
          onChange={event => setLegacyDraft(event.target.value)} aria-invalid={Boolean(legacyError)}
          aria-describedby={legacyError ? `${id}-legacy-error` : undefined} />
      </label><span className="legacy-unit" aria-hidden="true">h</span>
        <Button size="1" variant="soft" onClick={() => updateLegacy()}>Update earlier hours</Button>
        <button type="button" className="legacy-clear" onClick={() => updateLegacy(true)}>Clear earlier hours</button>
      </div>
      {legacyError && <p id={`${id}-legacy-error`} className="timeline-error" role="alert">{legacyError}</p>}
    </div>}
    <p className="timeline-sr-only" role="status">{notice}</p>
  </div>;
}
