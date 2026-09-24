// Full Access: the one-time purchase planned for the Android app (no ads, and
// every unlock straight away). Without it, unlocks are earned by playing (see
// progress.js), which is how the website works. The app will call Unlocks.set()
// with the Google Play purchase state. Add ?unlockall to the URL to preview
// everything unlocked.
const Unlocks = (() => {
  let full = false;
  try {
    if (new URLSearchParams(location.search).has('unlockall')) full = true;
  } catch (e) {}
  const listeners = [];

  return {
    hasFullAccess: () => full,
    set(owned) {
      full = !!owned;
      listeners.forEach((fn) => fn(full));
    },
    onChange(fn) {
      listeners.push(fn);
    },
  };
})();
