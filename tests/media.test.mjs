import test from "node:test";
import assert from "node:assert/strict";

const { upgradeToHttps, isMixedContent } = await import("../.scripts-out/lib/media.js");

/** The module reads window.location.protocol; node has no window by default. */
function withPage(protocol, run) {
  const previous = globalThis.window;
  globalThis.window = { location: { protocol } };
  try {
    return run();
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

test("upgrades http media to https on a secure page", () => {
  withPage("https:", () => {
    assert.equal(upgradeToHttps("http://cdn.example.de/ep.mp3"), "https://cdn.example.de/ep.mp3");
    assert.equal(upgradeToHttps("https://cdn.example.de/ep.mp3"), "https://cdn.example.de/ep.mp3");
  });
});

test("leaves http alone on a plain http page", () => {
  // Rewriting here would break hosts that genuinely have no TLS, which is what
  // silently killed local playback before this rule was made conditional.
  withPage("http:", () => {
    assert.equal(upgradeToHttps("http://127.0.0.1:3330/ep.wav"), "http://127.0.0.1:3330/ep.wav");
  });
});

test("flags mixed content only where a browser would block it", () => {
  withPage("https:", () => {
    assert.equal(isMixedContent("http://cdn.example.de/ep.mp3"), true);
    assert.equal(isMixedContent("https://cdn.example.de/ep.mp3"), false);
  });
  withPage("http:", () => {
    assert.equal(isMixedContent("http://cdn.example.de/ep.mp3"), false);
  });
});
