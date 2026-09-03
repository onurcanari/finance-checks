'use client';

import { useEffect, useMemo, useState } from 'react';
import { Header, formatPrice, SourceBadge } from '../components';

const DEFAULT_SYMBOLS = ['AMD', 'AAOI', 'ALAB', 'RKLB'];
const PARTY_FILTERS = ['ALL', 'D', 'R', 'I'];
const WINDOW_FILTERS = [['30D', 30], ['90D', 90], ['1Y', 365], ['ALL', null]];

const typeClass = (type) => (String(type || '').toUpperCase() === 'BUY' ? 'up' : String(type || '').toUpperCase() === 'SELL' ? 'down' : '');

const formatAmount = (min, max) => {
  if (!Number.isFinite(min) && !Number.isFinite(max)) return '';
  const low = Number.isFinite(min) ? `$${Math.round(min).toLocaleString('en-US')}` : '?';
  const high = Number.isFinite(max) ? `$${Math.round(max).toLocaleString('en-US')}` : '?';
  return low === high ? low : `${low} – ${high}`;
};

const formatDate = (value) => {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

// Date-window boundary as an ISO string; null = ALL.
const windowCutoff = (days) => {
  if (days == null) return null;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff.toISOString().slice(0, 10);
};

export default function Congress() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('CONNECTING...');
  const [provenance, setProvenance] = useState({});
  const [staleAt, setStaleAt] = useState(null);
  const [party, setParty] = useState('ALL');
  const [ticker, setTicker] = useState('ALL');
  const [windowDays, setWindowDays] = useState(null);

  const load = async () => {
    setStatus('FETCHING CONGRESS TRADES...');
    try {
      const response = await fetch(`/api/congress-trades?symbols=${DEFAULT_SYMBOLS.join(',')}`, { cache: 'no-store' });
      if (!response.ok) {
        // Route answered but failed: surface the HTTP status (teletext style)
        // instead of masking it as a network outage. Never invent data.
        setData(null);
        setStaleAt(null);
        setStatus(`ERROR ${response.status}`);
        return;
      }
      const payload = await response.json();
      setData(payload);
      setProvenance({ source: payload.source, fetchedAt: payload.updatedAt });

      const staleSymbols = (payload.symbols || []).filter((entry) => entry.stale);
      if (staleSymbols.length) {
        const staleTimes = staleSymbols.map((entry) => entry.fetchedAt).filter(Boolean).sort();
        setStaleAt(staleTimes.at(-1) || null);
        setStatus(`STALE DATA · ${new Date(staleTimes.at(-1)).toLocaleString('en-US')}`);
      } else {
        setStaleAt(null);
        setStatus(`LIVE · ${new Date(payload.updatedAt).toLocaleTimeString('en-US')}`);
      }
    } catch {
      // Fetch/parse itself threw (network, timeout, malformed body): keep the
      // generic unavailable message; no data to show.
      setData(null);
      setStaleAt(null);
      setStatus('LIVE DATA UNAVAILABLE');
    }
  };

  useEffect(() => { load(); }, []);

  const symbolRows = useMemo(() => (data?.symbols || []).map((entry) => ({
    symbol: entry.symbol,
    count: (entry.trades || []).length,
    error: entry.error,
    stale: entry.stale,
    fetchedAt: entry.fetchedAt,
  })), [data]);

  const rows = useMemo(() => {
    const cutoff = windowCutoff(windowDays);
    return (data?.trades || []).filter((trade) => {
      if (party !== 'ALL' && trade.party !== party) return false;
      if (ticker !== 'ALL' && trade.symbol !== ticker) return false;
      if (cutoff && (!trade.transactionDate || trade.transactionDate < cutoff)) return false;
      return true;
    });
  }, [data, party, ticker, windowDays]);

  return <main className="shell"><Header active="CONGRESS" stamp="CONGRESS TRADES / LIVE DATA" />
    <section className="panel market-board"><div className="panel-title">CONGRESS TRADES <span className="stamp">STOCK ACTS BY US LAWMAKERS</span></div>
      {!rows.length && data && <p className="market-empty">No recorded congressional trades for the tracked symbols.</p>}
      <div className="market-filters" role="tablist" aria-label="Congress trades filters">
        {PARTY_FILTERS.map((value) => <button key={`party-${value}`} type="button" role="tab" aria-selected={party === value} className={party === value ? 'active' : ''} onClick={() => setParty(value)}>{value === 'ALL' ? 'ALL PARTIES' : value}</button>)}
        <button type="button" role="tab" aria-selected={ticker === 'ALL'} className={ticker === 'ALL' ? 'active' : ''} onClick={() => setTicker('ALL')}>ALL TICKERS <span>{(data?.trades || []).length}</span></button>
        {(data?.symbols || []).map(({ symbol }) => <button key={`ticker-${symbol}`} type="button" role="tab" aria-selected={ticker === symbol} className={ticker === symbol ? 'active' : ''} onClick={() => setTicker(symbol)}>{symbol}</button>)}
        {WINDOW_FILTERS.map(([label, days]) => <button key={`window-${label}`} type="button" role="tab" aria-selected={windowDays === days} className={windowDays === days ? 'active' : ''} onClick={() => setWindowDays(days)}>{label}</button>)}
      </div>
      <div className="market-table-wrap"><table className="market-table">
        <thead><tr><th scope="col">SYMBOL</th><th scope="col">NAME</th><th scope="col">PARTY</th><th scope="col">STATE</th><th scope="col">TYPE</th><th scope="col">AMOUNT</th><th scope="col">TRADE DATE</th><th scope="col">NOTIFIED</th></tr></thead>
        <tbody>
          {rows.map((trade, index) => {
            const missing = !trade.politician && !trade.transactionDate;
            return <tr key={`${trade.symbol}-${trade.transactionDate}-${trade.politician}-${index}`} className={missing ? 'unavailable' : ''}><td><b>{trade.symbol}</b></td><td className="portfolio-name">{trade.politician || 'N/A'}</td><td>{trade.party || 'N/A'}</td><td>{trade.state || 'N/A'}</td><td className={typeClass(trade.transactionType)}>{trade.transactionType || 'N/A'}</td><td>{formatAmount(trade.amountMin, trade.amountMax)}</td><td>{formatDate(trade.transactionDate)}</td><td>{formatDate(trade.notificationDate)}</td></tr>;
          })}
        </tbody>
      </table></div>
      {symbolRows.map((entry) => (entry.error || entry.stale) && <p key={`note-${entry.symbol}`} className="market-empty">{entry.symbol}: {entry.stale ? `stale data as of ${formatDate(entry.fetchedAt)}` : ''}{entry.error ? ` (${entry.error})` : ''}</p>)}
      {symbolRows.some((entry) => entry.count === 0 && !entry.error) && !data?.trades.length && <p className="market-empty">No recorded congressional trades for the tracked symbols.</p>}
    </section>
    <div className="status"><span><b className={staleAt ? 'down' : 'up'}>●</b> CONGRESS TRADES</span>
      <span>
        {status}{' '}
        <SourceBadge {...provenance} label="Congress trades market data" />
        {staleAt && <span className="stale-badge">STALE · {new Date(staleAt).toLocaleString('en-US')}</span>}
      </span>
      <button onClick={load}>REFRESH</button>
    </div>
  </main>;
}
