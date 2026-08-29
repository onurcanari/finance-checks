'use client';

import { useState, useEffect } from 'react';
import { Header } from '../components';
import { EVENTS } from '../lib/events';

const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parts = (key) => key.split('-').map(Number);
const dayDiff = (a, b) => Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);

export default function CalendarPage() {
  const [today, setToday] = useState(null);
  useEffect(() => { setToday(dateKey(new Date())); }, []);
  const upcoming = today ? EVENTS.filter((item) => item.date >= today).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const next = upcoming[0];
  const days = next ? dayDiff(parts(today), parts(next.date)) : null;
  const daysLabel = days === null ? '' : `${days} day${days === 1 ? '' : 's'} away`;
  return <main className="shell">
    <Header active="CALENDAR" stamp="MACRO EVENT CALENDAR / STATIC LIST" />
    <section className="hero"><div className="eyebrow">MACRO CALENDAR</div><h1>UPCOMING EVENTS</h1><p>Central bank rate decisions and CPI releases ahead. The event list is maintained manually in the code; past events are hidden automatically.</p></section>
    <section className="panel read-panel"><div className="panel-title">NEXT EVENT {next && <span className="stamp">T-{days} DAYS</span>}</div><div className="insight">{next ? <p className="callout"><b>NEXT EVENT:</b> {next.event} — {next.date} ({daysLabel})</p> : <p className="empty-state">NO UPCOMING EVENTS</p>}</div></section>
    <section className="panel"><div className="panel-title">EVENTS <span className="stamp">{upcoming.length} UPCOMING</span></div><div className="table-wrap">{upcoming.length === 0 ? <div className="insight empty-state">NO UPCOMING EVENTS</div> : <table>
      <thead><tr><th>DATE</th><th>EVENT</th><th>REGION</th><th>IMPORTANCE</th></tr></thead>
      <tbody>{upcoming.map((item) => <tr key={`${item.date}-${item.event}`} className={`${item.importance === 'HIGH' ? 'up ' : ''}${item.date === today ? 'today' : ''}`.trim()}><td>{item.date}</td><td>{item.event}</td><td>{item.region}</td><td>{item.importance}</td></tr>)}</tbody>
    </table>}</div></section>
  </main>;
}
