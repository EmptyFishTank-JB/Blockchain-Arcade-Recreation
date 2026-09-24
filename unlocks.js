// Full Access: the one-time purchase in the Android app (no ads, every theme and
// track, the bonus exploits). The website is the free, fully unlocked version, so
// this is always true here; the app will call Unlocks.set() with the Google Play
// purchase state. Add ?free to the URL to preview what the free tier locks.
const Unlocks = (() => {
  let full = true;
  try {
    if (new URLSearchParams(location.search).has('free')) full = false;
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
