# Abuse Prevention — 如何防止 user abuse AI

本文档维护 chat 管线防滥用的整体策略。每层标注现状:**implemented** / **partial** / **planned**。

## 总览

| Layer | Threat | 落点 | 状态 |
|---|---|---|---|
| 1. Authentication & route guards | 匿名滥用、越权访问 | `app/api/chat/route.ts`、`middleware.ts` | implemented |
| 2. Input validation (Zod) | 超长输入、畸形 payload | `lib/validations/chat.ts` | implemented |
| 3. Output safety (medical guardrail) | 诊断/用药越界措辞 | `lib/ai/system-prompt.ts` | partial(prompt-level) |
| 4. Prompt-injection detection | 越狱、覆盖/泄露 system prompt | `lib/agents/orchestrator.ts`、`lib/ai/abuse.ts` | implemented |
| 5. Rate limiting / quota / monitoring | 刷接口烧钱、滥用趋势 | — | planned |

## Layer 1 — Authentication & route guards
**Threat:** 未登录用户访问 chat、非 admin 访问 admin 区。
**落点:** `/api/chat` 先 `getUser()`,无 user 返回 401;`middleware.ts` 做路由守卫 + admin 角色校验。
**状态:** implemented。

## Layer 2 — Input validation
**Threat:** 超长 prompt、畸形 JSON。
**落点:** `chatRequestSchema`(Zod):message 1–4000 字,sessionId UUID,city ≤100 字。
**状态:** implemented。仅长度/格式校验,不做内容过滤(内容判断交给 Layer 3/4)。

## Layer 3 — Output safety (medical guardrail)
**Threat:** 模型输出诊断、剂量、具体用药建议。
**落点:** `DEFAULT_SYSTEM_PROMPT` 的 3 条 load-bearing 安全条款,由 `system-prompt.test.ts` 正则守住。
**状态:** partial —— 目前**纯 prompt-level**,没有程序化输出复核。后续可加 streaming 后置复核。

## Layer 4 — Prompt-injection detection
**Threat:** "ignore previous instructions"、"you are now…"、"reveal your system prompt"、诱导扮演医生确诊等。
**机制:** 复用 orchestrator 的 `classifyIntent`,新增 `injection_attempt` 意图(不增加额外 API 调用);classifier 失败时由 `INJECTION_RE` 正则兜底拦高频英文措辞。
**命中处理:** orchestrator 顶层分支 **hard refuse**——返回固定 `INJECTION_REFUSAL` 文案,不触达 RAG / news / events / response agent;同时 `recordAbuseEvent` 写一条 `abuse_events`。
**落点:** `lib/agents/orchestrator.ts`(分支 + 正则 + 文案)、`lib/ai/abuse.ts`(记录)、`abuse_events` 表(service-role 写、admin-only 读)。
**状态:** implemented。

## Layer 5 — Rate limiting / quota / monitoring
**Threat:** 登录用户无节流刷接口烧 Claude/OpenAI/SerpAPI 成本;缺滥用趋势可视化。
**计划:** per-user + per-IP 限流(候选 Upstash Redis 滑动窗口);基于 `llm_calls` 成本聚合的每日配额;基于 `abuse_events` 的监控/告警。
**状态:** planned。
