/* Only operator controls fade; settings and face editing own their visibility. */
export function createControlVisibility({ trial = false, onChange, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let visible = Boolean(trial), timer = null;
  function stop() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }
  function setVisible(value) {
    if (visible === value) return;
    visible = value;
    onChange(visible);
  }
  function leave() {
    if (trial) return;
    stop();
    setVisible(false);
  }
  function move() {
    if (trial) return;
    stop();
    setVisible(true);
    timer = setTimer(() => { timer = null; setVisible(false); }, 2500);
  }
  function reset() {
    stop();
    visible = Boolean(trial);
    onChange(visible);
  }
  reset();
  return { move, leave, stop, reset };
}
