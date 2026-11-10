import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { db } from "@/db";
import { memberTable } from "@/db/schema";
import { notifyPanelUsersOfApplication } from "@/lib/application-emails";
import { sendApplicationNotices } from "@/lib/application-notices";
import { deleteFiles } from "@/lib/file-storage";
import { createRateLimiter } from "@/lib/rate-limit";
import {
  DOCUMENT_MIME_TYPES,
  LOGO_MIME_TYPES,
  storeLogoOriginal,
  storeUpload,
} from "@/lib/uploads";
import { applicationApiSchema } from "@/lib/zod-schemas/application";
import { MAX_REQUEST_SIZE } from "@/lib/zod-schemas/member";
import { pgErrorCode } from "./db-errors";
import { respondWithFirstField } from "./validation";

/** 5 saved applications per IP per hour; resets when the server restarts */
export const applicationLimiter = createRateLimiter({
  limit: 5,
  windowMs: 60 * 60 * 1000,
});

const LOGO_ERROR = "Logo PNG, JPG, PDF veya SVG olmalıdır";
const LIMITED_RESPONSE = {
  error: "Çok fazla başvuru gönderildi. Lütfen daha sonra tekrar deneyin.",
};
const DOCUMENT_ERROR = "Sadece PDF, PNG veya JPG dosyaları kabul edilir";

/**
 * The public membership application: no session, no audit entry. It can only
 * create a candidate (Aday). Mounted before the session check in app.ts.
 */
export const applicationsRoute = new Hono().post(
  "/",
  bodyLimit({
    maxSize: MAX_REQUEST_SIZE,
    onError: (c) => c.json({ error: "Dosyalar 5 MB'dan küçük olmalıdır" }, 413),
  }),
  async (c, next) => {
    // cheap early refusal; the real check is `reserve` below. The IP is set by
    // the Plesk nginx front end and is absent locally and in tests
    if (applicationLimiter.isLimited(c.req.header("x-real-ip"))) {
      return c.json(LIMITED_RESPONSE, 429);
    }
    await next();
  },
  zValidator("form", applicationApiSchema, respondWithFirstField),
  async (c) => {
    const {
      leaveBlank,
      logo,
      logoOriginal,
      identityDocument,
      activityDocument,
      ...fields
    } = c.req.valid("form");
    const { consentRules: _rules, consentData: _data, ...values } = fields;

    // a bot filled the hidden field: look successful, save nothing
    if (leaveBlank) return c.json({ message: "Başvurunuz alındı" }, 201);

    // checks and counts in one step, so a parallel burst can't pass together;
    // given back below when nothing is saved
    const ip = c.req.header("x-real-ip");
    if (!applicationLimiter.reserve(ip)) {
      return c.json(LIMITED_RESPONSE, 429);
    }

    const stored: string[] = [];
    try {
      const uploads = [
        {
          field: "logo",
          store: () => storeUpload(logo, LOGO_MIME_TYPES, "logo"),
        },
        // a PDF or SVG logo: `logo` is the PNG the applicant's browser drew
        // from it
        ...(logoOriginal
          ? [
              {
                field: "logoOriginal",
                store: () => storeLogoOriginal(logoOriginal),
              },
            ]
          : []),
        {
          field: "identityDocument",
          store: () =>
            storeUpload(identityDocument, DOCUMENT_MIME_TYPES, "document"),
        },
        {
          field: "activityDocument",
          store: () =>
            storeUpload(activityDocument, DOCUMENT_MIME_TYPES, "document"),
        },
      ];
      const names: Record<string, string> = {};
      for (const { field, store } of uploads) {
        const name = await store();
        if (!name) {
          applicationLimiter.release(ip);
          await deleteFiles(stored);
          return c.json(
            {
              error: field.startsWith("logo") ? LOGO_ERROR : DOCUMENT_ERROR,
              // the form has one logo field for both
              field: field === "logoOriginal" ? "logo" : field,
            },
            415,
          );
        }
        stored.push(name);
        names[field] = name;
      }

      const [member] = await db
        .insert(memberTable)
        .values({
          ...values,
          logo: names.logo,
          logoOriginal: names.logoOriginal ?? null,
          identityDocument: names.identityDocument,
          activityDocument: names.activityDocument,
          status: "candidate",
          consentedAt: new Date(),
        })
        .returning({ id: memberTable.id });

      void notifyPanelUsersOfApplication(member.id).catch(console.error);
      // "Başvurunuz alındı" to the applicant. Not awaited, so the applicant
      // never waits on SMTP or NetGSM; it never throws and, like the
      // submission itself, writes no audit entry. Sending to unverified contact
      // details is an accepted risk
      void sendApplicationNotices("received", {
        title: values.title,
        applicantFirstName: values.applicantFirstName,
        applicantLastName: values.applicantLastName,
        email: values.email,
        mobilePhone: values.mobilePhone,
      });

      return c.json({ message: "Başvurunuz alındı" }, 201);
    } catch (error) {
      applicationLimiter.release(ip);
      // never leave an upload behind: a failure in the second or third
      // store, or in the insert
      await deleteFiles(stored);
      // the error text can embed the submitted values (TC number, phones), so
      // only the Postgres code is logged
      console.error(
        "Saving a membership application failed, code:",
        pgErrorCode(error) ?? "none",
      );
      return c.json(
        { error: "Başvuru kaydedilemedi. Lütfen tekrar deneyin." },
        500,
      );
    }
  },
);
