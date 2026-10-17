import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveTaskCard } from "./LiveTaskCard";
import type { LiveTaskDefinition } from "../api/types";

const mockTask: LiveTaskDefinition = {
  task_id: "live_24_fm_blocks",
  milestone_item_id: "asq_24_fine_motor_1",
  domain: "fine_motor",
  age_bracket: "24m",
  title: "Block Tower Construction",
  instruction: "Place 6 small blocks in front of the child and encourage them to build a tall tower.",
  what_to_observe: "Child stacks 4 or more blocks vertically without knocking the tower over.",
  materials: "6 small one-inch blocks or similar items",
  response_options: [
    { label: "Not Yet", value: 0, description: "Cannot stack 2 blocks" },
    { label: "Sometimes", value: 1, description: "Stacks 2-3 blocks before falling" },
    { label: "Consistently", value: 2, description: "Successfully stacks 4 or more blocks" },
  ],
};

describe("LiveTaskCard", () => {
  it("renders instruction, what to observe, and three response options", () => {
    render(<LiveTaskCard task={mockTask} onAnswer={() => undefined} />);

    expect(screen.getByText("Block Tower Construction")).toBeInTheDocument();
    expect(screen.getByText(/Place 6 small blocks in front of the child/i)).toBeInTheDocument();
    expect(screen.getByText(/Child stacks 4 or more blocks vertically/i)).toBeInTheDocument();
    expect(screen.getByText(/Item: asq_24_fine_motor_1/i)).toBeInTheDocument();

    expect(screen.getByRole("radio", { name: /Not Yet/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Sometimes/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Consistently/i })).toBeInTheDocument();
  });

  it("submits the selected answer with source='observed' to feed the same item", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();

    render(<LiveTaskCard task={mockTask} onAnswer={onAnswer} />);

    const masteredOption = screen.getByRole("radio", { name: /Consistently/i });
    await user.click(masteredOption);

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(2, "observed");
  });
});
