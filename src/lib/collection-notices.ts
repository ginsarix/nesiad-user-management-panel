import { and, eq, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { memberTable, userTable } from "@/db/schema";
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
  memberId: number;
  memberName: string;
  amount: string;
  date: string;
  categoryName: string;
  cashAccountName: string;
  projectName: string | null;
  projectNumber: string | null;
};

export type OutcomeCounts = Record<NoticeOutcome, number>;

export type CollectionNoticeResult = {
  /** the member's email and SMS */
  member: NoticeOutcomes;
  /** how many panel-user emails and SMS ended which way */
  staff: { email: OutcomeCounts; sms: OutcomeCounts };
};

function countOutcomes(outcomes: NoticeOutcome[]): OutcomeCounts {
  const counts: OutcomeCounts = { sent: 0, failed: 0, skipped: 0, unknown: 0 };
  for (const outcome of outcomes) counts[outcome]++;
  return counts;
}

/**
 * Tells the member and every other active panel user about a new tahsilat,
 * by email and SMS, from the Ayarlar templates. The member's email goes to
 * E-posta and SMS to Cep Telefonu. The person who recorded it (`actorId`)
 * and disabled accounts get nothing, and panel users who turned a channel
 * off (Panel Kullanıcıları) get nothing on it. Never throws; each message reports its own outcome.
 */
export async function sendCollectionNotices(
  collection: NoticeCollection,
  actorId: string | null,
): Promise<CollectionNoticeResult> {
  const [settings, [member], staff] = await Promise.all([
    getCollectionNoticeSettings(),
    db
      .select({ email: memberTable.email, phone: memberTable.mobilePhone })
      .from(memberTable)
      .where(eq(memberTable.id, collection.memberId)),
    db
      .select({
        email: userTable.email,
        phone: userTable.phone,
        collectionSms: userTable.collectionSms,
        collectionEmail: userTable.collectionEmail,
      })
      .from(userTable)
      .where(
        and(
          or(eq(userTable.banned, false), isNull(userTable.banned)),
          actorId ? ne(userTable.id, actorId) : undefined,
        ),
      ),
  ]);

  const values = {
    uye: collection.memberName,
    tutar: formatAmountText(collection.amount),
    tarih: isoToDisplay(collection.date),
    tur: collection.categoryName,
    kasa: collection.cashAccountName,
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

  // the member's texts are in the columns named before the conversion
  const [memberEmail, memberSms, staffEmails, staffSms] = await Promise.all([
    sendNoticeEmail(
      "Collection notice email (member)",
      member?.email ?? null,
      fill(settings.representativeEmailSubject),
      fill(settings.representativeEmailBody),
    ),
    sendNoticeSms(
      "Collection notice SMS (member)",
      member?.phone ?? null,
      fill(settings.representativeSms),
    ),
    Promise.all(
      staff
        .filter((user) => user.collectionEmail)
        .map((user) =>
          sendNoticeEmail(
            "Collection notice email (panel user)",
            user.email,
            fill(settings.staffEmailSubject),
            fill(settings.staffEmailBody),
          ),
        ),
    ),
    Promise.all(
      staff
        .filter((user) => user.collectionSms)
        .map((user) =>
          sendNoticeSms(
            "Collection notice SMS (panel user)",
            user.phone,
            fill(settings.staffSms),
          ),
        ),
    ),
  ]);

  return {
    member: { email: memberEmail, sms: memberSms },
    staff: { email: countOutcomes(staffEmails), sms: countOutcomes(staffSms) },
  };
}
