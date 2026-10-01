import test from "node:test";
import assert from "node:assert/strict";
import { OllamaClient, ollamaModelMatches } from "../app/server/ai/ollama-client";

function installFetchStub(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("Ollama readiness requires the configured model, not only a reachable daemon", async () => {
  const restoreFetch = installFetchStub((url) => {
    assert.match(url, /\/api\/tags$/);
    return Response.json({
      models: [
        { name: "qwen3:4b", model: "qwen3:4b", size: 1 },
      ],
    });
  });

  try {
    const client = new OllamaClient({
      baseUrl: "http://127.0.0.1:11434",
      defaultModel: "llama3.2:1b",
    });

    assert.equal(await client.isServerAvailable(), true);
    assert.equal(
      await client.isAvailable(),
      false,
      "a running Ollama daemon must not be advertised as inference-ready when the configured model is missing",
    );
  } finally {
    restoreFetch();
  }
});

test("Ollama readiness accepts the installed configured model", async () => {
  const restoreFetch = installFetchStub(() => Response.json({
    models: [
      { name: "llama3.2:1b", model: "llama3.2:1b", size: 1 },
    ],
  }));

  try {
    const client = new OllamaClient({ defaultModel: "llama3.2:1b" });
    assert.equal(await client.isAvailable(), true);
  } finally {
    restoreFetch();
  }
});

test("an untagged configured Ollama model resolves only to its latest tag", () => {
  assert.equal(ollamaModelMatches("qwen3", "qwen3:latest"), true);
  assert.equal(ollamaModelMatches("qwen3", "qwen3:4b"), false);
  assert.equal(ollamaModelMatches("qwen3:4b", "qwen3:4b"), true);
  assert.equal(ollamaModelMatches("qwen3:4b", "qwen3:latest"), false);
});

test("Ollama chat keeps the configured local model warm for repeated clinical requests", async () => {
  let requestBody: any;
  const restoreFetch = installFetchStub((url, init) => {
    assert.match(url, /\/api\/chat$/);
    requestBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return Response.json({ message: { content: "ok" } });
  });

  try {
    const client = new OllamaClient({
      defaultModel: "llama3.2:1b",
      keepAlive: "45m",
    });
    const response = await client.chat([{ role: "user", content: "ping" }]);

    assert.equal(response, "ok");
    assert.equal(requestBody?.model, "llama3.2:1b");
    assert.equal(requestBody?.keep_alive, "45m");
  } finally {
    restoreFetch();
  }
});
