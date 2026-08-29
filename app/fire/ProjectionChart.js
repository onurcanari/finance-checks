'use client';

import { useEffect, useRef } from 'react';
import { LineSeries, createChart } from 'lightweight-charts';

const formatMoney = (value, currency) => new Intl.NumberFormat(currency === 'TRY' ? 'tr-TR' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);

export default function ProjectionChart({ scenarios, target, currency }) {
  const chartRef = useRef(null);
  const tooltipRef = useRef(null);
  const chartApiRef = useRef(null);

  useEffect(() => {
    const container = chartRef.current;
    if (!container) return undefined;
    const chart = createChart(container, { height: 280, layout: { background: { color: 'transparent' }, textColor: '#81908c', fontFamily: 'Cascadia Mono, Consolas, monospace', fontSize: 10 }, grid: { vertLines: { color: '#263132' }, horzLines: { color: '#263132' } }, rightPriceScale: { borderColor: '#344142' }, timeScale: { borderColor: '#344142', timeVisible: false, rightOffset: 2 }, crosshair: { vertLine: { color: '#c8ff38', width: 1, style: 2 }, horzLine: { color: '#c8ff38', width: 1, style: 2 } }, handleScale: true, handleScroll: true });
    const targetLine = chart.addSeries(LineSeries, { color: '#c8ff38', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    const lines = scenarios.map((scenario) => ({ scenario, series: chart.addSeries(LineSeries, { color: scenario.color, lineWidth: scenario.id === 'base' ? 3 : 2, priceLineVisible: false, lastValueVisible: false }) }));
    lines.forEach(({ scenario, series }) => series.setData(scenario.data)); targetLine.setData(scenarios[0].data.map(({ time }) => ({ time, value: target }))); chart.timeScale().fitContent(); chartApiRef.current = chart;
    const tooltip = tooltipRef.current;
    const move = (param) => { if (!tooltip || !param.point || !param.time || param.point.x < 0 || param.point.y < 0 || param.point.x > container.clientWidth || param.point.y > container.clientHeight) { if (tooltip) tooltip.hidden = true; return; } const points = lines.map(({ scenario, series }) => ({ ...scenario, point: param.seriesData.get(series) })).filter(({ point }) => point); if (!points.length) return; const date = typeof param.time === 'string' ? param.time : `${param.time.year}-${String(param.time.month).padStart(2, '0')}-${String(param.time.day).padStart(2, '0')}`; tooltip.innerHTML = `<b>${new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}</b>${points.map(({ label, color, point }) => `<span style="--scenario-color:${color}"><i>${label}</i><strong>${formatMoney(point.value, currency)}</strong></span>`).join('')}`; tooltip.hidden = false; tooltip.style.left = `${Math.min(Math.max(8, param.point.x + 12), container.clientWidth - tooltip.offsetWidth - 8)}px`; tooltip.style.top = `${Math.min(Math.max(8, param.point.y - 12), container.clientHeight - tooltip.offsetHeight - 8)}px`; };
    chart.subscribeCrosshairMove(move);
    const resize = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth })); resize.observe(container);
    return () => { resize.disconnect(); chart.unsubscribeCrosshairMove(move); chart.remove(); chartApiRef.current = null; };
  }, [scenarios, target, currency]);

  const zoom = (factor) => { const scale = chartApiRef.current?.timeScale(); const range = scale?.getVisibleLogicalRange(); if (!scale || !range) return; const center = (range.from + range.to) / 2; const half = (range.to - range.from) * factor / 2; scale.setVisibleLogicalRange({ from: center - half, to: center + half }); };
  return <div className="projection-chart-shell"><div className="projection-chart" ref={chartRef} role="img" aria-label="Interactive portfolio projection chart with 7 percent base, S&P 500 8 percent, and Nasdaq-100 10 percent scenarios. Drag to pan and use the mouse wheel or pinch to zoom." /><div ref={tooltipRef} className="projection-tooltip" role="status" hidden /><div className="projection-controls" aria-label="Chart viewport controls"><button type="button" onClick={() => zoom(.65)} aria-label="Zoom in on projection">ZOOM IN +</button><button type="button" onClick={() => zoom(1.5)} aria-label="Zoom out on projection">ZOOM OUT −</button><button type="button" onClick={() => chartApiRef.current?.timeScale().fitContent()}>RESET VIEW</button></div></div>;
}
