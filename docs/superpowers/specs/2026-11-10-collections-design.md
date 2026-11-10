# Tahsilatlar and Projeler: design

Status: draft for review, 2026-11-10.

Decisions marked **(staff)** came from the user, who checked them with NESİAD staff and management. Decisions marked **(my call)** are the designer's defaults and can be overruled. Everything else is left to the builder.

## Why

The association collects money from its members (Tahsilatlar): dues, entry fees and the like. Some collections belong to a project. This adds a record of each collection, a managed list of projects (Projeler), and links between them. It sits next to Ödemeler and Cariler under the Finans sidebar item and reuses their patterns: `docs/superpowers/specs/2026-11-10-payments-design.md` is the reference for anything this document doesn't restate.

"Otomatik Tahsilatlar", the greyed-out "yakında" sidebar item, is a **separate** idea that staff are still thinking through **(staff)**. This work doesn't rename or move it. Its placeholder link target is `/collections`, the URL Tahsilatlar takes. Nobody sees it (coming-soon items have no link), but it changes to `/automatic-collections` so the two don't share a URL **(my call)**.

## What gets built

1. A `project` table and the Projeler pages: list, detail, new, edit, delete.
2. A `collection` table and the Tahsilatlar pages: list with filters, a total and Excel export; new; edit; delete.
3. In the Tahsilat form, a "Proje" section: link an existing proje, create a new one together with the tahsilat, or leave it empty.
4. A Tahsilatlar section on each member's page.
5. Delete rules: a member, proje, Tahsilat Türü or Tahsilat Tipi that a tahsilat uses can't be deleted.
6. Audit entries for every change.

## Goals

- Staff can record a member's payment in well under a minute, and, if it's for a new project, create that project in the same form.
- Anyone can answer "how much did we collect from X / for Y / for project Z between these dates" from the Tahsilatlar list, and export it.
- Collection history is never lost or orphaned by deleting what it points at.

## Non-goals

- Otomatik Tahsilatlar (automatic or recurring collections) **(staff)**.
- Collections from anyone other than a member (e.g. a cari). Whether Cariler will ever be used for tahsilatlar is undecided **(staff)**.
- Debts, expected dues or "who hasn't paid": this records what was collected, not what's owed.
- Project budgets, dates or descriptions. A proje is only a name, a number and a status **(staff)**.
- Importing existing records (as with Ödemeler, unless staff ask).

## Anti-goals

- Deleting a member silently taking their tahsilatlar with them.
- Money as floats, or totals that drift by a kuruş. The Ödemeler rules apply unchanged.
- The proje created from the Tahsilat form being something different from a proje created on the Projeler page. It's the same record; the form just reuses the create fields and links it **(staff)**.

## Data

### Proje (`project`)

| Field | Column | Required | Notes |
|---|---|---|---|
| Ad | `name` | yes **(staff)** | |
| Proje Numarası | `number` | yes **(staff)** | Free text (it may contain letters or dashes). Unique ignoring Turkish case and surrounding spaces **(my call)** |
| Durum | `active` | yes **(staff)** | Aktif / Pasif, defaults to Aktif |

Plus `created_at` / `updated_at`. A proje exists on its own; any number of tahsilatlar can link to it **(staff)**.

### Tahsilat (`collection`)

| Field | Column | Required | Notes |
|---|---|---|---|
| Üye | `member_id` | yes **(staff)** | Foreign key to `member`, `on delete restrict` |
| Tahsilat Türü | `category_id` | yes **(staff)** | Foreign key to `parameter`, restrict; must be a `collection_category` |
| Tahsilat Tipi | `method_id` | yes **(staff)** | Foreign key to `parameter`, restrict; must be a `collection_method` |
| Tutar | `amount` | yes **(staff)** | `numeric(12,2)`, above zero |
| Tarih | `date` | yes **(staff)** | Postgres `date`, not in the future, defaults to today (Istanbul) |
| Not | `note` | no **(staff)** | |
| Proje | `project_id` | no **(staff)** | Foreign key to `project`, `on delete restrict` |

Plus `created_at` / `updated_at`. The API checks that the parameters are from the right lists, as it does for payments.

## Rules

- **Üye picker:** offers only Aktif members **(staff)**. When editing a tahsilat whose member has since become Pasif (or anything else), the form still shows and keeps that member **(my call)**. The API accepts a new tahsilat only for an Aktif member, and on edit also accepts the member the tahsilat already has **(my call)**.
- **Proje picker:** offers only Aktif projeler, with the same keep-what's-already-linked rule on edit **(my call)**. The label is "Ad (Proje Numarası)" **(my call)**.
- **Deleting a member** with tahsilatlar is refused **(staff)**. Like a cari with ödemeler, the dialog says "Bu üye silinemez", gives the count ("“X” üyesine ait N tahsilat var."), suggests making the member Pasif instead, and offers no Sil button **(my call)**. Setting the member to Pasif is still allowed. This changes today's member delete, which always succeeds.
- **Duplicate member names:** members' Ünvan isn't unique, so the Üye picker may show two identical names. It lists members by Ünvan like the existing member pickers do; this is accepted, not fixed here **(my call)**.
- **Deleting a proje** with tahsilatlar is refused the same way **(my call)**. Projeler are meant to be set Pasif instead.
- **Deleting a Tahsilat Türü or Tipi** that a tahsilat uses is refused, as for Ödeme Türü/Tipi. The Parametreler tab's usage count and dialog cover both tahsilatlar and ödemeler **(my call)**.
- **Status changes:** a member moving to Pasif, or a proje moving to Pasif, keeps its tahsilatlar unchanged.

## Pages

The Finans sidebar item gets **Tahsilatlar** and **Projeler**, after Ödemeler and Cariler **(my call)**. Every list follows the existing pattern: server prefetch, TanStack Table v9, the Sütunlar toggle, Turkish-aware sorting, filters mirrored in the URL, "… dön" links back to the filtered list.

### Tahsilatlar

- **List** `/collections`: Tarih, Üye (link to the member), Tutar, Tahsilat Türü, Tahsilat Tipi, Proje (link, or "—"), Not; newest first. Filters for date range, üye, tür, tip and proje (including a "Projesiz" choice for tahsilatlar with no proje) **(my call)**. Above the table, "N tahsilat · Toplam ₺…" for the filtered rows. An "Excel'e aktar" button downloads exactly those rows, newest first, with a total row, using the same cell rules as Ödemeler **(my call)**. A row's Tarih goes to its edit page.
- **New / edit** `/collections/new`, `/collections/:id/edit`: a page form with two sections:
  1. **Tahsilat:** Üye*, Tahsilat Türü*, Tahsilat Tipi*, Tutar*, Tarih*, Not.
  2. **Proje** (optional), with three choices **(staff: pick existing, create with it, or none)**:
     - **Projesiz** (default)
     - **Mevcut proje:** a searchable picker of Aktif projeler
     - **Yeni proje:** Ad*, Proje Numarası*, Aktif (checked)

     The section is a choice the person makes, not three blocks that are always visible **(my call)**.

  Saving with "Yeni proje" creates the proje and the tahsilat in one transaction: if either fails, neither is saved, and the error shows next to the field it's about (e.g. "Bu proje numarası zaten var" under Proje Numarası). On the edit page the same section can change or remove the link, or create a new proje to link.

  `?member=<id>` preselects the member and returns to the member page after saving; `?project=<id>` preselects the proje and returns to the proje page **(my call)**.
- **Delete** from the edit page, after a confirmation.
- When there are no Aktif members, or no Tahsilat Türü or Tipi, the list and the form show a notice of what to add first, linking to Üyeler and Ayarlar → Parametreler, the same as Ödemeler's notice.

### Projeler

- **List** `/projects`: Proje Numarası, Ad (link), Durum, Tahsilat sayısı, Toplam Tahsilat. Search on Ad and Proje Numarası; a status filter defaulting to Aktif, like Yetkililer **(my call)**. Excel export isn't included **(my call)**: the Tahsilatlar export filtered by proje covers it.
- **Detail** `/projects/:id`: Ad, Proje Numarası, Durum, then its tahsilatlar (Tarih, Üye, Tutar, Tür, Tip, Not) with count and total, a "Tahsilat Ekle" button (`?project=`, shown only while the proje is Aktif, since the API refuses Pasif ones **(my call)**), and a link to the Tahsilatlar list filtered by this proje. Buttons: Düzenle, Aktif/Pasif yap, Sil.
- **New / edit** `/projects/new`, `/projects/:id/edit`: Ad*, Proje Numarası*, Aktif. The Tahsilat form's "Yeni proje" fields are this same form's fields, sharing one schema **(staff)**.

### Member page

A **Tahsilatlar** section listing every tahsilat linked to that member (Tarih, Tutar, Tür, Tip, Proje, Not) with its count and total, a "Tahsilat Ekle" button (`?member=`, shown only while the member is Aktif **(my call)**), and a link to the Tahsilatlar list filtered by the member **(staff)**. It's shown for every status, so a Pasif member's history stays visible.

## Audit log

New entity types **Tahsilatlar** (`collection`) and **Projeler** (`project`), with create/update/delete labels (plus "Proje aktif/pasif yapıldı" if status changes get their own action, following Yetkililer). Same rules as everywhere else.

Specifically:
- A tahsilat's entry label is "Üye ünvanı · ₺1.250,00 · 10.11.2026".
- Its fields are stored as names: Üye, Tutar, Tarih, Tahsilat Türü, Tahsilat Tipi, Proje, Not.
- Creating a proje from the Tahsilat form writes two entries in the same transaction: the proje's create, then the tahsilat's create naming that proje.
- A refused delete writes nothing.

## Migration

New tables only (`project`, `collection`) with their foreign keys. Nothing touches existing production rows. The member delete change is code only.

## Tests

API tests in the existing style:
- **Required fields:** every required field of both entities.
- **Proje Numarası uniqueness.**
- **Linked records:** the wrong-list parameter check, the Aktif-only member and proje rules (including keeping a Pasif one on edit).
- **Creating a proje with a tahsilat:** both saved, and nothing saved when either fails, e.g. a duplicate Proje Numarası or an invalid tahsilat field.
- **Delete rules:** the four (member, proje, Tahsilat Türü, Tahsilat Tipi), plus the existing member-delete tests still passing for members without tahsilatlar.
- **Filters and totals:** including "Projesiz", and kuruş sums.
- **Export and audit entries.**

## Left to the builder

- Route and file layout. How much code to share with Ödemeler (filters, export, list), as long as each stays readable.
- Query keys and invalidation. Tahsilat changes affect members, projeler and parameters; proje changes affect tahsilatlar.
- Whether the member page's section reuses the cari page's payments section component.
