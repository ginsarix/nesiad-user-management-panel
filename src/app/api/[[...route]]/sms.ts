import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@/db";
import {
  applicationNoticeSettingsTable,
  authorizedRepresentativeTable,
  memberTable,
  smsSendTable,
  smsSettingsTable,
} from "@/db/schema";
import {
  type ApplicationNoticeSettings,
  getApplicationNoticeSettings,
} from "@/lib/application-notice-settings";
import { recordAudit } from "@/lib/audit";
import { type AuditSpec, diffFields, formatAudit } from "@/lib/audit-diff";
import { loadCelebrationsOn } from "@/lib/sms/load-celebrations";
import {
  decodeSendResponse,
  type NetgsmRawResponse,
  netgsmClient,
} from "@/lib/sms/netgsm";
import { buildRecipients, type Contact } from "@/lib/sms/recipients";
import { getSmsSettings, type SmsSettings } from "@/lib/sms/settings";
import { compareTr } from "@/lib/turkish";
import { noticeSettingsSchema } from "@/lib/zod-schemas/application-notices";
import {
  celebrationsQuerySchema,
  smsSendSchema,
  smsSettingsSchema,
} from "@/lib/zod-schemas/sms";
import { type AppEnv, actorOf } from "./env";
import { respondWithFirstIssue } from "./validation";

/** Active members and yetkililer; `ids` limits them to those */
async function loadContacts(ids?: {
  memberIds: number[];
  representativeIds: number[];
}): Promise<Contact[]> {
  const [members, representatives] = await Promise.all([
    ids?.memberIds.length === 0
      ? []
      : db
          .select({
            id: memberTable.id,
            name: memberTable.title,
            phone: memberTable.phone,
          })
          .from(memberTable)
          .where(
            and(
              eq(memberTable.status, "active"),
              ids ? inArray(memberTable.id, ids.memberIds) : undefined,
            ),
          ),
    ids?.representativeIds.length === 0
      ? []
      : db
          .select({
            id: authorizedRepresentativeTable.id,
            name: authorizedRepresentativeTable.name,
            phone: authorizedRepresentativeTable.phone,
          })
          .from(authorizedRepresentativeTable)
          .where(
            and(
              eq(authorizedRepresentativeTable.active, true),
              ids
                ? inArray(
                    authorizedRepresentativeTable.id,
                    ids.representativeIds,
                  )
                : undefined,
            ),
          ),
  ]);

  const byName = (a: Contact, b: Contact) => compareTr(a.name, b.name);
  return [
    ...members.map((m) => ({ kind: "member" as const, ...m })).sort(byName),
    ...representatives
      .map((r) => ({ kind: "representative" as const, ...r }))
      .sort(byName),
  ];
}

const KIND_LABELS = { member: "Üye", representative: "Yetkili" } as const;

const settingsAuditSpec: AuditSpec = {
  autoEnabled: {
    label: "Otomatik gönderim",
    format: (value) => (value ? "Açık" : "Kapalı"),
  },
  sendTime: { label: "Gönderim saati", format: formatAudit.text },
  foundingMessage: {
    label: "Kuruluş yıl dönümü mesajı",
    format: formatAudit.text,
  },
  birthdayMessage: { label: "Doğum günü mesajı", format: formatAudit.text },
};

/** The settings the Ayarlar form edits */
function settingsResponse(settings: SmsSettings) {
  const { autoEnabled, sendTime, foundingMessage, birthdayMessage } = settings;
  return { autoEnabled, sendTime, foundingMessage, birthdayMessage };
}

const noticeAuditSpec: AuditSpec = {
  receivedSms: { label: "Başvuru alındı SMS'i", format: formatAudit.text },
  receivedEmailSubject: {
    label: "Başvuru alındı e-postası konusu",
    format: formatAudit.text,
  },
  receivedEmailBody: {
    label: "Başvuru alındı e-postası metni",
    format: formatAudit.text,
  },
  acceptedSms: { label: "Kabul SMS'i", format: formatAudit.text },
  acceptedEmailSubject: {
    label: "Kabul e-postası konusu",
    format: formatAudit.text,
  },
  acceptedEmailBody: {
    label: "Kabul e-postası metni",
    format: formatAudit.text,
  },
  rejectedSms: { label: "Red SMS'i", format: formatAudit.text },
  rejectedEmailSubject: {
    label: "Red e-postası konusu",
    format: formatAudit.text,
  },
  rejectedEmailBody: { label: "Red e-postası metni", format: formatAudit.text },
};

/** The templates the Ayarlar form edits */
function noticeSettingsResponse(settings: ApplicationNoticeSettings) {
  const { id, updatedAt, ...templates } = settings;
  return templates;
}

export const smsRoute = new Hono<AppEnv>()
  /** Who can be picked on the Manuel tab */
  .get("/contacts", async (c) => {
    return c.json({
      contacts: await loadContacts(),
      dryRun: netgsmClient().dryRun,
    });
  })
  /** Who gets an automatic SMS on ?date=yyyy-MM-dd */
  .get(
    "/celebrations",
    zValidator("query", celebrationsQuerySchema, respondWithFirstIssue),
    async (c) => {
      const { date } = c.req.valid("query");
      const [celebrations, sends] = await Promise.all([
        loadCelebrationsOn(date),
        // what the daily job already did for that day
        db
          .select({
            kind: smsSendTable.kind,
            contactId: smsSendTable.contactId,
            status: smsSendTable.status,
            message: smsSendTable.message,
            jobId: smsSendTable.jobId,
            error: smsSendTable.error,
            createdAt: smsSendTable.createdAt,
            sentAt: smsSendTable.sentAt,
          })
          .from(smsSendTable)
          .where(eq(smsSendTable.celebrationDate, date)),
      ]);
      return c.json({ date, celebrations, sends });
    },
  )
  /** The Ayarlar tab: send time, on/off, message templates */
  .get("/settings", async (c) => {
    return c.json(settingsResponse(await getSmsSettings()));
  })
  .put(
    "/settings",
    zValidator("json", smsSettingsSchema, respondWithFirstIssue),
    async (c) => {
      const values = c.req.valid("json");
      const before = await getSmsSettings();

      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(smsSettingsTable)
          .set(values)
          .where(eq(smsSettingsTable.id, 1))
          .returning();
        const changes = diffFields(settingsAuditSpec, before, values);
        if (changes.length > 0) {
          await recordAudit(tx, {
            actor: actorOf(c),
            action: "settings_update",
            entityType: "sms",
            entityLabel: "Otomatik SMS ayarları",
            changes,
          });
        }
        return row;
      });

      return c.json(settingsResponse(updated));
    },
  )
  /** The Ayarlar tab: templates for the application accepted/rejected notices */
  .get("/notice-settings", async (c) => {
    return c.json(noticeSettingsResponse(await getApplicationNoticeSettings()));
  })
  .put(
    "/notice-settings",
    zValidator("json", noticeSettingsSchema, respondWithFirstIssue),
    async (c) => {
      const values = c.req.valid("json");
      const before = await getApplicationNoticeSettings();

      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(applicationNoticeSettingsTable)
          .set(values)
          .where(eq(applicationNoticeSettingsTable.id, 1))
          .returning();
        const changes = diffFields(noticeAuditSpec, before, values);
        if (changes.length > 0) {
          await recordAudit(tx, {
            actor: actorOf(c),
            action: "notice_settings_update",
            entityType: "sms",
            entityLabel: "Başvuru bildirim şablonları",
            changes,
          });
        }
        return row;
      });

      return c.json(noticeSettingsResponse(updated));
    },
  )
  .post(
    "/send",
    zValidator("json", smsSendSchema, respondWithFirstIssue),
    async (c) => {
      const { message, memberIds, representativeIds } = c.req.valid("json");
      const contacts = await loadContacts({ memberIds, representativeIds });
      const { recipients, skipped } = buildRecipients(contacts);

      if (recipients.length === 0) {
        return c.json(
          { error: "Seçilenler arasında geçerli cep telefonu olan yok" },
          400,
        );
      }

      const client = netgsmClient();
      let raw: NetgsmRawResponse;
      try {
        raw = await client.send(
          recipients.map((r) => ({ no: r.phone, msg: message })),
        );
      } catch (error) {
        console.error("NetGSM send failed", error);
        // a timeout may come after NetGSM queued the job
        return c.json(
          {
            error:
              "NetGSM'den yanıt alınamadı. SMS gitmiş olabilir; tekrar göndermeden önce NetGSM panelinden kontrol edin.",
          },
          502,
        );
      }

      const result = decodeSendResponse(raw);
      if (!result.ok) {
        console.error("NetGSM refused the send", raw);
        return c.json(
          { error: `${result.message} (NetGSM ${result.code})` },
          502,
        );
      }

      // nothing else changes in the database, so no transaction is needed
      await recordAudit(db, {
        actor: actorOf(c),
        action: "send",
        entityType: "sms",
        entityId: result.jobId,
        entityLabel: message.length > 60 ? `${message.slice(0, 60)}…` : message,
        details: [
          { label: "Mesaj", value: message },
          { label: "Alıcı sayısı", value: String(recipients.length) },
          {
            label: "Alıcılar",
            value: recipients
              .map(
                (r) =>
                  `${r.contact.name} (${KIND_LABELS[r.contact.kind]}, ${r.phone})`,
              )
              .join(", "),
          },
          { label: "NetGSM iş numarası", value: result.jobId },
          ...(client.dryRun
            ? [{ label: "Mod", value: "Deneme (SMS gönderilmedi)" }]
            : []),
        ],
      });

      return c.json({
        jobId: result.jobId,
        dryRun: client.dryRun,
        recipientCount: recipients.length,
        skippedCount: skipped.length,
      });
    },
  );
