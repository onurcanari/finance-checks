'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useRef, useState, useCallback, useEffect } from 'react';

function NavIcon({ name }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="14" width="8" height="7" rx="1.5" /><path d="M5.5 7h3M16.5 5.5h2" /></>,
    comparison: <><path d="M4 19V5m0 14h17" /><path d="m7 15 3-4 3 2 5-7" /><path d="M7 8h3M15 17h3" opacity=".55" /></>,
    fire: <><path d="M12 21c4.2 0 7-2.7 7-6.5 0-3.1-1.7-5.5-4.7-8.5.1 2.7-1 4.2-2.4 5.1.1-3.6-1.5-6.2-4.1-8.1.2 3.7-3.1 5.5-3.1 9.4C4.7 17.8 7.5 21 12 21Z" /><path d="M12 21c-2 0-3.3-1.3-3.3-3.2 0-1.3.8-2.4 2.1-3.7.2 1.3.9 2 1.7 2.4.8-.8 1.2-1.7 1.2-2.8 1.1 1.2 1.7 2.4 1.7 3.8 0 2.1-1.4 3.5-3.4 3.5Z" /><path d="M12 12.5c.8 1 1.2 1.8 1.2 2.6" opacity=".55" /></>,
    portfolio: <><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /><path d="M3 13h18" opacity=".55" /></>,
    inflation: <><path d="m4 6 6 6 3-3 7 7" /><path d="M20 11v5h-5" /></>,
    rates: <><path d="M4 19h16" /><path d="M5 15.5h4.5V11H14V6.5h5" /></>,
    crypto: <><circle cx="12" cy="12" r="8.5" /><path d="M10 7.5h2.6a2 2 0 0 1 0 4H10zm0 4h3a2 2 0 0 1 0 4h-3zm0-4v8m1.4-9.6v1.6m2-1.6v1.6" /></>,
    news: <><rect x="3" y="4.5" width="13" height="15" rx="1.5" /><path d="M16 8.5h3a1 1 0 0 1 1 1V17a2.5 2.5 0 0 1-2.5 2.5H5" opacity=".55" /><path d="M6 9h7M6 12.5h7M6 16h4" /></>,
    calendar: <><rect x="4" y="5.5" width="16" height="15" rx="2" /><path d="M4 10.5h16" /><path d="M8.5 3v4M15.5 3v4" /></>,
    alerts: <><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" /><path d="M10.3 19a2 2 0 0 0 3.4 0" /></>,
    flow: <><path d="M3 7h12M3 12h18M3 17h9" /><path d="M17 14l3 3-3 3" opacity=".7" /><circle cx="6" cy="7" r="1.4" fill="currentColor" stroke="none" /><circle cx="14" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="9" cy="17" r="1.4" fill="currentColor" stroke="none" /></>,
    congress: <><path d="M5 21h14" /><path d="M6 21V10M10 21V10M14 21V10M18 21V10" /><path d="m4 10 8-6 8 6" /><path d="M9 3v2m6-2v2" opacity=".55" /></>,
  };
  return <svg className={`nav-icon nav-icon-${name}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function BrandMark() {
  return <svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M6 5v18M6 6h13M6 14h10" stroke="currentColor" strokeWidth="3" strokeLinecap="square" /><path d="M21 8v12M24 8v12" stroke="var(--lime)" strokeWidth="2" /></svg>;
}

const LINKS = [['/', 'DASHBOARD', 'dashboard'], ['/metrics', 'COMPARISON', 'comparison'], ['/flow', 'FLOW', 'flow'], ['/fire', 'FIRE CALCULATOR', 'fire'], ['/portfolio', 'PORTFOLIO', 'portfolio'], ['/inflation', 'REAL RETURN', 'inflation'], ['/rates', 'RATES', 'rates'], ['/crypto', 'CRYPTO', 'crypto'], ['/news', 'NEWS', 'news'], ['/calendar', 'CALENDAR', 'calendar'], ['/alerts', 'ALERTS', 'alerts'], ['/congress', 'CONGRESS', 'congress']];

function Drawer({ isOpen, onClose, active }) {
  const drawerRef = useRef(null);
  const closeBtnRef = useRef(null);
  const controllerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (isOpen) {
      setOpen(false);
      const id = requestAnimationFrame(() => { void drawerRef.current?.offsetHeight; requestAnimationFrame(() => setOpen(true)); });
      return () => cancelAnimationFrame(id);
    } else {
      setOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && closeBtnRef.current) {
      const id = requestAnimationFrame(() => closeBtnRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; controllerRef.current?.abort(); controllerRef.current = null; };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !drawerRef.current) return;
    const el = drawerRef.current;
    const focusable = el.querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const onTab = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    el.addEventListener('keydown', onTab);
    return () => el.removeEventListener('keydown', onTab);
  }, [isOpen]);

  const onPointerDown = useCallback((e) => {
    if (e.target.closest('.drawer-links') || e.target.closest('.drawer-head')) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const startX = e.clientX;
    setSwiping(true);
    setSwipeX(0);
    const onMove = (ev) => { const dx = ev.clientX - startX; if (dx < 0) setSwipeX(dx); };
    const onUp = (ev) => { const dx = ev.clientX - startX; if (dx < -60) onClose(); setSwiping(false); setSwipeX(0); controller.abort(); controllerRef.current = null; };
    const onCancel = () => { setSwiping(false); setSwipeX(0); controller.abort(); controllerRef.current = null; };
    document.addEventListener('pointermove', onMove, { signal: controller.signal });
    document.addEventListener('pointerup', onUp, { signal: controller.signal });
    document.addEventListener('pointercancel', onCancel, { signal: controller.signal });
  }, [onClose]);

  if (!open && !swiping) return null;
  const transform = swiping ? `translateX(${290 + swipeX}px)` : (open ? 'translateX(0)' : 'translateX(290px)');
  const transition = swiping ? 'none' : undefined;
  return (
    <>
      <div className={`drawer-backdrop${open ? ' open' : ''}`} onClick={onClose} aria-hidden="true" />
      <nav ref={drawerRef} id="nav-drawer" className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" style={{ transform, transition }} onClick={(e) => { if (e.target === drawerRef.current) onClose(); }} onPointerDown={onPointerDown}>
        <div className="drawer-head">
          <span id="drawer-title" className="drawer-title">NAVIGATION</span>
          <button ref={closeBtnRef} className="drawer-close" onClick={onClose} aria-label="Close navigation menu">×</button>
        </div>
        <div className="drawer-links">
          {LINKS.map(([href, label, icon]) => {
            const isActive = pathname ? pathname === href : active === label;
            return <Link key={label} className={isActive ? 'active' : ''} href={href} title={label} aria-label={label} aria-current={isActive ? 'page' : undefined} onClick={onClose}><NavIcon name={icon} /><span className="drawer-label">{label}</span></Link>;
          })}
        </div>
      </nav>
    </>
  );
}

export function Header({ active, stamp = 'US EQUITY ROTATION MONITOR / LIVE PRICE DATA' }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hamburgerRef = useRef(null);
  return (
    <>
      <header className="topbar" title={stamp}>
        <Link className="rail-brand" href="/" aria-label="FLOW//SECTOR dashboard"><BrandMark /></Link>
        <button className="hamburger" onClick={() => setDrawerOpen(true)} ref={hamburgerRef} aria-expanded={drawerOpen} aria-controls="nav-drawer" aria-label="Open navigation menu">
          <span className="hamburger-icon" aria-hidden="true"><span /><span /><span /></span>
        </button>
        <nav className="nav" aria-label="Primary navigation">
          {LINKS.map(([href, label, icon]) => {
            const activeNow = pathname ? pathname === href : active === label;
            return <Link key={label} className={activeNow ? 'active' : ''} href={href} title={label} aria-label={label} aria-current={activeNow ? 'page' : undefined}><NavIcon name={icon} /></Link>;
          })}
        </nav>
      </header>
      <Drawer isOpen={drawerOpen} onClose={() => { setDrawerOpen(false); requestAnimationFrame(() => hamburgerRef.current?.focus()); }} active={active} />
    </>
  );
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
