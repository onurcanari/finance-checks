// Manual policy rate constants - update by hand when official data changes.

// TCMB one-week repo auction policy rate (%). Update manually from tcmb.gov.tr (latest MPC decision).
export const TCMB_POLICY_RATE = 37.0;

// FOMC target range (%) since December 12, 2025. Update manually from federalreserve.gov/monetarypolicy/openmarket.htm.
export const FED_FUNDS_RANGE = [3.5, 3.75];

// Annual TUFE (TR CPI) y/y % change, July 2026 reading (source: TCMB statistics). Update manually.
// duplicated intentionally; keep in sync with tr-constants.js
export const TR_CPI_INFLATION = 31.75;
