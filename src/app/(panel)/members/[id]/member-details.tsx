"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { CollectionsSection } from "@/components/collections-section";
import { formatDate, InfoFields, StatusTag } from "@/components/info-fields";
import { TableTotalFooter } from "@/components/table-total-footer";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getMember,
  type MemberCompany,
  type MemberDetails as MemberDetailsData,
} from "@/lib/fetches/member";
import { listHref } from "@/lib/list-href";
import { isEstablished, MEMBER_STATUS_LABELS } from "@/lib/member-status";
import { formatAmount, sumAmounts } from "@/lib/money";
import { ORGANIZATION_INFO, organizationHref } from "@/lib/organizations";
import { pledgeRowTotal } from "@/lib/pledges";
import { projectLabel } from "@/lib/projects";
import { SeniorityBadge } from "../_components/member-info";
import { ApplicationSection, DocumentLink } from "./application-sections";
import { DecisionButtons } from "./decision-buttons";
import { DeleteMemberButton } from "./delete-member-button";
import { MemberLogo } from "./member-logo";
import { MemberPhoto } from "./member-photo";
import { ToggleActiveButton } from "./toggle-active-button";

export function MemberDetails({ id }: { id: number }) {
  const { data: member, isError } = useQuery({
    queryKey: ["members", id],
    queryFn: () => getMember(id),
  });

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={listHref("/members")}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        Üyelere dön
      </Link>

      {isError && (
        <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Üye bilgileri yüklenirken bir hata oluştu.
        </p>
      )}

      {member && (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
            <MemberPhoto member={member} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-medium">{member.name}</h2>
                <SeniorityBadge memberLoginDate={member.memberLoginDate} />
                <StatusTag status={member.status} />
              </div>
              {member.company && (
                <p className="text-sm text-muted-foreground">
                  {[member.company.title, member.companyRole]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <DecisionButtons member={member} />
              {isEstablished(member.status) && (
                <ToggleActiveButton member={member} />
              )}
              <Link
                href={`/members/${member.id}/edit`}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil />
                Düzenle
              </Link>
              <DeleteMemberButton member={member} />
            </div>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <section className="rounded-lg border bg-card">
              <h3 className="border-b px-4 py-2.5 text-sm font-medium">Kişi</h3>
              <div className="p-4">
                <InfoFields
                  fields={[
                    {
                      label: "Durum",
                      value: MEMBER_STATUS_LABELS[member.status],
                    },
                    { label: "Cep Telefonu", value: member.mobilePhone },
                    { label: "E-posta", value: member.email },
                    {
                      label: "Doğum Tarihi",
                      value: formatDate(member.birthDate),
                    },
                    {
                      label: "Üye Giriş Tarihi",
                      value: formatDate(member.memberLoginDate),
                    },
                    {
                      label: "PO Positive Card No",
                      value: member.poPositiveCardNo,
                    },
                    { label: "Notlar", value: member.notes },
                    // the note belongs to the rejection, so only a Reddedildi shows it
                    ...(member.status === "rejected"
                      ? [{ label: "Ret Notu", value: member.rejectionNote }]
                      : []),
                  ]}
                />
              </div>
            </section>

            <CompanySection member={member} />

            <ApplicationSection member={member} />

            <OrganizationsSection member={member} />
          </div>

          <CollectionsSection
            of="member"
            id={member.id}
            canAdd={member.status === "active"}
          />
          <PledgesSection member={member} />
          <AccrualsSection member={member} />
        </>
      )}
    </div>
  );
}

function CompanySection({ member }: { member: MemberDetailsData }) {
  const { company } = member;

  return (
    <section className="rounded-lg border bg-card">
      <h3 className="border-b px-4 py-2.5 text-sm font-medium">Firma</h3>
      {company ? (
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-3">
            <MemberLogo member={member} company={company} />
            <span className="font-medium">{company.title}</span>
          </div>
          <InfoFields fields={companyFields(member, company)} />
          <div className="border-t pt-3">
            <h4 className="mb-2 text-sm font-medium">
              Bu firmadaki diğer üyeler ({company.otherMembers.length})
            </h4>
            {company.otherMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Bu firmada başka üye yok.
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {company.otherMembers.map((other) => (
                  <li
                    key={other.id}
                    className="flex items-center gap-2 py-1.5 first:pt-0 last:pb-0"
                  >
                    <Link
                      href={`/members/${other.id}`}
                      className="text-primary hover:underline"
                    >
                      {other.name}
                    </Link>
                    <StatusTag status={other.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <p className="p-4 text-sm text-muted-foreground">
          Bu üyenin firması yok.
        </p>
      )}
    </section>
  );
}

function companyFields(member: MemberDetailsData, company: MemberCompany) {
  return [
    { label: "Görev", value: member.companyRole },
    { label: "Sektör", value: company.sectorName },
    { label: "Telefon", value: company.phone },
    { label: "Adres", value: company.address },
    { label: "Kuruluş Tarihi", value: formatDate(company.foundingDate) },
    {
      label: "İstihdam Sayısı",
      value:
        company.employeeCount === null ? null : String(company.employeeCount),
    },
    {
      label: "Web Sitesi",
      value: company.website && (
        <a
          href={company.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          {company.website}
        </a>
      ),
    },
    { label: "Tanıtım Yazısı", value: company.companyIntro },
    {
      label: "Faaliyet Belgesi / Sicil Gazetesi",
      value: company.activityDocument && (
        <DocumentLink filename={company.activityDocument} />
      ),
    },
  ];
}

function OrganizationsSection({ member }: { member: MemberDetailsData }) {
  return (
    <section className="rounded-lg border bg-card">
      <h3 className="border-b px-4 py-2.5 text-sm font-medium">
        Organizasyonlar ({member.organizations.length})
      </h3>
      <div className="p-4">
        {member.organizations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Bu üye henüz bir organizasyonda yer almıyor.
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {member.organizations.map((row) => (
              <li
                // row ids repeat across the pages' tables
                key={`${row.organization}-${row.rowId}`}
                className="flex flex-wrap items-center gap-2 py-1.5 first:pt-0 last:pb-0"
              >
                <span className="text-muted-foreground">
                  {ORGANIZATION_INFO[row.organization].title}
                </span>
                <Link
                  href={organizationHref(row.organization, String(row.groupId))}
                  className="text-primary hover:underline"
                >
                  {row.groupName}
                </Link>
                <span className="ml-auto text-muted-foreground">
                  {row.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function PledgesSection({ member }: { member: MemberDetailsData }) {
  const rows = member.pledges.map((pledge) => ({
    ...pledge,
    total: pledgeRowTotal(pledge.quantity, pledge.amount),
  }));

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5">
        <h3 className="text-sm font-medium">Taahhütler</h3>
        {rows.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {rows.length} taahhüt · Toplam{" "}
            {formatAmount(sumAmounts(rows.map((row) => row.total)))}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Henüz taahhüt yok.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proje</TableHead>
              <TableHead className="text-right">Adet</TableHead>
              <TableHead className="text-right">Tutar</TableHead>
              <TableHead className="text-right">Toplam</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link
                    href={`/projects/${row.projectId}`}
                    className="text-primary hover:underline"
                  >
                    {projectLabel({
                      name: row.projectName,
                      number: row.projectNumber,
                    })}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.quantity}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatAmount(row.amount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatAmount(row.total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableTotalFooter
            columnIds={["project", "quantity", "amount", "total"]}
            amountColumnId="total"
            amounts={rows.map((row) => row.total)}
            alignRight
          />
        </Table>
      )}
    </section>
  );
}

function AccrualsSection({ member }: { member: MemberDetailsData }) {
  const rows = member.accruals;

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5">
        <h3 className="text-sm font-medium">Tahakkuk</h3>
        {rows.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {rows.length} satır · Toplam{" "}
            {formatAmount(sumAmounts(rows.map((row) => row.amount)))}
          </span>
        )}
        <Link
          href="/accruals"
          className="ml-auto text-sm text-primary hover:underline"
        >
          Tahakkuk listesine git
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Tahakkuk listesinde bu üyenin satırı yok.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tahakkuk Türü</TableHead>
              <TableHead className="text-right">Tutar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.categoryName}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatAmount(row.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableTotalFooter
            columnIds={["category", "amount"]}
            amountColumnId="amount"
            amounts={rows.map((row) => row.amount)}
            alignRight
          />
        </Table>
      )}
    </section>
  );
}
