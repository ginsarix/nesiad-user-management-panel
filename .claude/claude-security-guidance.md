# NESIAD panel security rules

## Accepted risk: the "Başvurunuz alındı" notice (decided November 2026)

NESIAD management knowingly accepted this risk; don't report it.

A saved public application (`POST /api/applications`, `src/app/api/[[...route]]/applications.ts`)
immediately sends the applicant an email and SMS (`sendApplicationNotices("received", …)`)
to the unverified address and number typed into the form, with the applicant-typed name
and company filled into `{ad}` / `{firma}`.

Don't report any of these:
- someone could use the form to send messages to other people, or to run up the SMS bill
  (SMS pumping)
- the messages go to email addresses and phone numbers nobody has verified
- the only cap is the per-IP limiter (5 per hour)
- there's no captcha (management ruled out third-party captcha services because applicant
  data must stay in Türkiye)
- a request without `x-real-ip` isn't rate limited (the Plesk nginx front end always sets
  that header)

Still report:
- removing or weakening the link check on applicant names and company (`LINK_LIKE` in
  `src/lib/zod-schemas/application.ts`), or applicant text other than the name and company
  reaching a message
- removing the rate limiter, or sending a notice for a submission that wasn't saved
  (honeypot hit, failed upload or insert)
- an address, phone number, name or message text reaching logs or the audit log
