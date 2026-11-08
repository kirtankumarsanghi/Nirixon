import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { setActiveLang, translate } from "../lib/i18n";
import { localizeNode } from "../lib/localize";
import { Page } from "../components/ui";
import { DOMAINS, STATUS_META, TIER_META, domainStatus } from "../lib/model";
import { AppProvider } from "../store";

describe("localization layer", () => {
  beforeEach(() => {
    window.location.hash = "#/";
    window.localStorage.removeItem("nirixon-lang");
    setActiveLang("en");
  });

  it("translates a plain text node into the selected language", () => {
    expect(localizeNode("Check-in", "hi")).toBe(translate("hi", "Check-in"));
    expect(localizeNode("Gross motor", "ta")).toBe(translate("ta", "Gross motor"));
  });

  it("keeps unknown text as-is instead of blanking it", () => {
    expect(localizeNode("A phrase that is not in the bank", "hi")).toBe("A phrase that is not in the bank");
  });

  it("localises model metadata and status labels to the active language", () => {
    setActiveLang("hi");
    expect(DOMAINS.gross.label).toBe(translate("hi", "Gross motor"));
    expect(DOMAINS.gross.blurb).toBe(translate("hi", "Walking, running, climbing, jumping and balance."));
    expect(TIER_META.Refer.hint).toBe(translate("hi", "Talk to a doctor"));
    expect(STATUS_META.refer.label).toBe(translate("hi", "Refer"));
    expect(domainStatus(-2.5).label).toBe(translate("hi", "Worth discussing"));
    setActiveLang("en");
  });

  it("renders page text in the persisted language", () => {
    window.localStorage.setItem("nirixon-lang", "hi");
    render(
      <AppProvider>
        <Page>
          <p>Check-in</p>
        </Page>
      </AppProvider>,
    );
    expect(screen.getByText(translate("hi", "Check-in"))).toBeInTheDocument();
  });
});
