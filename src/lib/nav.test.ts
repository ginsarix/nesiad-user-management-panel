import { describe, expect, it } from "vitest";
import { findActiveNavItem, isNavParent, navGroups } from "./nav";

describe("navigation", () => {
  it("puts Ödemeler and Cariler under Finans", () => {
    const finans = navGroups
      .flatMap((group) => group.items)
      .find((item) => item.title === "Finans");
    expect(finans && isNavParent(finans)).toBe(true);
    expect(
      finans && isNavParent(finans)
        ? finans.children.map((child) => child.title)
        : [],
    ).toEqual(["Ödemeler", "Cariler"]);
  });

  it("keeps Otomatik Tahsilatlar at the top level", () => {
    const topTitles = navGroups[0].items.map((item) => item.title);
    expect(topTitles).toContain("Otomatik Tahsilatlar");
    expect(topTitles).not.toContain("Ödemeler");
  });

  it("finds the page under Finans for the header title", () => {
    expect(findActiveNavItem("/payments/3/edit")?.title).toBe("Ödemeler");
    expect(findActiveNavItem("/counterparties")?.title).toBe("Cariler");
    expect(findActiveNavItem("/members/1")?.title).toBe("Üyeler");
  });
});
