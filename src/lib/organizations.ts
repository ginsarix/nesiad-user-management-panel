/** Client-safe: no db imports. */

/**
 * The Organizasyon pages, in sidebar and display order. Each keeps its
 * groups in its own tables (staff may want one handled differently later),
 * but for now all four share the same route, pages and components.
 */
export const ORGANIZATIONS = [
  "management_board",
  "committee",
  "disciplinary_board",
  "supervisory_board",
] as const;

export type Organization = (typeof ORGANIZATIONS)[number];

type OrganizationInfo = {
  /** In URLs: /organization/<slug>, /api/organizations/<slug> */
  slug: string;
  /** The page and sidebar title */
  title: string;
  /** One group, as in "Komite Ekle" */
  singular: string;
  /** Lowercase, after a count: "3 komite" */
  noun: string;
  /** The details page's link back to the list */
  backLabel: string;
};

export const ORGANIZATION_INFO = {
  management_board: {
    slug: "management-boards",
    title: "Yönetimler",
    singular: "Yönetim",
    noun: "yönetim",
    backLabel: "Yönetimlere dön",
  },
  committee: {
    slug: "committees",
    title: "Komiteler",
    singular: "Komite",
    noun: "komite",
    backLabel: "Komitelere dön",
  },
  disciplinary_board: {
    slug: "disciplinary-boards",
    title: "Disiplin Kurulu",
    singular: "Disiplin Kurulu",
    noun: "disiplin kurulu",
    backLabel: "Disiplin Kurulu listesine dön",
  },
  supervisory_board: {
    slug: "supervisory-boards",
    title: "Denetim Kurulu",
    singular: "Denetim Kurulu",
    noun: "denetim kurulu",
    backLabel: "Denetim Kurulu listesine dön",
  },
} as const satisfies Record<Organization, OrganizationInfo>;

export const ORGANIZATION_SLUGS = [
  ORGANIZATION_INFO.management_board.slug,
  ORGANIZATION_INFO.committee.slug,
  ORGANIZATION_INFO.disciplinary_board.slug,
  ORGANIZATION_INFO.supervisory_board.slug,
] as const;

export type OrganizationSlug = (typeof ORGANIZATION_SLUGS)[number];

export function organizationFromSlug(slug: string): Organization | null {
  return (
    ORGANIZATIONS.find((organization) => {
      return ORGANIZATION_INFO[organization].slug === slug;
    }) ?? null
  );
}

/** "/organization/committees", or a page under it ("12/edit") */
export function organizationHref(organization: Organization, path?: string) {
  const base = `/organization/${ORGANIZATION_INFO[organization].slug}`;
  return path ? `${base}/${path}` : base;
}

/** "Ahmet Yılmaz: Başkan, Ayşe Demir: Üye" for the audit log */
export function organizationPeopleText(
  people: { representativeName: string; roleName: string }[],
) {
  return (
    people.map((p) => `${p.representativeName}: ${p.roleName}`).join(", ") ||
    "—"
  );
}
