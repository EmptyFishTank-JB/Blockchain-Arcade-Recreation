// Full Access: the one-time purchase planned for the Android app (no ads, and
// every unlock straight away). Without it, unlocks are earned by playing (see
// progress.js), which is how the website works. The app will call Unlocks.set()
// with the Google Play purchase state. For testing, ?unlockall in the URL or the
// dev page's UNLOCK EVERYTHING switch (a flag in this browser) preview everything
// unlocked.
const Unlocks = (() => {
  let full = false;
  let dev = false;
  try {
    dev = new URLSearchParams(location.search).has('unlockall') || localStorage.getItem('bytefall-dev-unlockall') === 'on';
    full = dev;
  } catch (e) {}
  const listeners = [];

  return {
    hasFullAccess: () => full,
    isDevUnlock: () => dev,
    set(owned) {
      full = !!owned;
      listeners.forEach((fn) => fn(full));
    },
    onChange(fn) {
      listeners.push(fn);
    },
  };
})();
