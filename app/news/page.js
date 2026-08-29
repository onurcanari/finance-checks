'use client';

import { useCallback, useEffect, useState } from 'react';
import { Header } from '../components';

const clockTime = (value, seconds = false) => value ? new Date(value).toLocaleTimeString([], seconds
  ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
  : { hour: '2-digit', minute: '2-digit' }) : '--:--';

export default function NewsPage() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');

  const load = useCallback(() => {
    setStatus('loading');
    fetch('/api/news', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('feed request failed'))))
      .then((payload) => {
        setData(payload);
        setStatus(payload?.items?.length ? 'ready' : 'empty');
      })
      .catch(() => setStatus('error'));
  }, []);

  useEffect(load, [load]);

  const ready = status === 'ready';
  return <main className="shell">
    <Header stamp="NEWS FLASH / LIVE WIRE HEADLINES" />
    <section className="hero"><div className="eyebrow">CURRENT WIRE</div><h1>NEWS FLASH</h1><p>Latest headlines pulled live from the CNBC and Yahoo Finance RSS feeds. Headlines open on the publisher's site.</p></section>
    <section className="panel news-board">
      <div className="panel-title"><span>NEWS FLASH</span><span className="stamp">{ready && data?.updatedAt ? `UPDATED ${clockTime(data.updatedAt, true)}` : 'LIVE WIRE'}</span></div>
      <div className="list">
        {status === 'loading' && <div><span>LOADING...</span></div>}
        {ready && data.items.map((item) => <div key={item.link} className="news-row"><span className="news-time">{clockTime(item.publishedAt)}</span><span className="news-source">{item.source}</span><a href={item.link} target="_blank" rel="noopener noreferrer">{item.title}</a></div>)}
        {(status === 'error' || status === 'empty') && <div><span className="news-unavailable">NEWSFEED UNAVAILABLE</span></div>}
      </div>
      <div className="status"><span>{ready ? `LIVE · ${data.items.length} HEADLINES · CNBC + YAHOO RSS` : 'LIVE DATA UNAVAILABLE'}</span><button type="button" onClick={load}>REFRESH</button></div>
    </section>
  </main>;
}
