import test from "node:test";
import assert from "node:assert/strict";

const { translate, hasTranslationProvider, hasKeyedProvider } = await import(
  "../.scripts-out/lib/server/translate.js"
);

const KEY_VARS = [
  "DEEPL_API_KEY",
  "GOOGLE_TRANSLATE_API_KEY",
  "ANTHROPIC_API_KEY",
  "GROQ_API_KEY",
  "GROQ_TRANSLATE_MODEL",
];

async function withEnv(vars, fn) {
  const originals = Object.fromEntries(KEY_VARS.map((name) => [name, process.env[name]]));
  for (const name of KEY_VARS) delete process.env[name];
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const name of KEY_VARS) {
      if (originals[name] === undefined) delete process.env[name];
      else process.env[name] = originals[name];
    }
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

test("hasTranslationProvider is always true - MyMemory needs no key", async () => {
  await withEnv({}, () => {
    assert.equal(hasTranslationProvider(), true);
  });
});

test("hasKeyedProvider is false with nothing configured, true with any one key", async () => {
  await withEnv({}, () => {
    assert.equal(hasKeyedProvider(), false);
  });
  await withEnv({ GROQ_API_KEY: "test-key" }, () => {
    assert.equal(hasKeyedProvider(), true);
  });
});

test("returns no-op for empty text without calling any provider", async () => {
  await withEnv({}, async () => {
    await withFetch(
      async () => {
        throw new Error("should not call a provider for empty text");
      },
      async () => {
        const result = await translate("   ", "en", "de");
        assert.deepEqual(result, { text: null, source: "none" });
      },
    );
  });
});

test("returns the input unchanged when source and target match", async () => {
  await withEnv({}, async () => {
    await withFetch(
      async () => {
        throw new Error("should not call a provider when target equals source");
      },
      async () => {
        const result = await translate("Hallo", "de", "de");
        assert.deepEqual(result, { text: "Hallo", source: "none" });
      },
    );
  });
});

test("stops at DeepL when it succeeds, without falling through", async () => {
  await withEnv({ DEEPL_API_KEY: "dk" }, async () => {
    let calls = 0;
    await withFetch(
      async (url) => {
        calls += 1;
        assert.ok(String(url).includes("deepl.com"));
        return { ok: true, json: async () => ({ translations: [{ text: "Hello" }] }) };
      },
      async () => {
        const result = await translate("Hallo", "en", "de");
        assert.deepEqual(result, { text: "Hello", source: "deepl" });
        assert.equal(calls, 1);
      },
    );
  });
});

test("falls through to Groq when only a Groq key is configured", async () => {
  await withEnv({ GROQ_API_KEY: "gk" }, async () => {
    const calls = [];
    await withFetch(
      async (url, init) => {
        calls.push(String(url));
        assert.ok(String(url).includes("api.groq.com/openai/v1/chat/completions"));
        const body = JSON.parse(init.body);
        assert.equal(body.model, "llama-3.3-70b-versatile");
        assert.equal(body.messages[1].content, "Hallo");
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: "Hello" } }] }),
        };
      },
      async () => {
        const result = await translate("Hallo", "en", "de");
        assert.deepEqual(result, { text: "Hello", source: "groq" });
        assert.equal(calls.length, 1);
      },
    );
  });
});

test("falls through to MyMemory when Groq itself fails", async () => {
  await withEnv({ GROQ_API_KEY: "gk" }, async () => {
    await withFetch(
      async (url) => {
        if (String(url).includes("groq.com")) {
          return { ok: false, status: 500, text: async () => "server error" };
        }
        if (String(url).includes("mymemory.translated.net")) {
          return {
            ok: true,
            json: async () => ({ responseStatus: 200, responseData: { translatedText: "Hello" } }),
          };
        }
        throw new Error(`unexpected fetch: ${url}`);
      },
      async () => {
        const result = await translate("Hallo", "en", "de");
        assert.deepEqual(result, { text: "Hello", source: "mymemory" });
      },
    );
  });
});

test("falls through to MyMemory with no keys configured at all", async () => {
  await withEnv({}, async () => {
    await withFetch(
      async (url) => {
        assert.ok(String(url).includes("mymemory.translated.net"));
        return {
          ok: true,
          json: async () => ({ responseStatus: 200, responseData: { translatedText: "Hello" } }),
        };
      },
      async () => {
        const result = await translate("Hallo", "en", "de");
        assert.deepEqual(result, { text: "Hello", source: "mymemory" });
      },
    );
  });
});

test("reports no translation when every provider fails", async () => {
  await withEnv({}, async () => {
    await withFetch(
      async () => ({ ok: false, status: 500, json: async () => ({}) }),
      async () => {
        const result = await translate("Hallo", "en", "de");
        assert.deepEqual(result, { text: null, source: "none" });
      },
    );
  });
});
