import { describe, expect, it } from "vitest";
import {
  organizationFromSlug,
  organizationHref,
  organizationPeopleText,
} from "./organizations";

describe("organizationFromSlug", () => {
  it("finds an organization by its URL slug", () => {
    expect(organizationFromSlug("committees")).toBe("committee");
  });

  it("returns null for an unknown slug", () => {
    expect(organizationFromSlug("nope")).toBeNull();
  });
});

describe("organizationHref", () => {
  it("builds the page path under /organization", () => {
    expect(organizationHref("committee")).toBe("/organization/committees");
    expect(organizationHref("supervisory_board", "3")).toBe(
      "/organization/supervisory-boards/3",
    );
  });
});

describe("organizationPeopleText", () => {
  it("shows a dash for a group without people", () => {
    expect(organizationPeopleText([])).toBe("—");
  });

  it("lists each person with their görev", () => {
    expect(
      organizationPeopleText([
        { representativeName: "Ahmet Yılmaz", roleName: "Başkan" },
        { representativeName: "Ayşe Demir", roleName: "Üye" },
      ]),
    ).toBe("Ahmet Yılmaz: Başkan, Ayşe Demir: Üye");
  });
});
