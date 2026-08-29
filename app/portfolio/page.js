'use client';

import { useEffect, useState } from 'react';
import { Header, formatPrice, movement, percent, SourceBadge } from '../components';
import { PORTFOLIO } from '../lib/portfolio';

const CATEGORIES = [
  ['EQUITY', 'EQUITY'],
  ['GOLD', 'GOLD'],
  ['CRYPTO', 'CRYPTO'],
  ['INDEX', 'INDEX'],
];

export default function Portfolio() {
  const [quotes, setQuotes] = useState({});
  const [status, setStatus] = useState('CONNECTING...');
  const [provenance, setProvenance] = useState({});

  const load = async () => {
    setStatus('FETCHING LIVE PRICES...');
    const symbols = PORTFOLIO.map(({ symbol }) => symbol).join(',');
    try {
      const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      const returnedQuotes = Array.isArray(payload.quotes) ? payload.quotes : [];
      if (!returnedQuotes.length) throw new Error('No quotes returned');
      setQuotes(Object.fromEntries(returnedQuotes.map((quote) => [quote.symbol, quote])));
      setProvenance({ source: payload.source, fetchedAt: payload.updatedAt });
      const allUnavailable = returnedQuotes.every((quote) => !Number.isFinite(quote.price));
      setStatus(allUnavailable ? 'LIVE DATA UNAVAILABLE' : `LIVE · ${new Date(payload.updatedAt).toLocaleTimeString('en-US')}`);
    } catch {
      setStatus('LIVE DATA UNAVAILABLE');
    }
  };

  useEffect(() => { load(); }, []);

  const rows = PORTFOLIO.map((holding) => ({ ...holding, ...(quotes[holding.symbol] || {}) }));
  const value = (row) => (Number.isFinite(row.price) ? row.price * row.quantity : null);
  const positions = rows.map((row) => ({ ...row, value: value(row) })).filter((row) => row.value != null);
  const totalValue = positions.reduce((sum, row) => sum + row.value, 0);
  const weightedOneDay = positions.reduce((sum, row) => (Number.isFinite(row.oneDay) ? sum + row.value * row.oneDay : sum), 0) / (totalValue || 1);
  const categoryRows = CATEGORIES.map(([category, label]) => {
    const total = positions.filter((row) => row.category === category).reduce((sum, row) => sum + row.value, 0);
    return { category, label, total, pct: totalValue ? (total / totalValue) * 100 : 0 };
  }).filter((row) => row.total > 0);
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const unavailable = status === 'LIVE DATA UNAVAILABLE';

  return <main className="shell"><Header active="PORTFOLIO" />
    <section className="panel"><div className="panel-title">PORTFOLIO <span className="stamp">LIVE YAHOO PRICES</span></div>
      {unavailable && <p className="market-empty">LIVE DATA UNAVAILABLE</p>}
      <div className="market-table-wrap"><table className="market-table">
        <thead><tr><th scope="col">SYMBOL</th><th scope="col">NAME</th><th scope="col">QTY</th><th scope="col">PRICE</th><th scope="col">VALUE</th><th scope="col">1D</th><th scope="col">5D</th></tr></thead>
        <tbody>
          {rows.map((row) => {
            const v = value(row);
            const priced = Number.isFinite(row.price);
            const has1D = Number.isFinite(row.oneDay);
            const has5D = Number.isFinite(row.fiveDay);
            return <tr key={row.symbol} className={priced ? '' : 'unavailable'}><td><b>{row.symbol}</b></td><td className="portfolio-name">{row.name}</td><td>{row.quantity}</td><td>{priced ? formatPrice(row.price) : '--'} <SourceBadge {...provenance} label={`${row.symbol} price market data`} /></td><td className={v != null ? '' : 'muted-value'}>{v != null ? formatPrice(v) : '--'}</td><td className={has1D ? movement(row.oneDay) : ''}>{has1D ? percent(row.oneDay) : '--'} {has1D && <SourceBadge {...provenance} label={`${row.symbol} 1D market data`} />}</td><td className={has5D ? movement(row.fiveDay) : ''}>{has5D ? percent(row.fiveDay) : '--'} {has5D && <SourceBadge {...provenance} label={`${row.symbol} 5D market data`} />}</td></tr>;
          })}
          <tr className="totals-row"><td colSpan="2"><b>TOTAL</b></td><td>{totalQuantity}</td><td>—</td><td>{totalValue ? formatPrice(totalValue) : '--'}</td><td className={Number.isFinite(weightedOneDay) && totalValue ? movement(weightedOneDay) : ''}>{Number.isFinite(weightedOneDay) && totalValue ? percent(weightedOneDay) : '--'}</td><td>—</td></tr>
        </tbody>
      </table></div>
    </section>
    <section className="panel"><div className="panel-title">CATEGORY WEIGHT <span className="stamp">% OF TOTAL VALUE</span></div>
      <div className="category-summary">
        {categoryRows.length ? categoryRows.map((row) => (
          <div className="category-row" key={row.category}><b>{row.label}</b><div className="category-track"><span className="category-fill" style={{ width: `${row.pct}%` }} /></div><span>{row.pct.toFixed(1)}%</span></div>
        )) : <p className="market-empty">{unavailable ? 'LIVE DATA UNAVAILABLE' : 'No priced holdings available.'}</p>}
      </div>
    </section>
    <div className="status"><span><b className="up">●</b> LIVE PORTFOLIO PRICES</span><span>{status}</span><button onClick={load}>REFRESH</button></div>
  </main>;
}
