'use client';

import { useEffect, useMemo, useState } from 'react';
import { Header, movement, SourceBadge } from '../components';

const periods = [['weekly', 'Weekly'], ['monthly', 'Monthly'], ['3m', '3 Months'], ['6m', '6 Months'], ['ytd', 'Year to date'], ['1y', '1 Year'], ['3y', '3 Years'], ['5y', '5 Years']];
const profiles = [['turkey', 'TR Investor', 'TRY · BIST · local rates'], ['us', 'US / Nasdaq', 'USD · large cap · macro'], ['crypto', 'Crypto / BTC', 'BTC · ETH · crypto macro']];
const formatValue = (value) => typeof value === 'number' ? `${value > 0 ? '+' : ''}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : value ?? '—';
function MetricIcon({ type }) { return <span className={`metric-icon metric-icon-${type}`} aria-hidden="true">{type === 'top' ? '↗' : type === 'breadth' ? '◒' : '◈'}</span>; }

const unavailableLabel = (item) => typeof item === 'string' ? item : item?.label || item?.name || item?.shortName;

export default function MetricsPage() {
  const [data, setData] = useState();
  const [profile, setProfile] = useState('turkey');
  const [period, setPeriod] = useState('monthly');
  const [status, setStatus] = useState('CONNECTING...');
  const load = async () => { setStatus('FETCHING LIVE DATA...'); try { const response = await fetch('/api/market-comparison', { cache: 'no-store' }); const payload = await response.json(); if (!response.ok || payload.error) throw Error(payload.error); setData(payload); setStatus(`LIVE · ${new Date(payload.updatedAt).toLocaleTimeString('en-US')}`); } catch { setData(undefined); setStatus('LIVE DATA UNAVAILABLE'); } };
  useEffect(() => { load(); }, []);

  const selected = data?.profiles?.[profile];
  const rows = selected?.periods?.[period] || [];
  const unavailable = (selected?.unavailable || []).map(unavailableLabel).filter(Boolean);
  const unavailableKeys = new Set(unavailable.map((item) => item.toLowerCase()));
  const visibleRows = rows.filter((row) => !row.unavailable && !unavailableKeys.has((row.name || '').toLowerCase()) && !unavailableKeys.has((row.shortName || '').toLowerCase()));
  const unavailableRows = [...unavailable, ...rows.filter((row) => row.unavailable).map((row) => row.shortName || row.name)].filter((item, index, list) => item && list.indexOf(item) === index);
  const max = useMemo(() => Math.max(...visibleRows.map((row) => Math.abs(Number(row.value))).filter(Number.isFinite), 0), [visibleRows]);
  const profileLabel = profiles.find(([key]) => key === profile)?.[1] || 'MARKET';

  return <main className="shell metrics-page">
    <Header active="COMPARISON" stamp={`${profileLabel.toUpperCase()} / LIVE`} />
    <section className="metrics-hero"><div><div className="eyebrow">MARKET COMPASS / {profileLabel.toUpperCase()}</div><h1>Compare your<br /><em>assets.</em></h1><p>Track {selected?.label || profileLabel.toLowerCase()} performance in one focused market view.</p><div className="status" aria-live="polite">{status}<span> · {selected?.source || 'Awaiting profile data'}</span><button type="button" onClick={load}>REFRESH</button></div></div><div className="hero-mark" aria-hidden="true"><span>↗</span><i /></div></section>

    <section className="profile-tabs panel" aria-label="Market profile"><div className="profile-tabs-heading"><span className="eyebrow">MARKET PROFILE</span><span className="stamp">SELECT A LENS</span></div><div className="profile-tabs-list" role="tablist" aria-label="Market profile"><span className="profile-rule" aria-hidden="true" />{profiles.map(([key, label, detail]) => <button key={key} type="button" role="tab" aria-selected={profile === key} className={profile === key ? 'active' : ''} onClick={() => setProfile(key)}><b>{label}</b><small>{detail}</small></button>)}</div></section>
    <section className="period-panel panel" aria-label="Select period"><div className="period-label"><span className="eyebrow">PERIOD</span><span className="stamp">PERFORMANCE %</span></div><div className="periods" role="group" aria-label="Comparison period">{periods.map(([key, label]) => <button key={key} type="button" className={period === key ? 'active' : ''} aria-pressed={period === key} onClick={() => setPeriod(key)}>{label}</button>)}</div></section>

    <div className="metrics-layout"><section className="panel comparison-card"><div className="panel-title"><span>{profileLabel.toUpperCase()} / PERFORMANCE COMPARISON</span><span className={`live-pill${!selected ? ' muted' : ''}`}><b>●</b> {selected ? 'LIVE' : 'WAITING'}</span></div><div className="chart-head"><span>{periods.find(([key]) => key === period)?.[1].toUpperCase()}</span><span>VALUE</span></div><div className="bars" aria-live="polite">{data ? visibleRows.length || unavailableRows.length ? <>{visibleRows.map((row) => { const value = Number(row.value); const width = max && Number.isFinite(value) ? Math.max(3, Math.abs(value) / max * 100) : 0; return <div className="bar-row" key={row.id || row.name}><div className="bar-name"><span className="asset-dot" /><b>{row.shortName || row.name}</b><small>{row.name !== row.shortName ? row.name : ''}</small></div><div className="bar-track"><span className={movement(value)} style={{ width: `${width}%` }} /></div><strong className={movement(value)}>{formatValue(row.value)} <SourceBadge source={row.source || selected?.source} date={row.date} fetchedAt={row.fetchedAt || data.updatedAt} label={`${row.name} comparison data`} /></strong></div>; })}{unavailableRows.map((label) => <div className="bar-row unavailable-row" key={`unavailable-${label}`}><div className="bar-name"><span className="asset-dot" /><b>{label}</b><small>NOT REPORTED</small></div><div className="bar-track"><span /></div><strong>UNAVAILABLE</strong></div>)}</> : <p className="empty-state">No data found for this period.</p> : <p className="empty-state">Loading market data...</p>}</div><div className="chart-foot"><span>Source: {selected?.source || '—'}</span><span>{unavailableRows.length ? `${unavailableRows.length} metric${unavailableRows.length === 1 ? '' : 's'} unavailable` : 'Values may change'}</span></div></section>
      <aside className="highlight-stack" aria-label={`${profileLabel} market highlights`}>{selected?.highlights?.length ? selected.highlights.map((item, index) => <section className="metric-card panel" key={`${item.label}-${index}`}><MetricIcon type={index === 0 ? 'top' : index === 1 ? 'breadth' : 'signal'} /><div><div className="eyebrow">{item.label}</div><strong>{item.unavailable ? 'UNAVAILABLE' : formatValue(item.value)} {!item.unavailable && <SourceBadge source={item.source || selected.source} date={item.date} fetchedAt={item.fetchedAt || data.updatedAt} label={`${item.label} market data`} />}</strong><p>{item.detail || (item.unavailable ? 'No live value is available for this metric.' : '')}</p></div></section>) : <section className="metric-card panel"><MetricIcon type="signal" /><div><div className="eyebrow">{profileLabel.toUpperCase()} / HIGHLIGHTS</div><strong>—</strong><p>{selected ? 'No highlights available for this profile.' : 'Waiting for profile data...'}</p></div></section>}</aside>
    </div>
  </main>;
}
