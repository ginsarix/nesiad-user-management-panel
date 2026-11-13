# Yetkili photo: design

Status: draft for review, 2026-11-13.

Decisions marked **(user)** came from the user. Decisions marked **(my call)** are the designer's defaults and can be overruled. Everything else is left to the builder.

## Why

Staff want to recognize yetkililer by face **(user)**. So the photo shows wherever staff meet a yetkili's name, not only on the yetkili's own page.

## What gets built

1. `authorized_representative.photo` (text, nullable): the stored filename, like `member.logo`. Adding a nullable column touches no existing rows; the migration is safe.
2. A **Fotoğraf** field in the yetkili form (new and edit), saved in the same request as the rest of the form **(user: approach A)**. Edit can remove the current photo.
3. On the yetkili page, a large photo in the header that opens full size in a dialog with **Değiştir** and **Sil**, like the member logo **(user: same as logos)**.
4. A small round photo next to the yetkili's name on: the yetkili list, the member page's Yetkililer list, and the Organizasyon group page **(my call, follows from the why)**. Without a photo, a round avatar with initials.

## Goals

- Adding a photo is part of filling in the yetkili, not a separate step later.
- Photos load fast in lists and never fail on size because they came from a phone.

## Non-goals

- Cropping or positioning inside the panel. The round avatar shows the centered middle of the photo (`object-cover`) **(my call)**.
- PDF or SVG photos. Those exist for company logos **(my call)**.
- Keeping the original upload. Only the resized image is stored **(my call)**.
- Photos in the Organizasyon group *form* or the yetkili picker.

## Anti-goals

- A photo of a person looking like a company logo: people get **round** avatars, members keep square ones.
- A yetkili saved without its photo (or a photo file left behind) because one half of a save failed.

## How it works

- **In the browser, before upload** **(my call)**: the picked image is drawn to a canvas with its longest side at most **800px** and sent as **JPEG** (quality around 0.85, on a white background so transparent PNGs don't go black). This keeps phone photos well under the 5 MB limit, keeps lists fast, applies the EXIF rotation, and strips the EXIF data, including GPS location. The browser takes any image it can open. When it can't open one (e.g. an iPhone HEIC photo in Chrome), the field shows "Fotoğraf açılamadı. JPG veya PNG seçin."
- **Server**: checks the contents are JPEG or PNG (`storeUpload` with the logo types, base name `photo`) and stores it in `UPLOAD_DIR`, served by `/api/files` like logos. Body limit and 415 error as for logos.
- **API**: `POST /api/representatives` and `PATCH /api/representatives/:id` take multipart form data instead of JSON, the same way member create/update do. `photo` is a file and `removePhoto` is a flag, like `logo`/`removeLogo`. The `members` links need a multipart encoding (e.g. a JSON string field); the builder chooses. `setRepresentativeActive` moves along with it.
- **Files**: a new photo replaces the old one, and the old file is deleted after commit. If the transaction fails, the new file is deleted. Deleting a yetkili deletes their photo file after commit. Same pattern as member logos.
- **Audit**: create/delete entries get `Fotoğraf: Var` / `—`. Updates get `Fotoğraf: Eski fotoğraf → Yeni fotoğraf` (or `—` on either side), only when it changed. No filenames.
- **Queries**: the yetkili list, the yetkili detail, the member detail's yetkili list and the organization group's people include `photo`.

## Approaches considered

- **A. Photo in the form, sent with the rest (multipart)**: one save, one audit entry, and it works like member logos. **Picked (user).**
- B. Separate photo endpoint called after the form saves: the JSON API stays, but a create takes two saves, can half-fail, and writes two audit entries.
- C. Photo only on the yetkili page: least work, but it needs an extra step after creating, which will get skipped. That defeats the why.

## Left to the builder

- Whether the drop zone and full-size dialog are generalized from the logo ones or written as photo versions. Keep pdf.js out of the photo path either way.
- Avatar sizes and the exact component name/location (shared by members and representatives pages).
- Tests: API tests for create with photo, a rejected non-image, replace (old file gone), remove, delete (file gone), and the audit entries. The browser resize step needs canvas, so test it lightly or not at all.
- Update CLAUDE.md's UI notes to mention yetkili photos.
