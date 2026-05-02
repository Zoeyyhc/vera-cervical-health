// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/ai/openai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/openai")>();
  return {
    ...actual,
    getOpenAIClient: vi.fn(),
  };
});

import { EMBEDDING_MODEL, getOpenAIClient } from "@/lib/ai/openai";
import { embedText } from "./embed";

function mockOpenAI(embedding: number[] | Error) {
  return {
    embeddings: {
      create:
        embedding instanceof Error
          ? vi.fn().mockRejectedValue(embedding)
          : vi.fn().mockResolvedValue({ data: [{ embedding }] }),
    },
  };
}

describe("embedText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("calls embeddings.create with EMBEDDING_MODEL and the input text", async () => {
    const fakeEmbedding = Array.from({ length: 1536 }, () => 0.1);
    const openai = mockOpenAI(fakeEmbedding);
    vi.mocked(getOpenAIClient).mockReturnValue(openai as never);

    await embedText("What is HPV?");

    expect(openai.embeddings.create).toHaveBeenCalledTimes(1);
    const args = openai.embeddings.create.mock.calls[0] as unknown as [
      { model: string; input: string },
    ];
    expect(args[0].model).toBe(EMBEDDING_MODEL);
    expect(args[0].input).toBe("What is HPV?");
  });

  test("returns the first embedding's vector as number[]", async () => {
    const fakeEmbedding = Array.from({ length: 1536 }, (_, i) => i / 1536);
    const openai = mockOpenAI(fakeEmbedding);
    vi.mocked(getOpenAIClient).mockReturnValue(openai as never);

    const result = await embedText("anything");

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1536);
    expect(result).toEqual(fakeEmbedding);
  });

  test("propagates errors from the SDK", async () => {
    const openai = mockOpenAI(new Error("OpenAI exploded"));
    vi.mocked(getOpenAIClient).mockReturnValue(openai as never);

    await expect(embedText("anything")).rejects.toThrow("OpenAI exploded");
  });
});
