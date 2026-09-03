'use client';

import { useCallback, useEffect, useState } from 'react';
import { isHttpLink } from '../lib/links';
import { Header } from '../components';
import { PORTFOLIO } from '../lib/portfolio';

const clockTime = (value, seconds = false) => value ? new Date(value).toLocaleTimeString([], seconds
  ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
  : { hour: '2-digit', minute: '2-digit' }) : '--:--';

const PORTFOLIO_SYMBOLS = PORTFOLIO.map(({ symbol }) => symbol).join(',');

export default function NewsPage() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [stockData, setStockData] = useState(null);
  const [stockStatus, setStockStatus] = useState('loading');

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

  const loadStocks = useCallback(() => {
    setStockStatus('loading');
    fetch(`/api/stock-news?symbols=${encodeURIComponent(PORTFOLIO_SYMBOLS)}`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('stock feed request failed'))))
      .then((payload) => {
        setStockData(payload);
        setStockStatus(payload?.items?.length ? 'ready' : 'empty');
      })
      .catch(() => setStockStatus('error'));
  }, []);

  useEffect(load, [load]);
  useEffect(loadStocks, [loadStocks]);

  const ready = status === 'ready';
  const stockReady = stockStatus === 'ready';
  return <main className="shell">
    <Header active="NEWS" stamp="NEWS FLASH / LIVE WIRE HEADLINES" />
    <section className="hero"><div className="eyebrow">CURRENT WIRE</div><h1>NEWS FLASH</h1><p>Latest headlines pulled live from the CNBC and Yahoo Finance RSS feeds. Headlines open on the publisher's site.</p></section>
    <section className="panel news-board">
      <div className="panel-title"><span>MY STOCKS NEWS</span><span className="stamp">{stockReady && stockData?.updatedAt ? `UPDATED ${clockTime(stockData.updatedAt, true)}` : 'LIVE WIRE'}</span></div>
      <div className="list">
        {stockStatus === 'loading' && <div><span>LOADING...</span></div>}
        {stockReady && stockData.items.map((item, index) => {
          const safe = isHttpLink(item.link);
          return <div key={`${item.symbol}-${index}`} className="news-row"><span className="news-time">{clockTime(item.publishedAt)}</span><span className="news-source">{item.symbol}</span>{safe ? <a href={item.link} target="_blank" rel="noopener noreferrer">{item.title}</a> : <span>{item.title}</span>}</div>;
        })}
        {(stockStatus === 'error' || stockStatus === 'empty') && <div><span className="news-unavailable">NO NEWS FOUND FOR YOUR PORTFOLIO SYMBOLS</span></div>}
      </div>
      <div className="status"><span>{stockReady ? `LIVE · ${stockData.items.length} HEADLINES · ${PORTFOLIO.length} SYMBOLS TRACKED` : 'LIVE DATA UNAVAILABLE'}</span><button type="button" onClick={loadStocks}>REFRESH</button></div>
    </section>
    <section className="panel news-board">
      <div className="panel-title"><span>MARKET WIRE</span><span className="stamp">{ready && data?.updatedAt ? `UPDATED ${clockTime(data.updatedAt, true)}` : 'LIVE WIRE'}</span></div>
      <div className="list">
        {status === 'loading' && <div><span>LOADING...</span></div>}
        {ready && data.items.map((item, index) => {
          const safe = isHttpLink(item.link);
          return <div key={`${item.source}-${index}`} className="news-row"><span className="news-time">{clockTime(item.publishedAt)}</span><span className="news-source">{item.source}</span>{safe ? <a href={item.link} target="_blank" rel="noopener noreferrer">{item.title}</a> : <span>{item.title}</span>}</div>;
        })}
        {(status === 'error' || status === 'empty') && <div><span className="news-unavailable">NEWSFEED UNAVAILABLE</span></div>}
      </div>
      <div className="status"><span>{ready ? `LIVE · ${data.items.length} HEADLINES · CNBC + YAHOO RSS` : 'LIVE DATA UNAVAILABLE'}</span><button type="button" onClick={load}>REFRESH</button></div>
    </section>
  </main>;
}
