'use client';

import { useCallback, useEffect, useState } from 'react';
import { Header } from '../components';
import { EVENTS } from '../lib/events';
import { PORTFOLIO } from '../lib/portfolio';

const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parts = (key) => key.split('-').map(Number);
const dayDiff = (a, b) => Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);

const PORTFOLIO_SYMBOLS = PORTFOLIO.map(({ symbol }) => symbol).join(',');

export default function CalendarPage() {
  const [stockEvents, setStockEvents] = useState([]);
  const [stockStatus, setStockStatus] = useState('loading');

  const loadStockEvents = useCallback(() => {
    setStockStatus('loading');
    fetch(`/api/stock-calendar?symbols=${encodeURIComponent(PORTFOLIO_SYMBOLS)}`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('calendar request failed'))))
      .then((payload) => {
        setStockEvents(Array.isArray(payload.events) ? payload.events : []);
        setStockStatus('ready');
      })
      .catch(() => setStockStatus('error'));
  }, []);

  useEffect(loadStockEvents, [loadStockEvents]);

  const today = dateKey(new Date());
  const upcoming = EVENTS.filter((item) => item.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const upcomingStockEvents = stockEvents.filter((item) => item.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0];
  const days = next ? dayDiff(parts(today), parts(next.date)) : null;
  const daysLabel = `${days} day${days === 1 ? '' : 's'} away`;
  return <main className="shell">
    <Header active="CALENDAR" stamp="MACRO EVENT CALENDAR / STATIC LIST" />
    <section className="hero"><div className="eyebrow">MACRO CALENDAR</div><h1>UPCOMING EVENTS</h1><p>Central bank rate decisions and CPI releases ahead. The event list is maintained manually in the code; past events are hidden automatically.</p></section>
    <section className="panel read-panel"><div className="panel-title">NEXT EVENT {next && <span className="stamp">T-{days} DAYS</span>}</div><div className="insight">{next ? <p className="callout"><b>NEXT EVENT:</b> {next.event} — {next.date} ({daysLabel})</p> : <p className="empty-state">NO UPCOMING EVENTS</p>}</div></section>
    <section className="panel">
      <div className="panel-title">MY STOCKS CALENDAR <span className="stamp">{stockStatus === 'ready' ? `${upcomingStockEvents.length} UPCOMING` : 'LOADING'}</span></div>
      <div className="table-wrap">{stockStatus === 'loading' ? <div className="insight empty-state">LOADING...</div> : upcomingStockEvents.length === 0 ? <div className="insight empty-state">NO UPCOMING EARNINGS OR DIVIDEND DATES FOR YOUR PORTFOLIO SYMBOLS</div> : <table>
        <thead><tr><th>DATE</th><th>SYMBOL</th><th>EVENT</th></tr></thead>
        <tbody>{upcomingStockEvents.map((item, index) => <tr key={`${item.symbol}-${item.date}-${index}`} className={`${item.importance === 'HIGH' ? 'up ' : ''}${item.date === today ? 'today' : ''}`.trim()}><td>{item.date}</td><td><b>{item.symbol}</b></td><td>{item.event}</td></tr>)}</tbody>
      </table>}</div>
      <div className="status"><span>YAHOO FINANCE CALENDAR DATA · {PORTFOLIO.length} SYMBOLS TRACKED</span><button type="button" onClick={loadStockEvents}>REFRESH</button></div>
    </section>
    <section className="panel"><div className="panel-title">EVENTS <span className="stamp">{upcoming.length} UPCOMING</span></div><div className="table-wrap">{upcoming.length === 0 ? <div className="insight empty-state">NO UPCOMING EVENTS</div> : <table>
      <thead><tr><th>DATE</th><th>EVENT</th><th>REGION</th><th>IMPORTANCE</th></tr></thead>
      <tbody>{upcoming.map((item) => <tr key={item.date} className={`${item.importance === 'HIGH' ? 'up ' : ''}${item.date === today ? 'today' : ''}`.trim()}><td>{item.date}</td><td>{item.event}</td><td>{item.region}</td><td>{item.importance}</td></tr>)}</tbody>
    </table>}</div></section>
  </main>;
}
