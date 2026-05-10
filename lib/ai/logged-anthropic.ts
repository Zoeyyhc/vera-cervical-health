import { getAnthropicClient } from "@/lib/ai/anthropic";
import { auditContext } from "@/lib/ai/audit-context";
import { computeCostUsd } from "@/lib/ai/pricing";
import { type PromptDef, promptHash } from "@/lib/ai/prompts";
import type Anthropic from "@anthropic-ai/sdk";

type LoggedCallMeta = {
  agent: string;
  prompt: PromptDef;
};

type AuditUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

const ZERO_USAGE: AuditUsage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

function buildRow(args: {
  params: { model: string; max_tokens: number; temperature?: number };
  meta: LoggedCallMeta;
  startedAt: Date;
  durationMs: number;
  usage: AuditUsage;
  status: "ok" | "error";
  streamed: boolean;
  error?: unknown;
}) {
  const u = args.usage;
  return {
    user_id: null as string | null,
    session_id: null as string | null,
    agent: args.meta.agent,
    prompt_id: args.meta.prompt.id,
    prompt_version: args.meta.prompt.version,
    prompt_hash: promptHash(args.meta.prompt.text),
    model: args.params.model,
    temperature: args.params.temperature ?? null,
    max_tokens: args.params.max_tokens,
    streamed: args.streamed,
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_read_tokens: u.cache_read_input_tokens,
    cache_write_tokens: u.cache_creation_input_tokens,
    cost_usd:
      args.status === "ok" ? computeCostUsd(args.params.model, u) : null,
    started_at: args.startedAt.toISOString(),
    duration_ms: Math.round(args.durationMs),
    status: args.status,
    error_message: args.error instanceof Error ? args.error.message : null,
  };
}

async function writeAuditRow(row: ReturnType<typeof buildRow>): Promise<void> {
  const ctx = auditContext.get();
  if (!ctx) return;
  row.user_id = ctx.userId;
  row.session_id = ctx.sessionId;
  const { error } = await ctx.supabaseAdmin.from("llm_calls").insert(row);
  if (error) console.error("[llm-audit] insert failed:", error.message);
}

export async function loggedMessagesCreate(
  params: Anthropic.MessageCreateParamsNonStreaming,
  meta: LoggedCallMeta,
): Promise<Anthropic.Message> {
  const startedAt = new Date();
  const t0 = performance.now();
  try {
    const res = await getAnthropicClient().messages.create(params);
    const u = res.usage;
    const usage: AuditUsage = u
      ? {
          input_tokens: u.input_tokens,
          output_tokens: u.output_tokens,
          cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
        }
      : { ...ZERO_USAGE };
    void writeAuditRow(
      buildRow({
        params,
        meta,
        startedAt,
        durationMs: performance.now() - t0,
        usage,
        status: "ok",
        streamed: false,
      }),
    );
    return res;
  } catch (err) {
    void writeAuditRow(
      buildRow({
        params,
        meta,
        startedAt,
        durationMs: performance.now() - t0,
        usage: ZERO_USAGE,
        status: "error",
        streamed: false,
        error: err,
      }),
    );
    throw err;
  }
}

export async function* loggedMessagesStream(
  params: Anthropic.MessageStreamParams,
  meta: LoggedCallMeta,
): AsyncIterable<Anthropic.MessageStreamEvent> {
  const startedAt = new Date();
  const t0 = performance.now();
  const usage: AuditUsage = { ...ZERO_USAGE };
  try {
    const stream = getAnthropicClient().messages.stream(params);
    for await (const ev of stream as AsyncIterable<Anthropic.MessageStreamEvent>) {
      if (ev.type === "message_start") {
        const m = ev.message.usage;
        usage.input_tokens = m.input_tokens;
        usage.cache_read_input_tokens = m.cache_read_input_tokens ?? 0;
        usage.cache_creation_input_tokens = m.cache_creation_input_tokens ?? 0;
      } else if (ev.type === "message_delta" && ev.usage) {
        usage.output_tokens = ev.usage.output_tokens;
      }
      yield ev;
    }
    void writeAuditRow(
      buildRow({
        params,
        meta,
        startedAt,
        durationMs: performance.now() - t0,
        usage,
        status: "ok",
        streamed: true,
      }),
    );
  } catch (err) {
    void writeAuditRow(
      buildRow({
        params,
        meta,
        startedAt,
        durationMs: performance.now() - t0,
        usage,
        status: "error",
        streamed: true,
        error: err,
      }),
    );
    throw err;
  }
}
