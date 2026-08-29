'use client';

import { useEffect, useRef, useState } from 'react';
import { Header, SourceBadge } from '../components';

const STORAGE_KEY = 'fire-planner';
const USD_DEFAULTS = [['Rent', 1800], ['Utilities', 250], ['Groceries', 600], ['Transportation', 400], ['Insurance', 300], ['Healthcare', 200], ['Lifestyle', 250], ['Other', 200]];
const emptyExpenses = () => USD_DEFAULTS.map(([name], id) => ({ id, name, amount: 0 }));
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const lira = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
const validNumber = (value) => Number.isFinite(value) && value >= 0;
const validRate = (value) => Number.isFinite(value) && value > 0;
const copyExpenses = (items) => items.map((item, id) => ({ ...item, id }));

export default function FirePage() {
  const [expenses, setExpenses] = useState(emptyExpenses);
  const [income, setIncome] = useState(0);
  const [portfolio, setPortfolio] = useState(0);
  const [inputCurrency, setInputCurrency] = useState('TRY');
  const [rate, setRate] = useState();
  const [rateStatus, setRateStatus] = useState('LOADING RATE...');
  const [usingCache, setUsingCache] = useState(false);
  const [draft, setDraft] = useState();
  const closeRef = useRef();
  const recordRef = useRef();
  const touchedRef = useRef(false);

  const persist = (record) => { recordRef.current = record; try { localStorage.setItem(STORAGE_KEY, JSON.stringify(record)); } catch { /* storage may be unavailable */ } };
  const makeRecord = (nextExpenses, nextIncome, nextPortfolio, nextRate = rate) => ({ expenses: nextExpenses, income: nextIncome, portfolio: nextPortfolio, inputCurrency: 'TRY', ...(nextRate ? { rate: nextRate.rate, rateBase: nextRate.base, rateQuote: nextRate.quote, rateDate: nextRate.date, rateFetchedAt: nextRate.fetchedAt, rateSource: nextRate.source } : {}) });

  const applyRate = (nextRate, fallback = false) => {
    setRate(nextRate); setUsingCache(fallback); setRateStatus(fallback ? 'USING CACHED RATE' : 'RATE LIVE');
    if ((recordRef.current && recordRef.current.inputCurrency !== 'TRY') || inputCurrency === 'USD') {
      const sourceExpenses = recordRef.current?.expenses || expenses;
      const sourceIncome = recordRef.current?.income ?? income; const sourcePortfolio = recordRef.current?.portfolio ?? portfolio;
      const migrated = copyExpenses(sourceExpenses).map((item) => ({ ...item, amount: item.amount * nextRate.rate }));
      const nextIncome = sourceIncome * nextRate.rate; const nextPortfolio = sourcePortfolio * nextRate.rate;
      setExpenses(migrated); setIncome(nextIncome); setPortfolio(nextPortfolio); setInputCurrency('TRY');
      persist(makeRecord(migrated, nextIncome, nextPortfolio, nextRate));
    } else if (!recordRef.current) {
      const defaults = copyExpenses(USD_DEFAULTS.map(([name, amount], id) => ({ id, name, amount: amount * nextRate.rate })));
      const nextIncome = 7000 * nextRate.rate; const nextPortfolio = 100000 * nextRate.rate;
      if (!touchedRef.current) { setExpenses(defaults); setIncome(nextIncome); setPortfolio(nextPortfolio); persist(makeRecord(defaults, nextIncome, nextPortfolio, nextRate)); }
      else persist(makeRecord(expenses, income, portfolio, nextRate));
    } else {
      const canonical = recordRef.current || { expenses, income, portfolio };
      persist(makeRecord(canonical.expenses, canonical.income, canonical.portfolio, nextRate));
    }
  };

  const fetchRate = async () => {
    setRateStatus('LOADING RATE...');
    try {
      const response = await fetch('/api/exchange-rate', { cache: 'no-store' }); const payload = await response.json();
      if (!response.ok || payload.base !== 'USD' || payload.quote !== 'TRY' || !validRate(Number(payload.rate))) throw Error('Invalid rate');
      applyRate({ ...payload, rate: Number(payload.rate) });
    } catch {
      const cached = recordRef.current?.rate && validRate(Number(recordRef.current.rate)) ? { rate: Number(recordRef.current.rate), base: recordRef.current.rateBase || 'USD', quote: recordRef.current.rateQuote || 'TRY', date: recordRef.current.rateDate, fetchedAt: recordRef.current.rateFetchedAt, source: recordRef.current.rateSource } : undefined;
      if (cached) applyRate(cached, true); else setRateStatus('RATE UNAVAILABLE');
    }
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY); const parsed = stored?.trim() ? JSON.parse(stored) : null;
      const validExpenses = Array.isArray(parsed?.expenses) && parsed.expenses.every((item) => typeof item?.name === 'string' && item.name.trim() && validNumber(Number(item.amount)));
      if (parsed && validExpenses && validNumber(Number(parsed.income)) && validNumber(Number(parsed.portfolio))) {
        const savedExpenses = copyExpenses(parsed.expenses.map((item) => ({ name: item.name.trim(), amount: Number(item.amount) })));
        setExpenses(savedExpenses); setIncome(Number(parsed.income)); setPortfolio(Number(parsed.portfolio)); setInputCurrency(parsed.inputCurrency === 'TRY' ? 'TRY' : 'USD');
        recordRef.current = { ...parsed, expenses: savedExpenses };
        if (parsed.inputCurrency === 'TRY' && validRate(Number(parsed.rate))) { const cached = { rate: Number(parsed.rate), base: parsed.rateBase || 'USD', quote: parsed.rateQuote || 'TRY', date: parsed.rateDate, fetchedAt: parsed.rateFetchedAt, source: parsed.rateSource }; setRate(cached); }
      } else { recordRef.current = undefined; }
    } catch { recordRef.current = undefined; }
    fetchRate();
  }, []);

  const updateProfile = (key, value) => { touchedRef.current = true; const next = Math.max(0, Number(value) || 0); if (key === 'income') setIncome(next); else setPortfolio(next); if (inputCurrency === 'TRY') persist(makeRecord(expenses, key === 'income' ? next : income, key === 'portfolio' ? next : portfolio)); };
  const openEditor = () => { setDraft(copyExpenses(expenses)); setTimeout(() => closeRef.current?.focus(), 0); };
  const closeEditor = () => setDraft();
  useEffect(() => { if (!draft) return; const onKey = (event) => event.key === 'Escape' && closeEditor(); document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, [draft]);
  const updateDraft = (index, changes) => setDraft((current) => current.map((row, i) => i === index ? { ...row, ...changes } : row));
  const updateDraftAmount = (index, value, currency) => {
    const numeric = Number(value);
    if (!validNumber(numeric) || (currency === 'USD' && !validRate(rate?.rate))) return;
    updateDraft(index, { amount: currency === 'USD' ? numeric * rate.rate : numeric });
  };
  const saveExpenses = (event) => { event.preventDefault(); const saved = draft.filter((item) => item.name.trim() && validNumber(item.amount)).map((item, id) => ({ ...item, id, name: item.name.trim(), amount: Math.max(0, item.amount) })); touchedRef.current = true; setExpenses(saved); persist(makeRecord(saved, income, portfolio)); closeEditor(); };

  const monthlyTry = expenses.reduce((sum, item) => sum + (validNumber(Number(item.amount)) ? Number(item.amount) : 0), 0); const ready = validRate(rate?.rate) && inputCurrency === 'TRY';
  const monthlyUsd = ready ? monthlyTry / rate.rate : null; const incomeUsd = ready ? income / rate.rate : null; const portfolioUsd = ready ? portfolio / rate.rate : null;
  const surplusUsd = ready ? incomeUsd - monthlyUsd : null; const annual = ready ? monthlyUsd * 12 : null; const target = annual === null ? null : annual * 25; const progress = target === 0 ? 100 : target === null ? null : Math.min(100, portfolioUsd / target * 100); const remaining = target === null ? null : Math.max(0, target - portfolioUsd); const contribution = surplusUsd === null ? null : surplusUsd * 12;
  const annuityNumerator = target === null ? null : target * .07 + contribution; const annuityDenominator = target === null ? null : portfolioUsd * .07 + contribution;
  let years = null; if (target !== null && target <= portfolioUsd) years = 0; else if (target !== null && Number.isFinite(annuityNumerator) && Number.isFinite(annuityDenominator) && annuityNumerator > 0 && annuityDenominator > 0) { const value = Math.log(annuityNumerator / annuityDenominator) / Math.log(1.07); if (Number.isFinite(value) && value >= 0) years = Math.ceil(value); }
  const projectionReady = ready && [monthlyUsd, incomeUsd, portfolioUsd, surplusUsd, annual, target].every(Number.isFinite);
  const chartReached = projectionReady && years !== null ? years : null;
  const chartYears = projectionReady ? Math.max(1, Math.min(40, (chartReached === null ? 10 : chartReached + 2))) : 0;
  const chartMarker = chartReached !== null && chartReached <= chartYears ? chartReached : null;
  const chartData = projectionReady ? Array.from({ length: chartYears + 1 }, (_, year) => ({ year, value: year === 0 ? portfolioUsd : portfolioUsd * (1.07 ** year) + contribution * ((1.07 ** year - 1) / .07) })) : [];
  const chartMax = chartData.length ? Math.max(target, ...chartData.map((point) => point.value), 1) : 1;
  const chartX = (year) => 34 + year / chartYears * 532;
  const chartY = (value) => 188 - Math.min(1, Math.max(0, value / chartMax)) * 148;
  const portfolioPath = chartData.map((point) => `${chartX(point.year).toFixed(1)},${chartY(point.value).toFixed(1)}`).join(' ');
  const targetY = chartY(target || 0);
  const estimatedYear = chartReached === null ? null : new Date().getFullYear() + chartReached;
  const projection = <section aria-labelledby="projection-title" style={{ borderTop: '1px solid var(--line)', padding: '22px 28px 24px' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline', flexWrap: 'wrap' }}><div><div className="eyebrow">LONG-RANGE PROJECTION / USD</div><h2 id="projection-title" style={{ margin: '8px 0 4px', fontSize: 'clamp(19px, 3vw, 28px)', letterSpacing: '-.06em' }}>Portfolio path to <em style={{ color: 'var(--lime)', fontStyle: 'normal' }}>freedom.</em></h2></div><div aria-live="polite" style={{ color: chartReached === null ? 'var(--muted)' : 'var(--lime)', fontSize: 11, textAlign: 'right' }}>{!projectionReady ? 'PROJECTION UNAVAILABLE' : chartReached === 0 ? 'FIRE REACHED · TODAY' : estimatedYear ? `ESTIMATED FIRE · ${estimatedYear}` : 'NOT REACHABLE WITH CURRENT SURPLUS'}</div></div>{projectionReady ? <div style={{ marginTop: 20, overflow: 'auto' }}><svg viewBox="0 0 600 220" role="img" aria-labelledby="projection-title projection-description" style={{ display: 'block', width: '100%', minWidth: 420, height: 'auto' }}><title id="projection-description">Projected portfolio at 7 percent annual return with yearly contributions from the current monthly surplus, compared with the FIRE target.</title><line x1="34" y1={targetY} x2="566" y2={targetY} stroke="var(--lime)" strokeDasharray="5 5" strokeWidth="1.5" /><text x="566" y={Math.max(13, targetY - 7)} textAnchor="end" fill="var(--lime)" fontSize="10">TARGET {money.format(target)}</text><line x1="34" y1="188" x2="566" y2="188" stroke="var(--line)" /><polyline points={portfolioPath} fill="none" stroke="var(--cyan)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /><polygon points={`34,188 ${portfolioPath} 566,188`} fill="var(--cyan)" opacity=".08" />{chartMarker !== null && <circle cx={chartX(chartMarker)} cy={chartY(chartData[chartMarker].value)} r="5" fill="var(--lime)" stroke="var(--bg)" strokeWidth="2" />}<text x="34" y="207" fill="var(--muted)" fontSize="10">TODAY</text><text x="566" y="207" textAnchor="end" fill="var(--muted)" fontSize="10">YEAR {new Date().getFullYear() + chartYears}</text><text x="34" y="15" fill="var(--muted)" fontSize="10">{money.format(chartMax)}</text></svg><div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', color: 'var(--muted)', fontSize: 10, letterSpacing: '.04em' }}><span><i style={{ display: 'inline-block', width: 18, borderTop: '3px solid var(--cyan)', margin: '0 7px 3px 0' }} />PORTFOLIO + SURPLUS</span><span><i style={{ display: 'inline-block', width: 18, borderTop: '2px dashed var(--lime)', margin: '0 7px 3px 0' }} />FIRE TARGET · {money.format(target)}</span><span>MONTHLY SURPLUS {money.format(surplusUsd)} · 7% ANNUAL</span></div></div> : <p style={{ color: 'var(--muted)', margin: '20px 0 0', fontSize: 11 }}>{rate ? (contribution <= 0 ? 'A positive monthly surplus is required to project a reachable FIRE date.' : 'Portfolio values are incomplete or invalid.') : 'Waiting for a valid USD / TRY rate before projecting.'}</p>}</section>;
  const output = (value) => value === null ? 'UNAVAILABLE' : money.format(value);

  return <main className="shell fire-page"><Header active="FIRE" stamp="FIRE PLANNER / USD OUTPUTS · TRY INPUTS" /><section className="fire-hero"><div><div className="eyebrow">FINANCIAL INDEPENDENCE / RETIRE EARLY</div><h1>Find your<br /><em>number.</em></h1><p>A clear view of what your current spending and saving rate could support.</p></div><div className="fire-orbit" aria-hidden="true"><span>4%</span><i /></div></section>
    <section className="profile-strip panel" aria-label="Financial profile"><div><label htmlFor="income">MONTHLY AFTER-TAX INCOME / TRY</label><div className="profile-input"><span>₺</span><input id="income" type="number" min="0" step="100" inputMode="decimal" value={income} onChange={(event) => updateProfile('income', event.target.value)} /></div></div><div><label htmlFor="portfolio">INVESTED PORTFOLIO / TRY</label><div className="profile-input"><span>₺</span><input id="portfolio" type="number" min="0" step="1000" inputMode="decimal" value={portfolio} onChange={(event) => updateProfile('portfolio', event.target.value)} /></div></div><div className="rate-status" aria-live="polite"><span>{rate ? `1 USD = ₺${rate.rate.toFixed(2)}` : rateStatus}</span>{rate && <small>{usingCache ? 'CACHED FALLBACK' : rate.source} · {rate.date || 'date unavailable'}</small>} {rate && <SourceBadge source={usingCache ? `Cached fallback · ${rate.source}` : rate.source} date={rate.date} fetchedAt={rate.fetchedAt} label="USD/TRY exchange rate" />}<button type="button" onClick={fetchRate}>REFRESH RATE</button></div></section>
    <section className="fire-board panel" aria-labelledby="fire-board-title"><div className="panel-title"><span id="fire-board-title">FIRE PLANNER / USD OUTPUTS</span><span className="stamp">4% RULE · 7% RETURN</span></div><div className="fire-content"><div className="expense-block"><div className="eyebrow">MONTHLY EXPENSES / USD</div><strong>{output(monthlyUsd)}</strong><button className="edit-expenses" type="button" onClick={openEditor}>EDIT EXPENSES</button><div className="surplus-line"><span>MONTHLY SURPLUS / USD</span><b className={surplusUsd === null ? '' : surplusUsd >= 0 ? 'up' : 'down'}>{output(surplusUsd)}</b></div></div><div className="fire-results"><div className="result-card"><span className="eyebrow">ANNUAL EXPENSES / USD</span><strong>{output(annual)}</strong><span className="result-rule">monthly × 12</span></div><div className="result-card target"><span className="eyebrow">ESTIMATED FIRE TARGET / USD</span><strong>{output(target)}</strong><span className="result-rule">annual × 25</span></div><div className="result-card progress-card"><span className="eyebrow">PORTFOLIO PROGRESS</span><strong>{progress === null ? 'UNAVAILABLE' : `${progress.toFixed(0)}%`}</strong><span className="result-rule">{remaining === null ? 'Rate required' : `${money.format(remaining)} remaining`}</span><div className="progress-track"><i style={{ width: `${progress || 0}%` }} /></div></div><div className="result-card years-card"><span className="eyebrow">ESTIMATED YEARS TO FIRE</span><strong>{years === null ? 'UNAVAILABLE' : years}</strong><span className="result-rule">{years === null ? (ready ? 'Not reachable with current inputs' : 'Rate required') : '7% annual return'}</span></div></div></div>{projection}<p className="formula-note"><b>FORMULA NOTE</b> USD outputs use 1 USD = current TRY rate. The 4% rule estimates a target of 25× annual expenses; years assume a fixed 7% annual return and annual contributions of surplus × 12.</p></section><div className="status"><span><b className="up">●</b> CALCULATION READY</span><span>TRY INPUTS / USD OUTPUTS</span><span>RATE: {rate ? rate.date || 'LIVE' : 'UNAVAILABLE'}</span></div>
    {draft && <div className="fire-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeEditor()}><section className="fire-modal" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title"><div className="modal-head"><span id="expense-modal-title">EDIT EXPENSES / TRY + USD</span><button ref={closeRef} type="button" onClick={closeEditor}>CLOSE ×</button></div><form onSubmit={saveExpenses}><div className="expense-rows">{draft.map((item, index) => { const usdValue = validRate(rate?.rate) ? item.amount / rate.rate : ''; return <div className="expense-row" key={item.id}><h3 className="expense-heading"><input id={`expense-name-${item.id}`} aria-label={`Edit ${item.name || 'expense'} name`} value={item.name} onChange={(event) => updateDraft(index, { name: event.target.value })} /></h3><div className="expense-prices"><label className="modal-number"><span>TRY</span><input aria-label={`${item.name || 'Expense'} amount in TRY`} type="number" min="0" step="10" value={item.amount} onChange={(event) => updateDraftAmount(index, event.target.value, 'TRY')} /></label><label className="modal-number"><span>USD</span><input aria-label={`${item.name || 'Expense'} amount in USD`} type="number" min="0" step="0.01" value={usdValue} disabled={!validRate(rate?.rate)} placeholder={validRate(rate?.rate) ? undefined : 'UNAVAILABLE'} onChange={(event) => updateDraftAmount(index, event.target.value, 'USD')} /></label></div><button className="delete-expense" type="button" onClick={() => setDraft(draft.filter((_, i) => i !== index))} aria-label={`Delete ${item.name || 'expense'}`}>×</button></div>; })}</div><button className="add-expense" type="button" onClick={() => setDraft([...draft, { id: Date.now(), name: 'New expense', amount: 0 }])}>+ ADD EXPENSE</button><div className="modal-total"><span>COMPUTED MONTHLY TOTAL / TRY</span><strong>{lira.format(draft.reduce((sum, item) => sum + item.amount, 0))}</strong></div><div className="modal-actions"><button type="button" onClick={closeEditor}>CANCEL</button><button className="save-expenses" type="submit">SAVE EXPENSES</button></div></form></section></div>}
  </main>;
}
