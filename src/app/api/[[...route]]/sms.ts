import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@/db";
import { authorizedRepresentativeTable, memberTable } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import {
  decodeSendResponse,
  type NetgsmRawResponse,
  netgsmClient,
} from "@/lib/sms/netgsm";
import { buildRecipients, type Contact } from "@/lib/sms/recipients";
import { compareTr } from "@/lib/turkish";
import { smsSendSchema } from "@/lib/zod-schemas/sms";
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
              eq(memberTable.active, true),
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

export const smsRoute = new Hono<AppEnv>()
  /** Who can be picked on the Manuel tab */
  .get("/contacts", async (c) => {
    return c.json({
      contacts: await loadContacts(),
      dryRun: netgsmClient().dryRun,
    });
  })
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
