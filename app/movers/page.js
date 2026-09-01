'use client';

import { useEffect, useMemo, useState } from 'react';
import { Header, SourceBadge } from '../components';
import { MOVERS_TABS } from '../lib/movers';

// price -> fixed 2-4 decimals like every other money column in the app;
// volume -> grouped thousands via toLocaleString (contract requires en-US).
const formatPrice = (value) => (Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '-');
const formatVolume = (value) => (Number.isFinite(value) ? value.toLocaleString('en-US') : '-');
const formatChange = (value) => (Number.isFinite(value) ? (value > 0 ? '+' : '') + value.toFixed(2) : '-');
// AV's last_updated ("2026-08-31 16:15:56 US/Eastern") is not a format
// Date can parse — fall back to the raw string rather than "Invalid Date".
const formatStamp = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-US');
};

export default function Movers() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('CONNECTING...');
  const [tab, setTab] = useState('gainers');

  const load = async () => {
    setStatus('FETCHING TOP MOVERS...');
    try {
      const response = await fetch('/api/movers', { cache: 'no-store' });
      if (!response.ok) {
        // Route answered but failed: surface the HTTP status (teletext style)
        // instead of masking it as a network outage. Never invent data.
        setData(null);
        setStatus(`ERROR ${response.status}`);
        return;
      }
      const payload = await response.json();
      setData(payload);
      // Contract: status line carries AV's own last_updated market timestamp;
      // stale runs label the last successful fetch instead.
      const stamp = payload.stale
        ? (payload.fetchedAt ? new Date(payload.fetchedAt).toLocaleString('en-US') : 'UNKNOWN TIME')
        : formatStamp(payload.lastUpdated) || (payload.fetchedAt ? new Date(payload.fetchedAt).toLocaleTimeString('en-US') : '');
      setStatus(payload.stale ? `STALE DATA · ${stamp}` : `LIVE · MARKET DATA ${stamp}`.trim());
    } catch {
      // Fetch/parse itself threw (network, timeout, malformed body): keep the
      // generic unavailable message; no data to show.
      setData(null);
      setStatus('LIVE DATA UNAVAILABLE');
    }
  };

  useEffect(() => { load(); }, []);

  const rows = useMemo(() => (data?.[tab] || []), [data, tab]);

  return <main className="shell"><Header active="MOVERS" stamp="TOP MOVERS / US MARKET" />
    <section className="panel market-board"><div className="panel-title">TOP MOVERS <span className="stamp">GAINERS · LOSERS · MOST ACTIVE</span></div>
      {data && !rows.length && <p className="market-empty">No {tab === 'active' ? 'most-active' : tab} data in the current market snapshot.</p>}
      <div className="market-filters" role="tablist" aria-label="Top movers views">
        {MOVERS_TABS.map(({ key, label }) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      <div className="market-table-wrap"><table className="market-table">
        <thead><tr><th scope="col">TICKER</th><th scope="col">PRICE</th><th scope="col">CHANGE</th><th scope="col">% CHG</th><th scope="col">VOLUME</th></tr></thead>
        <tbody>
          {rows.map((mover, index) => (
            <tr key={`${mover.ticker || 'na'}-${index}`} className={mover.unavailable ? 'unavailable' : ''}>
              <td><b>{mover.ticker || 'N/A'}</b></td>
              <td>{formatPrice(mover.price)}</td>
              <td className={mover.changeAmount > 0 ? 'up' : mover.changeAmount < 0 ? 'down' : ''}>{formatChange(mover.changeAmount)}</td>
              <td className={mover.changePercentage > 0 ? 'up' : mover.changePercentage < 0 ? 'down' : ''}>{formatChange(mover.changePercentage)}</td>
              <td>{formatVolume(mover.volume)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </section>
    <div className="status"><span><b className={data?.stale ? 'down' : 'up'}>●</b> TOP MOVERS</span>
      <span>
        {status}{' '}
        <SourceBadge source={data?.source} fetchedAt={data?.fetchedAt} label="Top movers market data" />
        {data?.stale && <span className="stale-badge">STALE</span>}
      </span>
      <button onClick={load}>REFRESH</button>
    </div>
  </main>;
}
