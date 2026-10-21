import { describe, expect, it } from "vitest";
import { zToPercentile } from "../lib/model";

describe("zToPercentile", () => {
  it("maps the standard-normal landmarks", () => {
    expect(zToPercentile(0)).toBeCloseTo(50, 0);
    expect(zToPercentile(-1)).toBeCloseTo(15.9, 0);
    expect(zToPercentile(-2)).toBeCloseTo(2.3, 0);
    expect(zToPercentile(-3)).toBeCloseTo(0.1, 0);
    expect(zToPercentile(1)).toBeCloseTo(84.1, 0);
  });

  it("is monotonic and bounded", () => {
    expect(zToPercentile(-4)).toBeLessThan(zToPercentile(-2));
    expect(zToPercentile(-4)).toBeGreaterThanOrEqual(0);
    expect(zToPercentile(4)).toBeLessThanOrEqual(100);
  });
});
