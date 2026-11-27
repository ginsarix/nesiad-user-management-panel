import type { ClientRequestOptions } from "hono/client";
import { displayToIso } from "../dates";
import type { LogoUpload } from "../logo-upload";
import type { MemberStatus } from "../member-status";
import type { NoticeOutcomes } from "../notice-outcome";
import { rpcClient } from "../rpc-client";
import type {
  CompanyFormFields,
  MemberFormValues,
} from "../zod-schemas/member";
import type { MemberDecisionInput } from "../zod-schemas/member-decision";
import { throwResponseError } from "./errors";

export function logoUrl(filename: string) {
  return `/api/files/${encodeURIComponent(filename)}`;
}

/** `options` lets server-side prefetches forward the user's cookies */
export async function getMembers(options?: ClientRequestOptions) {
  const res = await rpcClient.api.members.$get(undefined, options);

  if (!res.ok) throw new Error("An error occured while getting members");

  return await res.json();
}

/** Resolves to null when the member does not exist */
export async function getMember(id: number, options?: ClientRequestOptions) {
  const res = await rpcClient.api.members[":id"].$get(
    { param: { id: String(id) } },
    options,
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error("An error occured while getting the member");

  return await res.json();
}

/** The member that replaced an old yetkili; null when none did */
export async function getMemberByRepresentative(
  representativeId: number,
  options?: ClientRequestOptions,
) {
  const res = await rpcClient.api.members["by-representative"][":id"].$get(
    { param: { id: String(representativeId) } },
    options,
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error("An error occured while getting the member");

  return await res.json();
}

/** A Firma section's fields as the API takes them: text, dates as yyyy-aa-gg */
function companyFieldsText(fields: CompanyFormFields) {
  return {
    title: fields.title,
    address: fields.address,
    phone: fields.phone,
    website: fields.website,
    companyIntro: fields.companyIntro,
    sectorId: fields.sectorId === null ? "" : String(fields.sectorId),
    foundingDate: displayToIso(fields.foundingDate),
    employeeCount: fields.employeeCount,
  };
}

function companyInputOf(company: MemberFormValues["company"]) {
  switch (company.mode) {
    case "none":
      return { mode: "none" };
    case "existing":
      return {
        mode: "existing",
        id: company.id,
        fields: companyFieldsText(company.fields),
      };
    case "new":
      return { mode: "new", fields: companyFieldsText(company.fields) };
  }
}

/**
 * Text fields are always sent so clearing one in the form clears it in the
 * DB, and so are the company choice and the Organizasyon rows (JSON text),
 * which replace what is stored. The TC number and documents are sent only
 * when given, so they keep their value. `logo` is the company section's
 * picked logo made ready to send; it and the Faaliyet Belgesi go to the
 * member's company, so they're left out without one.
 */
function toMemberForm(
  {
    company,
    organizations,
    companyRole,
    memberLoginDate,
    birthDate,
    nationalId,
    identityDocument,
    photo,
    removePhoto,
    status,
    ...text
  }: MemberFormValues,
  logo: LogoUpload | null,
) {
  return {
    ...text,
    // the form holds gg.aa.yyyy, the API takes yyyy-aa-gg
    memberLoginDate: displayToIso(memberLoginDate),
    birthDate: displayToIso(birthDate),
    // a görev at no company means nothing
    companyRole: company.mode === "none" ? "" : companyRole,
    company: JSON.stringify(companyInputOf(company)),
    organizations: JSON.stringify(
      organizations.map(({ organization, rowId, groupId, roleId }) => ({
        organization,
        rowId,
        groupId,
        roleId,
      })),
    ),
    ...(nationalId.trim() && { nationalId: nationalId.trim() }),
    ...(identityDocument && { identityDocument }),
    ...(status && { status }),
    ...(photo ? { photo } : removePhoto && { removePhoto: "true" }),
    ...(company.mode !== "none" && {
      ...(logo ?? (company.removeLogo && { removeLogo: "true" })),
      ...(company.activityDocument && {
        activityDocument: company.activityDocument,
      }),
    }),
  };
}

/** The full TC number, shown only when a staff member asks for it */
export async function getMemberNationalId(id: number) {
  const res = await rpcClient.api.members[":id"]["national-id"].$get({
    param: { id: String(id) },
  });

  if (!res.ok) await throwResponseError(res, "TC Kimlik No alınamadı");

  const body = (await res.json()) as { nationalId: string | null };
  return body.nationalId;
}

export async function createMember(
  values: MemberFormValues,
  logo: LogoUpload | null,
) {
  const res = await rpcClient.api.members.$post({
    form: toMemberForm(values, logo),
  });

  if (!res.ok) await throwResponseError(res, "Üye kaydedilemedi");

  return (await res.json()) as { id: number };
}

export async function updateMember(
  id: number,
  values: MemberFormValues,
  logo: LogoUpload | null,
) {
  const res = await rpcClient.api.members[":id"].$patch({
    param: { id: String(id) },
    form: toMemberForm(values, logo),
  });

  if (!res.ok) await throwResponseError(res, "Üye güncellenemedi");
}

export async function setMemberStatus(
  id: number,
  status: "active" | "passive",
) {
  const res = await rpcClient.api.members[":id"].$patch({
    param: { id: String(id) },
    form: { status },
  });

  if (!res.ok) await throwResponseError(res, "Üye durumu değiştirilemedi");
}

/** Decides an application; the notices say what reached the applicant */
export async function decideMember(id: number, decision: MemberDecisionInput) {
  const res = await rpcClient.api.members[":id"].decision.$post({
    param: { id: String(id) },
    json: decision,
  });

  if (!res.ok) await throwResponseError(res, "Karar kaydedilemedi");

  return (await res.json()) as {
    status: MemberStatus;
    notices: NoticeOutcomes | null;
  };
}

/** Replaces the logo; the API deletes the old file */
export async function setMemberLogo(id: number, logo: LogoUpload) {
  const res = await rpcClient.api.members[":id"].$patch({
    param: { id: String(id) },
    form: logo,
  });

  if (!res.ok) await throwResponseError(res, "Logo kaydedilemedi");
}

export async function removeMemberLogo(id: number) {
  const res = await rpcClient.api.members[":id"].$patch({
    param: { id: String(id) },
    form: { removeLogo: "true" },
  });

  if (!res.ok) await throwResponseError(res, "Logo silinemedi");
}

export async function deleteMember(id: number) {
  const res = await rpcClient.api.members[":id"].$delete({
    param: { id: String(id) },
  });

  if (!res.ok) await throwResponseError(res, "Üye silinemedi");
}

export type MemberListItem = Awaited<ReturnType<typeof getMembers>>[number];
export type MemberDetails = NonNullable<Awaited<ReturnType<typeof getMember>>>;
