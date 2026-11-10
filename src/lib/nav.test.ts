import { describe, expect, it } from "vitest";
import { findActiveNavItem, isNavParent, navGroups } from "./nav";

describe("navigation", () => {
  it("puts Ödemeler, Cariler, Tahsilatlar and Projeler under Finans", () => {
    const finans = navGroups
      .flatMap((group) => group.items)
      .find((item) => item.title === "Finans");
    expect(finans && isNavParent(finans)).toBe(true);
    expect(
      finans && isNavParent(finans)
        ? finans.children.map((child) => child.title)
        : [],
    ).toEqual(["Ödemeler", "Cariler", "Tahsilatlar", "Projeler"]);
  });

  it("keeps Otomatik Tahsilatlar at the top level, apart from Tahsilatlar", () => {
    const automatic = navGroups[0].items.find(
      (item) => item.title === "Otomatik Tahsilatlar",
    );
    expect(automatic && !isNavParent(automatic) && automatic.href).toBe(
      "/automatic-collections",
    );
    expect(navGroups[0].items.map((item) => item.title)).not.toContain(
      "Ödemeler",
    );
  });

  it("finds the page under Finans for the header title", () => {
    expect(findActiveNavItem("/payments/3/edit")?.title).toBe("Ödemeler");
    expect(findActiveNavItem("/counterparties")?.title).toBe("Cariler");
    expect(findActiveNavItem("/collections/new")?.title).toBe("Tahsilatlar");
    expect(findActiveNavItem("/projects/4")?.title).toBe("Projeler");
    expect(findActiveNavItem("/members/1")?.title).toBe("Üyeler");
  });
});
