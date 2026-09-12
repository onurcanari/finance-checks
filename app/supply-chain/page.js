'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header, SourceBadge, formatPrice, movement, percent } from '../components';
import { isHttpLink } from '../lib/links';
import {
  BUYERS,
  CONCENTRATION,
  DATA_DATE,
  EDGES,
  ENTITIES,
  FOCUS_IDS,
  SHARE_CHARTS,
  SOURCES,
  edgesOf,
  sidesFor,
  sourceById,
} from '../lib/supply-chain';

// Mindmap geometry. The viewBox is fixed so the tree keeps its proportions on
// every screen; the container scrolls sideways on narrow ones.
const ROW = 30;
const GAP = 20;
const BRANCH_X = 230;
const LEAF_X = 520;
const VIEW_W = 1560;

function layoutSide(groups, collapsed, side) {
  let cursor = 0;
  const laid = groups.map((group) => {
    const key = `${side}:${group.category}`;
    const open = !collapsed.has(key);
    const count = group.items.length;
    if (open) {
      const items = group.items.map((item, i) => ({ ...item, y: cursor + ROW / 2 + i * ROW }));
      const node = { ...group, key, open, count, y: cursor + (count * ROW) / 2, items };
      cursor += count * ROW + GAP;
      return node;
    }
    const node = { ...group, key, open, count, y: cursor + ROW / 2, items: [] };
    cursor += ROW + GAP;
    return node;
  });
  return { groups: laid, height: Math.max(cursor - GAP, 0) };
}

const CURVE = (x1, y1, x2, y2) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;

export default function SupplyChain() {
  const [live, setLive] = useState(null);
  const [status, setStatus] = useState('CONNECTING...');
  const [news, setNews] = useState(null);
  const [focus, setFocus] = useState('nvidia');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [detail, setDetail] = useState(null);
  const [chartTab, setChartTab] = useState(SHARE_CHARTS[0].id);
  const [query, setQuery] = useState('');
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const movedRef = useRef(false);

  // Live quotes for every listed entity in the graph.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus('FETCHING LIVE QUOTES...');
      try {
        const response = await fetch('/api/supply-chain', { cache: 'no-store' });
        if (!response.ok) {
          if (!cancelled) { setLive(null); setStatus(`ERROR ${response.status}`); }
          return;
        }
        const payload = await response.json();
        if (cancelled) return;
        setLive(payload);
        const stamp = payload.fetchedAt ? new Date(payload.fetchedAt).toLocaleTimeString('en-US') : '';
        // All quotes failing is an upstream outage, not a quiet tape — say so
        // rather than showing a map of dashes labelled LIVE.
        setStatus(payload.live
          ? `LIVE QUOTES ${stamp} · GRAPH RESEARCHED ${payload.dataDate || DATA_DATE}`
          : 'LIVE QUOTES UNAVAILABLE · GRAPH SHOWN WITHOUT PRICES');
      } catch {
        if (!cancelled) { setLive(null); setStatus('LIVE DATA UNAVAILABLE'); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Headlines follow whichever company is at the centre of the map.
  useEffect(() => {
    let cancelled = false;
    setNews(null);
    (async () => {
      try {
        const response = await fetch(`/api/supply-chain/news?focus=${encodeURIComponent(focus)}`, { cache: 'no-store' });
        if (!response.ok) { if (!cancelled) setNews({ items: [], failed: true }); return; }
        const payload = await response.json();
        if (!cancelled) setNews(payload);
      } catch {
        if (!cancelled) setNews({ items: [], failed: true });
      }
    })();
    return () => { cancelled = true; };
  }, [focus]);

  const quoteOf = useCallback((id) => {
    const symbol = ENTITIES[id]?.symbol;
    return symbol ? live?.quotes?.[symbol] || null : null;
  }, [live]);

  const sides = useMemo(() => sidesFor(focus), [focus]);
  const leftLayout = useMemo(() => layoutSide(sides.suppliers, collapsed, 'up'), [sides, collapsed]);
  const rightLayout = useMemo(() => layoutSide(sides.customers, collapsed, 'down'), [sides, collapsed]);
  const height = Math.max(leftLayout.height, rightLayout.height, 300) + 80;
  const centreY = height / 2;
  const offsetLeft = (height - leftLayout.height) / 2;
  const offsetRight = (height - rightLayout.height) / 2;

  const reroot = (id) => {
    setFocus(id);
    setCollapsed(new Set());
    setView({ x: 0, y: 0, k: 1 });
    setDetail(null);
  };

  const toggleBranch = (key) => setCollapsed((previous) => {
    const next = new Set(previous);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // Pan. Pointer capture is deliberately NOT used: capturing on the <svg>
  // retargets the click away from the node under the cursor and kills every
  // node handler.
  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    dragRef.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
    movedRef.current = false;
  };
  useEffect(() => {
    const onMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) movedRef.current = true;
      const scale = VIEW_W / (svgRef.current?.clientWidth || VIEW_W);
      setView((previous) => ({ ...previous, x: drag.vx + dx * scale, y: drag.vy + dy * scale }));
    };
    const onUp = () => { dragRef.current = null; setTimeout(() => { movedRef.current = false; }, 0); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // Plain wheel must keep scrolling the page; only ctrl/⌘+wheel zooms.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      setView((previous) => ({ ...previous, k: Math.min(3, Math.max(0.4, previous.k * factor)) }));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const guard = (fn) => () => { if (!movedRef.current) fn(); };

  const renderSide = (layout, offset, direction) => layout.groups.map((group) => {
    const groupY = group.y + offset;
    const groupX = direction * BRANCH_X;
    const toneClass = `tone-${group.tone}`;
    return (
      <g key={group.key}>
        <path className={`sc-link ${toneClass}`} d={CURVE(direction * 95, centreY, groupX - direction * 115, groupY)} />
        <g className="sc-node" onClick={guard(() => toggleBranch(group.key))}>
          <rect className={`sc-branch ${toneClass}`} x={groupX - 115} y={groupY - 13} width="230" height="26" rx="3" />
          <text className={`sc-branch-label ${toneClass}`} x={groupX} y={groupY + 4} textAnchor="middle">
            {`${group.open ? '▾' : '▸'} ${group.label} · ${group.count}`}
          </text>
        </g>
        {group.items.map((item) => {
          const itemY = item.y + offset;
          const itemX = direction * LEAF_X;
          const entity = ENTITIES[item.otherId];
          const quote = quoteOf(item.otherId);
          const anchor = direction < 0 ? 'end' : 'start';
          const textX = itemX + direction * 14;
          return (
            <g key={`${item.index}`} className="sc-node" onClick={guard(() => setDetail({ type: 'edge', index: item.index }))}>
              <path className={`sc-link ${toneClass}`} d={CURVE(groupX + direction * 115, groupY, itemX - direction * 8, itemY)} />
              <circle className={`sc-dot ${toneClass}`} cx={itemX} cy={itemY} r="4" />
              <text className="sc-leaf" x={textX} y={itemY - 1} textAnchor={anchor}>{entity.name}</text>
              <text className="sc-leaf-sub" x={textX} y={itemY + 11} textAnchor={anchor}>
                <tspan className="sc-pct">{item.edge.pct !== '—' ? `${item.edge.pct}  ` : ''}</tspan>
                <tspan>{entity.symbol || (entity.private ? 'private' : '')}</tspan>
                {quote && Number.isFinite(quote.oneDay) && (
                  <tspan className={`sc-quote ${movement(quote.oneDay)}`}>{`  ${percent(quote.oneDay)}`}</tspan>
                )}
              </text>
              <rect x={direction < 0 ? itemX - 330 : itemX - 10} y={itemY - 15} width="340" height="30" fill="transparent" />
            </g>
          );
        })}
      </g>
    );
  });

  const focusEntity = ENTITIES[focus];
  const focusQuote = quoteOf(focus);

  const detailEdge = detail?.type === 'edge' ? EDGES[detail.index] : null;
  const detailEntity = detail?.type === 'entity' ? ENTITIES[detail.id] : null;

  const chart = SHARE_CHARTS.find((item) => item.id === chartTab) || SHARE_CHARTS[0];
  const chartMax = Math.max(...chart.rows.map((row) => row.value));

  const term = query.trim().toLowerCase();
  const buyerRows = BUYERS.filter((row) => !term
    || `${row.buyer} ${row.suppliers.join(' ')} ${row.what} ${row.amount} ${row.caveat}`.toLowerCase().includes(term));

  const closeDetail = () => setDetail(null);

  return <main className="shell sc-page">
    <Header active="SUPPLY CHAIN" stamp="AI COMPUTE SUPPLY CHAIN / LIVE QUOTES" />

    <section className="panel">
      <div className="panel-title">SUPPLY-CHAIN MINDMAP <span className="stamp">{status}</span></div>
      <div className="sc-intro">
        Left of the centre supplies this company; right of it buys from it. Percentages are the curated allocation for that
        edge — the tape beside each name is live. Click a branch to collapse it, a leaf for the number, its basis and its sources.
      </div>
      <div className="sc-picker" aria-label="Supply-chain map focus">
        {FOCUS_IDS.map((id) => {
          const entity = ENTITIES[id];
          const quote = quoteOf(id);
          return <button key={id} type="button" aria-pressed={focus === id} className={focus === id ? 'active' : ''} onClick={() => reroot(id)}>
            {entity.name}
            <span className="sc-chip-sym">{entity.symbol || 'PRIVATE'}</span>
            {quote && Number.isFinite(quote.oneDay) && <span className={`sc-chip-pct ${movement(quote.oneDay)}`}>{percent(quote.oneDay)}</span>}
          </button>;
        })}
      </div>

      <div className="sc-mapbox">
        <div className="sc-tools">
          <button type="button" onClick={() => setView((v) => ({ ...v, k: Math.min(3, v.k * 1.2) }))} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => setView((v) => ({ ...v, k: Math.max(0.4, v.k / 1.2) }))} aria-label="Zoom out">−</button>
          <button type="button" onClick={() => setView({ x: 0, y: 0, k: 1 })}>FIT</button>
          <button type="button" onClick={() => setCollapsed((previous) => {
            if (previous.size) return new Set();
            const next = new Set();
            sides.suppliers.forEach((group) => next.add(`up:${group.category}`));
            sides.customers.forEach((group) => next.add(`down:${group.category}`));
            return next;
          })}>{collapsed.size ? 'EXPAND' : 'COLLAPSE'}</button>
        </div>
        <svg
          ref={svgRef}
          className="sc-map"
          viewBox={`${-VIEW_W / 2} 0 ${VIEW_W} ${height}`}
          style={{ aspectRatio: `${VIEW_W} / ${height}` }}
          onPointerDown={onPointerDown}
          role="img"
          aria-label={`Supply-chain map centred on ${focusEntity.name}`}
        >
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            <text className="sc-cap" x={-LEAF_X} y="26" textAnchor="middle">SUPPLIERS &#8594;</text>
            <text className="sc-cap" x={LEAF_X} y="26" textAnchor="middle">&#8592; CUSTOMERS</text>
            {renderSide(leftLayout, offsetLeft, -1)}
            {renderSide(rightLayout, offsetRight, 1)}
            <g className="sc-node" onClick={guard(() => setDetail({ type: 'entity', id: focus }))}>
              <rect className="sc-centre" x="-95" y={centreY - 30} width="190" height="60" rx="4" />
              <text className="sc-centre-name" x="0" y={centreY - 6} textAnchor="middle">{focusEntity.name}</text>
              <text className="sc-centre-sub" x="0" y={centreY + 10} textAnchor="middle">
                <tspan>{focusEntity.symbol || 'PRIVATE'}</tspan>
                {focusQuote && Number.isFinite(focusQuote.oneDay) && (
                  <tspan className={`sc-quote ${movement(focusQuote.oneDay)}`}>{`  ${percent(focusQuote.oneDay)}`}</tspan>
                )}
              </text>
            </g>
          </g>
        </svg>
        <div className="sc-hint">drag to pan · ctrl/⌘ + scroll to zoom</div>
      </div>
    </section>

    <section className="panel">
      <div className="panel-title">MARKET SHARE BY LAYER <span className="stamp">CURATED · RESEARCHED {DATA_DATE}</span></div>
      <div className="market-filters" aria-label="Market share layers">
        {SHARE_CHARTS.map((item) => <button key={item.id} type="button" aria-pressed={chartTab === item.id} className={chartTab === item.id ? 'active' : ''} onClick={() => setChartTab(item.id)}>{item.label}</button>)}
      </div>
      <div className="sc-bars">
        {chart.rows.map((row) => {
          const quote = row.id ? quoteOf(row.id) : null;
          return <div className="sc-bar" key={row.name}>
            <div className="sc-bar-name">
              {row.id ? <button type="button" className="sc-linkish" onClick={() => setDetail({ type: 'entity', id: row.id })}>{row.name}</button> : row.name}
              <small>{row.sub}</small>
            </div>
            <div className="sc-track"><i className={row.muted ? 'muted' : ''} style={{ width: `${(row.value / chartMax) * 100}%` }} /></div>
            <div className="sc-bar-value">{row.label}</div>
            <div className={`sc-bar-live ${quote && Number.isFinite(quote.oneDay) ? movement(quote.oneDay) : ''}`}>
              {quote && Number.isFinite(quote.oneDay) ? percent(quote.oneDay) : ''}
            </div>
          </div>;
        })}
        <p className="sc-note"><span className={`sc-conf ${chart.confidence}`}>{chart.confidence}</span> {chart.note}</p>
      </div>
    </section>

    <section className="panel">
      <div className="panel-title">{CONCENTRATION.title} <span className="stamp">SHARE OF TOTAL REVENUE, BY DIRECT CUSTOMER</span></div>
      <div className="sc-stack">
        {CONCENTRATION.segments.map((segment) => (
          <span key={segment.key} className={`sc-seg${segment.muted ? ' muted' : ''}`} style={{ width: `${segment.value}%` }} title={`${segment.key} — ${segment.value}%`}>
            {segment.value >= 9 ? `${segment.value}%` : ''}
          </span>
        ))}
      </div>
      <div className="sc-legend">
        {CONCENTRATION.segments.map((segment) => <span key={segment.key}><i className={segment.muted ? 'muted' : ''} />{segment.key} · {segment.value}%</span>)}
      </div>
      <p className="sc-note"><span className="sc-conf official">official</span> {CONCENTRATION.note}</p>
      <p className="sc-note spec"><span className="sc-conf speculation">speculation</span> {CONCENTRATION.speculation}</p>
    </section>

    <section className="panel">
      <div className="panel-title">SUPPLIER CARDS <span className="stamp">LAYER SHARE · NAMED CUSTOMERS · LIVE TAPE</span></div>
      <div className="sc-cards">
        {Object.entries(ENTITIES).filter(([, entity]) => entity.share).sort((a, b) => b[1].share - a[1].share).map(([id, entity]) => {
          const quote = quoteOf(id);
          const { outbound } = edgesOf(id);
          return <article className="sc-card" key={id}>
            <h3>{entity.name} <span>{entity.symbol || 'PRIVATE'}</span></h3>
            <p className="sc-card-role">{entity.role}</p>
            <div className="sc-card-live">
              <b>{quote && Number.isFinite(quote.price) ? formatPrice(quote.price) : '-'}</b>
              <span className={quote && Number.isFinite(quote.oneDay) ? movement(quote.oneDay) : ''}>{quote && Number.isFinite(quote.oneDay) ? percent(quote.oneDay) : '-'}</span>
              <small>{quote?.currency || ''} 1D</small>
              {live && <SourceBadge source="Yahoo Finance chart API" fetchedAt={live.fetchedAt} label={`${entity.name} live quote`} />}
            </div>
            <div className="sc-card-share">
              <b>{entity.share}%</b>
              <small>{entity.shareOf}</small>
            </div>
            <div className="sc-track"><i style={{ width: `${entity.share}%` }} /></div>
            {outbound.length > 0 && <ul className="sc-card-list">
              {outbound.slice(0, 7).map((item) => (
                <li key={item.index}>
                  <button type="button" onClick={() => setDetail({ type: 'edge', index: item.index })}>
                    <span>{ENTITIES[item.otherId].name}</span>
                    <span className="r">{item.edge.pct === '—' ? 'n/d' : item.edge.pct}</span>
                  </button>
                </li>
              ))}
            </ul>}
          </article>;
        })}
      </div>
    </section>

    <section className="panel">
      <div className="panel-title">BUYER LEDGER <span className="stamp">EVERY MAJOR BUYER BY NAME · NO &quot;OTHER BUYERS&quot; BUCKET</span></div>
      <div className="sc-filter">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by company, component, supplier..." aria-label="Filter the buyer ledger" />
      </div>
      <div className="market-table-wrap"><table className="market-table sc-table">
        <thead><tr>
          <th scope="col">BUYER</th><th scope="col">1D</th><th scope="col">SUPPLIERS</th><th scope="col">WHAT</th>
          <th scope="col">HOW MUCH / WHAT SHARE</th><th scope="col">CONF</th><th scope="col">SPECULATION / CAVEAT</th>
        </tr></thead>
        <tbody>
          {buyerRows.map((row) => {
            const quote = quoteOf(row.id);
            return <tr key={row.id}>
              <td><button type="button" className="sc-linkish" onClick={() => setDetail({ type: 'entity', id: row.id })}>{row.buyer}</button><small>{ENTITIES[row.id].symbol || 'PRIVATE'}</small></td>
              <td className={quote && Number.isFinite(quote.oneDay) ? movement(quote.oneDay) : ''}>{quote && Number.isFinite(quote.oneDay) ? percent(quote.oneDay) : '-'}</td>
              <td>{row.suppliers.join(', ')}</td>
              <td>{row.what}</td>
              <td className="sc-amount">{row.amount}</td>
              <td><span className={`sc-conf ${row.confidence}`}>{row.confidence}</span></td>
              <td className="sc-caveat">{row.caveat}</td>
            </tr>;
          })}
        </tbody>
      </table></div>
      {!buyerRows.length && <p className="market-empty">No buyer matches that filter.</p>}
    </section>

    <section className="panel">
      <div className="panel-title">LIVE HEADLINES <span className="stamp">{focusEntity.name.toUpperCase()} AND ITS DIRECT COUNTERPARTIES</span></div>
      <div className="sc-news">
        {!news && <p className="market-empty">Loading headlines...</p>}
        {news?.failed && <p className="market-empty">Headlines unavailable right now.</p>}
        {news && !news.failed && !news.items.length && <p className="market-empty">No tagged headlines for these tickers right now.</p>}
        {news?.items?.map((item) => (
          <a key={item.link} href={isHttpLink(item.link) ? item.link : undefined} target="_blank" rel="noopener noreferrer">
            <span className="sc-news-sym">{item.symbol}</span>
            <span className="sc-news-title">{item.title}</span>
            <span className="sc-news-meta">{item.source} · {new Date(item.publishedAt).toLocaleString('en-US')}</span>
          </a>
        ))}
      </div>
    </section>

    <section className="panel">
      <div className="panel-title">SOURCES <span className="stamp">{SOURCES.length} REFERENCES · TAGGED BY EVIDENCE TYPE</span></div>
      <div className="sc-sources">
        {[...SOURCES].sort((a, b) => ['official', 'research', 'press', 'speculation', 'background'].indexOf(a.kind) - ['official', 'research', 'press', 'speculation', 'background'].indexOf(b.kind)).map((source) => (
          <div className="sc-source" key={source.id}>
            <span className={`sc-conf ${source.kind}`}>{source.kind}</span>
            <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
            <small>{source.detail}</small>
          </div>
        ))}
      </div>
      <p className="sc-note">
        <b>How to read this.</b> Two layers sit on this page. The supply-chain graph is curated and dated {DATA_DATE}: no market
        API publishes supply allocations, so each edge is tagged <b>official</b> (filing or company statement), <b>research</b>
        {' '}(market-research estimate — firms disagree, most visibly on HBM share), <b>press</b> (credible reporting neither side
        confirms), <b>speculation</b> (explicitly unverified — the identities behind Nvidia&apos;s Customers A–D, and the
        Samsung/Micron split of its residual HBM4) or <b>background</b> (structural, no 2026 document pulled here). Prices,
        percentage moves and headlines are live from Yahoo Finance on every page load. Gigawatt figures are contracts and letters
        of intent, not delivered capacity.
      </p>
    </section>

    {detail && <>
      <div className="sc-scrim" onClick={closeDetail} aria-hidden="true" />
      <aside className="sc-drawer" role="dialog" aria-modal="true" aria-label="Supply-chain detail">
        <div className="sc-drawer-head">
          <button type="button" className="sc-drawer-close" onClick={closeDetail} aria-label="Close detail">×</button>
          {detailEdge && <>
            <h3>{ENTITIES[detailEdge.s].name} &#8594; {ENTITIES[detailEdge.b].name}</h3>
            <div className="sc-drawer-sub">{detailEdge.pct}</div>
          </>}
          {detailEntity && <>
            <h3>{detailEntity.name}</h3>
            <div className="sc-drawer-sub">{detailEntity.symbol || 'PRIVATE'} · {detailEntity.layer}</div>
          </>}
        </div>
        <div className="sc-drawer-body">
          {detailEdge && <>
            <dl className="sc-kv">
              <dt>share</dt><dd className="sc-strong">{detailEdge.pct}</dd>
              <dt>basis</dt><dd>{detailEdge.basis}</dd>
              <dt>evidence</dt><dd><span className={`sc-conf ${detailEdge.confidence}`}>{detailEdge.confidence}</span></dd>
            </dl>
            <p className={`sc-note${detailEdge.confidence === 'speculation' ? ' spec' : ''}`}>{detailEdge.note}</p>
            {[detailEdge.s, detailEdge.b].map((id) => {
              const quote = quoteOf(id);
              if (!quote) return null;
              return <div className="sc-drawer-quote" key={id}>
                <span>{ENTITIES[id].name} <small>{ENTITIES[id].symbol}</small></span>
                <span>{Number.isFinite(quote.price) ? formatPrice(quote.price) : '-'} <b className={Number.isFinite(quote.oneDay) ? movement(quote.oneDay) : ''}>{Number.isFinite(quote.oneDay) ? percent(quote.oneDay) : '-'}</b></span>
              </div>;
            })}
            <div className="sc-drawer-section">SOURCES</div>
            {detailEdge.sources.length === 0 && <p className="sc-note">No 2026 document pulled for this edge — treat it as background industry structure.</p>}
            <ul className="sc-drawer-list">
              {detailEdge.sources.map((id) => {
                const source = sourceById(id);
                if (!source) return null;
                return <li key={id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a><span className={`sc-conf ${source.kind}`}>{source.kind}</span></li>;
              })}
            </ul>
            <div className="sc-drawer-section">NAVIGATE</div>
            <div className="sc-drawer-nav">
              {[detailEdge.s, detailEdge.b].filter((id) => FOCUS_IDS.includes(id) && id !== focus).map((id) => (
                <button key={id} type="button" onClick={() => reroot(id)}>Re-root on {ENTITIES[id].name} &#8594;</button>
              ))}
            </div>
          </>}
          {detailEntity && <>
            <dl className="sc-kv">
              <dt>role</dt><dd>{detailEntity.role}</dd>
              {detailEntity.share && <><dt>share</dt><dd className="sc-strong">{detailEntity.share}% <small>{detailEntity.shareOf}</small></dd></>}
              {detailEntity.scale && <><dt>scale</dt><dd>{detailEntity.scale}</dd></>}
            </dl>
            {(() => {
              const quote = quoteOf(detail.id);
              if (!quote) return <p className="sc-note">Not listed — no live quote for this entity.</p>;
              return <div className="sc-drawer-quote">
                <span>live {quote.currency || ''}</span>
                <span>{Number.isFinite(quote.price) ? formatPrice(quote.price) : '-'} <b className={Number.isFinite(quote.oneDay) ? movement(quote.oneDay) : ''}>{Number.isFinite(quote.oneDay) ? percent(quote.oneDay) : '-'}</b> <small>5D {Number.isFinite(quote.fiveDay) ? percent(quote.fiveDay) : '-'}</small></span>
              </div>;
            })()}
            {(() => {
              const { inbound, outbound } = edgesOf(detail.id);
              return <>
                {inbound.length > 0 && <><div className="sc-drawer-section">SUPPLIED BY ({inbound.length})</div>
                  <ul className="sc-drawer-list">{inbound.map((item) => <li key={item.index}><button type="button" onClick={() => setDetail({ type: 'edge', index: item.index })}>{ENTITIES[item.otherId].name}</button><span>{item.edge.pct}</span></li>)}</ul></>}
                {outbound.length > 0 && <><div className="sc-drawer-section">SUPPLIES ({outbound.length})</div>
                  <ul className="sc-drawer-list">{outbound.map((item) => <li key={item.index}><button type="button" onClick={() => setDetail({ type: 'edge', index: item.index })}>{ENTITIES[item.otherId].name}</button><span>{item.edge.pct}</span></li>)}</ul></>}
              </>;
            })()}
            {FOCUS_IDS.includes(detail.id) && detail.id !== focus && <>
              <div className="sc-drawer-section">NAVIGATE</div>
              <div className="sc-drawer-nav"><button type="button" onClick={() => reroot(detail.id)}>Re-root on {detailEntity.name} &#8594;</button></div>
            </>}
          </>}
        </div>
      </aside>
    </>}
  </main>;
}
