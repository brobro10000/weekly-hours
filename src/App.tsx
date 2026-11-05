import { useEffect, useRef, useState } from 'react';
import { DayPicker } from '@daypicker/react';
import { Button, IconButton, Tooltip } from '@radix-ui/themes';
import {
  addDays, dateKey, expectedMinutes, formatDelta, formatMinutes, holidaysForYear, holidaysOn,
  parseDateKey, parseHours, startOfWeek, summarizeWeek, weekDays,
} from './lib/time';
import { loadEntries, saveEntries, STORAGE_KEY } from './lib/storage';

function Icon({ name }: { name: 'left' | 'right' | 'calendar' | 'close' | 'check' | 'arrow' | 'lock' }) {
  const paths = {
    left: 'm14 6-6 6 6 6', right: 'm10 6 6 6-6 6', close: 'm6 6 12 12M6 18 18 6',
    check: 'm5 12 4 4L19 6', arrow: 'M7 17 17 7M7 7h10v10',
    calendar: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z',
    lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5Z',
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

const fullDate = (date: Date) => date.toLocaleDateString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
});
const shortDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const tone = (delta: number) => delta < 0 ? 'negative' : delta > 0 ? 'positive' : 'neutral';
const hoursText = (minutes: number | undefined) => minutes === undefined ? '' : String(Number((minutes / 60).toFixed(2)));

export default function App() {
  const [initial] = useState(loadEntries);
  const [entries, setEntries] = useState(initial.entries);
  const [storageError, setStorageError] = useState(initial.error);
  const [writable, setWritable] = useState(initial.writable);
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [month, setMonth] = useState(week);
  const calendarDialog = useRef<HTMLDialogElement>(null);
  const calendarTrigger = useRef<HTMLButtonElement>(null);
  const pendingEntries = useRef<Record<string, number | null>>({});
  const days = weekDays(week);
  const summary = summarizeWeek(week, entries);
  const hasEntries = days.some(day => entries[dateKey(day)] !== undefined);
  const today = dateKey(new Date());
  const isThisWeek = dateKey(week) === dateKey(startOfWeek(new Date()));
  const monthHolidays = holidaysForYear(month.getFullYear())
    .filter(holiday => parseDateKey(holiday.date).getMonth() === month.getMonth());

  useEffect(() => {
    if (calendarOpen) calendarDialog.current?.showModal();
    else if (calendarDialog.current?.open) calendarDialog.current.close();
  }, [calendarOpen]);

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      const latest = loadEntries();
      if (latest.writable) {
        const next = { ...latest.entries };
        for (const [key, value] of Object.entries(pendingEntries.current)) {
          if (value === null) delete next[key];
          else next[key] = value;
        }
        setEntries(next);
      }
      if (!Object.keys(pendingEntries.current).length || latest.error) setStorageError(latest.error);
      setWritable(latest.writable);
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  function updateEntry(key: string, value: string) {
    setDrafts(current => ({ ...current, [key]: value }));
    try {
      const minutes = parseHours(value);
      setErrors(current => ({ ...current, [key]: '' }));
      // Merge with the latest saved entries so another tab's edits are not lost.
      const latest = writable ? loadEntries() : null;
      const next = { ...(latest?.writable ? latest.entries : entries) };
      pendingEntries.current[key] = minutes;
      for (const [pendingKey, pendingValue] of Object.entries(pendingEntries.current)) {
        if (pendingValue === null) delete next[pendingKey];
        else next[pendingKey] = pendingValue;
      }
      setEntries(next);
      if (writable && latest?.writable) {
        const error = saveEntries(next);
        setStorageError(error);
        if (!error) pendingEntries.current = {};
      }
      else if (latest && !latest.writable) {
        setWritable(false);
        setStorageError(latest.error);
      }
    } catch {
      setErrors(current => ({ ...current, [key]: 'Enter a number from 0 to 24, like 6.5.' }));
    }
  }

  function changeWeek(next: Date) {
    setWeek(startOfWeek(next));
    setDrafts({});
    setErrors({});
  }

  function closeCalendar() {
    setCalendarOpen(false);
    calendarTrigger.current?.focus();
  }

  const balance = summary.delta === 0 ? 'On target'
    : `${formatMinutes(Math.abs(summary.delta))} ${summary.delta < 0 ? 'remaining' : 'over target'}`;

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="./">
          <span className="brand-icon" aria-hidden="true"><i /><i /><i /></span>
          <span>weekly<span className="brand-light">hours</span><span className="brand-dot">.</span></span>
        </a>
        <span className={`save-status ${storageError ? 'save-error' : ''}`}>
          <span className="status-dot" />{storageError ? 'Not saved' : 'Saved on this device'}
        </span>
      </header>

      <main>
        <div className="page-heading"><div><p className="eyebrow">MAKE YOUR TIME COUNT</p>
          <h1>Your week, at a glance.</h1><p className="subtitle">Log your hours. Know where you stand.</p></div>
        </div>

        {storageError && <p className="storage-error" role="alert">{storageError}</p>}

        <div className="week-toolbar">
          <div className="week-navigation">
            <IconButton variant="ghost" color="gray" className="icon-button" aria-label="Previous week"
              onClick={() => changeWeek(addDays(week, -7))}><Icon name="left" /></IconButton>
            <button className="week-picker" ref={calendarTrigger} aria-haspopup="dialog" aria-expanded={calendarOpen}
              onClick={() => { setMonth(week); setCalendarOpen(true); }}>
              <Icon name="calendar" /><span>{shortDate(days[0])} – {shortDate(days[6])}</span>
              <span className="week-year">{days[6].getFullYear()}</span>
            </button>
            <IconButton variant="ghost" color="gray" className="icon-button" aria-label="Next week"
              onClick={() => changeWeek(addDays(week, 7))}><Icon name="right" /></IconButton>
          </div>
          <Button variant="soft" className="today-button" disabled={isThisWeek}
            onClick={() => changeWeek(new Date())}>This week</Button>
        </div>

        <div className="workspace">
          <section className="timesheet" aria-label="Daily hours">
            <div className="table-heading" aria-hidden="true"><span>DAY</span><span>HOURS</span><span>BALANCE</span></div>
            <div className="day-list">
              {days.map(day => {
                const key = dateKey(day);
                const expected = expectedMinutes(day);
                const value = entries[key];
                const difference = value === undefined ? null : value - expected;
                const holidays = holidaysOn(day);
                const weekend = day.getDay() === 0 || day.getDay() === 6;
                const isToday = key === today;
                const errorId = `error-${key}`;
                const balanceId = `balance-${key}`;
                return <div className={`day-row ${isToday ? 'is-today' : ''} ${weekend ? 'is-weekend' : ''}`} key={key}>
                  <div className="day-info">
                    <label htmlFor={`hours-${key}`} className="day-label">
                      {day.toLocaleDateString('en-US', { weekday: 'long' })}
                      {isToday && <span className="today-tag">Today</span>}
                    </label>
                    <span className="day-detail"><span>{shortDate(day)}</span>
                      {holidays.length > 0 ? <span className="holiday-label">{holidays.map(h => h.name
                        + (h.observed ? ' (observed)' : '')).join(', ')}</span>
                        : <span className="expected-label">{expected ? '8h expected' : 'No hours expected'}</span>}
                    </span>
                  </div>
                  <div className="hours-cell">
                    <div className={`input-wrap ${errors[key] ? 'input-error' : ''}`}>
                      <input id={`hours-${key}`} aria-label={`${fullDate(day)} hours`} type="text" inputMode="decimal"
                        autoComplete="off" spellCheck={false} placeholder="—" value={drafts[key] ?? hoursText(value)}
                        aria-invalid={!!errors[key]} aria-describedby={`${balanceId}${errors[key] ? ` ${errorId}` : ''}`}
                        onChange={event => updateEntry(key, event.target.value)}
                        onBlur={() => { if (!errors[key]) setDrafts(current => {
                          const next = { ...current }; delete next[key]; return next;
                        }); }} />
                      <span aria-hidden="true">h</span>
                    </div>
                  </div>
                  <output id={balanceId} className={`day-balance ${difference === null ? 'empty' : tone(difference)}`}
                    htmlFor={`hours-${key}`} aria-live="polite">
                    {difference === null ? <span aria-label="No hours entered">—</span>
                      : difference === 0 ? <><Icon name="check" /><span>On target</span></> : formatDelta(difference)}
                  </output>
                  {errors[key] && <p id={errorId} className="field-error" role="alert">{errors[key]}</p>}
                </div>;
              })}
            </div>
            <div className="timesheet-note"><span className="tiny-dot" />Decimal hours work here. 6.5 = 6h 30m.</div>
          </section>

          <aside className="weekly-summary" aria-labelledby="summary-heading">
            <p className="eyebrow" id="summary-heading">WEEKLY TOTAL</p>
            <div className="total-number" aria-label={`${formatMinutes(summary.total)} logged`}>
              {formatMinutes(summary.total)}</div>
            <p className="target-caption">of <strong>{formatMinutes(summary.expected)}</strong> expected</p>
            <div className={`weekly-balance ${hasEntries ? tone(summary.delta) : 'not-started'}`} role="status">
              <span className="balance-symbol" aria-hidden="true">{summary.delta === 0 ? '✓' : summary.delta > 0 ? '+' : '−'}</span>
              <span>{balance}</span>
            </div>
            <div className="week-graphic" aria-label="Hours by day">
              {days.map(day => {
                const minutes = entries[dateKey(day)];
                const expected = expectedMinutes(day);
                const maxMinutes = Math.max(600, ...days.map(d => entries[dateKey(d)] ?? 0));
                const description = `${day.toLocaleDateString('en-US', { weekday: 'long' })}: `
                  + `${minutes === undefined ? 'no hours entered' : `${formatMinutes(minutes)} logged`}, `
                  + `${formatMinutes(expected)} expected`;
                return <Tooltip key={dateKey(day)} content={description}>
                  <div className="graphic-day" tabIndex={0} role="img" aria-label={description}>
                    <div className={`graphic-track ${expected === 0 ? 'no-target' : ''}`}>
                      {expected > 0 && <span className="graphic-target" style={{ bottom: `${expected / maxMinutes * 100}%` }} />}
                      <span className={`graphic-fill ${minutes === undefined ? 'empty' : tone(minutes - expected)}`}
                        style={{ height: `${(minutes ?? 0) / maxMinutes * 100}%` }} />
                    </div>
                    <span className="graphic-label" aria-hidden="true">{day.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
                  </div>
                </Tooltip>;
              })}
            </div>
            <div className="summary-divider" />
            <dl className="summary-details"><div><dt>Standard week</dt><dd>40h</dd></div>
              <div><dt>Holiday adjustment</dt><dd>{summary.holidayDays ? `−${summary.holidayDays * 8}h` : '—'}</dd></div>
              <div className="adjusted-target"><dt>Your target</dt><dd>{formatMinutes(summary.expected)}</dd></div>
            </dl>
            <div className="summary-footnote"><Icon name="calendar" /><p>US federal holidays adjust your target.
              You can log hours on any day.</p></div>
          </aside>
        </div>

        <div className="under-workspace"><div className="legend" aria-label="Balance color key">
          <span><i className="legend-dot negative-dot" />Below target</span>
          <span><i className="legend-dot positive-dot" />Above target</span>
        </div><span className="week-convention">Monday–Sunday · 8h per workday</span></div>
      </main>

      <footer><span><Icon name="lock" />Your hours stay in this browser. No sign-in.</span>
        <a href="https://github.com/brobro10000/weekly-hours" target="_blank" rel="noreferrer">View on GitHub <Icon name="arrow" /></a>
      </footer>

      <dialog className="calendar-dialog" ref={calendarDialog} aria-labelledby="calendar-title"
        onCancel={closeCalendar} onClose={() => { setCalendarOpen(false); calendarTrigger.current?.focus(); }}
        onClick={event => { if (event.target === event.currentTarget) closeCalendar(); }}>
        {calendarOpen && <div className="calendar-content">
          <div className="dialog-heading"><h2 id="calendar-title">Choose a week</h2>
            <button className="icon-button" aria-label="Close calendar" onClick={closeCalendar}><Icon name="close" /></button>
          </div>
          <p className="dialog-subtitle">Select any day to jump to its week.</p>
          <DayPicker mode="single" selected={week} month={month} onMonthChange={setMonth} weekStartsOn={1}
            showOutsideDays autoFocus onSelect={selected => { if (selected) { changeWeek(selected); closeCalendar(); } }}
            modifiers={{ holiday: date => holidaysOn(date).length > 0,
              activeWeek: { from: days[0], to: days[6] } }}
            modifiersClassNames={{ holiday: 'calendar-holiday', activeWeek: 'calendar-active-week' }}
            labels={{ labelDayButton: date => `${fullDate(date)}${holidaysOn(date).map(h => `, ${h.name}${h.observed ? ' observed' : ''}`).join('')}` }}
          />
          <div className="calendar-holidays"><h3>US HOLIDAYS THIS MONTH</h3>
            {monthHolidays.length ? <ul>{monthHolidays.map(holiday => <li key={`${holiday.date}-${holiday.name}`}>
              <time dateTime={holiday.date}>{shortDate(parseDateKey(holiday.date))}</time>
              <span>{holiday.name}{holiday.observed && <small>Observed</small>}</span>
            </li>)}</ul> : <p>No federal holidays this month.</p>}
          </div>
        </div>}
      </dialog>
    </div>
  );
}
