// Smoothed scroll progress plus pointer position. Native page scrolling drives
// everything, so keyboard, touch and scrollbar all work without extra code.
import { clamp, damp } from './math.js';

export function createScroll({ pages, spacer }) {
  spacer.style.height = `${pages * 100}vh`;

  let target = 0;
  let current = 0;
  let jumped = false;
  // active: the mouse is over the page (hover picking only runs then).
  const pointer = { x: 0, y: 0, smoothX: 0, smoothY: 0, active: false };

  const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const read = () => {
    target = clamp(window.scrollY / maxScroll());
  };

  // The scroll length scales with the window height, so after a real resize
  // (fullscreen, rotation) scroll back to the same story position instead of
  // re-reading progress from the old pixel offset. Small height changes (mobile
  // toolbars sliding while scrolling) just re-read, so they never fight the user.
  let lastWidth = window.innerWidth;
  let lastHeight = window.innerHeight;
  const onResize = () => {
    const resized = window.innerWidth !== lastWidth || Math.abs(window.innerHeight - lastHeight) > 120;
    lastWidth = window.innerWidth;
    lastHeight = window.innerHeight;
    if (resized) window.scrollTo(0, target * maxScroll());
    else read();
  };

  window.addEventListener('scroll', read, { passive: true });
  window.addEventListener('resize', onResize);
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
      pointer.active = e.pointerType === 'mouse';
    },
    { passive: true },
  );
  document.documentElement.addEventListener('mouseleave', () => {
    pointer.active = false;
  });
  window.addEventListener('blur', () => {
    pointer.active = false;
  });

  // A jump (not a scroll): the story skips to p without playing what lies between.
  function setProgress(p) {
    window.scrollTo(0, clamp(p) * maxScroll());
    read();
    current = target;
    jumped = true;
  }

  // ?p=0.7 jumps straight to a point in the story (handy for checking a scene).
  const fromQuery = new URLSearchParams(window.location.search).get('p');
  if (fromQuery !== null && !Number.isNaN(parseFloat(fromQuery))) {
    requestAnimationFrame(() => setProgress(parseFloat(fromQuery)));
  }
  read();

  return {
    pointer,
    setProgress,
    // A real (smooth) scroll to p: everything on the way plays as usual.
    scrollToProgress(p) {
      window.scrollTo({ top: clamp(p) * maxScroll(), behavior: 'smooth' });
    },
    get progress() {
      return current;
    },
    // True once after setProgress, so time-based effects can skip the jump.
    consumeJump() {
      const value = jumped;
      jumped = false;
      return value;
    },
    update(dt) {
      current = damp(current, target, 4.5, dt);
      if (Math.abs(current - target) < 1e-5) current = target;
      pointer.smoothX = damp(pointer.smoothX, pointer.x, 3, dt);
      pointer.smoothY = damp(pointer.smoothY, pointer.y, 3, dt);
      return current;
    },
  };
}
