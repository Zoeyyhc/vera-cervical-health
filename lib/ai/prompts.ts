import { createHash } from "node:crypto";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

export type PromptDef = {
  id: string;
  version: string;
  text: string;
};

function defPrompt(id: string, version: string, text: string): PromptDef {
  return { id, version, text };
}

export const CLASSIFIER_PROMPT = defPrompt(
  "classifier",
  "v1",
  `You classify the user's message into exactly ONE of these categories. Return ONLY the category name (lowercase, with underscores), nothing else — no explanation, no punctuation.

Categories:
- health_question  : questions about cervical health, HPV, screening, vaccination, symptoms, treatments, anatomy
- news_request     : explicit requests for recent news, articles, headlines, or updates
- events_request   : questions about upcoming events, meetups, screening clinics, conferences, or local activity
- general_chat     : greetings, off-topic questions, or anything that doesn't fit above

If unsure, choose general_chat.`
);

export const RESPONSE_DEFAULT_PROMPT = defPrompt("response.default", "v1", DEFAULT_SYSTEM_PROMPT);

export function promptHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
