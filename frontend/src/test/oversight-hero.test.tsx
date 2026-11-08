import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OversightHero } from "../components/OversightHero";

describe("OversightHero", () => {
  it("rounds a fractional percentage instead of printing the raw float", () => {
    render(<OversightHero pct={88.66571018651362} ringLabel="Refer recall" ringSub="n = 10,000" tiles={[]} />);
    expect(screen.getByText("89%")).toBeInTheDocument();
    expect(screen.queryByText(/88\.665/)).not.toBeInTheDocument();
  });

  it("renders clickable tiles with their active state", () => {
    render(
      <OversightHero
        pct={50}
        ringLabel="Coverage"
        ringSub="half"
        tiles={[{ label: "Open", value: "7", helper: "created or sent", color: "#e8b13a", onClick: () => {}, active: true }]}
      />,
    );
    const tile = screen.getByRole("button", { name: /open/i });
    expect(tile).toHaveAttribute("aria-pressed", "true");
  });
});
