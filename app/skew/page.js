'use client';

import { useEffect, useState } from 'react';
import { Header, SourceBadge } from '../components';

// Skew card grid. One card per portfolio ticker: skew + weekly direction
// arrow + quadrant label + ATM IV. A ticker whose live fetch errored falls
// back to its last stored snapshot (labeled with the snapshot date) instead
// of showing nothing — never invented numbers.

const formatSkew = (value) => (Number.isFinite(value) ? value.toFixed(2) : '—');
const formatWeekly = (value) =>
  Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(3)}` : '—';
const formatIv = (value) =>
  Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';

function directionArrow(weeklyChange) {
  if (!Number.isFinite(weeklyChange) || weeklyChange === 0) return { arrow: '—', cls: '' };
  return weeklyChange > 0 ? { arrow: '↑', cls: 'up' } : { arrow: '↓', cls: 'down' };
}

function SkewCard({ entry, fallback }) {
  if (entry.error && !fallback) {
    return (
      <div className="unavailable">
        <b>{entry.ticker}</b>
        <p>NO DATA ({entry.error})</p>
      </div>
    );
  }

  const source = entry.error ? fallback : entry;
  const { arrow, cls } = directionArrow(source.weeklyChange);

  return (
    <div>
      <b>{entry.ticker}</b>
      <p className={cls}>
        {formatSkew(source.skew)} {arrow}
        {source.unreliable && <span className="stale-badge">UNRELIABLE</span>}
      </p>
      <span className="mini">{source.quadrant || 'QUADRANT N/A'}</span>
      <span className="mini">
        ATM IV {formatIv(source.atmIV)} · WK {formatWeekly(source.weeklyChange)}
      </span>
      {entry.error ? (
        <span className="mini stale-badge">LAST KNOWN · {source.date}</span>
      ) : null}
    </div>
  );
}

export default function Skew() {
  const [data, setData] = useState(null);
  const [fallbacks, setFallbacks] = useState({});
  const [provenance, setProvenance] = useState({});
  const [status, setStatus] = useState('CONNECTING...');

  const load = async () => {
    setStatus('FETCHING OPTION CHAINS...');
    try {
      const response = await fetch('/api/skew', { cache: 'no-store' });
      if (!response.ok) {
        // Route answered but failed (e.g. 500 config_missing): surface the
        // status teletext-style. No invented numbers.
        setData(null);
        setFallbacks({});
        setStatus(`ERROR ${response.status}`);
        return;
      }
      const payload = await response.json();
      setData(payload);
      setProvenance({ source: payload.source, fetchedAt: payload.updatedAt });

      const failed = (payload.tickers || []).filter((entry) => entry.error);
      if (failed.length) {
        // Live data unavailable for some tickers: pull their last stored
        // snapshot so the panel still shows something (labeled as of that
        // date). The history route never calls upstream.
        try {
          const historyResponse = await fetch('/api/skew?history=1', { cache: 'no-store' });
          if (historyResponse.ok) {
            const history = await historyResponse.json();
            const map = {};
            for (const snapshot of history.tickers || []) {
              if (!snapshot.error) map[snapshot.ticker] = snapshot;
            }
            setFallbacks(map);
          } else {
            setFallbacks({});
          }
        } catch {
          setFallbacks({});
        }
        setStatus(`PARTIAL · ${failed.length} TICKER(S) UNAVAILABLE`);
      } else {
        setFallbacks({});
        setStatus(`LIVE · ${new Date(payload.updatedAt).toLocaleTimeString('en-US')}`);
      }
    } catch {
      setData(null);
      setFallbacks({});
      setStatus('LIVE DATA UNAVAILABLE');
    }
  };

  useEffect(() => { load(); }, []);

  const tickers = data?.tickers || [];

  return <main className="shell"><Header active="SKEW" stamp="OPTIONS SKEW / PORTFOLIO" />
    <section className="panel market-board"><div className="panel-title">OPTIONS SKEW <span className="stamp">25-DELTA WINGS / DAILY SNAPSHOTS</span></div>
      {!tickers.length && data && <p className="market-empty">No skew data available for the tracked symbols.</p>}
      <div className="market-read">
        {tickers.map((entry) => (
          <SkewCard key={entry.ticker} entry={entry} fallback={fallbacks[entry.ticker]} />
        ))}
      </div>
      {Object.keys(fallbacks).length > 0 && (
        <p className="market-empty">Errored tickers show their last stored snapshot instead of live data.</p>
      )}
    </section>
    <div className="status"><span><b className={Object.keys(fallbacks).length ? 'down' : 'up'}>●</b> OPTIONS SKEW</span>
      <span>
        {status}{' '}
        <SourceBadge {...provenance} label="Options skew market data" />
      </span>
      <button onClick={load}>REFRESH</button>
    </div>
  </main>;
}
