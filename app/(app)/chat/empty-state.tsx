"use client";

import { CalendarDaysIcon, NewspaperIcon } from "lucide-react";

export const NEWS_PROMPT = "Show me the latest cervical health news.";
export const EVENTS_PROMPT = "What women's health events are happening near me?";

export const PROMPT_SUGGESTIONS = [
  "What is HPV?",
  "When should I start cervical screening?",
  "What are the symptoms of cervical cancer?",
  "Who should get the HPV vaccine?",
  "How often do I need a Pap smear?",
  "What does an abnormal Pap result mean?",
] as const;

type Props = {
  onPrompt: (text: string) => void;
  disabled?: boolean;
};

export function EmptyState({ onPrompt, disabled }: Props) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 pt-12 text-center">
      <p className="text-muted-gray text-sm">
        Ask a cervical-health question to get started. Replies are not a substitute for a
        clinician's advice — see a doctor for symptoms or specific situations.
      </p>

      <div className="flex w-full flex-col gap-3">
        <EntryCard
          icon={<NewspaperIcon className="size-5" />}
          title="Latest women's health news"
          description="See today's coverage on HPV, cervical screening & more"
          disabled={disabled}
          onClick={() => onPrompt(NEWS_PROMPT)}
        />
        <EntryCard
          icon={<CalendarDaysIcon className="size-5" />}
          title="Events near you"
          description="Find screening clinics & talks in your area"
          disabled={disabled}
          onClick={() => onPrompt(EVENTS_PROMPT)}
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <p className="text-muted-gray text-xs uppercase tracking-wider">Or try one of these:</p>
        <div className="flex flex-wrap justify-center gap-2">
          {PROMPT_SUGGESTIONS.map((text) => (
            <button
              key={text}
              type="button"
              disabled={disabled}
              onClick={() => onPrompt(text)}
              className="border-border text-charcoal hover:bg-white/60 rounded-full border bg-white/40 px-3 py-1.5 text-xs transition-colors disabled:opacity-60"
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EntryCard({
  icon,
  title,
  description,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="border-border hover:bg-white/60 flex items-start gap-3 rounded-xl border bg-white/40 p-4 text-left transition-colors disabled:opacity-60"
    >
      <span className="text-charcoal mt-0.5">{icon}</span>
      <span className="flex flex-col gap-0.5">
        <span className="text-charcoal text-sm font-medium">{title}</span>
        <span className="text-muted-gray text-xs">{description}</span>
      </span>
    </button>
  );
}
