// AI compute supply-chain graph: who supplies whom, at what share.
//
// Two layers, deliberately separated:
//   1. This module — the CURATED graph. Supply allocations ("SK hynix covers
//      ~70% of Nvidia's HBM4") are not published by any market API; they come
//      from filings, research firms and supply-chain reporting. Every edge
//      therefore carries `confidence` and `sources` so the UI can show how
//      solid a number is, and DATA_DATE says when the set was last researched.
//   2. app/api/supply-chain/* — the LIVE layer: Yahoo quotes and headlines for
//      the same entities, fetched per request and merged in the page.
//
// Kept free of React/Next imports so app/lib/supply-chain.test.js can exercise
// it fully offline.

export const DATA_DATE = '2026-09-12';

export const CATEGORIES = {
  logic: { label: 'LOGIC / FOUNDRY', tone: 'cyan' },
  mem: { label: 'MEMORY — HBM/DRAM', tone: 'amber' },
  pkg: { label: 'ADVANCED PACKAGING', tone: 'violet' },
  sub: { label: 'SUBSTRATE', tone: 'violet' },
  design: { label: 'ASIC CO-DESIGN', tone: 'lime' },
  net: { label: 'NETWORKING & OPTICS', tone: 'cyan' },
  sys: { label: 'SYSTEMS / RACK ODM', tone: 'red' },
  pwr: { label: 'POWER', tone: 'amber' },
  cool: { label: 'COOLING', tone: 'cyan' },
  compute: { label: 'COMPUTE CAPACITY', tone: 'lime' },
  shell: { label: 'DATA-CENTER SHELL', tone: 'amber' },
  equip: { label: 'FAB EQUIPMENT', tone: 'muted' },
  anon: { label: 'DIRECT CUSTOMERS (UNNAMED)', tone: 'muted' },
};

// symbol: Yahoo symbol used by the live layer. null = private or not listed
// (and, for the anonymous 10-Q customers, not identifiable at all).
export const ENTITIES = {
  tsmc: { name: 'TSMC', symbol: 'TSM', role: 'Leading-edge foundry + CoWoS packaging', layer: 'FOUNDRY', share: 72.5, shareOf: 'global foundry revenue, Q2 2026', sources: ['trendforce_foundry', 'tribune_tsmc'] },
  samsungfab: { name: 'Samsung Foundry', symbol: '005930.KS', role: 'Foundry', layer: 'FOUNDRY', share: 5.9, shareOf: 'global foundry revenue, Q2 2026', sources: ['trendforce_foundry'] },
  smic: { name: 'SMIC', symbol: '0981.HK', role: 'Foundry — mature + China leading edge', layer: 'FOUNDRY', share: 5.4, shareOf: 'global foundry revenue, Q2 2026', sources: ['trendforce_foundry', 'evertiq_foundry'] },
  skhynix: { name: 'SK hynix', symbol: '000660.KS', role: 'HBM / DRAM', layer: 'HBM', share: 50, shareOf: 'HBM revenue share, Q2 2026', sources: ['sedaily_hbm', 'astute_hbm'] },
  samsungmem: { name: 'Samsung Memory', symbol: '005930.KS', role: 'HBM / DRAM', layer: 'HBM', share: 33, shareOf: 'HBM revenue share, Q2 2026 (21% in Q1)', sources: ['sedaily_hbm'] },
  micron: { name: 'Micron', symbol: 'MU', role: 'HBM / DRAM', layer: 'HBM', share: 17, shareOf: 'HBM revenue share, Q2 2026 — residual of reported SKH+Samsung', sources: ['sedaily_hbm', 'astute_hbm'] },
  broadcom: { name: 'Broadcom', symbol: 'AVGO', role: 'Custom AI ASIC co-design + switch silicon', layer: 'ASIC DESIGN', share: 60, shareOf: 'AI compute ASIC design partnerships', sources: ['toms_asic'] },
  marvell: { name: 'Marvell', symbol: 'MRVL', role: 'Custom AI ASIC co-design', layer: 'ASIC DESIGN', share: 35, shareOf: 'implied residual of the ~95% Broadcom+Marvell duopoly', sources: ['toms_asic', 'cnbc_marvell_google'] },
  mediatek: { name: 'MediaTek', symbol: '2454.TW', role: 'ASIC design — TPU chiplet, US hyperscaler program', layer: 'ASIC DESIGN', sources: ['toms_asic'] },
  alchip: { name: 'Alchip', symbol: '3661.TW', role: 'Turnkey ASIC design house, advanced nodes', layer: 'ASIC DESIGN', sources: ['toms_asic'] },
  nvidia: { name: 'NVIDIA', symbol: 'NVDA', role: 'AI accelerators, NVL rack systems, networking', layer: 'ACCELERATOR' },
  amd: { name: 'AMD', symbol: 'AMD', role: 'Instinct accelerators, EPYC CPUs, Helios racks', layer: 'ACCELERATOR' },
  innolight: { name: 'InnoLight', symbol: '300308.SZ', role: '800G/1.6T optical modules', layer: 'OPTICS', share: 35, shareOf: '800G module shipments, 2026 estimate', sources: ['ipfiber_optics', 'cignal_optics'] },
  eoptolink: { name: 'Eoptolink', symbol: '300502.SZ', role: '800G/1.6T optical modules', layer: 'OPTICS', share: 25, shareOf: 'implied — InnoLight+Eoptolink ≈60% of 800G SFP supply', sources: ['ipfiber_optics'] },
  coherent: { name: 'Coherent', symbol: 'COHR', role: 'Optical modules + components (lasers)', layer: 'OPTICS', share: 16, shareOf: 'all optical transceiver shipments, 2025 (LightCounting)', sources: ['cignal_optics', 'ipfiber_optics'] },
  lumentum: { name: 'Lumentum', symbol: 'LITE', role: 'Optical components / lasers', layer: 'OPTICS', sources: ['ipfiber_optics'] },
  foxconn: { name: 'Foxconn (Hon Hai)', symbol: '2317.TW', role: 'AI rack / server integration', layer: 'ODM' },
  quanta: { name: 'Quanta', symbol: '2382.TW', role: 'AI rack / server integration', layer: 'ODM' },
  wistron: { name: 'Wistron', symbol: '3231.TW', role: 'GPU board + rack integration', layer: 'ODM' },
  dell: { name: 'Dell Technologies', symbol: 'DELL', role: 'AI server OEM', layer: 'OEM' },
  supermicro: { name: 'Super Micro', symbol: 'SMCI', role: 'AI server OEM', layer: 'OEM' },
  hpe: { name: 'HPE', symbol: 'HPE', role: 'AI server OEM', layer: 'OEM' },
  vertiv: { name: 'Vertiv', symbol: 'VRT', role: 'Power + precision/liquid cooling', layer: 'POWER & COOLING', share: 23, shareOf: 'precision cooling, global', sources: ['introl_cooling', 'lightwave_dcpi'] },
  schneider: { name: 'Schneider Electric', symbol: 'SU.PA', role: 'Data-center power + cooling', layer: 'POWER & COOLING', share: 23, shareOf: "DC physical infrastructure — tied with Vertiv within 0.1pt (Dell'Oro)", sources: ['lightwave_dcpi'] },
  eaton: { name: 'Eaton', symbol: 'ETN', role: 'Electrical distribution', layer: 'POWER', sources: ['lightwave_dcpi', 'introl_cooling'] },
  delta: { name: 'Delta Electronics', symbol: '2308.TW', role: 'Power supplies / busway / cooling', layer: 'POWER', sources: ['mnm_dcpower'] },
  abb: { name: 'ABB', symbol: 'ABBN.SW', role: 'Electrical distribution', layer: 'POWER', sources: ['mnm_dcpower'] },
  gevernova: { name: 'GE Vernova', symbol: 'GEV', role: 'Gas turbines / grid equipment', layer: 'POWER GENERATION', sources: ['techcrunch_chevron'] },
  caterpillar: { name: 'Caterpillar — Solar Turbines', symbol: 'CAT', role: 'On-site turbines / gensets', layer: 'POWER GENERATION', sources: ['techcrunch_chevron'] },
  bloom: { name: 'Bloom Energy', symbol: 'BE', role: 'On-site solid-oxide fuel cells', layer: 'POWER GENERATION', sources: ['bloom_q2', 'bloom_report'] },
  asml: { name: 'ASML', symbol: 'ASML', role: 'EUV lithography — sole source', layer: 'EQUIPMENT' },
  amkor: { name: 'Amkor', symbol: 'AMKR', role: 'OSAT — assembly & test', layer: 'PACKAGING' },
  ase: { name: 'ASE Technology', symbol: 'ASX', role: 'OSAT — assembly & test', layer: 'PACKAGING' },
  ibiden: { name: 'Ibiden', symbol: '4062.T', role: 'ABF substrate', layer: 'SUBSTRATE' },
  shinko: { name: 'Shinko Electric', symbol: '6967.T', role: 'ABF substrate', layer: 'SUBSTRATE' },
  unimicron: { name: 'Unimicron', symbol: '3037.TW', role: 'ABF substrate', layer: 'SUBSTRATE' },
  crusoe: { name: 'Crusoe', symbol: null, role: 'Data-center developer / operator', layer: 'SHELL', private: true },
  vantage: { name: 'Vantage Data Centers', symbol: null, role: 'Hyperscale data-center developer', layer: 'SHELL', private: true },
  arista: { name: 'Arista Networks', symbol: 'ANET', role: 'Ethernet switching', layer: 'NETWORKING' },

  microsoft: { name: 'Microsoft', symbol: 'MSFT', role: 'Hyperscaler — Azure, Maia', layer: 'BUYER', scale: '$110–120B capex, 2026', sources: ['valueadd_capex', 'cnbc_capex'] },
  meta: { name: 'Meta', symbol: 'META', role: 'Hyperscaler — MTIA', layer: 'BUYER', scale: '$125–145B capex, 2026', sources: ['valueadd_capex'] },
  amazon: { name: 'Amazon (AWS)', symbol: 'AMZN', role: 'Hyperscaler — Trainium', layer: 'BUYER', scale: '~$200B capex, 2026', sources: ['valueadd_capex'] },
  google: { name: 'Google (Alphabet)', symbol: 'GOOGL', role: 'Hyperscaler — TPU', layer: 'BUYER', scale: '$175–185B capex, 2026', sources: ['valueadd_capex'] },
  oracle: { name: 'Oracle', symbol: 'ORCL', role: 'Cloud — OCI / Stargate', layer: 'BUYER', scale: 'FY27 capex guided $80–100B', sources: ['benzinga_oracle'] },
  openai: { name: 'OpenAI', symbol: null, role: 'AI lab — compute buyer', layer: 'BUYER', private: true, scale: '~26 GW contracted across Nvidia / AMD / Broadcom', sources: ['fierce_deals', 'builtin_openai'] },
  apple: { name: 'Apple', symbol: 'AAPL', role: 'Consumer silicon', layer: 'BUYER' },
  coreweave: { name: 'CoreWeave', symbol: 'CRWV', role: 'Neocloud / GPU rental', layer: 'BUYER' },
  custA: { name: 'Customer A', symbol: null, role: 'Nvidia direct customer above the 10% disclosure threshold', layer: 'UNNAMED', private: true },
  custB: { name: 'Customer B', symbol: null, role: 'Nvidia direct customer above the 10% disclosure threshold', layer: 'UNNAMED', private: true },
  custC: { name: 'Customer C', symbol: null, role: 'Nvidia direct customer above the 10% disclosure threshold', layer: 'UNNAMED', private: true },
  custD: { name: 'Customer D', symbol: null, role: 'Nvidia direct customer above the 10% disclosure threshold', layer: 'UNNAMED', private: true },
};

// supplier -> buyer. pct is what the UI prints; basis says what that % is OF.
export const EDGES = [
  { s: 'tsmc', b: 'nvidia', c: 'logic', pct: '~100%', basis: "of Nvidia's leading-edge AI GPU wafers (N4P Blackwell → N3P Rubin)", confidence: 'research', note: "Single-sourced at the leading edge. The relationship runs the other way too: Nvidia became TSMC's largest customer in 2025 at 19% of TSMC revenue (NT$726.9B ≈ US$23.2B), passing Apple for the first time since about 2014.", sources: ['digitimes_tsmc', 'cnbc_tsmc_nvda', 'techpowerup_tsmc'] },
  { s: 'tsmc', b: 'nvidia', c: 'pkg', pct: '~60%', basis: "of TSMC's total 2026 CoWoS capacity, allocated to Nvidia", confidence: 'research', note: 'CoWoS (chip-on-wafer-on-substrate) is the interposer step that fuses the GPU die with its HBM stacks. Alongside HBM supply it has been the binding constraint on Blackwell output.', sources: ['intuition_gb200', 'semiconductorx_nvda', 'oplexa_pkg'] },
  { s: 'skhynix', b: 'nvidia', c: 'mem', pct: '~70%', basis: "of Nvidia's HBM4 order book for Vera Rubin", confidence: 'press', note: "Reported at 'about two-thirds' in January 2026 and ~70% by mid-year — above the >50% that had been expected. SK hynix shipped roughly $5.2B of HBM to Nvidia in Q1 2026 alone, +62.6% YoY.", sources: ['trendforce_hbm4', 'seekingalpha_70', 'biggo_skh'] },
  { s: 'samsungmem', b: 'nvidia', c: 'mem', pct: '~20–25%', basis: 'of Nvidia HBM4 supply — implied residual', confidence: 'speculation', note: 'Samsung and SK hynix were both reported as qualified Rubin HBM4 suppliers with shipments from around March 2026. The split between Samsung and Micron inside the remaining ~30% is not disclosed by any party — this range is inference, not a reported number.', sources: ['trendforce_rubin_hbm4', 'sedaily_hbm'] },
  { s: 'micron', b: 'nvidia', c: 'mem', pct: '~10–15%', basis: 'of Nvidia HBM4 supply — implied residual', confidence: 'speculation', note: "Same caveat as Samsung: derived from Nvidia's ~70% SK hynix allocation and Micron's overall HBM position, not from a disclosed allocation.", sources: ['seekingalpha_70', 'astute_hbm'] },
  { s: 'amkor', b: 'nvidia', c: 'pkg', pct: '—', basis: 'supplementary assembly & test capacity', confidence: 'background', note: "OSATs absorb assembly/test overflow around TSMC's in-house advanced packaging. No 2026 allocation figure is public.", sources: [] },
  { s: 'ase', b: 'nvidia', c: 'pkg', pct: '—', basis: 'supplementary assembly & test capacity', confidence: 'background', note: 'See Amkor. Allocation not disclosed.', sources: [] },
  { s: 'ibiden', b: 'nvidia', c: 'sub', pct: '—', basis: 'ABF substrate for GPU packages', confidence: 'background', note: 'Ibiden, Shinko and Unimicron are the three volume ABF substrate makers for high-end accelerators. Per-customer allocations are not disclosed.', sources: [] },
  { s: 'shinko', b: 'nvidia', c: 'sub', pct: '—', basis: 'ABF substrate', confidence: 'background', note: 'See Ibiden.', sources: [] },
  { s: 'unimicron', b: 'nvidia', c: 'sub', pct: '—', basis: 'ABF substrate', confidence: 'background', note: 'See Ibiden.', sources: [] },
  { s: 'innolight', b: 'nvidia', c: 'net', pct: '~35%', basis: 'of 800G optical module shipments, 2026 estimate', confidence: 'research', note: 'InnoLight and Eoptolink together supply roughly 60% of the 800G SFP modules flowing into Nvidia-order clusters; InnoLight has led all transceiver shipments three years running (23.4% of the whole market in 2025).', sources: ['ipfiber_optics', 'cignal_optics'] },
  { s: 'eoptolink', b: 'nvidia', c: 'net', pct: '~25%', basis: 'implied share of Nvidia-linked 800G module supply', confidence: 'research', note: 'Derived: InnoLight + Eoptolink ≈60% combined, InnoLight ≈35%.', sources: ['ipfiber_optics'] },
  { s: 'coherent', b: 'nvidia', c: 'net', pct: 'part of ~40%', basis: 'the non-Chinese remainder of 800G supply', confidence: 'research', note: 'Coherent, Lumentum and Broadcom split the ~40% of 800G supply not held by InnoLight/Eoptolink; Coherent is also a critical upstream source of lasers for the others.', sources: ['ipfiber_optics'] },
  { s: 'lumentum', b: 'nvidia', c: 'net', pct: 'part of ~40%', basis: 'the non-Chinese remainder of 800G supply', confidence: 'research', note: 'See Coherent.', sources: ['ipfiber_optics'] },
  { s: 'asml', b: 'tsmc', c: 'equip', pct: '100%', basis: 'of EUV lithography tools', confidence: 'background', note: 'ASML is the sole source of EUV scanners worldwide — the hardest single point of failure in the entire chain. No 2026 allocation document is cited here.', sources: [] },
  { s: 'asml', b: 'samsungfab', c: 'equip', pct: '100%', basis: 'of EUV lithography tools', confidence: 'background', note: 'See above.', sources: [] },
  { s: 'asml', b: 'skhynix', c: 'equip', pct: '100%', basis: 'of EUV tools for DRAM/HBM', confidence: 'background', note: 'See above.', sources: [] },
  { s: 'asml', b: 'micron', c: 'equip', pct: '100%', basis: 'of EUV tools for DRAM/HBM', confidence: 'background', note: 'See above.', sources: [] },

  { s: 'nvidia', b: 'custA', c: 'anon', pct: '22%', basis: 'of Nvidia total revenue, Q3 FY2026', confidence: 'official', note: "Disclosed in Nvidia's 10-Q as a direct customer above the 10% threshold, Compute & Networking segment. Identity withheld by Nvidia. Direct customers are usually ODM/OEM/distributor intermediaries (Foxconn, Quanta, Dell, Super Micro) rather than the hyperscaler end-user — but a hyperscaler buying direct would also appear here. Any name attached to 'Customer A' in the press is speculation.", sources: ['fool_conc', 'daloopa_conc', 'cnbc_mystery', 'dcd_mystery'] },
  { s: 'nvidia', b: 'custB', c: 'anon', pct: '15%', basis: 'of Nvidia total revenue, Q3 FY2026', confidence: 'official', note: 'Same disclosure. In Q2 FY2026 the top two were 23% + 16% = 39% of revenue, up from 30% one quarter earlier.', sources: ['fool_conc', 'cnbc_mystery', 'dcd_mystery'] },
  { s: 'nvidia', b: 'custC', c: 'anon', pct: '13%', basis: 'of Nvidia total revenue, Q3 FY2026', confidence: 'official', note: 'Same disclosure.', sources: ['fool_conc', 'daloopa_conc'] },
  { s: 'nvidia', b: 'custD', c: 'anon', pct: '11%', basis: 'of Nvidia total revenue, Q3 FY2026', confidence: 'official', note: 'Four >10% customers = 61% of a $57B quarter. That concentration went from 36% to 61% in a single year.', sources: ['fool_conc', 'daloopa_conc'] },

  { s: 'nvidia', b: 'openai', c: 'compute', pct: '10 GW', basis: 'letter-of-intent capacity built on Nvidia systems', confidence: 'official', note: "Announced with an Nvidia commitment to invest up to $100B in OpenAI as the capacity deploys — the most-cited example of the sector's circular financing.", sources: ['fierce_deals', 'builtin_openai'] },
  { s: 'nvidia', b: 'oracle', c: 'compute', pct: '~$40B', basis: 'GPU procurement for the Abilene / Stargate build', confidence: 'press', note: "Reported figure for Oracle's Nvidia GPU purchase tied to Stargate capacity it then rents on. Oracle has declared 'chip neutrality' after selling its Ampere stake.", sources: ['benzinga_oracle', 'dcf_stargate', 'ciodive_oracle'] },
  { s: 'nvidia', b: 'foxconn', c: 'sys', pct: '—', basis: 'GB300 NVL72 rack integration', confidence: 'press', note: 'Foxconn and Wistron are the named manufacturing partners for Blackwell-generation systems. As ODMs they are plausible candidates for the unnamed >10% direct customers, but Nvidia has never confirmed this.', sources: ['notebookcheck_odm', 'intuition_gb200', 'dcd_mystery'] },
  { s: 'nvidia', b: 'wistron', c: 'sys', pct: '—', basis: 'GPU board / rack integration', confidence: 'press', note: 'See Foxconn.', sources: ['notebookcheck_odm'] },
  { s: 'nvidia', b: 'quanta', c: 'sys', pct: '—', basis: 'rack integration', confidence: 'background', note: 'Named among the ODM class of Nvidia direct customers in reporting on the 10-Q disclosure; no specific contract figure.', sources: ['dcd_mystery'] },
  { s: 'nvidia', b: 'dell', c: 'sys', pct: '—', basis: 'AI server OEM', confidence: 'background', note: 'OEM channel; no disclosed share.', sources: [] },
  { s: 'nvidia', b: 'supermicro', c: 'sys', pct: '—', basis: 'AI server OEM', confidence: 'background', note: 'OEM channel; no disclosed share.', sources: [] },
  { s: 'nvidia', b: 'hpe', c: 'sys', pct: '—', basis: 'AI server OEM', confidence: 'background', note: 'OEM channel; no disclosed share.', sources: [] },
  { s: 'nvidia', b: 'microsoft', c: 'compute', pct: '—', basis: 'GPU purchases inside $110–120B 2026 capex', confidence: 'research', note: 'Microsoft does not break out Nvidia spend. It is one of the four hyperscalers whose capex — around $725B combined in 2026 — funds most of Nvidia data-center revenue.', sources: ['valueadd_capex', 'cnbc_capex'] },
  { s: 'nvidia', b: 'meta', c: 'compute', pct: '—', basis: 'GPU purchases inside $125–145B 2026 capex', confidence: 'research', note: 'Meta raised 2026 capex guidance to $125–145B, from $60–65B planned for 2025.', sources: ['valueadd_capex', 'enkiai_meta'] },
  { s: 'nvidia', b: 'amazon', c: 'compute', pct: '—', basis: 'GPU purchases inside ~$200B 2026 capex', confidence: 'research', note: 'AWS buys Nvidia alongside its own Trainium line.', sources: ['valueadd_capex'] },
  { s: 'nvidia', b: 'google', c: 'compute', pct: '—', basis: 'GPU purchases inside $175–185B 2026 capex', confidence: 'research', note: 'Google buys Nvidia for GCP customers while scaling its own TPU program.', sources: ['valueadd_capex'] },
  { s: 'nvidia', b: 'coreweave', c: 'compute', pct: '—', basis: 'GPU fleet for rental capacity', confidence: 'press', note: 'CoreWeave sits inside the Nvidia/OpenAI/Oracle financing loop as both an Nvidia customer and an Nvidia-backed company.', sources: ['curionic_circular'] },

  { s: 'tsmc', b: 'amd', c: 'logic', pct: '~100%', basis: 'of Instinct MI450 and EPYC Venice wafers (N2/N2P)', confidence: 'research', note: 'The MI450 XCD compute die is on TSMC N2P. Securing N2 capacity at volume is itself a competitive signal — that node is oversubscribed.', sources: ['techinsider_mi400', 'semiconductorx_amd'] },
  { s: 'samsungmem', b: 'amd', c: 'mem', pct: 'majority', basis: 'of 12-high HBM4 stacks for MI400/MI450', confidence: 'press', note: 'Samsung supplies the HBM inside Helios as it enters production — a deliberate second-source strategy while SK hynix is absorbed by the Nvidia Rubin ramp. Each Helios rack carries roughly 31 TB of HBM4.', sources: ['koreaherald_amd_hbm', 'trendforce_helios'] },
  { s: 'micron', b: 'amd', c: 'mem', pct: 'part of the majority', basis: '12-high HBM4 for MI400/MI450 alongside Samsung', confidence: 'press', note: "Samsung and Micron together are reported to provide the bulk of AMD's HBM4 in 2026.", sources: ['koreaherald_amd_hbm', 'x_amd_hbm'] },
  { s: 'skhynix', b: 'amd', c: 'mem', pct: 'minority', basis: 'of AMD HBM4', confidence: 'speculation', note: "SK hynix is described as holding room to expand into AMD's ecosystem while its capacity is committed to Nvidia Rubin. No allocation has been confirmed by either company.", sources: ['trendforce_hbm4', 'x_amd_hbm'] },
  { s: 'amd', b: 'openai', c: 'compute', pct: '6 GW', basis: 'Instinct deployment agreement, first 1 GW in H2 2026', confidence: 'official', note: 'Struck October 2025; includes a warrant structure tying OpenAI to AMD equity as milestones are hit.', sources: ['fierce_deals', 'builtin_openai'] },
  { s: 'amd', b: 'oracle', c: 'compute', pct: '50,000 GPUs', basis: 'MI450 units on OCI from Q3 2026', confidence: 'official', note: "Announced with Oracle's 'chip neutrality' posture — deploy whatever silicon customers ask for.", sources: ['ciodive_oracle'] },
  { s: 'amd', b: 'microsoft', c: 'compute', pct: '—', basis: 'Helios rack-scale systems', confidence: 'press', note: 'Microsoft was named the newest Helios buyer at launch; volume not disclosed.', sources: ['cnbc_helios', 'trendforce_helios'] },

  { s: 'broadcom', b: 'google', c: 'design', pct: 'lead partner', basis: 'of the TPU program — TPU v7, TSMC N3P, dual-chiplet', confidence: 'research', note: 'Broadcom holds roughly 60% of AI compute ASIC design partnerships overall. Google is deliberately multi-sourcing: Broadcom, MediaTek and potentially Marvell each take different parts of the TPU stack.', sources: ['toms_asic', 'tnw_google_marvell'] },
  { s: 'mediatek', b: 'google', c: 'design', pct: 'co-designer', basis: 'of TPU v7 chiplet work', confidence: 'research', note: 'MediaTek expects roughly $2B of AI ASIC revenue in Q4 2026 alone from its first US-hyperscaler accelerator program.', sources: ['toms_asic'] },
  { s: 'marvell', b: 'google', c: 'design', pct: 'expanding', basis: 'inference-chip work alongside Broadcom', confidence: 'press', note: 'Reported as in talks for new Google inference silicon; a warrant lets Google buy up to $12.2B of Marvell shares, vesting toward a $120B purchase threshold. Scope of the design win is not fully disclosed.', sources: ['cnbc_marvell_google', 'tnw_google_marvell', 'futurum_marvell'] },
  { s: 'marvell', b: 'amazon', c: 'design', pct: 'co-designer', basis: 'of Trainium accelerators', confidence: 'research', note: "Part of Marvell's ~$1.5B run-rate custom silicon business across 18 cloud design wins; Marvell guides up to $11B of AI ASIC revenue for 2026.", sources: ['toms_asic'] },
  { s: 'alchip', b: 'amazon', c: 'design', pct: 'co-designer', basis: 'Trainium-generation turnkey ASIC work', confidence: 'background', note: 'Alchip is a pure-play turnkey ASIC house at advanced nodes; per-program roles are not broken out publicly.', sources: ['toms_asic'] },
  { s: 'marvell', b: 'microsoft', c: 'design', pct: 'co-designer', basis: 'of the Maia accelerator', confidence: 'research', note: 'Maia work is split between design partners; Broadcom is also named on the Maia program.', sources: ['toms_asic'] },
  { s: 'broadcom', b: 'microsoft', c: 'design', pct: 'co-designer', basis: 'of the Maia accelerator', confidence: 'research', note: 'See above.', sources: ['toms_asic'] },
  { s: 'broadcom', b: 'meta', c: 'design', pct: 'lead partner', basis: 'of the MTIA accelerator line', confidence: 'research', note: 'MTIA is one of the four flagship Broadcom co-design programs, with Google TPU, Microsoft Maia and the OpenAI Titan program.', sources: ['toms_asic'] },
  { s: 'broadcom', b: 'openai', c: 'design', pct: '10 GW', basis: 'custom accelerator deployment from H2 2026', confidence: 'official', note: "OpenAI's own silicon program ('Titan'), announced October 2025 as a multi-year collaboration.", sources: ['fierce_deals', 'yahoo_openai_broadcom', 'toms_asic'] },
  { s: 'tsmc', b: 'broadcom', c: 'logic', pct: '—', basis: 'wafers for all Broadcom-designed accelerators', confidence: 'background', note: "TPU v7 is on TSMC N3P; Broadcom's ASIC programs are TSMC-based throughout.", sources: ['toms_asic'] },
  { s: 'tsmc', b: 'google', c: 'logic', pct: '—', basis: 'TPU v7 on N3P', confidence: 'research', note: 'Manufactured at TSMC even though designed with Broadcom/MediaTek.', sources: ['toms_asic'] },
  { s: 'tsmc', b: 'amazon', c: 'logic', pct: '—', basis: 'Trainium wafers', confidence: 'background', note: 'Standard for hyperscaler ASICs at advanced nodes.', sources: [] },
  { s: 'tsmc', b: 'apple', c: 'logic', pct: '17%', basis: "Apple's share of TSMC 2025 revenue (NT$645.1B ≈ US$20.5B)", confidence: 'research', note: "Down from 22% in 2024 — not because Apple shrank, but because Nvidia's spend doubled. Apple had been TSMC's top customer since roughly 2014.", sources: ['digitimes_tsmc', 'cnbc_tsmc_nvda'] },
  { s: 'broadcom', b: 'arista', c: 'net', pct: '—', basis: 'Tomahawk-class switch silicon', confidence: 'background', note: 'Merchant switch silicon underpins most Ethernet AI fabrics; per-customer shares are not disclosed.', sources: [] },
  { s: 'arista', b: 'microsoft', c: 'net', pct: '—', basis: 'Ethernet switching for AI clusters', confidence: 'background', note: 'Long-standing hyperscaler relationship; no 2026 figure cited here.', sources: [] },

  { s: 'vertiv', b: 'microsoft', c: 'cool', pct: '—', basis: 'liquid cooling / power distribution', confidence: 'research', note: "Vertiv and Schneider are effectively tied for the data-center physical-infrastructure market, within 0.1 percentage point per Dell'Oro. Vertiv holds about 23% of precision cooling. Per-hyperscaler splits are not published.", sources: ['lightwave_dcpi', 'introl_cooling'] },
  { s: 'vertiv', b: 'oracle', c: 'cool', pct: '—', basis: 'liquid cooling for AI halls', confidence: 'background', note: 'Direct-liquid-cooling revenue more than doubled year over year as racks approach 370 kW; vendor-to-site assignments are not public.', sources: ['introl_cooling', 'techrepublic_cooling'] },
  { s: 'vertiv', b: 'coreweave', c: 'cool', pct: '—', basis: 'liquid cooling', confidence: 'background', note: 'See above.', sources: ['introl_cooling'] },
  { s: 'schneider', b: 'meta', c: 'pwr', pct: '—', basis: 'power distribution / white space', confidence: 'research', note: 'Schneider, ABB, Eaton, Vertiv and Delta together hold roughly 41–43% of the data-center power market.', sources: ['mnm_dcpower', 'lightwave_dcpi'] },
  { s: 'eaton', b: 'amazon', c: 'pwr', pct: '—', basis: 'electrical distribution', confidence: 'research', note: 'Part of the same 41–43% oligopoly in data-center power.', sources: ['mnm_dcpower'] },
  { s: 'delta', b: 'foxconn', c: 'pwr', pct: '—', basis: 'rack power supplies / busway for AI racks', confidence: 'background', note: 'Delta is a primary power-electronics source inside Taiwanese rack integration.', sources: ['mnm_dcpower'] },
  { s: 'gevernova', b: 'microsoft', c: 'pwr', pct: 'majority of site power', basis: 'two large turbines on the Microsoft–Chevron gas project', confidence: 'press', note: 'Two GE Vernova turbines generate most of the power for one of the largest gas-fired data-center projects in the US; a Caterpillar subsidiary, Solar Turbines, supplies the rest.', sources: ['techcrunch_chevron'] },
  { s: 'caterpillar', b: 'microsoft', c: 'pwr', pct: 'remainder of site power', basis: 'Solar Turbines units on the same project', confidence: 'press', note: 'See GE Vernova.', sources: ['techcrunch_chevron'] },
  { s: 'bloom', b: 'oracle', c: 'pwr', pct: '—', basis: 'on-site fuel cells for AI capacity', confidence: 'press', note: "Bloom's Q2 2026 revenue hit a record $1.1B, +166% YoY, with FY guidance raised to $3.9–4.2B on data-center demand. Site-level customer assignments are largely undisclosed.", sources: ['bloom_q2', 'bloom_report'] },
  { s: 'crusoe', b: 'oracle', c: 'shell', pct: '—', basis: 'Abilene, TX campus operated for Oracle-leased capacity', confidence: 'press', note: "Crusoe operates the data center; Oracle installs the GPUs and rents the servers onward — reportedly including about 100,000 GPUs for Microsoft on OpenAI's behalf.", sources: ['dcd_crusoe', 'semianalysis_oracle'] },
  { s: 'vantage', b: 'oracle', c: 'shell', pct: '~1 GW', basis: "Port Washington, WI 'Lighthouse' campus by 2028", confidence: 'official', note: 'Announced jointly by OpenAI, Oracle and Vantage: four hyperscale data centers, nearly 1 GW.', sources: ['vantage_pr', 'aimag_vantage'] },
  { s: 'oracle', b: 'openai', c: 'compute', pct: '>$300B / 5 yrs', basis: 'contracted compute infrastructure', confidence: 'official', note: "Signed July 2025, tied to the US Stargate campuses. It sits behind Oracle's reported ~$638B RPO and its FY27 capex guide of $80–100B.", sources: ['dcf_stargate', 'enkiai_oracle', 'benzinga_oracle'] },
  { s: 'microsoft', b: 'openai', c: 'compute', pct: '—', basis: 'Azure capacity', confidence: 'background', note: 'Historic primary provider; the relationship is now non-exclusive.', sources: ['builtin_openai'] },
  { s: 'coreweave', b: 'openai', c: 'compute', pct: '—', basis: 'rented GPU capacity', confidence: 'press', note: 'Part of the circular Nvidia–OpenAI–Oracle–CoreWeave financing web.', sources: ['curionic_circular'] },
  { s: 'foxconn', b: 'microsoft', c: 'sys', pct: '—', basis: 'integrated AI racks', confidence: 'background', note: 'ODM output flows to hyperscalers; per-customer volumes are not disclosed.', sources: [] },
  { s: 'foxconn', b: 'oracle', c: 'sys', pct: '—', basis: 'integrated AI racks', confidence: 'background', note: 'See above.', sources: [] },
  { s: 'quanta', b: 'meta', c: 'sys', pct: '—', basis: 'integrated AI racks', confidence: 'background', note: 'See above.', sources: [] },
  { s: 'dell', b: 'coreweave', c: 'sys', pct: '—', basis: 'AI servers', confidence: 'background', note: 'OEM channel; no disclosed share.', sources: [] },
];

// Entities the map can be re-rooted on, in picker order.
export const FOCUS_IDS = ['nvidia', 'amd', 'broadcom', 'tsmc', 'skhynix', 'google', 'amazon', 'microsoft', 'meta', 'oracle', 'openai', 'marvell', 'samsungmem', 'micron', 'vertiv', 'foxconn'];

export const SHARE_CHARTS = [
  {
    id: 'foundry', label: 'FOUNDRY', confidence: 'research',
    note: "Q2 2026 revenue share of global foundry (TrendForce). Total market $53.49B, +11.5% QoQ. TSMC at a record 72.5% on fully-utilised 3nm/5nm; SMIC is now 0.5pt behind Samsung. 'Rest of market' is the residual across UMC, GlobalFoundries, HuaHong and others — not a company.",
    rows: [
      { name: 'TSMC', id: 'tsmc', label: '72.5%', value: 72.5, sub: '$40.20B' },
      { name: 'Samsung Foundry', id: 'samsungfab', label: '5.9%', value: 5.9, sub: '$3.26B' },
      { name: 'SMIC', id: 'smic', label: '5.4%', value: 5.4, sub: '$3.01B, +20% QoQ' },
      { name: 'Rest of market', id: null, label: '16.2%', value: 16.2, sub: 'residual', muted: true },
    ],
  },
  {
    id: 'hbm', label: 'HBM', confidence: 'research',
    note: 'Q2 2026 HBM revenue share. SK hynix 50%, Samsung 33% (up from 21% in Q1 as HBM4 ramped), Micron the residual. Numbers move fast and sources disagree: Q1 2026 was reported at SK hynix 56.4% / Samsung 21% / Micron 21%, and full-year bit-output projections put SK hynix near 50% and Samsung near 28%. Treat the ordering as solid and the decimals as soft.',
    rows: [
      { name: 'SK hynix', id: 'skhynix', label: '50%', value: 50, sub: 'Q1: 56.4%' },
      { name: 'Samsung', id: 'samsungmem', label: '33%', value: 33, sub: 'Q1: 21%' },
      { name: 'Micron', id: 'micron', label: '~17%', value: 17, sub: 'Q1: 21%' },
    ],
  },
  {
    id: 'asic', label: 'ASIC CO-DESIGN', confidence: 'research',
    note: "Broadcom and Marvell together control roughly 95% of the custom AI ASIC co-design market. Broadcom's ~60% spans Google TPU, Meta MTIA, Microsoft Maia and the OpenAI Titan program. MediaTek is the credible third entrant, guiding about $2B of AI ASIC revenue in Q4 2026 alone. Marvell's share here is the implied residual, not a reported figure.",
    rows: [
      { name: 'Broadcom', id: 'broadcom', label: '~60%', value: 60, sub: '4 flagship programs' },
      { name: 'Marvell', id: 'marvell', label: '~35%', value: 35, sub: 'implied residual' },
      { name: 'MediaTek + Alchip + others', id: 'mediatek', ids: ['mediatek', 'alchip'], label: '~5%', value: 5, sub: 'emerging', muted: true },
    ],
  },
  {
    id: 'optics', label: 'OPTICAL MODULES', confidence: 'research',
    note: 'InnoLight has led global transceiver shipments three years running — 23.4% of all transceivers in 2025, about seven points ahead of Coherent at ~16% — and roughly 35% of 800G specifically in 2026. InnoLight plus Eoptolink account for ~60% of 800G SFP supply into AI clusters; Coherent, Lumentum and Broadcom split the other ~40%. The AI-facing transceiver market grows from $16.5B in 2025 to about $26B in 2026 as 1.6T becomes the default for new HPC builds.',
    rows: [
      { name: 'InnoLight', id: 'innolight', label: '~35%', value: 35, sub: '800G, 2026e' },
      { name: 'Eoptolink', id: 'eoptolink', label: '~25%', value: 25, sub: 'implied' },
      { name: 'Coherent', id: 'coherent', label: '~16%', value: 16, sub: 'all transceivers, 2025' },
      { name: 'Lumentum / Broadcom / others', id: 'lumentum', ids: ['lumentum', 'broadcom'], label: '~24%', value: 24, sub: 'residual', muted: true },
    ],
  },
  {
    id: 'power', label: 'POWER & COOLING', confidence: 'research',
    note: "Dell'Oro has Schneider Electric and Vertiv 'virtually tied' for data-center physical infrastructure, separated by about 0.1 percentage point. Vertiv holds roughly 23% of precision cooling specifically. Schneider, ABB, Eaton, Vertiv and Delta together take roughly 41–43% of the data-center power market. Direct liquid cooling revenue more than doubled year over year as next-generation racks head toward 370 kW.",
    rows: [
      { name: 'Vertiv', id: 'vertiv', label: '~23%', value: 23, sub: 'precision cooling' },
      { name: 'Schneider Electric', id: 'schneider', label: '~23%', value: 23, sub: 'DCPI, tied w/ Vertiv' },
      { name: 'Eaton + ABB + Delta', id: 'eaton', ids: ['eaton', 'abb', 'delta'], label: '~18%', value: 18, sub: 'within the 41–43% group' },
      { name: 'Everyone else', id: null, label: '~36%', value: 36, sub: 'residual', muted: true },
    ],
  },
];

export const CONCENTRATION = {
  title: 'NVIDIA DIRECT-CUSTOMER CONCENTRATION — Q3 FY2026',
  segments: [
    { key: 'Customer A', value: 22 },
    { key: 'Customer B', value: 15 },
    { key: 'Customer C', value: 13 },
    { key: 'Customer D', value: 11 },
    { key: 'All other customers (each <10%)', value: 39, muted: true },
  ],
  note: 'Four direct customers = 61% of a roughly $57B quarter, all in the Compute & Networking segment. That is up from 36% a year earlier. The split is disclosed; the names are not.',
  speculation: "Who are they? Nvidia declined to say. Two structural facts narrow it: (1) 'direct customer' means whoever Nvidia invoices — typically an ODM/OEM such as Foxconn, Quanta, Dell or Super Micro that integrates boards and racks, not the hyperscaler that ends up running them; (2) end demand is concentrated in Microsoft, Meta, Amazon, Google and Oracle, whose combined 2026 capex is around $725–800B. Press coverage tends to assume the big four hyperscalers; the ODM reading is at least as consistent with the wording. Both remain unverified.",
};

export const BUYERS = [
  { id: 'microsoft', buyer: 'Microsoft', suppliers: ['Nvidia', 'AMD', 'Marvell', 'Broadcom', 'Vertiv', 'GE Vernova', 'Caterpillar', 'Arista', 'Foxconn'], what: 'GPUs; Helios racks; Maia custom accelerator; cooling; on-site gas generation', amount: '$110–120B capex (2026); two GE Vernova turbines + Caterpillar Solar Turbines on the Chevron gas project', confidence: 'research', caveat: "Individual vendor spend is not broken out. Frequently named as a candidate for Nvidia's 'Customer A/B' — unconfirmed." },
  { id: 'meta', buyer: 'Meta', suppliers: ['Nvidia', 'Broadcom', 'Schneider Electric', 'Quanta'], what: 'GPUs; MTIA custom accelerator; power distribution; rack integration', amount: '$125–145B capex (2026), raised from $60–65B planned for 2025', confidence: 'research', caveat: 'MTIA volumes undisclosed. Also a common guess for an unnamed Nvidia >10% customer.' },
  { id: 'amazon', buyer: 'Amazon (AWS)', suppliers: ['Nvidia', 'Marvell', 'Alchip', 'TSMC', 'Eaton'], what: 'GPUs; Trainium accelerators (Marvell/Alchip co-design, TSMC wafers); electrical distribution', amount: '~$200B capex (2026)', confidence: 'research', caveat: 'Trainium-3 unit volumes and the Marvell/Alchip split are not public.' },
  { id: 'google', buyer: 'Google (Alphabet)', suppliers: ['Broadcom', 'MediaTek', 'Marvell', 'TSMC', 'Nvidia'], what: 'TPU v7 (N3P dual-chiplet); new inference silicon; GPUs for GCP customers', amount: '$175–185B capex (2026); Marvell warrant lets Google buy up to $12.2B of MRVL shares', confidence: 'press', caveat: "Marvell's exact TPU-stack scope is reported, not confirmed in detail; Broadcom remains lead partner." },
  { id: 'oracle', buyer: 'Oracle', suppliers: ['Nvidia', 'AMD', 'Crusoe', 'Vantage', 'Bloom Energy', 'Vertiv', 'Foxconn'], what: '~$40B of Nvidia GPUs; 50,000 AMD MI450s from Q3 2026; leased campuses; on-site power', amount: 'FY27 capex guided $80–100B; ~$638B RPO', confidence: 'official', caveat: 'The $40B Nvidia figure is reported rather than filed. Bloom/Vertiv site assignments are inferred from sector reporting.' },
  { id: 'openai', buyer: 'OpenAI', suppliers: ['Nvidia', 'AMD', 'Broadcom', 'Oracle', 'Microsoft', 'CoreWeave'], what: '10 GW Nvidia systems; 6 GW AMD Instinct; 10 GW Broadcom custom accelerators; Oracle-contracted capacity', amount: '>$300B/5yr Oracle contract; up to $100B Nvidia investment alongside the 10 GW LOI', confidence: 'official', caveat: 'Capacity commitments are letters of intent and multi-year frameworks, not delivered hardware. Delivery risk is real: the first AMD gigawatt only lands in H2 2026.' },
  { id: 'apple', buyer: 'Apple', suppliers: ['TSMC'], what: 'Leading-edge consumer SoC wafers', amount: '17% of TSMC 2025 revenue (NT$645.1B ≈ US$20.5B), down from 22% in 2024', confidence: 'research', caveat: "Share fell because Nvidia's spend doubled, not because Apple cut orders." },
  { id: 'nvidia', buyer: 'NVIDIA', suppliers: ['TSMC', 'SK hynix', 'Samsung', 'Micron', 'InnoLight', 'Eoptolink', 'Coherent', 'Amkor', 'Ibiden'], what: 'Wafers + CoWoS; HBM4; 800G/1.6T optics; assembly/test; ABF substrate', amount: '19% of TSMC 2025 revenue (US$23.2B); ~60% of TSMC 2026 CoWoS; ~70% of its HBM4 from SK hynix', confidence: 'press', caveat: "The Samsung/Micron split of Nvidia's residual ~30% HBM4 is inference, not disclosure." },
  { id: 'amd', buyer: 'AMD', suppliers: ['TSMC', 'Samsung', 'Micron', 'SK hynix'], what: 'N2P wafers for MI450 XCD; 12-high HBM4 stacks', amount: '~31 TB of HBM4 per Helios rack; shipments from late Q3 2026', confidence: 'press', caveat: "'Majority from Samsung + Micron' is reported; no party has published an allocation table." },
  { id: 'broadcom', buyer: 'Broadcom', suppliers: ['TSMC'], what: 'Wafers for every co-designed accelerator it ships', amount: '~60% of AI compute ASIC design partnerships', confidence: 'research', caveat: 'Share is a research-firm estimate of design wins, not of revenue.' },
  { id: 'coreweave', buyer: 'CoreWeave', suppliers: ['Nvidia', 'Dell', 'Vertiv'], what: 'GPU fleet; servers; cooling', amount: 'Not disclosed', confidence: 'press', caveat: 'Sits inside the Nvidia–OpenAI–Oracle circular-financing web; exposure is hard to size from outside.' },
  { id: 'foxconn', buyer: 'Foxconn (Hon Hai)', suppliers: ['Nvidia', 'Delta Electronics'], what: 'GPUs and boards for GB300 NVL72 rack integration; rack power electronics', amount: 'Not disclosed', confidence: 'press', caveat: 'As a named Blackwell manufacturing partner it is a plausible unnamed Nvidia >10% direct customer. Never confirmed.' },
  { id: 'wistron', buyer: 'Wistron', suppliers: ['Nvidia'], what: 'GPU board and rack integration', amount: 'Not disclosed', confidence: 'press', caveat: "Same 'Customer A–D' caveat as Foxconn." },
  { id: 'quanta', buyer: 'Quanta', suppliers: ['Nvidia'], what: 'Rack integration', amount: 'Not disclosed', confidence: 'background', caveat: 'Named in coverage of the 10-Q disclosure as part of the ODM class; no figures.' },
  { id: 'arista', buyer: 'Arista Networks', suppliers: ['Broadcom'], what: 'Tomahawk-class merchant switch silicon', amount: 'Not disclosed', confidence: 'background', caveat: 'Merchant-silicon shares per switch vendor are not published.' },
  { id: 'tsmc', buyer: 'TSMC', suppliers: ['ASML'], what: 'EUV lithography scanners', amount: '100% sole-sourced', confidence: 'background', caveat: 'Structural fact rather than a 2026 figure — the single hardest point of failure in the chain.' },
];

export const SOURCES = [
  { id: 'trendforce_foundry', title: 'TrendForce — Global foundry revenue 2Q26', url: 'https://www.trendforce.com/presscenter/news/20260909-13225.html', kind: 'research', detail: 'Q2 2026 foundry revenue $53.49B; TSMC 72.5%, Samsung 5.9%, SMIC 5.4%' },
  { id: 'tribune_tsmc', title: 'The Tribune — TSMC foundry share hits record 72.5%', url: 'https://www.tribuneindia.com/news/ai-boom/tsmcs-global-foundry-market-share-hits-record-72-5-in-q2', kind: 'press', detail: 'Confirms the Q2 2026 record share' },
  { id: 'evertiq_foundry', title: 'Evertiq — SMIC narrows gap with Samsung', url: 'https://evertiq.com/design/2026-09-10-smic-narrows-gap-with-samsung-as-global-foundry-revenue-hits-record-5349-billion', kind: 'press', detail: 'SMIC $3.01B, +20% QoQ' },
  { id: 'sedaily_hbm', title: 'Seoul Economic Daily — Samsung HBM share jumps to 33%', url: 'https://en.sedaily.com/finance/2026/09/03/samsung-doubles-hbm-market-share-to-33-percent-narrowing', kind: 'press', detail: 'Q2 2026: SK hynix 50%, Samsung 33% (from 21%)' },
  { id: 'astute_hbm', title: 'Astute Group — SK hynix holds 62% of HBM; 2026 pivots to HBM4', url: 'https://www.astutegroup.com/news/general/sk-hynix-holds-62-of-hbm-micron-overtakes-samsung-2026-battle-pivots-to-hbm4/', kind: 'research', detail: 'Alternative HBM share series — sources disagree on the exact split' },
  { id: 'digitimes_tsmc', title: 'DigiTimes — Nvidia and Apple orders exceed 40% of TSMC revenue', url: 'https://www.digitimes.com/news/a20251031PD219/tsmc-revenue-profit-apple-nvidia-2025.html', kind: 'research', detail: 'Nvidia 19% / NT$726.9B; Apple 17% / NT$645.1B of TSMC 2025 revenue' },
  { id: 'cnbc_tsmc_nvda', title: "CNBC — Nvidia set to supplant Apple as TSMC's top customer", url: 'https://www.cnbc.com/2026/01/26/nvidia-set-to-supplant-apple-as-tsmcs-largest-customer.html', kind: 'press', detail: "First change at the top of TSMC's customer list since about 2014" },
  { id: 'techpowerup_tsmc', title: "TechPowerUp — Nvidia beats Apple to become TSMC's largest customer", url: 'https://www.techpowerup.com/346835/nvidia-beats-apple-to-become-tsmcs-largest-customer', kind: 'press', detail: 'US$23.2B vs US$20.5B' },
  { id: 'fool_conc', title: "Motley Fool — Blackwell sales, and Nvidia's customer concentration", url: 'https://www.fool.com/investing/2025/11/27/blackwell-off-charts-nvidia-customer-concentration/', kind: 'official', detail: 'Q3 FY26 10-Q: Customers A/B/C/D at 22/15/13/11% = 61% of a $57B quarter' },
  { id: 'daloopa_conc', title: 'Daloopa — Nvidia customer concentration: a Big 4 preview', url: 'https://daloopa.com/blog/analyst-pov/nvidia-customer-concentration-a-big-4-earnings-preview', kind: 'research', detail: 'Concentration rose from 36% to 61% in a year' },
  { id: 'cnbc_mystery', title: "CNBC — Nvidia's top two mystery customers were 39% of Q2 revenue", url: 'https://www.cnbc.com/2025/08/28/nvidias-top-two-mystery-customers-made-up-39percent-of-its-q2-revenue-.html', kind: 'press', detail: 'Nvidia declined to identify Customer A and B' },
  { id: 'dcd_mystery', title: "DCD — Two unnamed customers were almost 40% of Nvidia's Q2 FY26 revenue", url: 'https://www.datacenterdynamics.com/en/news/two-unnamed-customers-accounted-for-almost-40-of-nvidias-q2-2026-revenue/', kind: 'press', detail: 'Explains that direct customers are typically ODM/OEMs, not end users' },
  { id: 'sec_10q', title: 'SEC — Nvidia Form 10-Q', url: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581025000209/nvda-20250727.htm', kind: 'official', detail: 'Primary filing containing the customer-concentration disclosure' },
  { id: 'trendforce_hbm4', title: 'TrendForce — SK hynix to supply about two-thirds of Nvidia HBM4', url: 'https://www.trendforce.com/news/2026/01/28/news-sk-hynix-reportedly-to-supply-about-two-thirds-of-nvidia-hbm4-samsung-targets-early-delivery/', kind: 'research', detail: 'Above the >50% previously expected' },
  { id: 'seekingalpha_70', title: "Seeking Alpha — SK hynix secures 70% of Nvidia's HBM orders for Vera Rubin", url: 'https://seekingalpha.com/news/4543608-sk-hynix-secures-70-percent-of-nvidias-hbm-orders-for-vera-rubin-report', kind: 'press', detail: 'Higher of the two reported allocations' },
  { id: 'trendforce_rubin_hbm4', title: 'TrendForce — Samsung and SK hynix tapped as Rubin HBM4 suppliers', url: 'https://www.trendforce.com/news/2026/03/09/news-samsung-sk%E2%80%AFhynix-reportedly-tapped-as-nvidia-rubin-hbm4-suppliers-shipments-could-start-in-march/', kind: 'press', detail: 'Shipments could start March 2026' },
  { id: 'biggo_skh', title: 'BigGo Finance — SK hynix Nvidia revenue tops ~$5.2B', url: 'https://finance.biggo.com/news/-cg1K54BNl__-4_Gd-0t', kind: 'press', detail: 'Q1 2026 HBM revenue from Nvidia, +62.6% YoY' },
  { id: 'koreaherald_amd_hbm', title: "Korea Herald — Samsung supplies HBM4 as AMD's Helios enters production", url: 'https://www.koreaherald.com/article/10819286', kind: 'press', detail: 'Samsung is the named HBM supplier inside Helios' },
  { id: 'trendforce_helios', title: "TrendForce — AMD's Helios rack challenges Nvidia with an HBM4 edge", url: 'https://www.trendforce.com/news/2026/07/21/news-amds-first-rack-scale-ai-system-helios-challenges-nvidia-with-hbm4-memory-edge-but-reportedly-comes-at-a-higher-price/', kind: 'research', detail: 'Microsoft joins as a Helios customer; ~31 TB HBM4 per rack' },
  { id: 'cnbc_helios', title: 'CNBC — AMD launches Helios, adding Microsoft as newest buyer', url: 'https://www.cnbc.com/2026/07/20/amd-helios-microsoft-ai-nvidia.html', kind: 'press', detail: 'First AMD rack-scale system to target Nvidia NVL' },
  { id: 'techinsider_mi400', title: 'Tech-Insider — AMD MI400 series', url: 'https://tech-insider.org/amd-mi400-series-ai-gpu-data-center-2026/', kind: 'research', detail: 'MI450 XCD on TSMC N2P' },
  { id: 'x_amd_hbm', title: 'Analyst thread — AMD/Samsung HBM analysis', url: 'https://x.com/MikeLongTerm/status/2001352043630338281', kind: 'speculation', detail: 'HBM capacity across all three vendors sold out through 2026; AMD allocation inference' },
  { id: 'semiconductorx_amd', title: 'SemiconductorX — AMD Instinct MI400, EPYC Venice, Helios supply chain', url: 'https://semiconductorx.com/spotlight-amd.html', kind: 'research', detail: 'Supply-chain mapping for the AMD rack stack' },
  { id: 'semiconductorx_nvda', title: 'SemiconductorX — Nvidia AI GPU supply chain, HBM4, CoWoS, Vera Rubin', url: 'https://semiconductorx.com/spotlight-nvidia.html', kind: 'research', detail: 'CoWoS and HBM as the binding constraints' },
  { id: 'intuition_gb200', title: 'IntuitionLabs — Nvidia GB200 supply chain', url: 'https://intuitionlabs.ai/articles/nvidia-gb200-supply-chain', kind: 'research', detail: 'Component-level map of the Blackwell rack' },
  { id: 'oplexa_pkg', title: 'Oplexa — AI chip packaging bottleneck 2026', url: 'https://oplexa.com/ai-chip-packaging-bottleneck-2026/', kind: 'research', detail: "Nvidia holds ~60% of TSMC's 2026 CoWoS allocation" },
  { id: 'notebookcheck_odm', title: 'Notebookcheck — Nvidia secures supply orders from Wistron and Foxconn', url: 'https://www.notebookcheck.net/Blackwell-B100-AI-GPUs-getting-closer-to-launch-as-Nvidia-secures-supply-orders-from-Wistron-and-Foxconn.763844.0.html', kind: 'press', detail: 'Named rack manufacturing partners' },
  { id: 'toms_asic', title: "Tom's Hardware — The custom AI ASIC state of play", url: 'https://www.tomshardware.com/tech-industry/semiconductors/custom-ai-asics-examined-from-broadcom-to-mtia', kind: 'research', detail: 'Broadcom ~60% of design partnerships; Broadcom+Marvell ~95%; TPU v7 on N3P with Broadcom + MediaTek' },
  { id: 'cnbc_marvell_google', title: 'CNBC — Marvell pops on report it will help Google with custom AI chips', url: 'https://www.cnbc.com/2026/04/20/marvell-stock-google-custom-ai-chips.html', kind: 'press', detail: 'Broadcom shares fell on the same report' },
  { id: 'tnw_google_marvell', title: 'TNW — Google in talks with Marvell for AI inference chips', url: 'https://thenextweb.com/news/google-marvell-ai-chips-inference-tpu-broadcom', kind: 'press', detail: 'Multi-supplier TPU architecture' },
  { id: 'futurum_marvell', title: "Futurum — Marvell attaches across Google's TPU stack", url: 'https://futurumgroup.com/insights/marvell-attaches-across-googles-tpu-stack-with-a-warrant-vesting-toward-120b/', kind: 'research', detail: 'Warrant vesting toward a $120B purchase threshold' },
  { id: 'yahoo_openai_broadcom', title: "Yahoo Finance — OpenAI is making its own AI chips with Broadcom's help", url: 'https://finance.yahoo.com/news/openai-making-own-ai-chips-142242173.html', kind: 'press', detail: '10 GW of custom accelerators from H2 2026' },
  { id: 'fierce_deals', title: 'Fierce Network — Encyclopedia of AI deals', url: 'https://www.fierce-network.com/cloud/fierce-networks-encyclopedia-ai-deals', kind: 'press', detail: 'Consolidated ledger of the Nvidia 10 GW, AMD 6 GW, Broadcom 10 GW and Oracle $300B commitments' },
  { id: 'builtin_openai', title: "Built In — OpenAI's $1T infrastructure plan", url: 'https://builtin.com/articles/openai-cloud-deals', kind: 'press', detail: 'Deal-by-deal breakdown of OpenAI compute contracts' },
  { id: 'dcf_stargate', title: "Data Center Frontier — OpenAI and Oracle's $300B Stargate deal", url: 'https://www.datacenterfrontier.com/machine-learning/article/55316610/openai-and-oracles-300b-stargate-deal-building-ais-national-scale-infrastructure', kind: 'press', detail: 'Five-year contract tied to US Stargate campuses' },
  { id: 'enkiai_oracle', title: 'EnkiAI — Oracle AI data centers, $638B RPO', url: 'https://enkiai.com/data-center/oracle-ai-blackstone-partnership/', kind: 'research', detail: 'Backlog and campus strategy' },
  { id: 'benzinga_oracle', title: 'Benzinga — Oracle capex could hit $100B as Stargate expands', url: 'https://www.benzinga.com/analyst-stock-ratings/reiteration/26/06/53035425/oracles-ai-spending-bill-keeps-growing-capex-could-hit-100-billion-as-stargate-expands', kind: 'press', detail: 'FY27 capex guide $80–100B; ~$40B Nvidia GPU procurement' },
  { id: 'ciodive_oracle', title: 'CIO Dive — Oracle teams up with AMD and Nvidia', url: 'https://www.ciodive.com/news/oracle-amd-nvidia-AI-infrastructure/802772/', kind: 'official', detail: '50,000 AMD MI450 GPUs on OCI from Q3 2026' },
  { id: 'dcd_crusoe', title: 'DCD — Oracle to lease Texas data center from Crusoe', url: 'https://www.datacenterdynamics.com/en/news/oracle-to-lease-texas-data-center-from-cryptomining-and-ai-firm-crusoe-report/', kind: 'press', detail: 'Abilene campus; Oracle installs GPUs and rents onward' },
  { id: 'semianalysis_oracle', title: 'SemiAnalysis — How Oracle is winning the AI compute market', url: 'https://newsletter.semianalysis.com/p/how-oracle-is-winning-the-ai-compute-market', kind: 'research', detail: 'Structure of the Oracle lease-and-rent model' },
  { id: 'vantage_pr', title: 'Vantage Data Centers — Stargate site in Wisconsin (press release)', url: 'https://vantage-dc.com/news/openai-oracle-and-vantage-data-centers-announce-stargate-data-center-site-in-wisconsin/', kind: 'official', detail: 'Joint OpenAI / Oracle / Vantage announcement' },
  { id: 'aimag_vantage', title: "AI Magazine — OpenAI, Oracle and Vantage's $15bn data centre", url: 'https://aimagazine.com/news/openai-oracle-and-vantage-forge-green-energy-partnership', kind: 'press', detail: 'Four hyperscale data centers, nearly 1 GW by 2028' },
  { id: 'lightwave_dcpi', title: "Lightwave (Dell'Oro data) — Schneider and Vertiv dominate DC physical infrastructure", url: 'https://www.lightwaveonline.com/home/article/55301804/schneider-electric-and-vertiv-dominate-the-data-center-physical-infrastructure-market', kind: 'research', detail: 'Tied within 0.1 percentage point' },
  { id: 'introl_cooling', title: 'Introl — Vertiv vs Schneider vs Eaton cooling comparison', url: 'https://introl.com/blog/vertiv-schneider-eaton-cooling-solutions-comparison-ai-data-centers', kind: 'research', detail: 'Vertiv ~23% of precision cooling; DLC revenue more than doubled' },
  { id: 'mnm_dcpower', title: 'MarketsandMarkets — Top companies in the data-center power market', url: 'https://www.marketsandmarkets.com/ResearchInsight/data-center-power-market.asp', kind: 'research', detail: 'Schneider, ABB, Eaton, Vertiv, Delta ≈41–43% combined' },
  { id: 'techrepublic_cooling', title: 'TechRepublic (Omdia) — Data center power and cooling trends', url: 'https://www.techrepublic.com/article/news-ai-data-centers-power-cooling-omdia/', kind: 'research', detail: 'Next-gen racks toward 370 kW; liquid cooling becomes mandatory' },
  { id: 'techcrunch_chevron', title: 'TechCrunch — Microsoft and Chevron plan a large gas-powered data center project', url: 'https://techcrunch.com/2026/06/22/microsoft-and-chevron-plan-one-of-the-largest-gas-powered-data-center-projects-in-us/', kind: 'press', detail: 'Two GE Vernova turbines plus Caterpillar Solar Turbines' },
  { id: 'bloom_q2', title: 'SEC — Bloom Energy Q2 2026 results (8-K exhibit)', url: 'https://www.sec.gov/Archives/edgar/data/0001664703/000162828026050150/ex991_q226financialresults.htm', kind: 'official', detail: 'Record $1.1B revenue, +166% YoY; FY guide raised to $3.9–4.2B' },
  { id: 'bloom_report', title: 'Bloom Energy — 2026 Data Center Power Report', url: 'https://www.bloomenergy.com/2026-power-report/', kind: 'official', detail: 'Vendor-published view of data-center power constraints' },
  { id: 'ipfiber_optics', title: 'IP-Fiber — InnoLight and Eoptolink dominate 60% of 800G SFP supply', url: 'https://ip-fiber.com/blogs/news/nvidia-orders-surge-innolight-and-eoptolink-dominate-60-of-800g-sfp-optical-modules-supply', kind: 'press', detail: 'Remaining ~40% split across Coherent, Lumentum, Broadcom' },
  { id: 'cignal_optics', title: 'Cignal AI / LightCounting — 800GbE optics shipments', url: 'https://cignal.ai/2025/05/800gbe-optics-shipments-to-grow-60-in-2025/', kind: 'research', detail: 'InnoLight 23.4% of all transceivers in 2025, Coherent ~16%' },
  { id: 'valueadd_capex', title: 'ValueAdd VC — $725B AI capex 2026', url: 'https://valueaddvc.com/blog/ai-hyperscaler-capex-compared-why-microsoft-google-meta-and-amazon-are-all-spending-at-once', kind: 'research', detail: 'Amazon ~$200B, Google $175–185B, Meta $125–145B, Microsoft $110–120B' },
  { id: 'cnbc_capex', title: 'CNBC — Hyperscalers face capex scrutiny', url: 'https://www.cnbc.com/2026/07/28/hyperscalers-face-higher-capex-scrutiny-after-alphabet-report-panned.html', kind: 'press', detail: 'Investor pushback on the 2026 spending step-up' },
  { id: 'enkiai_meta', title: "EnkiAI — Unpacking Meta's Nvidia deal", url: 'https://enkiai.com/data-center/ai-infrastructure-2026-unpacking-metas-nvidia-deal/', kind: 'research', detail: 'Meta capex trajectory 2024 → 2026' },
  { id: 'curionic_circular', title: "Curionic — Inside AI's circular financing web", url: 'https://www.curionic.net/2026/08/ai-circular-financing-nvidia-openai-oracle-coreweave-2026.html', kind: 'speculation', detail: 'Nvidia / OpenAI / Oracle / CoreWeave equity and revenue loops' },
];

// ---------------------------------------------------------------------------
// Pure helpers. No network, no React — app/lib/supply-chain.test.js covers these.
// ---------------------------------------------------------------------------

// Every Yahoo symbol referenced by the graph, deduped and sorted. The live
// route derives its fetch list from this, so a client can never ask the server
// to quote an arbitrary symbol.
export function graphSymbols() {
  return [...new Set(Object.values(ENTITIES).map((entity) => entity.symbol).filter(Boolean))].sort();
}

export function isFocusId(id) {
  return FOCUS_IDS.includes(id);
}

// Symbols worth pulling headlines for when `focusId` is the centre of the map:
// the focus itself plus its direct counterparties, capped so one page view
// cannot fan out into dozens of upstream news calls.
export function newsSymbolsFor(focusId, limit = 6) {
  if (!isFocusId(focusId)) return [];
  const ids = [focusId];
  for (const edge of EDGES) {
    if (edge.s === focusId) ids.push(edge.b);
    else if (edge.b === focusId) ids.push(edge.s);
  }
  const symbols = [];
  for (const id of ids) {
    const symbol = ENTITIES[id]?.symbol;
    if (symbol && !symbols.includes(symbol)) symbols.push(symbol);
    if (symbols.length >= limit) break;
  }
  return symbols;
}

// Group the edges touching `focusId` into the two sides of the mindmap,
// preserving CATEGORIES order so the branch layout is stable across renders.
export function sidesFor(focusId) {
  const suppliers = new Map();
  const customers = new Map();
  EDGES.forEach((edge, index) => {
    if (edge.b === focusId) {
      if (!suppliers.has(edge.c)) suppliers.set(edge.c, []);
      suppliers.get(edge.c).push({ index, otherId: edge.s, edge });
    }
    if (edge.s === focusId) {
      if (!customers.has(edge.c)) customers.set(edge.c, []);
      customers.get(edge.c).push({ index, otherId: edge.b, edge });
    }
  });
  const order = Object.keys(CATEGORIES);
  const shape = (map) => order.filter((category) => map.has(category))
    .map((category) => ({ category, label: CATEGORIES[category].label, tone: CATEGORIES[category].tone, items: map.get(category) }));
  return { suppliers: shape(suppliers), customers: shape(customers) };
}

export function edgesOf(entityId) {
  const inbound = [];
  const outbound = [];
  EDGES.forEach((edge, index) => {
    if (edge.b === entityId) inbound.push({ index, otherId: edge.s, edge });
    if (edge.s === entityId) outbound.push({ index, otherId: edge.b, edge });
  });
  return { inbound, outbound };
}

export function sourceById(id) {
  return SOURCES.find((source) => source.id === id) || null;
}

// Dataset integrity, used by the test suite: unknown entity ids, dangling
// source references and unreachable entities are data bugs, not UI bugs.
export function validateGraph() {
  const problems = [];
  const sourceIds = new Set(SOURCES.map((source) => source.id));
  const seen = new Set();
  EDGES.forEach((edge, index) => {
    if (!ENTITIES[edge.s]) problems.push(`edge ${index}: unknown supplier '${edge.s}'`);
    if (!ENTITIES[edge.b]) problems.push(`edge ${index}: unknown buyer '${edge.b}'`);
    if (!CATEGORIES[edge.c]) problems.push(`edge ${index}: unknown category '${edge.c}'`);
    if (!edge.pct) problems.push(`edge ${index}: missing pct`);
    if (!CONFIDENCE_LEVELS.includes(edge.confidence)) problems.push(`edge ${index}: bad confidence '${edge.confidence}'`);
    for (const id of edge.sources || []) {
      if (!sourceIds.has(id)) problems.push(`edge ${index}: unknown source '${id}'`);
    }
    seen.add(edge.s);
    seen.add(edge.b);
  });
  // An entity earns its place either by sitting on an edge or by appearing in
  // a market-share chart. SMIC and ABB are the second kind: real players in
  // their layer, but with no supply relationship this dataset can source.
  for (const chart of SHARE_CHARTS) {
    for (const row of chart.rows) for (const id of row.ids || (row.id ? [row.id] : [])) seen.add(id);
  }
  for (const id of Object.keys(ENTITIES)) {
    if (!seen.has(id)) problems.push(`entity '${id}' is referenced by no edge and no chart`);
  }
  for (const id of FOCUS_IDS) {
    if (!ENTITIES[id]) problems.push(`focus id '${id}' is not an entity`);
  }
  for (const entity of Object.values(ENTITIES)) {
    for (const id of entity.sources || []) {
      if (!sourceIds.has(id)) problems.push(`entity '${entity.name}': unknown source '${id}'`);
    }
  }
  return problems;
}

export const CONFIDENCE_LEVELS = ['official', 'research', 'press', 'speculation', 'background'];
