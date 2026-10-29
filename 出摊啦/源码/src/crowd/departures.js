// Caller owns the pause-aware game clock, queue removal, penalties and feedback.
// Hash the permanent order key so relayout, settings changes and rendering never
// reroll a customer's patience. No RNG, wall clock or persistent state is needed.
function jitterMs(key) {
  let hash = 2166136261;
  for (const char of String(key ?? '')) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
  return hash % 10001 - 5000;
}

function deadlineAt(order, settings) {
  const threshold = settings.crowd?.moodSeconds?.[2];
  const configuredWait = settings.order.abandon.angryWaitSeconds;
  const angrySeconds = Number.isFinite(threshold) ? Math.max(0, threshold) : 120;
  const waitSeconds = Number.isFinite(configuredWait) ? Math.max(0, configuredWait) : 60;
  const receivedAt = Number.isFinite(order.receivedAt) ? order.receivedAt : 0;
  // Even a zero-second setting may not make somebody leave before getting angry.
  return receivedAt + angrySeconds * 1000 + Math.max(0, waitSeconds * 1000 + jitterMs(order.key));
}

/** All due orders, including outside customers and a pending receipt's target.
 * This pure query returns the original objects once per caller-owned batch. */
export function collectAbandoned(orders, settings, now) {
  if (settings.order?.abandon?.enabled !== true) return [];
  return orders.filter(order => deadlineAt(order, settings) <= now);
}

/** Earliest future wake; overdue unprocessed orders request a wake at `now`. */
export function nextAbandonmentAt(orders, settings, now) {
  if (settings.order?.abandon?.enabled !== true) return null;
  let next = null;
  for (const order of orders) {
    const deadline = deadlineAt(order, settings);
    if (next === null || deadline < next) next = deadline;
  }
  return next === null ? null : Math.max(now, next);
}
