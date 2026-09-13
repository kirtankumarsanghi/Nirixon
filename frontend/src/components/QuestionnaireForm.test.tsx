import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionnaireForm } from "../components/QuestionnaireForm";
import type { QuestionPayload } from "../api/types";

const frequencyQuestion: QuestionPayload = {
  item_id: "gm_01",
  question_text: "Does your child walk without holding on?",
  domain: "gross_motor",
  question_number: 3,
  question_cap: 10,
  response_type: "frequency",
};

const yesNoQuestion: QuestionPayload = {
  item_id: "regression_flag",
  question_text: "Has your child lost a skill they used to have?",
  domain: "background",
  question_number: 1,
  question_cap: 10,
  response_type: "yes_no",
};

describe("QuestionnaireForm", () => {
  it("renders prompt and frequency options from the API payload", () => {
    render(
      <QuestionnaireForm question={frequencyQuestion} onAnswer={() => undefined} />,
    );
    expect(
      screen.getByRole("heading", {
        name: /Does your child walk without holding on/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Not yet/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3 or more/i })).toBeInTheDocument();
  });

  it("renders yes/no options for yes_no response_type", async () => {
    const user = userEvent.setup();
    let answered: number | null = null;
    render(
      <QuestionnaireForm
        question={yesNoQuestion}
        onAnswer={(v) => {
          answered = v;
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Yes" }));
    expect(answered).toBe(1);
  });

  it("does not hardcode item ids — different payloads render their own text", () => {
    const other: QuestionPayload = {
      ...frequencyQuestion,
      item_id: "com_04",
      question_text: "Does your child put two words together?",
      domain: "communication",
    };
    const { rerender } = render(
      <QuestionnaireForm question={frequencyQuestion} onAnswer={() => undefined} />,
    );
    rerender(<QuestionnaireForm question={other} onAnswer={() => undefined} />);
    expect(
      screen.getByRole("heading", {
        name: /put two words together/i,
      }),
    ).toBeInTheDocument();
  });
});
