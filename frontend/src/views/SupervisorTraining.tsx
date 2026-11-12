import { useState } from "react";
import { ClipboardCheck, ShieldAlert } from "lucide-react";
import { Chip, Display, Eyebrow, Page, Reveal } from "../components/ui";
import { Photo } from "../components/Photo";
import { PHOTO } from "../photos";
import { SUPERVISOR_PLAYBOOKS } from "../lib/roleTrainingContent";
import { useT } from "../lib/useT";
import { cn } from "../utils/cn";

export function SupervisorTraining() {
  const tr = useT();
  const [selected, setSelected] = useState(SUPERVISOR_PLAYBOOKS[0].id);
  const active = SUPERVISOR_PLAYBOOKS.find((p) => p.id === selected) ?? SUPERVISOR_PLAYBOOKS[0];

  return (
    <Page>
      <Eyebrow>Supervisor training · oversight playbooks</Eyebrow>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
        <Display as="h1" className="text-[clamp(52px,8vw,118px)]">
          {tr("Lead the team.")}
          <br />
          <span className="text-sea">{tr("Close the loop.")}</span>
        </Display>
      </div>

      <p className="mt-5 max-w-[640px] text-[15px] leading-relaxed text-ink-2">
        Built for field supervisors: reading coverage, chasing referrals, coaching workers, handling safety escalations and protecting privacy.
      </p>

      <Reveal className="mt-10">
        <div className="grid items-start gap-4 lg:grid-cols-[400px_1fr]">
          <div className="space-y-4">
            <div className="relative h-44 overflow-hidden rounded-[36px]">
              <Photo src={PHOTO.women} alt="Supervisor reviewing the ward with health workers" wrapperClassName="absolute inset-0" />
            </div>
            <ul className="space-y-1 rounded-[36px] border border-line-2 bg-card p-3">
              {SUPERVISOR_PLAYBOOKS.map((item, i) => {
                const on = item.id === active.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(item.id)}
                      aria-current={on ? "true" : undefined}
                      className={cn("flex w-full items-center gap-3 rounded-[22px] px-4 py-3.5 text-left transition-colors", on ? "bg-ink text-paper" : "hover:bg-card-2")}
                    >
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold", on ? "bg-paper/15 text-paper" : "bg-sand text-ink-2")}>{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-bold">{item.title}</span>
                        <span className={cn("block text-[11px]", on ? "text-paper/55" : "text-muted")}>{item.summary}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div key={active.id} className="rounded-[44px] bg-night p-7 text-paper sm:p-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Eyebrow tone="peach">Playbook</Eyebrow>
                <p className="mt-3 font-display text-[clamp(34px,4vw,52px)] leading-[0.95] uppercase">{active.title}</p>
              </div>
              <Chip tone="night">{active.steps.length} steps</Chip>
            </div>
            <p className="mt-5 max-w-[620px] text-[14.5px] leading-relaxed text-paper/80">{active.summary}</p>
            <ol className="mt-7 space-y-3">
              {active.steps.map((step, i) => (
                <li key={step} className="flex items-start gap-3.5 rounded-2xl bg-white/[0.06] p-4 text-[13.5px] leading-relaxed text-paper/85">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-peach font-mono text-[11px] font-bold text-night">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <p className="mt-6 flex items-start gap-2.5 rounded-2xl bg-[#ee6a4f]/15 p-4 text-[12.5px] leading-relaxed text-paper/85">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#ee6a4f]" />
              {active.watch}
            </p>
            <p className="mt-5 flex items-center gap-2 text-[11.5px] text-paper/50">
              <ClipboardCheck className="size-3.5" /> Follow your district protocol where it differs.
            </p>
          </div>
        </div>
      </Reveal>
    </Page>
  );
}
