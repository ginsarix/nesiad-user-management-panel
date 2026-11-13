# Taahhütler: "Adet ve tutarı tüm satırlara uygula" — design

## Intent

Staff often give every yetkili in a proje the same Adet and Tutar. A
checkbox above the Taahhütler rows makes an Adet or Tutar typed in one row
go into every row, so they type it once.

## Behaviour (approved)

- One checkbox, "Adet ve tutarı tüm satırlara uygula", above the rows,
  wherever the Taahhütler editor is (proje create, edit, details).
- While ticked, typing an Adet in any row sets that Adet in every other row;
  Tutar likewise, independently. Yetkili is never touched.
- Ticking does nothing by itself; only the next edit spreads.
- A row added while ticked starts with the Adet and Tutar of the last row.
- Not saved: unticked on every page load. Saving and the audit are
  unchanged (rows are saved as they are).

## Approaches

- **Chosen:** the editor keeps the checkbox state and, on an Adet/Tutar
  change, writes the value into the other rows with react-hook-form
  `setValue` (marking them dirty), so inputs keep focus and Kaydet/the save
  bar see the change.
- Rejected: `replace` on the field array — re-keys the rows, so the input
  being typed in loses focus.

## Left to the builder

Layout of the checkbox; whether spread rows are re-validated.

## Addition: undo (approved)

While the checkbox is ticked, Cmd/Ctrl+Z in an Adet or Tutar box undoes the
last apply-to-all step: every row gets back its own previous value.
Cmd/Ctrl+Shift+Z (and Ctrl+Y) redoes. One step is everything typed in one
box until it loses focus (Tutar tidying on blur included). Steps undo in
order across boxes. Rows added meanwhile aren't touched; rows removed are
skipped. History clears on Kaydet, İptal (the form re-keys its rows), leaving
the page, and unticking; while unticked the browser's own per-box undo
applies. While ticked with nothing to undo, Cmd/Ctrl+Z does nothing (the
browser's undo would spread a wrong value). Steps are keyed by
useFieldArray row ids, so removing a row doesn't shift them. The history
logic is a pure module with tests; the editor only wires keys and focus.
