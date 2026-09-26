import test from "node:test";
import assert from "node:assert/strict";

const { looksLikeAd, decorateAdText } = await import("../.scripts-out/lib/adDetection.js");

test("recognizes common German and English ad-read phrases", () => {
  assert.ok(looksLikeAd("Diese Episode wird von unserem Sponsor unterstützt."));
  assert.ok(looksLikeAd("Nutzt den Rabattcode PODCAST20 für 20 Prozent Rabatt."));
  assert.ok(looksLikeAd("This episode is brought to you by our sponsor."));
  assert.ok(looksLikeAd("Use promo code SAVE10 at checkout."));
});

test("does not flag ordinary episode content", () => {
  assert.equal(looksLikeAd("Willkommen zurück zu einer neuen Folge unseres Podcasts."), false);
  assert.equal(looksLikeAd("Heute sprechen wir über die Wirtschaft in Deutschland."), false);
});

test("decorateAdText tags keyword-matching text with the ad marker", () => {
  const decorated = decorateAdText("Gesponsert von unserem Partner.", false);
  assert.match(decorated, /^📢 \[Quảng cáo\] /);
});

test("decorateAdText tags any text in a detected ad region, regardless of keywords", () => {
  const decorated = decorateAdText("Ganz normaler Satz ohne Schlüsselwort.", true);
  assert.match(decorated, /^📢 \[Quảng cáo\] /);
});

test("decorateAdText leaves ordinary text untouched", () => {
  assert.equal(decorateAdText("Ein ganz normaler Satz.", false), "Ein ganz normaler Satz.");
});

test("decorateAdText is idempotent - never double-tags already-marked text", () => {
  const once = decorateAdText("Gesponsert von unserem Partner.", false);
  const twice = decorateAdText(once, false);
  assert.equal(twice, once);
});

test("decorateAdText trims and returns empty text as-is", () => {
  assert.equal(decorateAdText("   ", false), "");
});
