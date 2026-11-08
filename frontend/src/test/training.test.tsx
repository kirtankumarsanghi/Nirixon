import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "../store";
import { Training } from "../views/Training";
import { TRAINING_QUIZ } from "../lib/trainingContent";

beforeEach(() => {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
  window.scrollTo = () => {};
  try {
    window.localStorage.clear();
  } catch {
    /* restricted storage */
  }
});

describe("Frontline training", () => {
  it("opens sample cases and reveals the correct tier", async () => {
    render(
      <AppProvider>
        <Training />
      </AppProvider>,
    );
    expect(screen.getByRole("button", { name: /Sample cases/i })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Monitor/i }));
    expect(await screen.findByText(/Correct tier/i)).toBeInTheDocument();
  });

  it("runs the practice quiz and shows a score", async () => {
    render(
      <AppProvider>
        <Training />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Practice quiz/i }));

    for (const question of TRAINING_QUIZ) {
      fireEvent.click(await screen.findByText(question.options[question.answer]));
      expect(await screen.findByText(/Why:/i)).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", {
          name: question.id === TRAINING_QUIZ[TRAINING_QUIZ.length - 1].id ? /See score/i : /Next/i,
        }),
      );
      await waitFor(() =>
        expect(screen.queryByText(question.question)).not.toBeInTheDocument(),
      );
    }

    expect(await screen.findByText(/Quiz complete/i)).toBeInTheDocument();
    expect(screen.getAllByText(/100%/).length).toBeGreaterThan(0);
  });
});
