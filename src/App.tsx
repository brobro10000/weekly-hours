import { useEffect, useRef, useState } from 'react';
import { DayPicker } from '@daypicker/react';
import { Button, IconButton, Switch, Tooltip } from '@radix-ui/themes';
import {
  addDays, dateKey, expectedMinutes, formatDelta, formatMinutes, holidaysForYear, holidaysOn,
  parseDateKey, startOfWeek, summarizeWeek, weekDays,
} from './lib/time';
import { dayTotals, eventsForDate, removeEvent, setDayCountedTotal, upsertEvent, validateSchedule } from './lib/schedule';
import { loadSchedule, saveSchedule, SCHEDULE_STORAGE_KEY } from './lib/schedule-storage';
import type { Schedule, TimeEvent } from './lib/schedule-types';
import { applyPatch, emptyPatch, hasPendingChanges, recordChanges } from './lib/schedule-draft';
import DayTimeline from './components/DayTimeline';
import HoursEntry from './components/HoursEntry';

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
type ScheduleChange = (schedule: Schedule) => Schedule;

export default function App() {
  const [initial] = useState(loadSchedule);
  const [schedule, setSchedule] = useState(initial.schedule);
  const [storageError, setStorageError] = useState(initial.error);
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [month, setMonth] = useState(week);
  const calendarDialog = useRef<HTMLDialogElement>(null);
  const calendarTrigger = useRef<HTMLButtonElement>(null);
  const pendingChanges = useRef(emptyPatch());
  const currentSchedule = useRef(schedule);
  const days = weekDays(week);
  const totals = Object.fromEntries(days.map(day => [dateKey(day), dayTotals(schedule, dateKey(day))]));
  const entries = Object.fromEntries(days.filter(day => totals[dateKey(day)].hasEntries)
    .map(day => [dateKey(day), totals[dateKey(day)].counted]));
  const summary = summarizeWeek(week, entries);
  const hasEntries = days.some(day => entries[dateKey(day)] !== undefined);
  const relatedTotal = days.reduce((sum, day) => sum + totals[dateKey(day)].related, 0);
  const awayTotal = days.reduce((sum, day) => sum + totals[dateKey(day)].away, 0);
  const graphicMaximum = Math.max(600, ...Object.values(totals).map(day => day.counted + day.related + day.away));
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
      if (event.key !== SCHEDULE_STORAGE_KEY && event.key !== 'weekly-hours.entries.v1' && event.key !== null) return;
      const latest = loadSchedule();
      if (!latest.writable) { setStorageError(latest.error); return; }
      const next = applyPatch(latest.schedule, pendingChanges.current);
      currentSchedule.current = next;
      setSchedule(next);
      const conflict = validateSchedule(next);
      if (conflict) setStorageError(`Another tab changed this schedule. Your unsaved edits are kept here. ${conflict}`);
      else if (!hasPendingChanges(pendingChanges.current)) setStorageError(null);
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  function commitChange(change: ScheduleChange, kind: 'entry' | 'view' = 'entry'): string | null {
    const latest = loadSchedule();
    try {
      const base = latest.writable ? applyPatch(latest.schedule, pendingChanges.current) : currentSchedule.current;
      const next = change(base);
      const conflict = validateSchedule(next);
      // A user can still open the timeline to fix a conflict between tabs.
      if (conflict && kind === 'entry') return conflict;
      const error = conflict ?? (latest.writable ? saveSchedule(next) : latest.error);
      pendingChanges.current = error ? recordChanges(pendingChanges.current, base, next) : emptyPatch();
      currentSchedule.current = next;
      setSchedule(next);
      setStorageError(error);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'This event could not be saved. Check its dates and times.';
    }
  }

  function setTimeline(key: string, enabled: boolean) {
    const error = commitChange(state => ({
      ...state, timelineEnabled: { ...state.timelineEnabled, [key]: enabled },
    }), 'view');
    if (error) setStorageError(error);
  }

  function changeWeek(next: Date) {
    setWeek(startOfWeek(next));
    setExpandedDate(null);
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
          <h1>Your week, at a glance.</h1><p className="subtitle">Plan your day. Know what counts.</p></div>
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
            <div className="table-heading" aria-hidden="true"><span>DAY</span><span>COUNTED</span><span>BALANCE</span></div>
            <div className="day-list">
              {days.map(day => {
                const key = dateKey(day);
                const expected = expectedMinutes(day);
                const value = entries[key];
                const difference = value === undefined ? null : value - expected;
                const holidays = holidaysOn(day);
                const weekend = day.getDay() === 0 || day.getDay() === 6;
                const isToday = key === today;
                const isExpanded = expandedDate === key;
                const dayEvents = eventsForDate(schedule.events, key);
                const timelineEnabled = schedule.timelineEnabled?.[key] ?? (dayEvents.length > 0);
                const untimedMinutes = schedule.legacy[key];
                const dayTotal = totals[key];
                const countedBlocks = dayTotal.counted - (untimedMinutes ?? 0);
                const balanceId = `balance-${key}`;
                return <article className={`day-item ${isExpanded ? 'is-expanded' : ''}`} key={key}>
                  <div className={`day-row ${isToday ? 'is-today' : ''} ${weekend ? 'is-weekend' : ''}`}>
                    <button className="day-toggle" id={`day-${key}`} aria-expanded={isExpanded} aria-controls={`entry-${key}`}
                      onClick={() => setExpandedDate(isExpanded ? null : key)}>
                      <span className="day-label"><span className="day-chevron" aria-hidden="true"><Icon name="right" /></span>
                        {day.toLocaleDateString('en-US', { weekday: 'long' })}
                        {isToday && <span className="today-tag">Today</span>}
                      </span>
                      <span className="day-detail"><span>{shortDate(day)}</span>
                        {holidays.length > 0 ? <span className="holiday-label">{holidays.map(h => h.name
                          + (h.observed ? ' (observed)' : '')).join(', ')}</span>
                          : <span className="expected-label">{expected ? '8h expected' : 'No hours expected'}</span>}
                      </span>
                    </button>
                    <HoursEntry date={key} label={fullDate(day)} total={value}
                      description={`hours-help ${balanceId}${dayEvents.length ? ' blocks-' + key : ''}`}
                      onSave={minutes => commitChange(state => setDayCountedTotal(state, key, minutes))} />
                    <span id={balanceId} className={`day-balance ${difference === null ? 'empty' : tone(difference)}`}>
                      {difference === null ? <span aria-label="No hours entered">—</span>
                        : difference === 0 ? <><Icon name="check" /><span>On target</span></> : formatDelta(difference)}
                    </span>
                    {dayEvents.length > 0 && <span id={`blocks-${key}`} className="day-category-breakdown">
                      {countedBlocks > 0 && <span>{formatMinutes(countedBlocks)} in counted blocks</span>}
                      {dayTotal.related > 0 && <span className="category-related">{formatMinutes(dayTotal.related)} related</span>}
                      {dayTotal.away > 0 && <span className="category-away">{formatMinutes(dayTotal.away)} away</span>}
                    </span>}
                  </div>
                  <div id={`entry-${key}`} hidden={!isExpanded} role="region" aria-labelledby={`day-${key}`}>
                    {isExpanded && <>
                      <label className="timeline-setting" htmlFor={`mode-${key}`}>
                        Event timeline
                        <Switch id={`mode-${key}`} checked={timelineEnabled} size="2"
                          aria-controls={`timeline-${key}`} onCheckedChange={enabled => setTimeline(key, enabled)} />
                      </label>
                      <div id={`timeline-${key}`} hidden={!timelineEnabled}>
                        <DayTimeline date={key} events={dayEvents} untimedMinutes={untimedMinutes}
                          onSave={(event: TimeEvent, occurrenceDate, scope) => commitChange(state =>
                            upsertEvent(state, event, occurrenceDate, scope))}
                          onDelete={(id, date, scope) => commitChange(state => removeEvent(state, id, date, scope))} />
                      </div>
                    </>}
                  </div>
                </article>;
              })}
            </div>
            <p className="timesheet-note" id="hours-help">Enter daily totals in hours, like 6.5. Press Enter or leave the field to save.</p>
          </section>

          <aside className="weekly-summary" aria-labelledby="summary-heading">
            <div className="summary-content">
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
              const dayTotal = totals[dateKey(day)];
                const expected = expectedMinutes(day);
                const description = `${day.toLocaleDateString('en-US', { weekday: 'long' })}: `
                  + `${formatMinutes(dayTotal.counted)} counted, ${formatMinutes(dayTotal.related)} related, ${formatMinutes(dayTotal.away)} away, `
                  + `${formatMinutes(expected)} expected`;
                return <Tooltip key={dateKey(day)} content={description}>
                  <div className="graphic-day" tabIndex={0} role="img" aria-label={description}>
                    <div className={`graphic-track ${expected === 0 ? 'no-target' : ''}`}>
                      {expected > 0 && <span className="graphic-target" style={{ bottom: `${expected / graphicMaximum * 100}%` }} />}
                      <span className="graphic-fill counted-fill" style={{ height: `${dayTotal.counted / graphicMaximum * 100}%` }} />
                      <span className="graphic-fill related-fill" style={{ bottom: `${dayTotal.counted / graphicMaximum * 100}%`,
                        height: `${dayTotal.related / graphicMaximum * 100}%` }} />
                      <span className="graphic-fill away-fill" style={{ bottom: `${(dayTotal.counted + dayTotal.related) / graphicMaximum * 100}%`,
                        height: `${dayTotal.away / graphicMaximum * 100}%` }} />
                    </div>
                    <span className="graphic-label" aria-hidden="true">{day.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
                  </div>
                </Tooltip>;
              })}
            </div>
            <div className="summary-divider" />
            <dl className="category-totals"><div><dt><i className="legend-dot positive-dot" />Counted</dt><dd>{formatMinutes(summary.total)}</dd></div>
              <div><dt><i className="legend-dot related-dot" />Related</dt><dd>{formatMinutes(relatedTotal)}</dd></div>
              <div><dt><i className="legend-dot negative-dot" />Away</dt><dd>{formatMinutes(awayTotal)}</dd></div></dl>
            <dl className="summary-details"><div><dt>Standard week</dt><dd>40h</dd></div>
              <div><dt>Holiday adjustment</dt><dd>{summary.holidayDays ? `−${summary.holidayDays * 8}h` : '—'}</dd></div>
              <div className="adjusted-target"><dt>Your target</dt><dd>{formatMinutes(summary.expected)}</dd></div>
            </dl>
            <div className="summary-footnote"><Icon name="calendar" /><p>US federal holidays adjust your target.
              Only counted time reduces the hours remaining.</p></div>
            </div>
          </aside>
        </div>

        <div className="under-workspace"><div className="legend" aria-label="Time categories">
          <span><i className="legend-dot positive-dot" />Counted</span>
          <span><i className="legend-dot related-dot" />Related · not counted</span>
          <span><i className="legend-dot negative-dot" />Away · not counted</span>
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
