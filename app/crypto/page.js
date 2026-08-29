'use client';

import { useEffect, useState } from 'react';
import { Header, SourceBadge, formatPrice, movement, percent } from '../components';

const names = { 'BTC-USD': 'Bitcoin', 'ETH-USD': 'Ethereum', 'SOL-USD': 'Solana' };

function ChangeCell({ value, symbol, period }) {
  const available = Number.isFinite(value);
  return <td className={available ? movement(value) : ''}>{percent(value)} <SourceBadge source="yahoo" label={`${symbol} ${period} crypto data`} /></td>;
}

export default function CryptoPage() {
  const [data, setData] = useState();
  const [status, setStatus] = useState('CONNECTING...');
  const load = async () => { setStatus('FETCHING LIVE PRICES...'); try { const response = await fetch('/api/crypto', { cache: 'no-store' }); const snapshot = await response.json(); if (!response.ok || snapshot.error) throw Error(snapshot.error); setData(snapshot); setStatus(`LIVE · ${new Date(snapshot.updatedAt).toLocaleTimeString('en-US')}`); } catch { setData(undefined); setStatus('LIVE DATA UNAVAILABLE'); } };
  useEffect(() => { load(); }, []);

  const coins = data?.coins || [];
  const fear = data?.fearGreed;

  return <main className="shell crypto-page"><Header active="CRYPTO" stamp="CRYPTO MONITOR / BTC · ETH · SOL" />
    <div className="grid crypto-board">
      <section className="panel"><div className="panel-title"><span>CRYPTO PRICES</span><span className="stamp">LIVE · 1D / 7D / 30D</span></div><div className="table-wrap"><table><thead><tr><th scope="col">ASSET</th><th scope="col">PRICE</th><th scope="col">1D</th><th scope="col">7D</th><th scope="col">30D</th></tr></thead><tbody>{coins.length ? coins.map((coin, index) => <tr key={coin.symbol}><td><span className="rank">{String(index + 1).padStart(2, '0')}</span><span className="ticker">{coin.symbol.replace('-USD', '')}</span><span className="sector">{names[coin.symbol] || coin.symbol}</span></td><td>{formatPrice(coin.price)} <SourceBadge source="yahoo" label={`${coin.symbol} price crypto data`} /></td><ChangeCell value={coin.oneDay} symbol={coin.symbol} period="1D" /><ChangeCell value={coin.sevenDay} symbol={coin.symbol} period="7D" /><ChangeCell value={coin.thirtyDay} symbol={coin.symbol} period="30D" /></tr>) : <tr><td colSpan="5" className="market-empty">{data ? 'No coin data.' : 'Loading market data...'}</td></tr>}</tbody></table></div></section>
      <aside className="panel fng-panel"><div className="panel-title"><span>FEAR &amp; GREED</span><span className="stamp">CROWD SENTIMENT</span></div><div className="fng-body">{fear ? <><div className={`fng-value ${fear.value < 25 ? 'down' : fear.value > 75 ? 'up' : ''}`}>{fear.value}</div><div className="fng-class">{String(fear.classification || '').toUpperCase()}</div><SourceBadge source="alternative.me" fetchedAt={fear.updatedAt} label="Fear & Greed index" /></> : <div className="fng-unavailable">F&amp;G UNAVAILABLE</div>}</div></aside>
    </div>
    <div className="status" aria-live="polite"><span><b className="up">●</b> LIVE CRYPTO PRICES</span><span>{status}</span><button type="button" onClick={load}>REFRESH</button></div><p className="foot">PRICES VIA YAHOO FINANCE. SENTIMENT VIA ALTERNATIVE.ME. NO SYNTHETIC VALUES.</p>
  </main>;
}
