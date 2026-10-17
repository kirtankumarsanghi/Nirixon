import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { helpApi } from "../api/client";
import type { HelpCentreItem, HelpNearbyResponse } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import {
  defaultAuthenticatedPath,
  isClinicianRole,
  isFrontlineRole,
  isParentRole,
} from "../auth/roles";
import { PageNav } from "../components/PageNav";
import { getLatestCheckIn } from "../lib/checkInHistory";
import { VERIFIED_HELPLINES } from "../landing/helplines";

const SAMPLE_PINS = [
  { label: "South Delhi (110029)", pin: "110029" },
  { label: "New Delhi (110001)", pin: "110001" },
  { label: "North Delhi (110054)", pin: "110054" },
  { label: "Mumbai (400012)", pin: "400012" },
  { label: "Bengaluru (560029)", pin: "560029" },
  { label: "Unserviced PIN (999999)", pin: "999999" },
];

export function FindHelpPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useAuth();
  const home = defaultAuthenticatedPath(role);
  const latest = getLatestCheckIn();

  // Initial values from search params or latest screening check-in
  const initialPin =
    searchParams.get("pin") ?? (latest?.childRef ? "" : "110029");
  const initialAge = searchParams.get("age")
    ? Number(searchParams.get("age"))
    : latest
      ? Math.round((latest.correctedAgeMonths / 12) * 10) / 10
      : 4;

  const [pinInput, setPinInput] = useState<string>(initialPin);
  const [ageInput, setAgeInput] = useState<number | "">(initialAge);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HelpNearbyResponse | null>(null);

  const performSearch = useCallback(
    async (pinToSearch: string, ageYears: number | null) => {
      const cleanPin = pinToSearch.trim();

      // Client-side validation: PIN must be 6 digits
      if (!/^\d{6}$/.test(cleanPin)) {
        setError(`Invalid PIN code '${cleanPin}': must be a 6-digit number.`);
        return;
      }

      setError(null);
      setIsLoading(true);

      try {
        const res = await helpApi.getNearby({
          pin: cleanPin,
          age: ageYears != null && ageYears !== 0 ? ageYears : undefined,
        });
        setData(res);

        // Update URL query params without reloading
        const nextParams = new URLSearchParams();
        nextParams.set("pin", cleanPin);
        if (ageYears != null) nextParams.set("age", String(ageYears));
        setSearchParams(nextParams, { replace: true });
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to locate nearby help centres.";
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [setSearchParams],
  );

  // Initial automatic search on mount if initial PIN is valid
  useEffect(() => {
    if (/^\d{6}$/.test(initialPin)) {
      performSearch(initialPin, typeof initialAge === "number" ? initialAge : null);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(pinInput, typeof ageInput === "number" ? ageInput : null);
  };

  const handleQuickPin = (pin: string) => {
    setPinInput(pin);
    performSearch(pin, typeof ageInput === "number" ? ageInput : null);
  };

  const hasSampleData = data?.centres.some((c) => c.is_sample);

  return (
    <div className="feature-page find-help-page">
      <PageNav current="/help" />

      <header className="find-help-header">
        <p className="eyebrow">Public health & early intervention</p>
        <h1 className="display">Find nearest help</h1>
        <p className="lede">
          Search verified DEIC, RBSK child-health teams, and district hospital
          rehab units by pincode — then call or visit with confidence.
        </p>
      </header>

      {/* Search Bar Form */}
      <section className="find-help-search-box" aria-labelledby="search-heading">
        <h2 id="search-heading" className="sr-only">Search help centres by PIN and Age</h2>
        <form onSubmit={handleSubmit} className="find-help-form">
          <div className="find-help-field">
            <label htmlFor="pin-input" className="find-help-label">
              Postal PIN Code
            </label>
            <input
              id="pin-input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="e.g. 110029"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="find-help-input"
              aria-describedby="pin-help"
            />
            <span id="pin-help" className="find-help-helptext">
              6-digit Indian Postal PIN code
            </span>
          </div>

          <div className="find-help-field">
            <label htmlFor="age-input" className="find-help-label">
              Child's Age (Years)
            </label>
            <input
              id="age-input"
              type="number"
              min={0}
              max={18}
              step={0.5}
              placeholder="e.g. 4"
              value={ageInput}
              onChange={(e) =>
                setAgeInput(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="find-help-input"
              aria-describedby="age-help"
            />
            <span id="age-help" className="find-help-helptext">
              Under 6: DEICs & RBSK | Ages 6–12: Hospitals & Rehab
            </span>
          </div>

          <div className="find-help-actions">
            <button
              type="submit"
              className="btn btn--primary find-help-submit"
              aria-label="Find Nearest Help"
              disabled={isLoading}
            >
              {isLoading ? "Searching..." : "Find Nearest Help"}
            </button>
          </div>
        </form>

        {/* Quick Age Presets */}
        <div className="find-help-presets">
          <span className="find-help-presets__label">Age routing presets:</span>
          <button
            type="button"
            className={`btn btn--xs ${ageInput === 4 ? "btn--secondary" : "btn--ghost"}`}
            onClick={() => {
              setAgeInput(4);
              performSearch(pinInput, 4);
            }}
          >
            Age 4 (Early Intervention / DEIC)
          </button>
          <button
            type="button"
            className={`btn btn--xs ${ageInput === 9 ? "btn--secondary" : "btn--ghost"}`}
            onClick={() => {
              setAgeInput(9);
              performSearch(pinInput, 9);
            }}
          >
            Age 9 (School & Hospital Rehab)
          </button>
          <button
            type="button"
            className={`btn btn--xs ${ageInput === "" ? "btn--secondary" : "btn--ghost"}`}
            onClick={() => {
              setAgeInput("");
              performSearch(pinInput, null);
            }}
          >
            All Resources
          </button>
        </div>

        {/* Quick PIN Chips */}
        <div className="find-help-chips">
          <span className="find-help-chips__label">Try sample PINs:</span>
          {SAMPLE_PINS.map((item) => (
            <button
              key={item.pin}
              type="button"
              className="btn btn--xs btn--ghost"
              onClick={() => handleQuickPin(item.pin)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {/* Error Banner */}
      {error && (
        <div className="whatif-alert whatif-alert--error" role="alert">
          <AlertTriangle className="whatif-alert__icon" size={18} />
          <div>
            <strong>Error:</strong> {error}
          </div>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Sample Data Banner Notice */}
      {hasSampleData && (
        <div className="sample-data-notice" role="note">
          <span className="badge badge--sample">Sample data</span>
          <p>
            Showing sample data for demonstration. Clinical and administrative
            teams can import real district health facilities by replacing{" "}
            <code>backend/data/help_centres.sample.json</code> or adding{" "}
            <code>backend/data/help_centres.json</code>.
          </p>
        </div>
      )}

      {/* Results Section */}
      {data && (
        <section className="find-help-results" aria-labelledby="results-title">
          <div className="find-help-results__header">
            <h2 id="results-title" className="h-sm">
              {data.total > 0
                ? `Found ${data.total} Verified Centre${data.total === 1 ? "" : "s"} near PIN ${data.pin}`
                : `No Centres Found for PIN ${data.pin}`}
            </h2>
            {data.child_age_years != null && (
              <span className="find-help-age-pill">
                Age: {data.child_age_years} years (
                {data.child_age_years < 6
                  ? "DEIC & RBSK Focus"
                  : "Hospital & Rehab Focus"}
                )
              </span>
            )}
          </div>

          {/* Results List */}
          {data.centres.length > 0 ? (
            <div className="find-help-centres-grid">
              {data.centres.map((centre) => (
                <HelpCentreCard key={centre.id} centre={centre} />
              ))}
            </div>
          ) : (
            /* Empty State: Helplines & District Guidance */
            <div className="find-help-empty-state">
              <div className="find-help-empty-callout">
                <h3>No specialized centres found in this immediate area</h3>
                <p>
                  No designated centres matched PIN <strong>{data.pin}</strong>{" "}
                  {data.child_age_years != null && (
                    <>for age {data.child_age_years} years</>
                  )}
                  . Please use the government helplines or contact your District
                  Health Office below for free early intervention services.
                </p>
              </div>

              {/* Helplines Box */}
              <div className="find-help-helplines-box">
                <h3 className="h-sm">National Emergency & Health Helplines</h3>
                <div className="find-help-helplines-grid">
                  {data.helplines.map((hl) => (
                    <div key={hl.number} className="find-help-helpline-card">
                      <span className="find-help-helpline-name">{hl.name}</span>
                      <a
                        href={`tel:${hl.number.replace(/[^\d+]/g, "")}`}
                        className="find-help-helpline-number"
                      >
                        {hl.number}
                      </a>
                      <span className="find-help-helpline-timing">
                        {hl.available}
                      </span>
                      <p className="find-help-helpline-desc">{hl.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* District Health Office Guidance */}
              <div className="find-help-guidance-box">
                <h3 className="h-sm">{data.district_guidance.title}</h3>
                <ol className="find-help-guidance-list">
                  {data.district_guidance.steps.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Always show Helplines & Guidance footer when centres were found */}
      {data && data.centres.length > 0 && (
        <section className="find-help-support-footer">
          <h3 className="h-sm">Support Helplines & District Guidance</h3>
          <p className="feature-page__note">
            If you need transport assistance or have questions before your
            appointment, reach out to your local ASHA worker or call{" "}
            <strong>{VERIFIED_HELPLINES.childline.name} ({VERIFIED_HELPLINES.childline.number})</strong> /{" "}
            <strong>{VERIFIED_HELPLINES.telemanas.name} ({VERIFIED_HELPLINES.telemanas.number})</strong>.
          </p>
        </section>
      )}

      <div className="feature-page__actions">
        <Link className="btn btn--secondary" to={home}>
          {home === "/referrals"
            ? "Back to referrals"
            : home === "/sandbox"
              ? "Back to clinician tools"
              : "Back to screening"}
        </Link>
        {isParentRole(role) ? (
          <Link className="btn btn--ghost" to="/screen">
            Start a check-in
          </Link>
        ) : null}
        {isFrontlineRole(role) ? (
          <Link className="btn btn--ghost" to="/referrals">
            Open caseload
          </Link>
        ) : null}
        {isClinicianRole(role) ? (
          <>
            <Link className="btn btn--ghost" to="/deferred/what-if">
              What-If simulator
            </Link>
            <Link className="btn btn--ghost" to="/sandbox">
              Clinician tools
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}

function HelpCentreCard({ centre }: { centre: HelpCentreItem }) {
  const isDeic = centre.type.toLowerCase() === "deic";
  const isRbsk = centre.type.toLowerCase().includes("rbsk");

  return (
    <article className="centre-card" aria-labelledby={`centre-${centre.id}`}>
      <div className="centre-card__header">
        <div>
          <span
            className={`centre-type-badge ${isDeic ? "centre-type-badge--deic" : isRbsk ? "centre-type-badge--rbsk" : "centre-type-badge--hospital"}`}
          >
            {centre.type}
          </span>
          <h3 id={`centre-${centre.id}`} className="centre-card__title">
            {centre.name}
          </h3>
        </div>

        <div className="centre-card__distance">
          {centre.distance_km === 0 ? (
            <span className="centre-dist-pill centre-dist-pill--local">
              Same PIN ({centre.pin})
            </span>
          ) : (
            <span className="centre-dist-pill">
              {centre.distance_km} km away
            </span>
          )}
        </div>
      </div>

      <div className="centre-card__body">
        <p className="centre-card__address">
          <strong>Address:</strong> {centre.address}, {centre.district},{" "}
          {centre.state} — {centre.pin}
        </p>

        <div className="centre-card__contact">
          <span className="centre-card__phone-label">Phone:</span>
          <a
            href={`tel:${centre.phone.replace(/[^\d+]/g, "")}`}
            className="centre-card__phone-link"
          >
            {centre.phone}
          </a>
        </div>
      </div>

      <footer className="centre-card__footer">
        <div className="centre-card__meta">
          <span className="centre-verified-date">
            Last verified: {centre.last_verified_date}
          </span>
          {centre.source_url && (
            <a
              href={centre.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="centre-source-link"
            >
              Verified Source ↗
            </a>
          )}
        </div>

        {centre.is_sample && (
          <span className="badge badge--sample">Sample data</span>
        )}
      </footer>
    </article>
  );
}

export default FindHelpPage;
