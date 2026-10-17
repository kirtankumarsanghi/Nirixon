import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { shareApi, ApiError } from "../api/client";
import type { JointInvitePublicDetail, JointQuestionItem } from "../api/types";

export function JointRespondentPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [detail, setDetail] = useState<JointInvitePublicDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);

  useEffect(() => {
    if (!token) {
      setError({ status: 400, message: "No invite token was provided in the URL." });
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    shareApi
      .getInviteQuestions(token)
      .then((data) => {
        if (active) {
          setDetail(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          if (err instanceof ApiError) {
            setError({ status: err.status, message: err.detail });
          } else if (err instanceof Error) {
            setError({ status: 500, message: err.message });
          } else {
            setError({ status: 500, message: "Failed to load questionnaire." });
          }
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  const handleSelectOption = (itemId: string, val: number) => {
    setAnswers((prev) => ({ ...prev, [itemId]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !detail) return;

    const unanswered = detail.items.filter((it) => answers[it.item_id] === undefined);
    if (unanswered.length > 0) {
      alert(`Please answer all questions before submitting. (${unanswered.length} remaining)`);
      return;
    }

    setSubmitting(true);
    try {
      await shareApi.submitResponse(token, {
        role_label: detail.role_label,
        answers,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError({ status: err.status, message: err.detail });
      } else if (err instanceof Error) {
        setError({ status: 500, message: err.message });
      } else {
        setError({ status: 500, message: "Failed to submit observations." });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="joint-page joint-page--center">
        <div className="joint-status">
          <p className="eyebrow">Secure invite</p>
          <h2 className="display">Checking link</h2>
          <p className="lede">
            Accessing independent questionnaire. Personal child data is never transmitted.
          </p>
        </div>
      </main>
    );
  }

  if (error) {
    let title = "Unable to Access Questionnaire";
    let explanation = error.message;

    if (error.status === 410) {
      title = "This Invite Link Has Expired";
      explanation =
        "For the child's privacy and clinical data integrity, invite links expire automatically. Please ask the primary caregiver to send you a fresh invite link.";
    } else if (error.status === 409) {
      title = "Invite Link Already Used";
      explanation =
        "This one-time invite link has already been submitted. Each link is single-use to ensure observations remain confidential and cannot be overwritten.";
    } else if (error.status === 404) {
      title = "Invite Link Not Found";
      explanation = "The link may be malformed or invalid. Please check the URL you received.";
    }

    return (
      <main className="joint-page joint-page--center">
        <div className="joint-status joint-status--error">
          <p className="eyebrow eyebrow--clay">Invite issue</p>
          <h1 className="display display--clay">{title}</h1>
          <p className="lede">{explanation}</p>
          <Link to="/" className="btn btn--primary">
            Go to Nirixon Home
          </Link>
        </div>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="joint-page joint-page--center">
        <div className="joint-status joint-status--success">
          <p className="eyebrow">Observations recorded</p>
          <h1 className="display">Thank you</h1>
          <p className="lede">
            Your independent observations have been securely recorded under your role:{" "}
            <strong>{detail?.role_label}</strong>.
          </p>
          <div className="joint-next">
            <p className="h-sm">What happens next?</p>
            <ul>
              <li>The primary caregiver and clinician can view cross-caregiver agreement scores.</li>
              <li>Any developmental differences you noticed will be highlighted for discussion.</li>
              <li>This one-time link is now closed and cannot be accessed again.</li>
            </ul>
          </div>
          <p className="joint-muted">You may now safely close this browser window.</p>
        </div>
      </main>
    );
  }

  const answeredCount = detail ? detail.items.filter((it) => answers[it.item_id] !== undefined).length : 0;
  const totalCount = detail ? detail.items.length : 0;
  const progressPct = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;

  return (
    <main className="joint-page">
      <div className="joint-page__inner">
        <header className="joint-header">
          <div className="joint-header__meta">
            <span className="badge badge--typical">Role: {detail?.role_label}</span>
            {detail?.expires_at ? (
              <span className="joint-muted">
                Link valid until: {new Date(detail.expires_at).toLocaleDateString()}
              </span>
            ) : null}
          </div>

          <p className="eyebrow">Family sharing</p>
          <h1 className="display">Independent observation</h1>
          <p className="lede">
            The primary caregiver has invited you to share what you have observed in the child&apos;s daily routines.
            Answer based on your own experience with the child.
          </p>

          <div className="joint-privacy">
            <strong>Privacy by design:</strong> This one-time link exposes only the questions to answer.
            It does not contain the child&apos;s name, medical history, or the other caregiver&apos;s answers. Your observations are stored
            anonymously under your role label (<em>{detail?.role_label}</em>) without your name.
          </div>
        </header>

        <div className="progress joint-progress">
          <div className="progress__label">
            <span>Questions completed</span>
            <span>
              {answeredCount} of {totalCount} ({progressPct}%)
            </span>
          </div>
          <div className="progress__track" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress__fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="joint-questions">
            {detail?.items.map((item: JointQuestionItem, index: number) => {
              const selectedValue = answers[item.item_id];
              const isFlag = item.item_id === "regression_flag";
              const isAnswered = selectedValue !== undefined;

              return (
                <div
                  key={item.item_id}
                  className={`joint-q${isFlag ? " joint-q--flag" : ""}${isAnswered ? " joint-q--answered" : ""}`}
                >
                  <div className="joint-q__top">
                    <span className="eyebrow">
                      {isFlag ? "Safety question" : item.domain ? `Domain: ${item.domain}` : `Question ${index + 1}`}
                    </span>
                    {isAnswered ? <span className="joint-q__done">Answered</span> : null}
                  </div>

                  <p className="joint-q__text">{item.question_text}</p>

                  <div
                    className="joint-q__options"
                    style={{
                      gridTemplateColumns:
                        item.options.length <= 2
                          ? "repeat(2, 1fr)"
                          : "repeat(auto-fit, minmax(130px, 1fr))",
                    }}
                  >
                    {item.options.map((opt) => {
                      const isChosen = selectedValue === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleSelectOption(item.item_id, opt.value)}
                          className={`btn btn--option${isChosen ? " btn--option-selected" : ""}`}
                          aria-pressed={isChosen}
                        >
                          <div>{opt.label}</div>
                          {opt.description ? (
                            <div className="joint-q__opt-desc">{opt.description}</div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="joint-submit-bar">
            <div>
              <div className="joint-submit-bar__title">
                {answeredCount === totalCount
                  ? "Ready to submit"
                  : `${totalCount - answeredCount} question(s) remaining`}
              </div>
              <div className="joint-muted">
                Submitting marks this single-use link as completed.
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || answeredCount < totalCount}
              className="btn btn--primary btn--lg"
            >
              {submitting ? "Recording observations…" : "Submit observations"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
