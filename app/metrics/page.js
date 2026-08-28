'use client';

import { useEffect, useMemo, useState } from 'react';
import { Header, movement } from '../components';

const periods = [['weekly', 'Weekly'], ['monthly', 'Monthly'], ['3m', '3 Months'], ['6m', '6 Months'], ['ytd', 'Year to date'], ['1y', '1 Year'], ['3y', '3 Years'], ['5y', '5 Years']];
const formatValue = (value) => typeof value === 'number' ? `${value > 0 ? '+' : ''}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : value ?? '—';

function MetricIcon({ type }) { return <span className={`metric-icon metric-icon-${type}`} aria-hidden="true">{type === 'top' ? '↗' : type === 'breadth' ? '◒' : '◈'}</span>; }

export default function MetricsPage() {
  const [data, setData] = useState(); const [period, setPeriod] = useState('monthly'); const [status, setStatus] = useState('CONNECTING...');
  const load = async () => { setStatus('FETCHING LIVE DATA...'); try { const response = await fetch('/api/market-comparison', { cache: 'no-store' }); const payload = await response.json(); if (!response.ok || payload.error) throw Error(payload.error); setData(payload); setStatus(`LIVE · ${new Date(payload.updatedAt).toLocaleTimeString('en-US')}`); } catch { setData(undefined); setStatus('LIVE DATA UNAVAILABLE'); } };
  useEffect(() => { load(); }, []);
  const rows = data?.periods?.[period] || []; const highlights = data?.highlights || [];
  const max = useMemo(() => Math.max(...rows.map((row) => Math.abs(Number(row.value))).filter(Number.isFinite), 0), [rows]);
  return <main className="shell metrics-page"><Header active="COMPARISON" stamp="US MARKET COMPARISON / LIVE" />
    <section className="metrics-hero"><div><div className="eyebrow">MARKET COMPASS / PERFORMANCE</div><h1>Compare your<br /><em>assets.</em></h1><p>Track the performance of different investment assets in one place.</p></div><div className="hero-mark" aria-hidden="true"><span>↗</span><i /></div></section>
    <section className="period-panel panel" aria-label="Select period"><div className="period-label"><span className="eyebrow">PERIOD</span><span className="stamp">PERFORMANCE %</span></div><div className="periods" role="group" aria-label="Comparison period">{periods.map(([key, label]) => <button key={key} className={period === key ? 'active' : ''} aria-pressed={period === key} onClick={() => setPeriod(key)}>{label}</button>)}</div></section>
    <div className="metrics-layout"><section className="panel comparison-card"><div className="panel-title"><span>PERFORMANCE COMPARISON</span><span className="live-pill"><b>●</b> LIVE</span></div><div className="chart-head"><span>{periods.find(([key]) => key === period)?.[1].toUpperCase()}</span><span>VALUE</span></div><div className="bars" aria-live="polite">{data ? rows.length ? rows.map((row) => { const value = Number(row.value); const width = max && Number.isFinite(value) ? Math.max(3, Math.abs(value) / max * 100) : 0; return <div className="bar-row" key={row.id}><div className="bar-name"><span className="asset-dot" /><b>{row.shortName || row.name}</b><small>{row.name !== row.shortName ? row.name : ''}</small></div><div className="bar-track"><span className={movement(value)} style={{ width: `${width}%` }} /></div><strong className={movement(value)}>{formatValue(row.value)}</strong></div>; }) : <p className="empty-state">No data found for this period.</p> : <p className="empty-state">Loading market data...</p>}</div><div className="chart-foot"><span>Source: {data?.source || '—'}</span><span>Values may change</span></div></section><aside className="highlight-stack" aria-label="Market highlights">{highlights.length ? highlights.map((item, index) => <section className="metric-card panel" key={`${item.label}-${index}`}><MetricIcon type={index === 0 ? 'top' : index === 1 ? 'breadth' : 'signal'} /><div><div className="eyebrow">{item.label}</div><strong>{formatValue(item.value)}</strong><p>{item.detail}</p></div></section>) : <section className="metric-card panel"><MetricIcon type="signal" /><div><div className="eyebrow">HIGHLIGHTS</div><strong>—</strong><p>Waiting for API data.</p></div></section>}</aside></div>
    <div className="status"><span><b className="up">●</b> LIVE MARKET DATA</span><span>{status}</span><button onClick={load}>REFRESH</button></div><p className="foot">DATA SOURCE: {data?.source || 'API'} · NO SYNTHETIC VALUES USED.</p></main>;
}
