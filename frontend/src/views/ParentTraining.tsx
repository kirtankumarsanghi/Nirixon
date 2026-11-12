import { useState } from "react";
import { Eye, Home as HomeIcon, MessageCircleHeart } from "lucide-react";
import { Display, Eyebrow, Page, Reveal } from "../components/ui";
import { MiniQuiz } from "../components/MiniQuiz";
import { Photo } from "../components/Photo";
import { PHOTO } from "../photos";
import { PARENT_QUIZ, PARENT_STAGES, PARENT_TIPS } from "../lib/roleTrainingContent";
import { cn } from "../utils/cn";

type Mode = "learn" | "quiz";

function Block({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: string[]; tone: string }) {
  return (
    <div className={cn("rounded-[32px] p-6", tone)}>
      <div className="flex items-center gap-2.5 text-[13px] font-bold">
        {icon}
        {title}
      </div>
      <ul className="mt-4 space-y-2.5 text-[13.5px] leading-relaxed">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-current opacity-50" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ParentTraining() {
  const [mode, setMode] = useState<Mode>("learn");
  const [stageId, setStageId] = useState(PARENT_STAGES[0].id);
  const stage = PARENT_STAGES.find((s) => s.id === stageId) ?? PARENT_STAGES[0];

  return (
    <Page>
      <Eyebrow>Learn · simple guides for families</Eyebrow>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
        <Display as="h1" className="text-[clamp(52px,8vw,118px)]">
          Grow together.
          <br />
          <span className="text-sea">Small steps daily.</span>
        </Display>
        <div className="flex rounded-full border border-line-2 bg-card p-1" role="group" aria-label="Learning mode">
          {([["learn", "Guides"], ["quiz", "Quick quiz"]] as [Mode, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
              className={cn("rounded-full px-5 py-2.5 text-[12px] font-bold transition-colors", mode === value ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-5 max-w-[620px] text-[15px] leading-relaxed text-ink-2">
        Pick your child&apos;s age to see what to look for, what to try at home, and when to talk to your health worker.
      </p>

      <Reveal className="mt-10">
        {mode === "learn" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2.5" role="group" aria-label="Child age">
              {PARENT_STAGES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStageId(s.id)}
                  aria-pressed={s.id === stage.id}
                  className={cn(
                    "rounded-full border px-5 py-2.5 text-[13px] font-bold transition-colors",
                    s.id === stage.id ? "border-ink bg-ink text-paper" : "border-line-2 bg-card text-ink-2 hover:border-ink/60",
                  )}
                >
                  {s.label} <span className="font-mono text-[10.5px] font-normal opacity-70">· {s.ages}</span>
                </button>
              ))}
            </div>

            <div key={stage.id} className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="relative min-h-[320px] overflow-hidden rounded-[44px]">
                <Photo src={stage.id === "school" ? PHOTO.school : `${import.meta.env.BASE_URL}training/stage-${stage.id}.jpg`} alt={`${stage.label} learning and playing`} wrapperClassName="absolute inset-0" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night/90 to-transparent p-7 pt-24 text-paper">
                  <p className="font-mono text-[10.5px] tracking-[0.2em] uppercase opacity-70">{stage.ages}</p>
                  <p className="mt-2 font-display text-[clamp(30px,3.5vw,44px)] leading-[0.95] uppercase">{stage.label}</p>
                  <p className="mt-3 text-[13px] leading-relaxed text-paper/85">{stage.intro}</p>
                </div>
              </div>
              <div className="grid gap-4">
                <Block icon={<Eye className="size-4" />} title="What you may see" items={stage.look} tone="bg-moss-bg text-ink" />
                <Block icon={<HomeIcon className="size-4" />} title="Try at home" items={stage.tryAtHome} tone="bg-sand/70 text-ink" />
                <Block icon={<MessageCircleHeart className="size-4" />} title="Talk to your health worker if" items={stage.talk} tone="bg-night text-paper" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {PARENT_TIPS.map((tip) => (
                <div key={tip.title} className="rounded-[32px] border border-line-2 bg-card p-6">
                  <p className="text-[14px] font-bold">{tip.title}</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{tip.text}</p>
                </div>
              ))}
            </div>
            <p className="px-2 text-[12px] leading-relaxed text-muted">
              In an emergency or if your child talks about self-harm: Tele-MANAS 14416, CHILDLINE 1098, or 112.
            </p>
          </div>
        ) : (
          <MiniQuiz questions={PARENT_QUIZ} storageKey="nirixon-parent-training" tone="warm" />
        )}
      </Reveal>
    </Page>
  );
}
