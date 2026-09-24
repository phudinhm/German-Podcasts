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

test("declines an episode whose declared size is over the combined cap", async () => {
  await withGroqKey("test-key", async () => {
    await withFetch(
      async (url, init) => {
        if (init?.method === "HEAD") {
          // Bigger than MAX_CHUNKS (4) * MAX_CHUNK_BYTES (24MB) - too large
          // even for the chunked path.
          return { headers: new Map([["content-length", String(100 * 1024 * 1024)]]) };
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

test("splits a declared size over one chunk into ranged requests and stitches the results", async () => {
  await withGroqKey("test-key", async () => {
    const rangesRequested = [];
    await withFetch(
      async (url, init) => {
        if (init?.method === "HEAD") {
          // 30MB: bigger than one 24MB chunk, small enough for two.
          return { headers: new Map([["content-length", String(30 * 1024 * 1024)]]) };
        }
        if (String(url).includes("groq.com")) {
          // Each chunk's Groq call is distinguished by its own audio blob's
          // size, set below per range - order-independent since both
          // chunks' fetch-then-transcribe pipelines run in parallel.
          const audioBlob = init.body.get("file");
          if (audioBlob.size === 111) {
            return {
              ok: true,
              json: async () => ({ duration: 600, segments: [{ start: 0, end: 3, text: "Erster Teil." }] }),
            };
          }
          return {
            ok: true,
            json: async () => ({ duration: 300, segments: [{ start: 0, end: 4, text: "Zweiter Teil." }] }),
          };
        }
        const range = init?.headers?.Range;
        rangesRequested.push(range);
        const size = range === "bytes=0-25165823" ? 111 : 222;
        return {
          ok: true,
          headers: new Map([["content-type", "audio/mpeg"]]),
          arrayBuffer: async () => new ArrayBuffer(size),
        };
      },
      async () => {
        const result = await transcribeAudio(AUDIO_URL);
        assert.equal(result.ok, true);
        // Two chunks: [0, 24MB-1] and [24MB, 30MB-1].
        assert.deepEqual(rangesRequested.sort(), ["bytes=0-25165823", "bytes=25165824-31457279"].sort());
        assert.equal(result.segments.length, 2);
        const byText = Object.fromEntries(result.segments.map((s) => [s.text, s]));
        assert.equal(byText["Erster Teil."].start, 0);
        // Second chunk's segments are offset by the first chunk's own
        // 600s duration, not by an estimate from its byte size.
        assert.equal(byText["Zweiter Teil."].start, 600);
      },
    );
  });
});

test("reports transcription-failed when any chunk fails, rather than a silent gap", async () => {
  await withGroqKey("test-key", async () => {
    await withFetch(
      async (url, init) => {
        if (init?.method === "HEAD") {
          return { headers: new Map([["content-length", String(30 * 1024 * 1024)]]) };
        }
        const range = init?.headers?.Range;
        if (range === "bytes=0-25165823") {
          return {
            ok: true,
            headers: new Map([["content-type", "audio/mpeg"]]),
            arrayBuffer: async () => new ArrayBuffer(1000),
          };
        }
        // The second chunk's audio fetch itself fails.
        return { ok: false, status: 500 };
      },
      async () => {
        const result = await transcribeAudio(AUDIO_URL);
        assert.deepEqual(result, { ok: false, reason: "transcription-failed" });
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
