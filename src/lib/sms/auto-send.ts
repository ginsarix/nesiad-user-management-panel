import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { type SmsSendStatus, smsSendTable } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { type Celebration, celebrationLabel } from "./celebrations";
import { loadCelebrationsOn } from "./load-celebrations";
import {
  decodeSendResponse,
  type NetgsmClient,
  type NetgsmRawResponse,
  netgsmClient,
} from "./netgsm";
import { isDue, sendDay } from "./schedule";
import { getSmsSettings, type SmsSettings } from "./settings";
import { celebrationMessage } from "./templates";

export type AutoSmsResult =
  | { status: "disabled" }
  | { status: "not_due"; date: string; sendTime: string }
  /** Nobody celebrating today has a mobile, or they all got theirs already */
  | { status: "nothing_to_send"; date: string; celebrations: number }
  | { status: "sent"; date: string; count: number; jobId: string }
  | {
      status: "failed" | "unknown";
      date: string;
      count: number;
      error: string;
    };

/** Overridable for tests */
export type AutoSmsDeps = {
  settings?: SmsSettings;
  client?: NetgsmClient;
  loadCelebrations?: (date: string) => Promise<Celebration[]>;
};

/**
 * The daily job, run every few minutes by the Plesk scheduled task through
 * POST /api/cron/sms. Once the send time has passed (Istanbul), each person
 * celebrating today gets their SMS at most once: a run first claims an
 * `sms_send` row per SMS, and only the rows it claimed are sent. A row that
 * stays "pending" (server stopped mid-run) or "unknown" (NetGSM didn't
 * answer) is never sent again; staff can follow up by hand.
 */
export async function runAutoSms(
  now = new Date(),
  deps: AutoSmsDeps = {},
): Promise<AutoSmsResult> {
  const settings = deps.settings ?? (await getSmsSettings());
  if (!settings.autoEnabled) return { status: "disabled" };

  const date = sendDay(now);
  if (!isDue(now, settings.sendTime)) {
    return { status: "not_due", date, sendTime: settings.sendTime };
  }

  // read at send time, so today's edits count
  const celebrations = await (deps.loadCelebrations ?? loadCelebrationsOn)(
    date,
  );
  const rows = celebrations.flatMap((c) =>
    c.phone.ok
      ? [
          {
            kind: c.kind,
            contactId: c.contact.id,
            contactName: c.contact.name,
            celebrationDate: date,
            years: c.years,
            phone: c.phone.phone,
            message: celebrationMessage(c, settings),
          },
        ]
      : [],
  );
  if (rows.length === 0) {
    return {
      status: "nothing_to_send",
      date,
      celebrations: celebrations.length,
    };
  }

  // the unique key lets only one run claim each SMS, even concurrent ones
  const claimed = await db
    .insert(smsSendTable)
    .values(rows)
    .onConflictDoNothing({
      target: [
        smsSendTable.kind,
        smsSendTable.contactId,
        smsSendTable.celebrationDate,
      ],
    })
    .returning();
  if (claimed.length === 0) {
    return {
      status: "nothing_to_send",
      date,
      celebrations: celebrations.length,
    };
  }

  const client = deps.client ?? netgsmClient();
  const ids = claimed.map((r) => r.id);
  const audit = {
    actor: null,
    entityType: "sms" as const,
    entityLabel: truncate(
      `Kutlama SMS'i: ${claimed.map((r) => r.contactName).join(", ")}`,
    ),
    details: [
      { label: "Tarih", value: date },
      { label: "Alıcı sayısı", value: String(claimed.length) },
      {
        label: "Alıcılar",
        value: claimed
          .map((r) => `${r.contactName} (${celebrationLabel(r)}, ${r.phone})`)
          .join(", "),
      },
      ...(client.dryRun
        ? [{ label: "Mod", value: "Deneme (SMS gönderilmedi)" }]
        : []),
    ],
  };

  let raw: NetgsmRawResponse;
  try {
    raw = await client.send(
      claimed.map((r) => ({ no: r.phone, msg: r.message })),
    );
  } catch (error) {
    console.error("Automatic SMS: NetGSM didn't answer", error);
    const message =
      "NetGSM'den yanıt alınamadı; SMS gitmiş olabilir, tekrar gönderilmeyecek";
    await finish(ids, "unknown", { error: message }, async (tx) =>
      recordAudit(tx, {
        ...audit,
        action: "auto_send_unknown",
        details: [...audit.details, { label: "Sonuç", value: message }],
      }),
    );
    return { status: "unknown", date, count: claimed.length, error: message };
  }

  const result = decodeSendResponse(raw);
  if (!result.ok) {
    console.error("Automatic SMS: NetGSM refused the send", raw);
    const message = `${result.message} (NetGSM ${result.code})`;
    await finish(ids, "failed", { error: message }, async (tx) =>
      recordAudit(tx, {
        ...audit,
        action: "auto_send_failed",
        details: [...audit.details, { label: "Hata", value: message }],
      }),
    );
    return { status: "failed", date, count: claimed.length, error: message };
  }

  await finish(
    ids,
    "sent",
    { jobId: result.jobId, sentAt: new Date() },
    async (tx) =>
      recordAudit(tx, {
        ...audit,
        action: "auto_send",
        entityId: result.jobId,
        details: [
          ...audit.details,
          { label: "NetGSM iş numarası", value: result.jobId },
        ],
      }),
  );
  return {
    status: "sent",
    date,
    count: claimed.length,
    jobId: result.jobId,
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Sets the claimed rows' outcome and writes the audit row together */
async function finish(
  ids: number[],
  status: SmsSendStatus,
  fields: Partial<typeof smsSendTable.$inferInsert>,
  audit: (tx: Tx) => Promise<void>,
) {
  await db.transaction(async (tx) => {
    await tx
      .update(smsSendTable)
      .set({ status, ...fields })
      .where(inArray(smsSendTable.id, ids));
    await audit(tx);
  });
}

function truncate(text: string, max = 120) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
