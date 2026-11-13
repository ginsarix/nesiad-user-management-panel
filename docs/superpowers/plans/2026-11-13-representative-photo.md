# Yetkili Photo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yetkililer get an optional photo, uploaded in the yetkili form, shown as a round avatar wherever staff see a yetkili's name, and viewable/changeable/removable from the yetkili page.

**Architecture:** A nullable `authorized_representative.photo` column holds a filename in `UPLOAD_DIR`, served by the existing `/api/files/:filename`. The yetkili create/update API switches from JSON to multipart (like members) so the photo goes with the rest of the form in one transaction and one audit entry. The browser shrinks every photo to a JPEG of at most 800px before it ever reaches the form value; the server only checks the contents are JPEG/PNG.

**Tech Stack:** Next.js 16, Hono + `@hono/zod-validator` (`"form"` target), Drizzle (Postgres), zod 4, react-hook-form, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-representative-photo-design.md`

## Global Constraints

- Photo longest side at most **800px**, sent as **JPEG**, quality **0.85**, drawn on a **white** background, EXIF orientation applied.
- Server accepts only JPEG or PNG by content (`file-type`), at most **5 MB**; stored filenames start with `photo_`.
- Avatars for people are **round** (`rounded-full`, `object-cover`); member logos stay square.
- Audit label **`Fotoğraf`**; create/delete value `Var` or `—`; update change `Eski fotoğraf` → `Yeni fotoğraf` (`—` on an empty side), only when it changed. No filenames.
- Turkish copy, exactly:
  - browser can't open the file: `Fotoğraf açılamadı. JPG veya PNG seçin.`
  - server rejects contents: `Sadece JPG veya PNG fotoğraflar kabul edilir` (415)
  - too large: `Fotoğraf 5 MB'dan küçük olmalıdır` (413 / form error)
  - drop zone hint: `veya buraya sürükleyin · JPG veya PNG`; button `Fotoğraf seç` / `Değiştir`; dialog buttons `Fotoğraf Değiştir`, `Fotoğraf Sil`; delete confirm title `Fotoğraf silinsin mi?`, body `{name} adlı yetkilinin fotoğrafı kalıcı olarak silinir.`
- Migration only adds a nullable column (no production data touched). Run `pnpm db:push` then `pnpm db:generate`, commit the migration.
- Every photo change invalidates `["representatives"]`, `["members"]` and `["organizations"]`.
- Keep pdf.js and `logo-upload.ts` out of the photo path.

## Review Focus

1. **Editing a yetkili without touching the photo keeps it**, and so does the Aktif/Pasif toggle. Test in Task 2.
2. **A save that fails after the photo was stored** (e.g. linking an Aday member) leaves no photo set and no file on disk. Test in Task 2.
3. **Malformed `members` text in the multipart body** returns 400 with a message, not 500. Test in Task 1.
4. **A transparent PNG** becomes a white-backed JPEG, not black. Check by hand in Task 3 (canvas isn't available in Vitest).
5. **A phone photo taken sideways** shows upright after upload (EXIF orientation). Check by hand in Task 3.

---

### Task 1: Yetkili API takes multipart form data; `photo` column

Switches the transport only. No photo handling yet, so every existing behaviour must still pass.

**Files:**
- Modify: `src/db/schema.ts` (`authorizedRepresentativeTable`: add `photo: text()`, with a comment like `member.logo`'s)
- Create: `drizzle/<generated>.sql` (from `pnpm db:generate`)
- Modify: `src/lib/zod-schemas/authorized-representative.ts`
- Modify: `src/app/api/[[...route]]/representatives.ts` (`zValidator("json", …)` → `zValidator("form", …)`)
- Modify: `src/lib/fetches/representative.ts`
- Test: `src/app/api/[[...route]]/representatives.test.ts`, `audit-entries.test.ts`, `sms.test.ts` (their yetkili requests become multipart)

**Interfaces:**
- Produces: `createRepresentativeSchema` / `updateRepresentativeSchema` that parse multipart strings: `active: z.stringbool().optional()`, `members`: JSON text of `[{ memberId: number, role: string | null }]` parsed then validated by the existing array schema (duplicate check kept). Invalid JSON → issue `Geçersiz üye listesi`.
- Produces: `toRepresentativeForm(values: RepresentativeUpload): Record<string, string | File>` in `fetches/representative.ts`, used by `createRepresentative`, `updateRepresentative`, and `setRepresentativeActive` (which sends `{ active: "true" | "false" }`).
- Produces: a test helper `form(fields: Record<string, string | File>)` in `representatives.test.ts`; `createRepresentative(body)` / `patch(id, body)` helpers keep taking a plain object and convert `members` with `JSON.stringify`, `active` with `String`.

- [ ] **Step 1:** Add `photo: text()` to the schema. Run `pnpm db:push`, then `pnpm db:generate`. Expected: one migration with `ALTER TABLE "authorized_representative" ADD COLUMN "photo" text;` and nothing else.
- [ ] **Step 2: Write the failing tests.** Convert the yetkili helpers in the three test files to multipart, then add to `representatives.test.ts`:

```ts
it("rejects a members field that isn't JSON", async () => {
  const res = await representativesRoute.request("/", {
    method: "POST",
    body: form({ name: "__test__ Bozuk Liste", members: "[{" }),
  });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe("Geçersiz üye listesi");
});
```

- [ ] **Step 3:** Run `pnpm test --run representatives audit-entries sms`. Expected: FAIL (the route still reads JSON).
- [ ] **Step 4:** Switch the schemas, the route validators and the fetches to multipart as in Interfaces.
- [ ] **Step 5:** Run `pnpm test --run representatives audit-entries sms` and `pnpm exec tsc --noEmit`. Expected: all pass.
- [ ] **Step 6:** Commit the spec, the plan and this task: `feat: send yetkili forms as multipart and add the photo column`.

### Task 2: Store, replace, remove and audit the photo in the API

**Files:**
- Modify: `src/lib/uploads.ts` (`PHOTO_MIME_TYPES = ["image/jpeg", "image/png"] as const`; `storeUpload`'s `baseName` union gains `"photo"`)
- Modify: `src/lib/zod-schemas/authorized-representative.ts`
- Modify: `src/app/api/[[...route]]/representatives.ts`
- Modify: `src/app/api/[[...route]]/members.ts` (`selectRepresentatives` also selects `photo`)
- Modify: `src/app/api/[[...route]]/organizations.ts` (group people select `representativePhoto`)
- Test: `src/app/api/[[...route]]/representatives.test.ts`

**Interfaces:**
- Consumes: Task 1's multipart schemas and test helpers.
- Produces: `MAX_PHOTO_SIZE = 5 * 1024 * 1024` and `photoFileSchema` (instance of `File`, non-empty, ≤ `MAX_PHOTO_SIZE` with message `Fotoğraf 5 MB'dan küçük olmalıdır`) exported from `authorized-representative.ts`. API create schema gains `photo: photoFileSchema.optional()`; update schema also gains `removePhoto: z.stringbool().optional()`.
- Produces: API responses where the list, the detail, the member's `representatives[]` and an organization group's `people[]` carry `photo` / `representativePhoto: string | null`.
- Route: a `bodyLimit` of `MAX_PHOTO_SIZE + 1 MiB` on POST and PATCH with the 413 copy. A stored photo whose contents aren't JPEG/PNG → 415 with the copy. The new file is deleted if the transaction throws, the old file after commit when replaced or removed, the yetkili's file after a delete commits. Audit as in Global Constraints.

- [ ] **Step 1: Write the failing tests** in `representatives.test.ts`. Track every stored filename in `createdFiles` and remove them in `afterAll` with `deleteFile`, as `members.test.ts` does. Reuse a tiny PNG/JPEG buffer like its `PNG` constant.
  - `stores a photo and records Fotoğraf: Var`: POST with `photo` → detail `photo` matches `/^photo_.+\.(png|jpg)$/`, `readStoredFile` is not null, create entry details contain `{ label: "Fotoğraf", value: "Var" }`.
  - `rejects a photo that isn't an image`: a `.jpg` named file holding text → 415, body `{ error: "Sadece JPG veya PNG fotoğraflar kabul edilir" }`, and no yetkili with that name exists.
  - `replaces the photo and deletes the old file`: PATCH with a new photo → new filename, `readStoredFile(old)` is null, update changes contain `{ label: "Fotoğraf", from: "Eski fotoğraf", to: "Yeni fotoğraf" }`.
  - `removes the photo`: PATCH `removePhoto: "true"` → `photo` null, file gone, change `to: "—"`.
  - `keeps the photo when the form is saved without one`: PATCH `{ name: "…" }` and PATCH `{ active: "false" }` → `photo` unchanged, file still there, no `Fotoğraf` change.
  - `stores no photo when the save fails`: POST with a photo and a link to a `candidate` member → 400, the number of files in the upload dir whose names start with `photo_` and were created during the test is unchanged (compare `readdir(getFilePath(""))` before/after, filtered to names not seen before).
  - `deletes the photo file with the yetkili`: DELETE → file gone, delete entry details contain `{ label: "Fotoğraf", value: "Var" }`.
  - `includes the photo where the yetkili is listed`: GET `/` row, member detail (`membersRoute`) `representatives[0].photo`, and an organization group's `people[0].representativePhoto` all equal the stored filename.
- [ ] **Step 2:** Run `pnpm test --run representatives`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement as in Interfaces, following the member logo code in `members.ts` (`saveLogoFiles`, the `newLogo` undefined/null/value pattern, `deleteFiles` placement).
- [ ] **Step 4:** Run `pnpm test --run representatives members organizations` and `pnpm exec tsc --noEmit`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: store yetkili photos`.

### Task 3: Photo field in the yetkili form

**Files:**
- Create: `src/lib/photo-upload.ts` + `src/lib/photo-upload.test.ts`
- Create: `src/components/file-drop-area.tsx` (the drag/drop container extracted from `LogoDropZone`)
- Modify: `src/app/(panel)/members/_components/logo-drop-zone.tsx` (uses `FileDropArea`; no behaviour change)
- Create: `src/app/(panel)/representatives/_components/photo-drop-zone.tsx`
- Create: `src/components/representative-avatar.tsx`
- Modify: `src/lib/zod-schemas/authorized-representative.ts` (form schema), `src/lib/fetches/representative.ts`, `src/app/(panel)/representatives/_components/representative-form.tsx`, `src/app/(panel)/representatives/[id]/edit/edit-representative.tsx` (pass the current photo)

**Interfaces:**
- Produces: `fitWithin(width: number, height: number, max = 800): { width: number; height: number }`: scales down to fit, never up, rounds to whole pixels, min 1.
- Produces: `class PhotoFileError extends Error` and `resizePhoto(file: File): Promise<File>`: `createImageBitmap(file, { imageOrientation: "from-image" })`, canvas sized by `fitWithin`, filled white, drawn, `toBlob("image/jpeg", 0.85)`, returned as `new File([blob], "photo.jpg", { type: "image/jpeg" })`. Any decode/encode failure throws `PhotoFileError("Fotoğraf açılamadı. JPG veya PNG seçin.")`.
- Produces: `FileDropArea({ onDropFile: (file: File | null) => void, className?, children })`: owns the dragging state and exposes it through a render-prop or `data-dragging`, builder's choice.
- Produces: `PhotoDropZone({ id, file, currentUrl, onPick, onRemove? })`: same props as `LogoDropZone`, round 56px preview, `accept="image/*"`, copy from Global Constraints.
- Produces: `RepresentativeAvatar({ name: string, photo?: string | null, size?: "sm" | "lg" })`: `sm` = `size-7` (28px), `lg` = `size-16` (64px); photo via `logoUrl(photo)`, `unoptimized`; without one, initials (`initialsTr`) on `bg-secondary`; always `rounded-full`.
- Form schema gains `photo: z.instanceof(File).nullable()` and `removePhoto: z.boolean()`. Resizing happens **on pick**, so the form value is already the upload. The field's `onPick` runs `resizePhoto`; on `PhotoFileError` it sets the field error and keeps the value null. `toRepresentativeForm` adds `photo` when set, else `removePhoto: "true"` when set.

- [ ] **Step 1: Write the failing test** `photo-upload.test.ts`:

```ts
expect(fitWithin(4000, 3000)).toEqual({ width: 800, height: 600 });
expect(fitWithin(3000, 4000)).toEqual({ width: 600, height: 800 });
expect(fitWithin(500, 300)).toEqual({ width: 500, height: 300 });
expect(fitWithin(5000, 2)).toEqual({ width: 800, height: 1 });
```

- [ ] **Step 2:** Run `pnpm test --run photo-upload`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `photo-upload.ts`, `FileDropArea` (and move `LogoDropZone` onto it), `PhotoDropZone`, `RepresentativeAvatar`, and the form field (under the name field, full width).
- [ ] **Step 4:** Run `pnpm test --run photo-upload members` and `pnpm exec tsc --noEmit` and `pnpm lint`. Expected: pass.
- [ ] **Step 5: Check by hand** in `pnpm dev` (log in with the dev session script): create a yetkili with a large JPEG, a transparent PNG (white behind, not black), a sideways phone photo (upright), a `.txt` renamed `.jpg` (the error copy, nothing saved), and the member logo drop zone still works with a PDF.
- [ ] **Step 6:** Commit: `feat: add a photo field to the yetkili form`.

### Task 4: Show photos; change and remove from the yetkili page

**Files:**
- Create: `src/app/(panel)/representatives/[id]/representative-photo.tsx`, `change-photo-button.tsx`, `delete-photo-button.tsx`
- Modify: `src/lib/fetches/representative.ts`
- Modify: `src/app/(panel)/representatives/[id]/representative-details.tsx` (header: photo before the name)
- Modify: `src/app/(panel)/representatives/representatives.tsx` (Ad Soyad cell: `sm` avatar before the link)
- Modify: `src/app/(panel)/members/_components/member-info.tsx` (`RepresentativeList`: `sm` avatar before the name)
- Modify: `src/app/(panel)/organization/[organization]/[id]/group-details.tsx` (`sm` avatar before the name)
- Modify: `CLAUDE.md` (UI section: yetkili photos are resized to an 800px JPEG in the browser, stored like logos, `photo_` prefix, no original kept)

**Interfaces:**
- Consumes: `RepresentativeAvatar`, `PhotoDropZone`, `resizePhoto`, `PhotoFileError` (Task 3); `photo` fields on API responses (Task 2).
- Produces: `setRepresentativePhoto(id: number, photo: File): Promise<void>` (PATCH `{ photo }`, error fallback `Fotoğraf kaydedilemedi`) and `removeRepresentativePhoto(id: number): Promise<void>` (PATCH `{ removePhoto: "true" }`, fallback `Fotoğraf silinemedi`).
- `RepresentativePhoto({ representative })`: no photo → `lg` avatar only (adding one is done through Düzenle). With a photo → the avatar is a zoom button opening a dialog (title = name, full-size image `max-h-[65vh]`, footer `DeletePhotoButton` + `ChangePhotoButton`), mirroring `member-logo.tsx` / `change-logo-button.tsx` / `delete-logo-button.tsx`.

- [ ] **Step 1:** Implement the fetches, the three components, and the avatars in the four places.
- [ ] **Step 2:** Run `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test --run`. Expected: all pass.
- [ ] **Step 3: Check by hand** in `pnpm dev`: the photo appears on the yetkili list, the yetkili page, a member page's Yetkililer and an Organizasyon group. Change it from the dialog and all four update without a reload. Remove it, and initials show everywhere. Delete the yetkili and the file is gone from `uploads/`.
- [ ] **Step 4:** Commit: `feat: show yetkili photos and manage them from the yetkili page`.
