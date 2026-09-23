import test from "node:test";
import assert from "node:assert/strict";

const { transcribeAudio, hasTranscriptionProvider } = await import("../.scripts-out/lib/server/transcribe.js");

const AUDIO_URL = new URL("https://cdn.example.de/audio/ep1.mp3");

async function withGroqKey(key, fn) {
  const original = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = key;
  try {
    // Awaiting here matters: without it, `finally` runs as soon as fn()
    // returns a pending promise, restoring the env var before the mocked
    // call inside fn() has actually run against it.
    return await fn();
  } finally {
    if (original === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = original;
  }
}

async function withFetch(impl, fn) {
  const original = global.fetch;
  global.fetch = impl;
  try {
    return await fn();
  } finally {
    global.fetch = original;
  }
}

test("reports no provider when GROQ_API_KEY is unset", () => {
  const original = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    assert.equal(hasTranscriptionProvider(), false);
  } finally {
    if (original !== undefined) process.env.GROQ_API_KEY = original;
  }
});

test("hasTranscriptionProvider is true once a key is set", () => {
  withGroqKey("test-key", () => {
    assert.equal(hasTranscriptionProvider(), true);
  });
});

test("refuses to transcribe with no key configured", async () => {
  const original = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    const result = await transcribeAudio(AUDIO_URL);
    assert.deepEqual(result, { ok: false, reason: "no-key" });
  } finally {
    if (original !== undefined) process.env.GROQ_API_KEY = original;
  }
});

test("declines an episode whose declared size is over the cap", async () => {
  await withGroqKey("test-key", async () => {
    await withFetch(
      async (url, init) => {
        if (init?.method === "HEAD") {
          return { headers: new Map([["content-length", String(30 * 1024 * 1024)]]) };
        }
        throw new Error("should not fetch the body when HEAD already says it's too large");
      },
      async () => {
        const result = await transcribeAudio(AUDIO_URL);
        assert.deepEqual(result, { ok: false, reason: "too-large" });
      },
    );
  });
});

test("parses Groq's verbose_json segments into transcript segments", async () => {
  await withGroqKey("test-key", async () => {
    const calls = [];
    await withFetch(
      async (url, init) => {
        calls.push({ url: String(url), method: init?.method ?? "GET" });
        if (init?.method === "HEAD") {
          return { headers: new Map([["content-length", "1000"]]) };
        }
        if (String(url).includes("groq.com")) {
          return {
            ok: true,
            json: async () => ({
              segments: [
                { start: 0, end: 3, text: " Hallo und willkommen. " },
                { start: 3, end: 6, text: "" },
              ],
            }),
          };
        }
        return {
          ok: true,
          headers: new Map([["content-type", "audio/mpeg"]]),
          arrayBuffer: async () => new ArrayBuffer(1000),
        };
      },
      async () => {
        const result = await transcribeAudio(AUDIO_URL, "de");
        assert.equal(result.ok, true);
        assert.equal(result.segments.length, 1);
        assert.equal(result.segments[0].text, "Hallo und willkommen.");
        const groqCall = calls.find((c) => c.url.includes("groq.com"));
        assert.ok(groqCall, "should have called the Groq endpoint");
      },
    );
  });
});

test("falls back to the whole-text field when there are no segments", async () => {
  await withGroqKey("test-key", async () => {
    await withFetch(
      async (url, init) => {
        if (init?.method === "HEAD") return { headers: new Map() };
        if (String(url).includes("groq.com")) {
          return { ok: true, json: async () => ({ text: "Ein langer Text ohne Segmente." }) };
        }
        return { ok: true, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(10) };
      },
      async () => {
        const result = await transcribeAudio(AUDIO_URL);
        assert.equal(result.ok, true);
        assert.equal(result.segments.length, 1);
        assert.equal(result.segments[0].text, "Ein langer Text ohne Segmente.");
      },
    );
  });
});

test("reports fetch-failed when the audio itself cannot be downloaded", async () => {
  await withGroqKey("test-key", async () => {
    await withFetch(
      async (url, init) => {
        if (init?.method === "HEAD") return { headers: new Map() };
        return { ok: false, status: 404 };
      },
      async () => {
        const result = await transcribeAudio(AUDIO_URL);
        assert.deepEqual(result, { ok: false, reason: "fetch-failed" });
      },
    );
  });
});

test("reports transcription-failed when Groq itself errors", async () => {
  await withGroqKey("test-key", async () => {
    await withFetch(
      async (url, init) => {
        if (init?.method === "HEAD") return { headers: new Map() };
        if (String(url).includes("groq.com")) {
          return { ok: false, status: 500, text: async () => "server error" };
        }
        return { ok: true, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(10) };
      },
      async () => {
        const result = await transcribeAudio(AUDIO_URL);
        assert.deepEqual(result, { ok: false, reason: "transcription-failed" });
      },
    );
  });
});
