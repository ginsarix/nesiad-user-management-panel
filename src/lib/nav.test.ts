import { describe, expect, it } from "vitest";
import {
  findActiveNavItem,
  isNavParent,
  isNavParentActive,
  navGroups,
} from "./nav";

describe("navigation", () => {
  it("finds Organizasyon pages under their parent, right after Yetkililer", () => {
    const items = navGroups[0].items;
    const index = items.findIndex((item) => item.title === "Organizasyon");
    expect(items[index - 1]?.title).toBe("Yetkililer");

    const organization = items[index];
    if (!organization || !isNavParent(organization)) {
      throw new Error("Organizasyon is not a parent item");
    }
    expect(organization.children.map((child) => child.title)).toEqual([
      "Yönetimler",
      "Komiteler",
      "Disiplin Kurulu",
      "Denetim Kurulu",
    ]);

    const path = "/organization/committees/12/edit";
    expect(findActiveNavItem(path)?.title).toBe("Komiteler");
    expect(isNavParentActive(organization, path)).toBe(true);
  });

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

  it("shows Genel Bakış first, active only on the dashboard itself", () => {
    expect(navGroups[0].items[0].title).toBe("Genel Bakış");
    expect(findActiveNavItem("/")?.title).toBe("Genel Bakış");
    expect(findActiveNavItem("/settings")?.title).toBe("Ayarlar");
  });
});
