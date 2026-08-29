'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useState } from 'react';

function NavIcon({ name }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="14" width="8" height="7" rx="1.5" /><path d="M5.5 7h3M16.5 5.5h2" /></>,
    comparison: <><path d="M4 19V5m0 14h17" /><path d="m7 15 3-4 3 2 5-7" /><path d="M7 8h3M15 17h3" opacity=".55" /></>,
fire: <><path d="M12 21c4.2 0 7-2.7 7-6.5 0-3.1-1.7-5.5-4.7-8.5.1 2.7-1 4.2-2.4 5.1.1-3.6-1.5-6.2-4.1-8.1.2 3.7-3.1 5.5-3.1 9.4C4.7 17.8 7.5 21 12 21Z" /><path d="M12 21c-2 0-3.3-1.3-3.3-3.2 0-1.3.8-2.4 2.1-3.7.2 1.3.9 2 1.7 2.4.8-.8 1.2-1.7 1.2-2.8 1.1 1.2 1.7 2.4 1.7 3.8 0 2.1-1.4 3.5-3.4 3.5Z" /><path d="M12 12.5c.8 1 1.2 1.8 1.2 2.6" opacity=".55" /></>,
  };
  return <svg className={`nav-icon nav-icon-${name}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function BrandMark() {
  return <svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M6 5v18M6 6h13M6 14h10" stroke="currentColor" strokeWidth="3" strokeLinecap="square" /><path d="M21 8v12M24 8v12" stroke="var(--lime)" strokeWidth="2" /></svg>;
}

export function Header({ active, stamp = 'US EQUITY ROTATION MONITOR / LIVE PRICE DATA' }) {
  const pathname = usePathname();
  const links = [['/', 'DASHBOARD', 'dashboard'], ['/metrics', 'COMPARISON', 'comparison'], ['/fire', 'FIRE CALCULATOR', 'fire']];
  return <header className="topbar" title={stamp}>
    <Link className="rail-brand" href="/" aria-label="FLOW//SECTOR dashboard"><BrandMark /></Link>
    <nav className="nav" aria-label="Primary navigation">
      {links.map(([href, label, icon]) => {
        const isActive = pathname ? pathname === href : active === label;
        return <Link key={label} className={isActive ? 'active' : ''} href={href} title={label} aria-label={label} aria-current={isActive ? 'page' : undefined}><NavIcon name={icon} /></Link>;
      })}
    </nav>
  </header>;
}

export const percent = (value) => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '-';
export const formatPrice = (value) => Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '-';
export const movement = (value) => value >= 0 ? 'up' : 'down';

export function SourceBadge({ source, date, fetchedAt, label = 'View data source' }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  if (!source) return null;
  const details = [source, date && `data date ${date}`, fetchedAt && `fetched ${new Date(fetchedAt).toLocaleString('en-US')}`].filter(Boolean).join(' · ');
  return <span className={`source-badge${open ? ' is-open' : ''}`}><button type="button" className="source-button" aria-label={`${label}: ${details}`} aria-describedby={`source-${id}`} aria-expanded={open} onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }} onKeyDown={(event) => event.stopPropagation()}><span aria-hidden="true">i</span></button><span id={`source-${id}`} className="source-tooltip" role="tooltip">{details}</span></span>;
}

export function SectorDetail({ sector, sectors = [], onSelect, source, fetchedAt }) {
  const profile = sector ? [sector.fiveDay / 5, sector.oneDay * .5, -sector.oneDay * .3, sector.oneDay * .75, sector.oneDay] : [];
  return <>
    <div className="panel switcher"><div className="panel-title">SECTOR SWITCHER</div><div className="sector-nav">{sectors.map((item) => <button key={item.ticker} className={item.ticker === sector?.ticker ? 'active' : ''} onClick={() => onSelect(item.ticker)}>{item.ticker}</button>)}</div></div>
    <section className="hero"><div className="eyebrow">SECTOR / {sector?.ticker || 'LOADING'}</div><h1 className={sector ? movement(sector.oneDay) : ''}>{sector ? <>{sector.name} {percent(sector.oneDay)} <SourceBadge source={source} fetchedAt={fetchedAt} label={`${sector.name} market data`} /></> : 'Loading live data...'}</h1>{sector && <p>{sector.name} is {sector.rs >= 0 ? 'outperforming' : 'underperforming'} SPY by {Math.abs(sector.rs).toFixed(2)} points today.</p>}</section>
    <section className="regime"><div><div className="eyebrow">ROTATION SCORE</div><div className="signal">{sector ? `${sector.score} / 100` : '--'} {sector && <SourceBadge source={source} fetchedAt={fetchedAt} label="Rotation score market inputs" />}</div><div className="stamp">live price calculation</div></div>{[['1D RETURN', 'oneDay'], ['5D RETURN', 'fiveDay'], ['RS vs SPY', 'rs']].map(([label, key]) => <div key={key}><div className="eyebrow">{label}</div><div className={`value ${sector ? movement(sector[key]) : ''}`}>{sector ? <>{percent(sector[key])} <SourceBadge source={source} fetchedAt={fetchedAt} label={`${label} market data`} /></> : '--'}</div></div>)}</section>
    <div className="detail-grid"><section className="panel"><div className="panel-title">MOMENTUM PROFILE <span className="stamp">DERIVED FROM LIVE 1D / 5D</span></div><div className="trend">{profile.map((value, index) => <i key={index} className={value < 0 ? 'neg' : ''} style={{ height: `${Math.max(10, Math.min(100, Math.abs(value) * 35))}%` }} />)}</div></section><aside className="panel"><div className="panel-title">DESK READ</div>{sector && <div className="insight"><p className="callout">{sector.score > 60 ? 'Momentum and relative strength are constructive.' : sector.score < 40 ? 'Momentum and relative strength are weak.' : 'Momentum is mixed; no clear rotation signal.'}</p><p>Rotation score uses only live 1D, 5D and SPY-relative price data.</p></div>}</aside></div>
  </>;
}
