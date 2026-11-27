import { z } from "zod";
import { ORGANIZATIONS } from "../organizations";
import {
  jsonTextSchema,
  MAX_PHOTO_SIZE,
  organizationRowsTextSchema,
  PHOTO_TOO_LARGE_MESSAGE,
  photoFileSchema,
} from "./member";
import {
  emailTextSchema,
  optionalDisplayDateSchema,
  optionalIsoDateSchema,
  optionalTextSchema,
} from "./shared";

const nameSchema = z.string().trim().min(1, "Ad soyad boş olamaz");

const DUPLICATE_MEMBER_MESSAGE = "Aynı üye birden fazla seçilemez";

function hasDuplicateMembers(links: { memberId: number | null }[]) {
  const ids = links.map((link) => link.memberId).filter((id) => id !== null);
  return new Set(ids).size !== ids.length;
}

const INVALID_MEMBERS_MESSAGE = "Geçersiz üye listesi";

const memberLinksTextSchema = jsonTextSchema(
  z
    .array(
      z.object({
        memberId: z.number().int().positive(),
        role: optionalTextSchema.nullable(),
      }),
      { error: INVALID_MEMBERS_MESSAGE },
    )
    .refine((links) => !hasDuplicateMembers(links), DUPLICATE_MEMBER_MESSAGE),
  INVALID_MEMBERS_MESSAGE,
);

/** API schema; the yetkili form is sent as multipart form data */
export const createRepresentativeSchema = z.object({
  name: nameSchema,
  dateOfBirth: optionalIsoDateSchema,
  phone: optionalTextSchema,
  email: emailTextSchema.transform((value) => value || null).optional(),
  notes: optionalTextSchema,
  poPositiveCardNo: optionalTextSchema,

  /** Defaults to aktif when left out */
  active: z.stringbool().optional(),

  /** The members this yetkili represents, each with their görev there */
  members: memberLinksTextSchema.optional(),

  /** The Organizasyon group rows this yetkili is in */
  organizations: organizationRowsTextSchema.optional(),

  photo: photoFileSchema.optional(),
});

/**
 * Fields left out are kept; `members`, when sent, replaces all links, and
 * `organizations`, when sent, becomes the yetkili's group rows
 */
export const updateRepresentativeSchema = createRepresentativeSchema
  .partial()
  .extend({
    /** Clears the current photo when no new one is uploaded */
    removePhoto: z.stringbool().optional(),
  });

/** Client-side form values (dates as gg.aa.yyyy) */
export const representativeFormSchema = z.object({
  name: nameSchema,
  dateOfBirth: optionalDisplayDateSchema,
  phone: z.string(),
  email: emailTextSchema,
  notes: z.string(),
  poPositiveCardNo: z.string(),
  active: z.boolean(),
  /** Already shrunk to the JPEG that is uploaded, when it was picked */
  photo: z
    .instanceof(File)
    .refine((f) => f.size <= MAX_PHOTO_SIZE, PHOTO_TOO_LARGE_MESSAGE)
    .nullable(),
  removePhoto: z.boolean(),
  members: z
    .array(
      z.object({
        // null while a newly added row has no member picked yet
        memberId: z
          .number()
          .nullable()
          .refine((id) => id !== null, "Üye seçin"),
        role: z.string(),
      }),
    )
    .refine((links) => !hasDuplicateMembers(links), DUPLICATE_MEMBER_MESSAGE),
  organizations: z.array(
    z.object({
      // the saved row this one edits; null for a row added in the form
      rowId: z.number().nullable(),
      // null while a newly added row has nothing picked yet
      organization: z
        .enum(ORGANIZATIONS)
        .nullable()
        .refine((organization) => organization !== null, "Organizasyon seçin"),
      groupId: z
        .number()
        .nullable()
        .refine((id) => id !== null, "Grup seçin"),
      roleId: z
        .number()
        .nullable()
        .refine((id) => id !== null, "Görev seçin"),
    }),
  ),
});

/** What the form holds; a row's memberId may still be null */
export type RepresentativeFormInput = z.input<typeof representativeFormSchema>;
/** What a valid form submits; every row has a member */
export type RepresentativeFormValues = z.output<
  typeof representativeFormSchema
>;
