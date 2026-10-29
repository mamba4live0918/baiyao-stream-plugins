/* Time-driven crowd state. The caller owns timers and animation frames. */
const DEFAULT_THRESHOLDS = [30, 60, 120];
const NAME_MS = 3000;
const URGE_MS = 600;
const STOMP_MS = 320;
const STOMP_PERIOD_MS = 5000;
const CHANT_MS = 900;
const CHANT_PERIOD_MS = 8000;

const receivedAt = order => Number.isFinite(order?.receivedAt) ? order.receivedAt : 0;
const ageAt = (order, nowMs) => Math.max(0, nowMs - receivedAt(order));
const isFront = slot => slot?.front === true || (slot?.front === undefined && slot?.row === 0);

export function moodAt(ageMs, thresholds = DEFAULT_THRESHOLDS) {
  if (ageMs >= thresholds[2] * 1000) return 'angry';
  if (ageMs >= thresholds[1] * 1000) return 'impatient';
  if (ageMs >= thresholds[0] * 1000) return 'neutral';
  return 'happy';
}

export function showName(order, slot, nowMs, { names = true } = {}) {
  return Boolean(names && (isFront(slot) || ageAt(order, nowMs) < NAME_MS));
}

export function showBubble(slot) {
  return isFront(slot);
}

export function moodSchedule(orders, nowMs, thresholds = DEFAULT_THRESHOLDS) {
  let next = null;
  for (const order of orders) {
    for (const seconds of thresholds) {
      const boundary = receivedAt(order) + seconds * 1000;
      if (boundary > nowMs && (next === null || boundary < next)) next = boundary;
    }
  }
  return next;
}

export function queueSummary(orders, nowMs, thresholds = DEFAULT_THRESHOLDS) {
  let angryCount = 0;
  for (const order of orders) {
    if (ageAt(order, nowMs) >= thresholds[2] * 1000) angryCount += 1;
  }
  return { total: orders.length, angryCount, majority: angryCount > orders.length / 2 };
}

export function evaluateCrowd(orders, slots, nowMs, { names = true, thresholds = DEFAULT_THRESHOLDS } = {}) {
  const byKey = new Map(orders.map(order => [order.key, order]));
  const summary = queueSummary(orders, nowMs, thresholds);
  let nextWake = moodSchedule(orders, nowMs, thresholds);
  let activeUntil = null;
  const wake = at => {
    if (Number.isFinite(at) && at > nowMs && (nextWake === null || at < nextWake)) nextWake = at;
  };
  const animateUntil = end => {
    activeUntil = activeUntil === null ? end : Math.max(activeUntil, end);
    wake(end);
  };
  const actors = [];
  // One common window guarantees rest intervals even with hundreds of angry actors.
  const stompPhase = ((nowMs % STOMP_PERIOD_MS) + STOMP_PERIOD_MS) % STOMP_PERIOD_MS;
  const stompCycleStart = nowMs - stompPhase;
  for (const slot of slots) {
    const key = slot.key ?? slot.order?.key;
    const order = byKey.get(key);
    if (!order) continue;
    const mood = moodAt(ageAt(order, nowMs), thresholds);
    let jump = 0, callout = null;
    if (names && !isFront(slot)) wake(receivedAt(order) + NAME_MS);
    if (Number.isFinite(order.lastUrgedAt)) {
      const start = order.lastUrgedAt, end = start + URGE_MS;
      if (start > nowMs) wake(start);
      else if (nowMs < end) {
        jump = Math.sin(Math.PI * (nowMs - start) / URGE_MS);
        callout = '快点！';
        animateUntil(end);
      }
    }
    if (mood === 'angry') {
      if (stompPhase < STOMP_MS) {
        jump = Math.max(jump, Math.sin(Math.PI * stompPhase / STOMP_MS));
        animateUntil(stompCycleStart + STOMP_MS);
      }
      wake(stompCycleStart + STOMP_PERIOD_MS);
    }
    actors.push({
      key, mood, showName: showName(order, slot, nowMs, { names }), showBubble: showBubble(slot),
      jump, steam: mood === 'angry', callout,
    });
  }

  let chant = null;
  if (summary.majority) {
    let oldest = Infinity;
    for (const order of orders) oldest = Math.min(oldest, receivedAt(order));
    // The oldest customer's clock anchors a stable cadence as new orders arrive.
    const origin = oldest + thresholds[2] * 1000;
    const phase = (nowMs - origin) % CHANT_PERIOD_MS;
    const cycleStart = nowMs - phase;
    if (phase < CHANT_MS) {
      chant = '快点！快点！';
      animateUntil(cycleStart + CHANT_MS);
    }
    wake(cycleStart + CHANT_PERIOD_MS);
  }
  return { actors, chant, active: activeUntil !== null, activeUntil, nextWake, summary };
}
