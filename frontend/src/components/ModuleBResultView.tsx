import type { ResultPayload, ActivityPayload } from "../api/types";
import { DOMAIN_LABELS, MODULE_B_DOMAINS } from "../lib/domainConcern";
import { ScreeningDisclaimer } from "./ScreeningDisclaimer";
import { t } from "../i18n";
import { VERIFIED_HELPLINES } from "../landing/helplines";

interface Props {
  result: ResultPayload;
  correctedAgeMonths?: number | null;
  childRef?: string;
  onStartOver?: () => void;
}

type DomainStatus = "Typical" | "Monitor" | "Refer";

/** Icon for domain status — never relies on color alone. */
function statusIcon(status: DomainStatus): string {
  switch (status) {
    case "Typical":
      return "✓";
    case "Monitor":
      return "◐";
    case "Refer":
      return "▲";
  }
}

function statusLabel(status: DomainStatus): string {
  switch (status) {
    case "Typical":
      return t("moduleb.status.typical", "Typical");
    case "Monitor":
      return t("moduleb.status.monitor", "Patterns worth a closer look");
    case "Refer":
      return t("moduleb.status.refer", "Worth discussing with a specialist");
  }
}

function statusBadgeClass(status: DomainStatus): string {
  switch (status) {
    case "Typical":
      return "badge badge--typical";
    case "Monitor":
      return "badge badge--monitor";
    case "Refer":
      return "badge badge--refer";
  }
}

/**
 * Enriched Module B result view.
 *
 * Fixed order per spec:
 * (a) reassurance + privacy line
 * (b) domain profile for the 8 domains with Typical/Monitor/Refer (text + icon, never color alone)
 *     + any rule-out note
 * (c) plain-language summary from the API
 * (d) practice activities per flagged domain
 * (e) who to contact (help from API; free options first; "Talk to someone now" always present)
 * (f) the API's disclaimer
 *
 * If result.safety is true, helplines appear at the very top.
 */
export function ModuleBResultView({
  result,
  onStartOver,
}: Props) {
  const domainStatuses = result.domains
    ? Object.entries(result.domains)
    : result.domain_classifications
      ? Object.entries(result.domain_classifications).map(([k, v]) => [
          k,
          { status: v as DomainStatus, answers: {}, score: 0 },
        ] as const)
      : [];

  const flaggedDomains = result.flagged_domains ?? [];
  const ruleOutFlags = result.rule_out_flags ?? {};
  const activities: ActivityPayload[] = Array.isArray(result.activities)
    ? result.activities
    : result.activities && typeof result.activities === "object"
      ? Object.entries(result.activities).flatMap(([dom, acts]) =>
          acts.map((a) => ({ ...a, domain: a.domain ?? dom }))
        )
      : [];
  const hasSafety = result.safety === true;

  return (
    <article
      className="moduleb-result"
      aria-label={t("moduleb.result.label", "School-age screening result")}
    >
      {/* Safety helplines at the very top if result.safety is true */}
      {hasSafety ? (
        <div className="moduleb-result__safety-top" role="alert">
          <h2 className="h-sm display--clay">
            {t("moduleb.result.safety.title", "Talk to someone now")}
          </h2>
          <ul className="safety-notice__list">
            <li>
              <a href={VERIFIED_HELPLINES.kiran.tel} className="safety-notice__link">
                <strong>Kiran</strong> — {VERIFIED_HELPLINES.kiran.number} ({t("moduleb.safety.kiran.meta", "Free, 24/7, confidential")})
              </a>
            </li>
            <li>
              <a href={VERIFIED_HELPLINES.childline.tel} className="safety-notice__link">
                <strong>CHILDLINE</strong> — {VERIFIED_HELPLINES.childline.number} ({t("moduleb.safety.childline.meta", "Free, for children and families")})
              </a>
            </li>
          </ul>
        </div>
      ) : null}

      {/* (a) Short reassurance + privacy line */}
      <section className="moduleb-result__reassurance">
        <h1 className="display">
          {t(
            "moduleb.result.heading",
            "Here is what this check-in found",
          )}
        </h1>
        <p className="lede">
          {t(
            "moduleb.result.reassurance",
            "This is a screening check-in — it highlights patterns worth a closer look, not a diagnosis. Your answers are not stored beyond this session.",
          )}
        </p>
      </section>

      {/* (b) Domain profile for the 8 domains */}
      <section
        className="moduleb-result__domains"
        aria-labelledby="domains-heading"
      >
        <h2 id="domains-heading" className="h-sm">
          {t("moduleb.result.domains.title", "Domain profile")}
        </h2>
        <ul className="moduleb-domain-list" role="list">
          {MODULE_B_DOMAINS.map((domainKey) => {
            const entry = domainStatuses.find(([k]) => k === domainKey);
            const status: DomainStatus = entry
              ? (typeof entry[1] === "string"
                  ? (entry[1] as DomainStatus)
                  : (entry[1] as { status: DomainStatus }).status)
              : "Typical";
            const label =
              DOMAIN_LABELS[domainKey] ?? domainKey.replace(/_/g, " ");

            return (
              <li key={domainKey} className="moduleb-domain-item">
                <span className="moduleb-domain-item__name">{label}</span>
                <span className={statusBadgeClass(status)}>
                  <span aria-hidden="true">{statusIcon(status)} </span>
                  {statusLabel(status)}
                </span>
              </li>
            );
          })}
        </ul>

        {/* Rule-out notes */}
        {Object.keys(ruleOutFlags).length > 0 ? (
          <aside className="moduleb-result__ruleout" role="note">
            <h3 className="h-sm">
              {t("moduleb.result.ruleout.title", "Additional recommendations")}
            </h3>
            {ruleOutFlags["vision_hearing"] ? (
              <p>
                {t(
                  "moduleb.result.ruleout.vision",
                  "A vision or hearing check is recommended before further screening. Please visit your nearest RBSK team, DEIC centre, or paediatrician.",
                )}
              </p>
            ) : null}
            {ruleOutFlags["global_asd"] ? (
              <p>
                {t(
                  "moduleb.result.ruleout.global",
                  "A broader developmental evaluation is recommended. Please speak with a paediatrician or visit your nearest DEIC centre.",
                )}
              </p>
            ) : null}
          </aside>
        ) : null}
      </section>

      {/* (c) Plain-language summary from the API */}
      {result.summary ? (
        <section className="moduleb-result__summary">
          <h2 className="h-sm">
            {t("moduleb.result.summary.title", "Summary")}
          </h2>
          <p>{result.summary}</p>
        </section>
      ) : null}

      {/* (d) Practice activities per flagged domain */}
      {activities.length > 0 ? (
        <section
          className="moduleb-result__activities"
          aria-labelledby="activities-heading"
        >
          <h2 id="activities-heading" className="h-sm">
            {t("moduleb.result.activities.title", "Things you can try at home or school")}
          </h2>
          <ul className="moduleb-activity-list" role="list">
            {activities.map((act: ActivityPayload, i: number) => {
              const domLabel = act.domain ? (DOMAIN_LABELS[act.domain] ?? act.domain) : "";
              return (
                <li key={`${act.domain ?? "act"}-${i}`} className="moduleb-activity-card">
                  {(domLabel || act.setting) ? (
                    <p className="eyebrow">
                      {domLabel}{act.setting ? ` · ${act.setting}` : ""}
                    </p>
                  ) : null}
                  <h3 className="moduleb-activity-card__title">{act.title}</h3>
                  {act.description ? <p className="moduleb-activity-card__desc">{act.description}</p> : null}
                  {act.frequency ? <p className="moduleb-activity-card__freq">{act.frequency}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* (e) Who to contact — help from the API, free options first */}
      <section className="moduleb-result__help">
        <h2 className="h-sm">
          {t("moduleb.result.help.title", "Who to talk to")}
        </h2>
        {result.help ? (
          <p>{result.help}</p>
        ) : (
          <p>
            {t(
              "moduleb.result.help.default",
              "If you have concerns, your child's teacher, school counsellor, or a paediatrician can help with next steps.",
            )}
          </p>
        )}
        {flaggedDomains.length > 0 ? (
          <p className="moduleb-result__flagged">
            {t("moduleb.result.help.flagged", "Areas highlighted:")}{" "}
            {flaggedDomains
              .map((d) => DOMAIN_LABELS[d] ?? d.replace(/_/g, " "))
              .join(", ")}
          </p>
        ) : null}
        <div className="safety-persistent" role="complementary">
          <a href={VERIFIED_HELPLINES.kiran.tel} className="safety-persistent__link">
            {t("moduleb.safety.persistent", "Talk to someone now")}
          </a>
        </div>
      </section>

      {/* (f) The API's disclaimer */}
      {result.disclaimer ? (
        <aside className="moduleb-result__disclaimer" role="note">
          <p>{result.disclaimer}</p>
        </aside>
      ) : (
        <ScreeningDisclaimer />
      )}

      {/* Start over */}
      {onStartOver ? (
        <div className="results__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onStartOver}
          >
            {t("moduleb.result.startover", "Start another check-in")}
          </button>
        </div>
      ) : null}
    </article>
  );
}
