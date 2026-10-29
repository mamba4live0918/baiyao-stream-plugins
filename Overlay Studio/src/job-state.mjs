const terminal = new Set(['completed', 'failed', 'cancelled']);
const timestamp = value => Date.parse(value) || 0;

function olderLogs(incoming, current) {
  const next = incoming.logs || [];
  const previous = current.logs || [];
  const nextTime = timestamp(next.at(-1)?.time);
  const previousTime = timestamp(previous.at(-1)?.time);
  // The service caps its log window, so length alone cannot establish freshness.
  return nextTime < previousTime || (nextTime === previousTime && next.length < previous.length);
}

// RPC responses and SSE events can arrive in either order. Preserve monotonic
// task identity, terminal state and progress without mutating either snapshot.
export function mergeJob(current, incoming) {
  if (!incoming) return current;
  if (!current) return incoming;
  if (current.id !== incoming.id) {
    return timestamp(incoming.startedAt) > timestamp(current.startedAt) ? incoming : current;
  }
  if (terminal.has(current.state)) return current;
  if (olderLogs(incoming, current)) {
    return terminal.has(incoming.state) ? { ...incoming, logs: current.logs } : current;
  }
  return incoming;
}
