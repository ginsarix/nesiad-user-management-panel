import { and, eq, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { authorizedRepresentativeTable, userTable } from "@/db/schema";
import {
  type NoticeOutcome,
  type NoticeOutcomes,
  sendNoticeEmail,
  sendNoticeSms,
} from "./application-notices";
import { getCollectionNoticeSettings } from "./collection-notice-settings";
import { isoToDisplay } from "./dates";
import { formatAmountText } from "./money";
import { projectLabel } from "./projects";
import { fillTemplate } from "./sms/templates";

/** What a notice needs to know about the new tahsilat */
export type NoticeCollection = {
  representativeId: number;
  representativeName: string;
  amount: string;
  date: string;
  categoryName: string;
  methodName: string;
  projectName: string | null;
  projectNumber: string | null;
};

export type OutcomeCounts = Record<NoticeOutcome, number>;

export type CollectionNoticeResult = {
  /** the yetkili's email and SMS */
  representative: NoticeOutcomes;
  /** how many panel-user emails and SMS ended which way */
  staff: { email: OutcomeCounts; sms: OutcomeCounts };
};

function countOutcomes(outcomes: NoticeOutcome[]): OutcomeCounts {
  const counts: OutcomeCounts = { sent: 0, failed: 0, skipped: 0, unknown: 0 };
  for (const outcome of outcomes) counts[outcome]++;
  return counts;
}

/**
 * Tells the yetkili and every other active panel user about a new tahsilat,
 * by email and SMS, from the Ayarlar templates. The yetkili's SMS goes to
 * Cep Telefonu. The person who recorded it (`actorId`) and disabled accounts get
 * nothing. Never throws; each message reports its own outcome.
 */
export async function sendCollectionNotices(
  collection: NoticeCollection,
  actorId: string | null,
): Promise<CollectionNoticeResult> {
  const [settings, [representative], staff] = await Promise.all([
    getCollectionNoticeSettings(),
    db
      .select({
        email: authorizedRepresentativeTable.email,
        phone: authorizedRepresentativeTable.phone,
      })
      .from(authorizedRepresentativeTable)
      .where(eq(authorizedRepresentativeTable.id, collection.representativeId)),
    db
      .select({ email: userTable.email, phone: userTable.phone })
      .from(userTable)
      .where(
        and(
          or(eq(userTable.banned, false), isNull(userTable.banned)),
          actorId ? ne(userTable.id, actorId) : undefined,
        ),
      ),
  ]);

  const values = {
    yetkili: collection.representativeName,
    tutar: formatAmountText(collection.amount),
    tarih: isoToDisplay(collection.date),
    tur: collection.categoryName,
    tip: collection.methodName,
    proje:
      collection.projectName && collection.projectNumber
        ? projectLabel({
            name: collection.projectName,
            number: collection.projectNumber,
          })
        : // "—" would reach phones as "?"
          "-",
  };
  const fill = (template: string) => fillTemplate(template, values);

  const [representativeEmail, representativeSms, staffEmails, staffSms] =
    await Promise.all([
      sendNoticeEmail(
        "Collection notice email (yetkili)",
        representative?.email ?? null,
        fill(settings.representativeEmailSubject),
        fill(settings.representativeEmailBody),
      ),
      sendNoticeSms(
        "Collection notice SMS (yetkili)",
        representative?.phone ?? null,
        fill(settings.representativeSms),
      ),
      Promise.all(
        staff.map((user) =>
          sendNoticeEmail(
            "Collection notice email (panel user)",
            user.email,
            fill(settings.staffEmailSubject),
            fill(settings.staffEmailBody),
          ),
        ),
      ),
      Promise.all(
        staff.map((user) =>
          sendNoticeSms(
            "Collection notice SMS (panel user)",
            user.phone,
            fill(settings.staffSms),
          ),
        ),
      ),
    ]);

  return {
    representative: { email: representativeEmail, sms: representativeSms },
    staff: { email: countOutcomes(staffEmails), sms: countOutcomes(staffSms) },
  };
}
