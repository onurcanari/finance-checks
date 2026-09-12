// Offline unit tests for app/lib/supply-chain.js — the curated graph and its
// pure helpers. Run with `node --test app/lib/supply-chain.test.js`.
// ZERO network calls: nothing here imports a route or dials out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUYERS,
  CATEGORIES,
  CONCENTRATION,
  CONFIDENCE_LEVELS,
  EDGES,
  ENTITIES,
  FOCUS_IDS,
  SHARE_CHARTS,
  SOURCES,
  edgesOf,
  graphSymbols,
  isFocusId,
  newsSymbolsFor,
  sidesFor,
  sourceById,
  validateGraph,
} from './supply-chain.js';

test('validateGraph: the shipped dataset is internally consistent', () => {
  assert.deepEqual(validateGraph(), []);
});

test('every edge carries a basis and a note explaining its number', () => {
  for (const [index, edge] of EDGES.entries()) {
    assert.ok(edge.basis, `edge ${index} has no basis`);
    assert.ok(edge.note, `edge ${index} has no note`);
  }
});

test('non-background edges cite at least one source', () => {
  // 'background' is the one level allowed to stand on industry structure
  // rather than a document; everything else must be traceable.
  for (const [index, edge] of EDGES.entries()) {
    if (edge.confidence === 'background') continue;
    assert.ok(edge.sources.length > 0, `edge ${index} (${edge.confidence}) cites no source`);
  }
});

test('confidence levels are drawn from the declared set', () => {
  const levels = new Set(EDGES.map((edge) => edge.confidence));
  for (const level of levels) assert.ok(CONFIDENCE_LEVELS.includes(level), `unexpected level ${level}`);
  // All five levels are actually exercised, so the legend is never lying
  // about a level the data does not use.
  for (const level of CONFIDENCE_LEVELS) assert.ok(levels.has(level), `level ${level} is unused`);
});

test('graphSymbols: deduped, sorted, free of nulls', () => {
  const symbols = graphSymbols();
  assert.ok(symbols.length > 30, 'expected the graph to reference 30+ listed entities');
  assert.deepEqual(symbols, [...new Set(symbols)].sort());
  assert.ok(symbols.every((symbol) => typeof symbol === 'string' && symbol.length > 0));
  // Samsung Foundry and Samsung Memory are separate graph nodes sharing one
  // listing — the live layer must fetch 005930.KS exactly once.
  assert.equal(symbols.filter((symbol) => symbol === '005930.KS').length, 1);
  // Private entities and the anonymous 10-Q customers contribute no symbol.
  for (const id of ['openai', 'crusoe', 'vantage', 'custA', 'custB', 'custC', 'custD']) {
    assert.equal(ENTITIES[id].symbol, null, `${id} must not carry a symbol`);
  }
});

test('isFocusId accepts only declared focus entities', () => {
  assert.ok(isFocusId('nvidia'));
  assert.ok(isFocusId('openai'));
  assert.equal(isFocusId('custA'), false);
  assert.equal(isFocusId('AAPL'), false);
  assert.equal(isFocusId(''), false);
  assert.equal(isFocusId(undefined), false);
});

test('sidesFor(nvidia): suppliers and customers land on the right sides', () => {
  const { suppliers, customers } = sidesFor('nvidia');
  const supplierIds = suppliers.flatMap((group) => group.items.map((item) => item.otherId));
  const customerIds = customers.flatMap((group) => group.items.map((item) => item.otherId));
  assert.ok(supplierIds.includes('tsmc'));
  assert.ok(supplierIds.includes('skhynix'));
  assert.ok(customerIds.includes('openai'));
  assert.ok(customerIds.includes('custA'));
  // Nvidia buys from TSMC and sells to nobody upstream of it: no id may appear
  // on both sides of the same map.
  assert.equal(supplierIds.filter((id) => customerIds.includes(id)).length, 0);
});

test('sidesFor: groups follow CATEGORIES order and carry their labels', () => {
  const order = Object.keys(CATEGORIES);
  for (const id of FOCUS_IDS) {
    for (const side of Object.values(sidesFor(id))) {
      const indices = side.map((group) => order.indexOf(group.category));
      assert.deepEqual(indices, [...indices].sort((a, b) => a - b), `${id}: groups out of order`);
      for (const group of side) {
        assert.equal(group.label, CATEGORIES[group.category].label);
        assert.ok(group.items.length > 0);
      }
    }
  }
});

test('sidesFor: TSMC appears twice for Nvidia — wafers and CoWoS are separate edges', () => {
  const { suppliers } = sidesFor('nvidia');
  const tsmcEdges = suppliers.flatMap((group) => group.items).filter((item) => item.otherId === 'tsmc');
  assert.equal(tsmcEdges.length, 2);
  assert.deepEqual(tsmcEdges.map((item) => item.edge.c).sort(), ['logic', 'pkg']);
});

test('sidesFor: every focus entity renders a non-empty map', () => {
  for (const id of FOCUS_IDS) {
    const { suppliers, customers } = sidesFor(id);
    assert.ok(suppliers.length + customers.length > 0, `${id} has no edges to draw`);
  }
});

test('sidesFor: an unknown id yields empty sides rather than throwing', () => {
  assert.deepEqual(sidesFor('nope'), { suppliers: [], customers: [] });
});

test('edge indices returned by sidesFor address the right EDGES entry', () => {
  const { suppliers, customers } = sidesFor('oracle');
  for (const group of [...suppliers, ...customers]) {
    for (const item of group.items) {
      assert.equal(EDGES[item.index], item.edge);
      assert.ok(item.edge.s === 'oracle' || item.edge.b === 'oracle');
    }
  }
});

test('edgesOf: inbound and outbound match the edge direction', () => {
  const { inbound, outbound } = edgesOf('tsmc');
  assert.ok(inbound.every((item) => item.edge.b === 'tsmc'));
  assert.ok(outbound.every((item) => item.edge.s === 'tsmc'));
  assert.ok(inbound.some((item) => item.otherId === 'asml'));
  assert.ok(outbound.some((item) => item.otherId === 'nvidia'));
});

test('newsSymbolsFor: focus symbol leads, counterparties follow, capped', () => {
  const symbols = newsSymbolsFor('nvidia');
  assert.equal(symbols[0], 'NVDA');
  assert.ok(symbols.length <= 6);
  assert.deepEqual(symbols, [...new Set(symbols)]);
  assert.equal(newsSymbolsFor('nvidia', 2).length, 2);
});

test('newsSymbolsFor: a private focus still returns its listed counterparties', () => {
  const symbols = newsSymbolsFor('openai');
  assert.equal(symbols.includes('NVDA'), true);
  // OpenAI itself is unlisted, so it contributes no symbol of its own.
  assert.equal(symbols.includes(null), false);
});

test('newsSymbolsFor: rejects ids that are not focus entities', () => {
  assert.deepEqual(newsSymbolsFor('custA'), []);
  assert.deepEqual(newsSymbolsFor('../../etc/passwd'), []);
});

test('sourceById resolves known ids and returns null otherwise', () => {
  assert.equal(sourceById('toms_asic').kind, 'research');
  assert.equal(sourceById('missing'), null);
});

test('sources are http(s) links with a kind the legend explains', () => {
  const kinds = new Set(CONFIDENCE_LEVELS);
  for (const source of SOURCES) {
    assert.match(source.url, /^https:\/\//, `${source.id} is not an https link`);
    assert.ok(kinds.has(source.kind), `${source.id} has kind ${source.kind}`);
    assert.ok(source.title && source.detail, `${source.id} is missing title/detail`);
  }
  assert.equal(SOURCES.length, new Set(SOURCES.map((source) => source.id)).size, 'duplicate source id');
});

test('share charts: values are positive and rows point at real entities', () => {
  for (const chart of SHARE_CHARTS) {
    assert.ok(chart.rows.length >= 3, `${chart.id} has too few rows`);
    assert.ok(chart.note, `${chart.id} has no note`);
    for (const row of chart.rows) {
      assert.ok(row.value > 0, `${chart.id}/${row.name} is not positive`);
      if (row.id !== null) assert.ok(ENTITIES[row.id], `${chart.id}/${row.name} points at unknown entity ${row.id}`);
      // Rows covering several companies name all of them, so no real company
      // hides inside a combined label.
      for (const id of row.ids || []) assert.ok(ENTITIES[id], `${chart.id}/${row.name} lists unknown entity ${id}`);
    }
    const total = chart.rows.reduce((sum, row) => sum + row.value, 0);
    // Charts either cover the whole market (with a residual row) or a named
    // subset; either way a total above 100 would mean double counting.
    assert.ok(total <= 100.5, `${chart.id} sums to ${total}`);
  }
});

test('concentration: the disclosed segments sum to 100 with the residual', () => {
  const total = CONCENTRATION.segments.reduce((sum, segment) => sum + segment.value, 0);
  assert.equal(total, 100);
  const disclosed = CONCENTRATION.segments.filter((segment) => !segment.muted);
  assert.equal(disclosed.reduce((sum, segment) => sum + segment.value, 0), 61);
  // Each disclosed customer is above Nvidia's 10% reporting threshold.
  assert.ok(disclosed.every((segment) => segment.value >= 10));
  assert.ok(CONCENTRATION.speculation.length > 0);
});

test('buyer ledger: no aggregate bucket rows, ids resolve, caveats present', () => {
  for (const row of BUYERS) {
    assert.ok(ENTITIES[row.id], `buyer row ${row.buyer} points at unknown entity ${row.id}`);
    assert.ok(row.suppliers.length > 0, `${row.buyer} lists no supplier`);
    assert.ok(row.caveat, `${row.buyer} has no caveat`);
    assert.ok(CONFIDENCE_LEVELS.includes(row.confidence), `${row.buyer} has bad confidence`);
    assert.doesNotMatch(row.buyer, /^(other|others|misc)/i, `${row.buyer} looks like a bucket row`);
  }
  assert.equal(BUYERS.length, new Set(BUYERS.map((row) => row.id)).size, 'duplicate buyer row');
});
