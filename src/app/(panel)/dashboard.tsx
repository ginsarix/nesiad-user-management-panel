"use client";

import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { CircleAlert, CircleCheck, PhoneOff } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { auditActionLabel, formatAuditTime } from "@/lib/audit-labels";
import {
  CANDIDATE_LIST_SIZE,
  CELEBRATION_DAYS,
  FAILED_SMS_DAYS,
} from "@/lib/dashboard";
import { isoToDisplay, parseIsoDate, todayInIstanbul } from "@/lib/dates";
import {
  type Dashboard as DashboardData,
  getDashboard,
} from "@/lib/fetches/dashboard";
import { MEMBER_STATUS_LABELS, MEMBER_STATUSES } from "@/lib/member-status";
import { formatAmount } from "@/lib/money";
import { celebrationLabel } from "@/lib/sms/celebrations";
import { cn } from "@/lib/utils";
import { BarList } from "./_dashboard/bar-list";
import { MoneyChart } from "./_dashboard/money-chart";

const FAILED_SMS_LIST_SIZE = 5;

export function Dashboard() {
  const { data, isError } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getDashboard(),
  });

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        {isError
          ? "Genel bakış yüklenemedi. Sayfayı yenileyin."
          : "Yükleniyor…"}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Section title="Dikkat gerektirenler">
        <div className="grid gap-4 lg:grid-cols-3">
          <Candidates data={data} />
          <Celebrations data={data} />
          <FailedSms data={data} />
        </div>
      </Section>

      <Section title={`Finans · ${data.year}`}>
        <MoneyTiles data={data} />
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel
            title="Aylık tahsilat ve ödeme"
            note="Son 12 ay"
            className="xl:col-span-2"
          >
            <MoneyChart monthly={data.money.monthly} />
          </Panel>
          <MembersWithoutCollection data={data} />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Tahsilat türleri" note={String(data.year)}>
            <BarList
              empty="Bu yıl tahsilat yok"
              items={data.money.collectionsByCategory.map((c) => ({
                key: c.id,
                label: c.name,
                href: `/collections?category=${c.id}&${yearParams(data.year)}`,
                value: Number(c.total),
                display: formatAmount(c.total),
                note: `${c.count} tahsilat`,
              }))}
            />
          </Panel>
          <Panel title="Ödeme türleri" note={String(data.year)}>
            <BarList
              empty="Bu yıl ödeme yok"
              items={data.money.paymentsByCategory.map((c) => ({
                key: c.id,
                label: c.name,
                href: `/payments?category=${c.id}&${yearParams(data.year)}`,
                value: Number(c.total),
                display: formatAmount(c.total),
                note: `${c.count} ödeme`,
              }))}
            />
          </Panel>
          <Panel title="Aktif projeler" note="Toplam tahsilat">
            <BarList
              empty="Aktif proje yok"
              items={data.money.activeProjects.map((p) => ({
                key: p.id,
                label: p.name,
                href: `/projects/${p.id}`,
                value: Number(p.total),
                display: formatAmount(p.total),
                note: p.number,
              }))}
            />
          </Panel>
        </div>
      </Section>

      <Section title="Üyeler">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MEMBER_STATUSES.map((status) => (
            <StatTile
              key={status}
              label={MEMBER_STATUS_LABELS[status]}
              value={String(data.memberCounts[status])}
              href={`/members?status=${status}`}
            />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Sektörlere göre" note="Aktif üyeler">
            <BarList
              empty="Aktif üye yok"
              items={data.membership.bySector.map((s) => ({
                key: s.id ?? "none",
                label: s.name ?? (
                  <span className="text-muted-foreground">Sektörsüz</span>
                ),
                href: s.id ? `/members?sector=${s.id}` : undefined,
                value: s.count,
              }))}
            />
          </Panel>
          <Panel title="Kıdem" note="Aktif üyeler, Üye Giriş Tarihi'nden">
            <BarList
              empty="Aktif üye yok"
              items={data.membership.seniority.buckets.map((b) => ({
                key: b.label,
                label: b.label,
                value: b.count,
              }))}
            />
            {data.membership.seniority.unknown > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Üye Giriş Tarihi girilmemiş: {data.membership.seniority.unknown}{" "}
                üye
              </p>
            )}
          </Panel>
          <Panel
            title="Yıllara göre yeni üyeler"
            note="Hâlâ üye olanlar (Aktif ve Pasif)"
          >
            <JoinsChart joins={data.membership.joinsPerYear} />
          </Panel>
        </div>
      </Section>

      <Section title="Son işlemler">
        <RecentAudit data={data} />
      </Section>
    </div>
  );
}

/** from/to search params covering the year, for the Tahsilatlar and Ödemeler lists */
function yearParams(year: number) {
  return `from=${year}-01-01&to=${year}-12-31`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-l-3 border-sidebar-primary pl-2 text-base font-semibold text-sidebar">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Panel({
  title,
  note,
  action,
  className,
  children,
}: {
  title: ReactNode;
  note?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h3 className="text-sm font-semibold">{title}</h3>
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="shrink-0 text-xs font-medium text-primary hover:underline"
    >
      {children}
    </Link>
  );
}

function StatTile({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: string;
  note?: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold text-sidebar">{value}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </>
  );
  const classes = "flex flex-col gap-1 rounded-lg border bg-card p-4";
  return href ? (
    <Link
      href={href}
      className={cn(classes, "transition-colors hover:border-primary/50")}
    >
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
      <CircleCheck className="size-4 text-emerald-600" />
      {children}
    </p>
  );
}

/** Days between two yyyy-MM-dd days */
function daysBetween(from: string, to: string) {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  return a && b ? differenceInCalendarDays(b, a) : 0;
}

function Candidates({ data }: { data: DashboardData }) {
  const { count, oldest } = data.attention.candidates;
  return (
    <Panel
      title={`Bekleyen başvurular${count ? ` (${count})` : ""}`}
      note={count > CANDIDATE_LIST_SIZE ? "En uzun bekleyenler" : undefined}
      action={
        count > 0 && (
          <PanelLink href="/members?status=candidate">Tümü</PanelLink>
        )
      }
    >
      {count === 0 ? (
        <EmptyNote>Bekleyen başvuru yok</EmptyNote>
      ) : (
        <ul className="flex flex-col divide-y text-sm">
          {oldest.map((c) => {
            const days = daysBetween(
              todayInIstanbul(new Date(c.createdAt)),
              data.today,
            );
            return (
              <li
                key={c.id}
                className="flex items-baseline justify-between gap-3 py-1.5"
              >
                <Link
                  href={`/members/${c.id}`}
                  className="min-w-0 truncate text-primary hover:underline"
                >
                  {c.title}
                </Link>
                <span
                  className={cn(
                    "shrink-0 text-xs tabular-nums",
                    days >= 14
                      ? "font-medium text-amber-700"
                      : "text-muted-foreground",
                  )}
                >
                  {days === 0 ? "Bugün" : `${days} gündür`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

const weekdayFormat = new Intl.DateTimeFormat("tr-TR", { weekday: "long" });

/** "Bugün", "Yarın", "Cuma, 14.11" */
function dayLabel(on: string, today: string) {
  const days = daysBetween(today, on);
  if (days === 0) return "Bugün";
  if (days === 1) return "Yarın";
  const date = parseIsoDate(on);
  return date
    ? `${weekdayFormat.format(date)}, ${isoToDisplay(on).slice(0, 5)}`
    : on;
}

function Celebrations({ data }: { data: DashboardData }) {
  const { items, autoEnabled } = data.attention.celebrations;
  const days = [...new Set(items.map((c) => c.on))];

  return (
    <Panel
      title="Yaklaşan kutlamalar"
      note={`Önümüzdeki ${CELEBRATION_DAYS} gün, otomatik SMS`}
      action={<PanelLink href="/sms">SMS</PanelLink>}
    >
      {!autoEnabled && (
        <p className="flex items-center gap-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800">
          <CircleAlert className="size-4 shrink-0" />
          <span>
            Otomatik gönderim kapalı; bu mesajlar gitmeyecek.{" "}
            <Link href="/settings?tab=notifications" className="underline">
              Ayarlar
            </Link>
          </span>
        </p>
      )}
      {items.length === 0 ? (
        <p className="py-1 text-sm text-muted-foreground">
          Önümüzdeki {CELEBRATION_DAYS} günde kutlama yok
        </p>
      ) : (
        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
          {days.map((day) => (
            <div key={day} className="flex flex-col gap-1">
              <h4 className="text-xs font-medium text-muted-foreground">
                {dayLabel(day, data.today)}
              </h4>
              <ul className="flex flex-col gap-1 text-sm">
                {items
                  .filter((c) => c.on === day)
                  .map((c) => (
                    <li
                      key={`${c.kind}:${c.contact.id}`}
                      className="flex flex-col"
                    >
                      <Link
                        href={`/${c.contact.kind === "member" ? "members" : "representatives"}/${c.contact.id}`}
                        className="truncate text-primary hover:underline"
                      >
                        {c.contact.name}
                      </Link>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {celebrationLabel(c)}
                        {!c.phoneOk && (
                          <span className="flex items-center gap-1 text-destructive">
                            <PhoneOff className="size-3" />
                            geçerli telefon yok, SMS gitmeyecek
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

const SMS_STATUS_TEXT: Record<string, string> = {
  failed: "Gönderilemedi",
  unknown: "Gidip gitmediği belli değil",
  pending: "Gönderim yarıda kaldı",
};

function FailedSms({ data }: { data: DashboardData }) {
  const sends = data.attention.failedSms;
  const shown = sends.slice(0, FAILED_SMS_LIST_SIZE);

  return (
    <Panel
      title={`Gönderilemeyen SMS'ler${sends.length ? ` (${sends.length})` : ""}`}
      note={`Son ${FAILED_SMS_DAYS} gün, otomatik kutlama mesajları`}
      action={sends.length > 0 && <PanelLink href="/sms">SMS</PanelLink>}
    >
      {sends.length === 0 ? (
        <EmptyNote>Gönderilemeyen SMS yok</EmptyNote>
      ) : (
        <ul className="flex flex-col divide-y text-sm">
          {shown.map((s) => (
            <li key={s.id} className="flex flex-col py-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={`/${s.kind === "founding" ? "members" : "representatives"}/${s.contactId}`}
                  className="min-w-0 truncate text-primary hover:underline"
                >
                  {s.contactName}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {isoToDisplay(s.celebrationDate)}
                </span>
              </div>
              <span className="text-xs text-destructive">
                {SMS_STATUS_TEXT[s.status] ?? s.status}
                {s.error ? `: ${s.error}` : ""}
              </span>
            </li>
          ))}
          {sends.length > shown.length && (
            <li className="pt-1.5 text-xs text-muted-foreground">
              ve {sends.length - shown.length} tane daha
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}

function MoneyTiles({ data }: { data: DashboardData }) {
  const { collected, paid, net } = data.money.totals;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatTile
        label="Tahsilat"
        value={formatAmount(collected)}
        note={`${data.year} yılı toplamı`}
        href={`/collections?${yearParams(data.year)}`}
      />
      <StatTile
        label="Ödeme"
        value={formatAmount(paid)}
        note={`${data.year} yılı toplamı`}
        href={`/payments?${yearParams(data.year)}`}
      />
      <StatTile
        label="Fark"
        value={formatAmount(net)}
        note="Tahsilat − Ödeme"
      />
    </div>
  );
}

function MembersWithoutCollection({ data }: { data: DashboardData }) {
  const members = data.money.membersWithoutCollection;
  return (
    <Panel
      title={`Bu yıl tahsilatı olmayan aktif üyeler${members.length ? ` (${members.length})` : ""}`}
      note="Aidat borcu değil: yalnızca bu yıl hiç tahsilat girilmemiş olanlar"
    >
      {members.length === 0 ? (
        <EmptyNote>Her aktif üyenin bu yıl tahsilatı var</EmptyNote>
      ) : (
        <ul className="flex max-h-72 flex-col divide-y overflow-y-auto text-sm">
          {members.map((m) => (
            <li key={m.id} className="py-1.5">
              <Link
                href={`/members/${m.id}`}
                className="block truncate text-primary hover:underline"
              >
                {m.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** New members per year as columns, each with its count on top */
function JoinsChart({
  joins,
}: {
  joins: DashboardData["membership"]["joinsPerYear"];
}) {
  const max = Math.max(...joins.map((j) => j.count), 0);
  return (
    <div className="flex h-48 items-end gap-1.5">
      {joins.map((j) => (
        <div
          key={j.year}
          className="flex h-full min-w-0 flex-1 flex-col items-center gap-1"
        >
          <div className="flex w-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs font-medium tabular-nums">
              {j.count > 0 ? j.count : ""}
            </span>
            <div
              className="w-full max-w-6 rounded-t-sm bg-primary"
              style={{ height: max > 0 ? `${(j.count / max) * 100}%` : 0 }}
              title={`${j.year}: ${j.count} üye`}
            />
          </div>
          <span className="w-full border-t pt-1 text-center text-[11px] text-muted-foreground tabular-nums">
            {String(j.year).slice(2)}
            <span className="sr-only"> ({j.year})</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function RecentAudit({ data }: { data: DashboardData }) {
  return (
    <div className="rounded-lg border bg-card">
      {data.recentAudit.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Kayıt yok</p>
      ) : (
        <ul className="divide-y text-sm">
          {data.recentAudit.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2"
            >
              <span className="w-36 shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatAuditTime(entry.createdAt)}
              </span>
              <span className="font-medium">
                {auditActionLabel(entry.entityType, entry.action)}
              </span>
              {entry.entityLabel && (
                <span className="min-w-0 truncate">{entry.entityLabel}</span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {entry.actorName ??
                  (entry.action === "login_failed" ? "—" : "Sistem")}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t px-4 py-2">
        <PanelLink href="/audit-logs">Tüm denetim kayıtları</PanelLink>
      </div>
    </div>
  );
}
