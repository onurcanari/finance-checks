// Delta-anchored options skew, computed from a Tradier chain (see
// app/lib/options-providers.js). Pure math — no network, no clock — so the
// route and the tests share one implementation.
//
// Definitions (all IVs are decimals, e.g. 0.42 for 42%):
//   ATM IV  — average of call+put IV at the strike nearest spot; when spot sits
//             exactly between two strikes, interpolate between their averages.
//   Wing IV — IV at the ±0.25-delta wings, linearly interpolated between the
//             two adjacent strikes bracketing the target delta.
//   skew    — (putIV(25d) − callIV(25d)) / ATM IV

const CALL_TARGET_DELTA = 0.25;
const PUT_TARGET_DELTA = -0.25;
const UNRELIABLE_ABS_SKEW = 0.5;

const finite = (value) => Number.isFinite(value);

// Keep only strikes with both a usable IV and delta; sorted ascending.
// Expire the arrow when either leg of the pair is missing.
function usableStrikes(options) {
  if (!Array.isArray(options)) return [];
  const rows = [];
  for (const option of options) {
    const strike = Number(option?.strike);
    const iv = Number(option?.iv);
    const delta = Number(option?.delta);
    if (!finite(strike) || !finite(iv) || iv <= 0 || !finite(delta)) continue;
    rows.push({ strike, iv, delta });
  }
  rows.sort((a, b) => a.strike - b.strike);
  return rows;
}

// Linear interpolation of iv between the two strikes a and b at x
// (a.strike <= x <= b.strike).
function interpolateAtPrice(strikes, x) {
  for (let i = 0; i < strikes.length - 1; i += 1) {
    const a = strikes[i];
    const b = strikes[i + 1];
    if (x >= a.strike && x <= b.strike) {
      if (b.strike === a.strike) return a.iv;
      const weight = (x - a.strike) / (b.strike - a.strike);
      return a.iv + weight * (b.iv - a.iv);
    }
  }
  return null;
}

// Linear interpolation of iv at a target delta. Options strikes are discrete;
// delta moves monotonically through them, so we find the adjacent pair whose
// deltas bracket the target and interpolate across their strikes.
function interpolateAtDelta(strikes, targetDelta) {
  for (let i = 0; i < strikes.length - 1; i += 1) {
    const a = strikes[i];
    const b = strikes[i + 1];
    const crosses =
      (a.delta >= targetDelta && b.delta <= targetDelta) ||
      (a.delta <= targetDelta && b.delta >= targetDelta);
    if (!crosses) continue;

    // Interpolate on the strike axis: the IV surface is quoted per strike, so
    // the bracketing strike pair is what the interpolation walks between.
    if (a.delta === b.delta) return a.iv;
    const weight = (targetDelta - a.delta) / (b.delta - a.delta);
    return a.iv + weight * (b.iv - a.iv);
  }

  // No bracketing pair (thin chain): fall back to the closest available delta.
  let best = null;
  let bestDistance = Infinity;
  for (const row of strikes) {
    const distance = Math.abs(row.delta - targetDelta);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = row;
    }
  }
  return best ? best.iv : null;
}

export function computeSkew(chain, spot) {
  const spotPrice = Number(spot);
  if (!finite(spotPrice) || spotPrice <= 0) {
    return { error: 'insufficient_chain' };
  }

  const calls = usableStrikes(chain?.calls);
  const puts = usableStrikes(chain?.puts);
  if (!calls.length || !puts.length) {
    return { error: 'insufficient_chain' };
  }

  // ATM IV: call+put average at the strike nearest spot. When spot sits
  // exactly between two strikes, interpolate between their averages.
  const strikeSet = [...new Set([...calls, ...puts].map((row) => row.strike))].sort((a, b) => a - b);
  const averageAt = (strike) => {
    const call = calls.find((row) => row.strike === strike);
    const put = puts.find((row) => row.strike === strike);
    if (!call || !put) return null;
    return (call.iv + put.iv) / 2;
  };
  const atmIv = interpolateAtPrice(
    strikeSet.map((strike) => ({ strike, iv: averageAt(strike) })).filter((row) => row.iv !== null),
    spotPrice,
  );
  if (!finite(atmIv) || atmIv <= 0) {
    return { error: 'insufficient_chain' };
  }

  // Wing IVs at the ±0.25-delta targets.
  const callIv = interpolateAtDelta(calls, CALL_TARGET_DELTA);
  const putIv = interpolateAtDelta(puts, PUT_TARGET_DELTA);
  if (!finite(callIv) || !finite(putIv)) {
    return { error: 'insufficient_chain' };
  }

  const skew = (putIv - callIv) / atmIv;
  return {
    skew,
    atmIv,
    putIv,
    callIv,
    unreliable: Math.abs(skew) > UNRELIABLE_ABS_SKEW,
  };
}
