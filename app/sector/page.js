'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header, movement, percent } from '../components';

function SectorContent() {
  const params = useSearchParams(); const ticker = params.get('ticker') || 'XLK'; const [data, setData] = useState(); const [status, setStatus] = useState('CONNECTING...');
  useEffect(() => { fetch('/api/market-snapshot', { cache: 'no-store' }).then((response) => response.json()).then((snapshot) => { if (snapshot.error) throw Error(snapshot.error); setData(snapshot); setStatus(`LIVE · ${new Date(snapshot.updatedAt).toLocaleTimeString('tr-TR')}`); }).catch(() => setStatus('LIVE DATA UNAVAILABLE')); }, []);
  const sector = data?.sectors.find((item) => item.ticker === ticker) || data?.sectors.find((item) => item.ticker === 'XLK');
  const profile = sector ? [sector.fiveDay / 5, sector.oneDay * .5, -sector.oneDay * .3, sector.oneDay * .75, sector.oneDay] : [];
  return <main className="shell"><Header active="SECTOR DETAIL" stamp="LIVE SECTOR DETAIL" />
    <section className="panel switcher"><div className="panel-title">SECTOR SWITCHER</div><div className="sector-nav">{data?.sectors.map((item) => <Link key={item.ticker} className={item.ticker === sector?.ticker ? 'active' : ''} href={`/sector?ticker=${item.ticker}`}>{item.ticker}</Link>)}</div></section>
    <section className="hero"><div className="eyebrow">SECTOR / {sector?.ticker || 'LOADING'}</div><h1 className={sector ? movement(sector.oneDay) : ''}>{sector ? `${sector.name} ${percent(sector.oneDay)}` : 'Loading live data...'}</h1>{sector && <p>{sector.name} is {sector.rs >= 0 ? 'outperforming' : 'underperforming'} SPY by {Math.abs(sector.rs).toFixed(2)} points today.</p>}</section>
    <section className="regime"><div><div className="eyebrow">ROTATION SCORE</div><div className="signal">{sector ? `${sector.score} / 100` : '--'}</div><div className="stamp">live price calculation</div></div>{[['1D RETURN', 'oneDay'], ['5D RETURN', 'fiveDay'], ['RS vs SPY', 'rs']].map(([label, key]) => <div key={key}><div className="eyebrow">{label}</div><div className={`value ${sector ? movement(sector[key]) : ''}`}>{sector ? percent(sector[key]) : '--'}</div></div>)}</section>
    <div className="detail-grid"><section className="panel"><div className="panel-title">MOMENTUM PROFILE <span className="stamp">DERIVED FROM LIVE 1D / 5D</span></div><div className="trend">{profile.map((value, index) => <i key={index} className={value < 0 ? 'neg' : ''} style={{ height: `${Math.max(10, Math.min(100, Math.abs(value) * 35))}%` }} />)}</div></section><aside className="panel"><div className="panel-title">DESK READ</div>{sector && <div className="insight"><p className="callout">{sector.score > 60 ? 'Momentum and relative strength are constructive.' : sector.score < 40 ? 'Momentum and relative strength are weak.' : 'Momentum is mixed; no clear rotation signal.'}</p><p>Rotation score uses only live 1D, 5D and SPY-relative price data.</p></div>}</aside></div>
    <div className="status"><span><b className="up">●</b> LIVE PRICE DATA ONLY</span><span>{status}</span></div>
  </main>;
}

export default function SectorPage() {
  return <Suspense fallback={<main className="shell">Loading...</main>}><SectorContent /></Suspense>;
}
