import { useState, useEffect } from "react";
import type { ResultPayload, WorkerSuggestion } from "../api/types";
import { screenApi } from "../api/client";
import { useToast } from "../toast/Toast";

interface Props {
  result: ResultPayload;
  sessionId?: string | null;
}

export function SuggestedWorkersSection({ result, sessionId }: Props) {
  const { push } = useToast();
  const [workers, setWorkers] = useState<WorkerSuggestion[]>(
    result.suggested_workers || [],
  );
  const [loading, setLoading] = useState(false);
  const [contactingId, setContactingId] = useState<string | null>(null);
  const [contactedIds, setContactedIds] = useState<Set<string>>(new Set());

  // If workers weren't embedded directly in result, fetch them from the endpoint
  useEffect(() => {
    if (result.suggested_workers && result.suggested_workers.length > 0) {
      setWorkers(result.suggested_workers);
      return;
    }
    if (!sessionId) return;

    let cancelled = false;
    setLoading(true);
    screenApi
      .getWorkers(sessionId)
      .then((data: WorkerSuggestion[]) => {
        if (!cancelled && data && data.length > 0) {
          setWorkers(data);
        }
      })
      .catch((err: unknown) => {
        console.warn("Could not load community worker suggestions:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, result.suggested_workers]);

  async function handleContact(
    worker: WorkerSuggestion,
    method: "call" | "whatsapp" | "in_person",
  ) {
    if (!sessionId) return;
    setContactingId(worker.id);
    try {
      await screenApi.contactWorker(sessionId, {
        worker_id: worker.id,
        contact_method: method,
        notes: `Caregiver initiated ${method} contact for ${result.child_name || "child"}`,
      });
      setContactedIds((prev) => new Set([...prev, worker.id]));
      push(
        `Contact request noted for ${worker.name}. You can connect directly!`,
        "success",
      );
    } catch {
      push(
        `Direct contact logged for ${worker.name}.`,
        "info",
      );
    } finally {
      setContactingId(null);
    }
  }

  const hasLocation = Boolean(
    result.location_city || result.location_pincode || result.location_state,
  );

  return (
    <section
      className="suggested-workers"
      aria-labelledby="suggested-workers-title"
    >
      <div className="suggested-workers__header">
        <p className="eyebrow eyebrow--teal">
          Nearby Healthcare & Early Intervention Directory
        </p>
        <h2 id="suggested-workers-title" className="h-md">
          Recommended Workers in Your Area
        </h2>
        <p className="suggested-workers__subtitle">
          Based on {result.child_name ? <strong>{result.child_name}</strong> : "your child"}&apos;s screening summary
          {hasLocation ? (
            <>
              {" "}and your location in{" "}
              <strong>
                {[
                  result.location_address,
                  result.location_city,
                  result.location_state,
                  result.location_pincode ? `PIN ${result.location_pincode}` : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </strong>
            </>
          ) : null}
          , here are verified Indian public health workers and early intervention specialists you can connect with:
        </p>
      </div>

      {/* Intake Profile Pill Bar */}
      {(result.child_name || result.parent_name || result.parent_phone) ? (
        <div className="suggested-workers__profile-banner">
          <div className="profile-badge">
            <span className="profile-badge__label">Child:</span>
            <span className="profile-badge__val">
              {result.child_name || "Anonymous Child"}
            </span>
          </div>
          {result.parent_name ? (
            <div className="profile-badge">
              <span className="profile-badge__label">Parent / Caregiver:</span>
              <span className="profile-badge__val">
                {result.parent_name} ({result.relationship_to_child || "Parent"})
              </span>
            </div>
          ) : null}
          {result.parent_phone ? (
            <div className="profile-badge">
              <span className="profile-badge__label">Phone:</span>
              <span className="profile-badge__val">{result.parent_phone}</span>
            </div>
          ) : null}
          {result.triage_tier ? (
            <div className="profile-badge profile-badge--tier">
              <span className="profile-badge__label">Triage Priority:</span>
              <span className="profile-badge__val">{result.triage_tier}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <p className="suggested-workers__loading">Finding closest local health centres and workers…</p>
      ) : workers.length === 0 ? (
        <div className="suggested-workers__empty">
          <p>
            No private clinic required — your local <strong>Anganwadi (ICDS)</strong> or <strong>Primary Health Centre (PHC)</strong> can assist with developmental follow-up. Dial <strong>104</strong> for your state health helpline.
          </p>
        </div>
      ) : (
        <div className="suggested-workers__grid">
          {workers.map((w) => {
            const isContacted = contactedIds.has(w.id);
            const isBusy = contactingId === w.id;

            return (
              <article key={w.id} className="worker-card">
                <div className="worker-card__top">
                  <div className="worker-card__meta">
                    <span className="worker-card__role-tag">{w.role}</span>
                    {w.free_service ? (
                      <span className="worker-card__free-tag">✓ Free Public Service</span>
                    ) : null}
                  </div>
                  <h3 className="worker-card__name">{w.name}</h3>
                  {w.facility_name ? (
                    <p className="worker-card__facility">{w.facility_name}</p>
                  ) : null}
                </div>

                <div className="worker-card__details">
                  {w.distance_hint ? (
                    <p className="worker-card__location">
                      <strong>Location Coverage:</strong> {w.distance_hint}
                    </p>
                  ) : null}
                  {w.recommendation_reason ? (
                    <p className="worker-card__reason">
                      <strong>Why this worker:</strong> {w.recommendation_reason}
                    </p>
                  ) : null}
                  {w.operating_hours ? (
                    <p className="worker-card__hours">
                      <strong>Hours:</strong> {w.operating_hours}
                    </p>
                  ) : null}
                </div>

                <div className="worker-card__actions">
                  <a
                    href={`tel:${w.phone.replace(/\s+/g, "")}`}
                    className="btn btn--primary btn--sm"
                    onClick={() => {
                      void handleContact(w, "call");
                    }}
                  >
                    Call {w.phone}
                  </a>

                  {w.whatsapp ? (
                    <a
                      href={`https://wa.me/${w.whatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                        `Hello ${w.name}, I recently completed an early developmental check-in for my child ${result.child_name || ""}. I would like to consult with you.`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn--secondary btn--sm"
                      onClick={() => {
                        void handleContact(w, "whatsapp");
                      }}
                    >
                      WhatsApp
                    </a>
                  ) : null}

                  <button
                    type="button"
                    className={`btn btn--ghost btn--sm ${isContacted ? "btn--contacted" : ""}`}
                    disabled={isBusy || isContacted}
                    onClick={() => void handleContact(w, "in_person")}
                  >
                    {isContacted
                      ? "✓ Contact Logged"
                      : isBusy
                        ? "Saving…"
                        : "Log Callback Request"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
