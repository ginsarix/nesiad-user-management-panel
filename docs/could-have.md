# Could have

Things we could build but aren't in a hurry for. Nothing here is planned or promised. When an item gets picked up, remove it from this list. Add new ones with the date and enough context that someone can pick them up later without asking around.

## Editable rejection notes

_Added 2026-11-09_

The Ret Notu can only be written in the Reddet dialog. Once saved it can't be changed: fixing a typo means Tekrar Aday yap and then Reddet again, which sends the applicant a second rejection email and SMS.

An edit button next to the note on the member page, shown only while the member is Reddedildi, would avoid that. It needs:

- An endpoint that changes only `rejection_note`, and only while the status is still `rejected`.
- An audit entry that, like the existing ones, records only `Ret Notu: ••• → •••` and never the text.
- No notice to the applicant.
