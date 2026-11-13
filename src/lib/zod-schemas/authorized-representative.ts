import { z } from "zod";
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

/** Multipart carries the member links as JSON text */
const memberLinksTextSchema = z
  .string()
  .transform((text, ctx) => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: INVALID_MEMBERS_MESSAGE });
      return z.NEVER;
    }
  })
  .pipe(
    z
      .array(
        z.object({
          memberId: z.number().int().positive(),
          role: optionalTextSchema.nullable(),
        }),
        { error: INVALID_MEMBERS_MESSAGE },
      )
      .refine((links) => !hasDuplicateMembers(links), DUPLICATE_MEMBER_MESSAGE),
  );

/** API schema; the yetkili form is sent as multipart form data */
export const createRepresentativeSchema = z.object({
  name: nameSchema,
  dateOfBirth: optionalIsoDateSchema,
  phone: optionalTextSchema,
  email: emailTextSchema.transform((value) => value || null).optional(),
  notes: optionalTextSchema,

  /** Defaults to aktif when left out */
  active: z.stringbool().optional(),

  /** The members this yetkili represents, each with their görev there */
  members: memberLinksTextSchema.optional(),
});

/** Fields left out are kept; `members`, when sent, replaces all links */
export const updateRepresentativeSchema = createRepresentativeSchema.partial();

/** Client-side form values (dates as gg.aa.yyyy) */
export const representativeFormSchema = z.object({
  name: nameSchema,
  dateOfBirth: optionalDisplayDateSchema,
  phone: z.string(),
  email: emailTextSchema,
  notes: z.string(),
  active: z.boolean(),
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
});

/** What the form holds; a row's memberId may still be null */
export type RepresentativeFormInput = z.input<typeof representativeFormSchema>;
/** What a valid form submits; every row has a member */
export type RepresentativeFormValues = z.output<
  typeof representativeFormSchema
>;
