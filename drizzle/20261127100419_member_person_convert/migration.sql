-- Members become people; their company data moves to "company"
-- (docs/superpowers/specs/2026-11-27-member-is-person-design.md).
-- Every yetkili becomes a member: the lowest-id yetkili linked to a member
-- becomes that member (same id), every other yetkili a new member. Money and
-- Organizasyon rows, birthday/founding SMS log rows and the tahsilat notice
-- templates follow. authorized_representative, members_representatives and
-- the old company columns on member are left as they are (dropped later by
-- the cleanup PR). The migrator runs this in one transaction with the
-- migrations around it; the checks at the end abort the whole deploy if
-- anything doesn't add up. Must also run on an empty database (CI).

-- Preconditions: production has no yetkili linked to two members, and this
-- runs once, on empty company / representative_member_map tables
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM members_representatives
    GROUP BY authorized_representative_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'member conversion: a yetkili is linked to more than one member';
  END IF;
  IF EXISTS (SELECT 1 FROM company) OR EXISTS (SELECT 1 FROM representative_member_map) THEN
    RAISE EXCEPTION 'member conversion: company or representative_member_map already has rows';
  END IF;
END $$;
--> statement-breakpoint
CREATE TEMP TABLE conversion_before ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM member) AS members,
  (SELECT count(*) FROM authorized_representative) AS representatives;
--> statement-breakpoint

-- 1. One company per member with an Ünvan; members whose folded Ünvan is the
-- same share one. Per field, the lowest member id with a value supplies it
-- (logo and logo_original always come from the same member).
CREATE TEMP TABLE company_source ON COMMIT DROP AS
SELECT
  id AS member_id,
  regexp_replace(
    lower(translate(trim(title), 'İIıŞşĞğÜüÖöÇçÂâÎîÛû', 'iiiSsGgUuOoCcAaIiUu')),
    '\s+', ' ', 'g'
  ) AS title_key
FROM member
WHERE nullif(trim(title), '') IS NOT NULL;
--> statement-breakpoint
INSERT INTO company (
  title, title_key, logo, logo_original, address, phone, website,
  company_intro, activity_document, sector_id, founding_date, employee_count,
  created_at
)
SELECT
  (array_agg(m.title ORDER BY m.id))[1],
  s.title_key,
  (array_agg(m.logo ORDER BY m.id) FILTER (WHERE nullif(trim(m.logo), '') IS NOT NULL))[1],
  (array_agg(m.logo_original ORDER BY m.id) FILTER (WHERE nullif(trim(m.logo), '') IS NOT NULL))[1],
  (array_agg(m.address ORDER BY m.id) FILTER (WHERE nullif(trim(m.address), '') IS NOT NULL))[1],
  (array_agg(m.phone ORDER BY m.id) FILTER (WHERE nullif(trim(m.phone), '') IS NOT NULL))[1],
  (array_agg(m.website ORDER BY m.id) FILTER (WHERE nullif(trim(m.website), '') IS NOT NULL))[1],
  (array_agg(m.company_intro ORDER BY m.id) FILTER (WHERE nullif(trim(m.company_intro), '') IS NOT NULL))[1],
  (array_agg(m.activity_document ORDER BY m.id) FILTER (WHERE nullif(trim(m.activity_document), '') IS NOT NULL))[1],
  (array_agg(m.sector_id ORDER BY m.id) FILTER (WHERE m.sector_id IS NOT NULL))[1],
  (array_agg(m.founding_date ORDER BY m.id) FILTER (WHERE m.founding_date IS NOT NULL))[1],
  (array_agg(m.employee_count ORDER BY m.id) FILTER (WHERE m.employee_count IS NOT NULL))[1],
  (array_agg(m.created_at ORDER BY m.id))[1]
FROM company_source s
JOIN member m ON m.id = s.member_id
GROUP BY s.title_key;
--> statement-breakpoint
-- company was empty before (checked above), so title_key finds the one just made
CREATE TEMP TABLE member_company (member_id integer PRIMARY KEY, company_id integer NOT NULL) ON COMMIT DROP;
--> statement-breakpoint
INSERT INTO member_company (member_id, company_id)
SELECT s.member_id, c.id
FROM company_source s
JOIN company c ON c.title_key = s.title_key;
--> statement-breakpoint

-- 2.
UPDATE member m
SET company_id = mc.company_id
FROM member_company mc
WHERE mc.member_id = m.id;
--> statement-breakpoint

-- Every yetkili's name split for Adı / Soyadı: the last word is the Soyadı,
-- the rest the Adı; a one-word name is all Adı with an empty Soyadı
CREATE TEMP TABLE representative_name ON COMMIT DROP AS
SELECT
  id,
  CASE WHEN position(' ' IN n) = 0 THEN n ELSE regexp_replace(n, ' \S+$', '') END AS first_name,
  CASE WHEN position(' ' IN n) = 0 THEN '' ELSE substring(n FROM '\S+$') END AS last_name
FROM (
  SELECT id, regexp_replace(regexp_replace(name, '^\s+|\s+$', '', 'g'), '\s+', ' ', 'g') AS n
  FROM authorized_representative
) r;
--> statement-breakpoint

-- 3. A member with yetkililer becomes its lowest-id yetkili. The yetkili's
-- value wins where it has one (staff have been editing yetkililer); the
-- name fills in only where the member (an /uyelik applicant) has none.
CREATE TEMP TABLE person_link ON COMMIT DROP AS
SELECT DISTINCT ON (member_id)
  member_id,
  authorized_representative_id AS representative_id,
  role
FROM members_representatives
ORDER BY member_id, authorized_representative_id;
--> statement-breakpoint
UPDATE member m
SET
  first_name = coalesce(nullif(trim(m.first_name), ''), rn.first_name),
  last_name = coalesce(nullif(trim(m.last_name), ''), rn.last_name),
  email = coalesce(r.email, m.email),
  mobile_phone = coalesce(r.phone, m.mobile_phone),
  birth_date = coalesce(r.date_of_birth, m.birth_date),
  photo = r.photo,
  notes = r.notes,
  po_positive_card_no = r.po_positive_card_no,
  company_role = coalesce(pl.role, m.company_role)
FROM person_link pl
JOIN authorized_representative r ON r.id = pl.representative_id
JOIN representative_name rn ON rn.id = r.id
WHERE m.id = pl.member_id;
--> statement-breakpoint
INSERT INTO representative_member_map (representative_id, member_id)
SELECT representative_id, member_id FROM person_link;
--> statement-breakpoint

-- 4 and 5. Every other yetkili becomes a new member: one linked to a member
-- (its second yetkili) joins that member's company with its status and Üye
-- Giriş Tarihi; one with no member gets no company and is Aktif (Pasif if
-- the yetkili was). Ids are drawn first so the mapping is known.
CREATE TEMP TABLE new_person ON COMMIT DROP AS
SELECT
  nextval(pg_get_serial_sequence('member', 'id'))::integer AS member_id,
  r.id AS representative_id,
  l.member_id AS from_member_id,
  l.role
FROM authorized_representative r
LEFT JOIN members_representatives l ON l.authorized_representative_id = r.id
WHERE NOT EXISTS (
  SELECT 1 FROM representative_member_map map WHERE map.representative_id = r.id
);
--> statement-breakpoint
INSERT INTO member (
  id, status, member_login_date, company_id, company_role,
  first_name, last_name, email, mobile_phone, birth_date,
  photo, notes, po_positive_card_no, created_at
)
OVERRIDING SYSTEM VALUE
SELECT
  np.member_id,
  CASE
    WHEN np.from_member_id IS NOT NULL THEN fm.status
    WHEN r.active THEN 'active'
    ELSE 'passive'
  END,
  fm.member_login_date,
  fm.company_id,
  np.role,
  rn.first_name,
  rn.last_name,
  r.email,
  r.phone,
  r.date_of_birth,
  r.photo,
  r.notes,
  r.po_positive_card_no,
  r.created_at
FROM new_person np
JOIN authorized_representative r ON r.id = np.representative_id
JOIN representative_name rn ON rn.id = r.id
LEFT JOIN member fm ON fm.id = np.from_member_id;
--> statement-breakpoint
INSERT INTO representative_member_map (representative_id, member_id)
SELECT representative_id, member_id FROM new_person;
--> statement-breakpoint

-- 6. Money and Organizasyon rows follow their yetkili
UPDATE collection t SET member_id = map.member_id
FROM representative_member_map map WHERE map.representative_id = t.representative_id;
--> statement-breakpoint
UPDATE accrual t SET member_id = map.member_id
FROM representative_member_map map WHERE map.representative_id = t.representative_id;
--> statement-breakpoint
UPDATE project_pledge t SET member_id = map.member_id
FROM representative_member_map map WHERE map.representative_id = t.representative_id;
--> statement-breakpoint
UPDATE management_board_member t SET member_id = map.member_id
FROM representative_member_map map WHERE map.representative_id = t.representative_id;
--> statement-breakpoint
UPDATE committee_member t SET member_id = map.member_id
FROM representative_member_map map WHERE map.representative_id = t.representative_id;
--> statement-breakpoint
UPDATE disciplinary_board_member t SET member_id = map.member_id
FROM representative_member_map map WHERE map.representative_id = t.representative_id;
--> statement-breakpoint
UPDATE supervisory_board_member t SET member_id = map.member_id
FROM representative_member_map map WHERE map.representative_id = t.representative_id;
--> statement-breakpoint
UPDATE honorary_board_member t SET member_id = map.member_id
FROM representative_member_map map WHERE map.representative_id = t.representative_id;
--> statement-breakpoint

-- 7. The celebration SMS log: birthday rows now name the member, founding
-- rows the company, so a same-day re-run can't send one twice. Postgres
-- checks sms_send_once row by row, so the ids to move are first parked as
-- negatives (which no real id is) to keep old and new ids from colliding.
UPDATE sms_send s SET contact_id = -s.contact_id
FROM representative_member_map map
WHERE s.kind = 'birthday' AND map.representative_id = s.contact_id;
--> statement-breakpoint
UPDATE sms_send s SET contact_id = map.member_id
FROM representative_member_map map
WHERE s.kind = 'birthday' AND s.contact_id < 0 AND map.representative_id = -s.contact_id;
--> statement-breakpoint
UPDATE sms_send s SET contact_id = -s.contact_id
FROM member m
WHERE s.kind = 'founding' AND s.contact_id = m.id AND m.company_id IS NOT NULL;
--> statement-breakpoint
-- two members of one company may both have a row for the same day: the
-- lowest row id takes the company, the others keep their member id
UPDATE sms_send s SET contact_id = x.company_id
FROM (
  SELECT
    s2.id,
    m.company_id,
    row_number() OVER (PARTITION BY m.company_id, s2.celebration_date ORDER BY s2.id) AS n
  FROM sms_send s2
  JOIN member m ON m.id = -s2.contact_id
  WHERE s2.kind = 'founding' AND s2.contact_id < 0
) x
WHERE s.id = x.id AND x.n = 1;
--> statement-breakpoint
UPDATE sms_send SET contact_id = -contact_id
WHERE kind = 'founding' AND contact_id < 0;
--> statement-breakpoint

-- 8. Tahsilat notice templates: {yetkili} is now {uye}
UPDATE collection_notice_settings SET
  representative_sms = replace(representative_sms, '{yetkili}', '{uye}'),
  representative_email_subject = replace(representative_email_subject, '{yetkili}', '{uye}'),
  representative_email_body = replace(representative_email_body, '{yetkili}', '{uye}'),
  staff_sms = replace(staff_sms, '{yetkili}', '{uye}'),
  staff_email_subject = replace(staff_email_subject, '{yetkili}', '{uye}'),
  staff_email_body = replace(staff_email_body, '{yetkili}', '{uye}');
--> statement-breakpoint

-- 9. Checks; any failure aborts the migration and the deploy
DO $$
DECLARE
  t text;
  bad boolean;
BEGIN
  IF EXISTS (
    SELECT 1 FROM authorized_representative r
    WHERE NOT EXISTS (SELECT 1 FROM representative_member_map map WHERE map.representative_id = r.id)
  ) THEN
    RAISE EXCEPTION 'member conversion check failed: a yetkili has no member in representative_member_map';
  END IF;

  IF (SELECT count(*) FROM representative_member_map)
     <> (SELECT representatives FROM conversion_before) THEN
    RAISE EXCEPTION 'member conversion check failed: representative_member_map does not have exactly one row per yetkili';
  END IF;

  IF (SELECT count(*) FROM member)
     <> (SELECT members FROM conversion_before) + (SELECT count(*) FROM new_person) THEN
    RAISE EXCEPTION 'member conversion check failed: member count is not the old count plus the new members';
  END IF;

  IF EXISTS (SELECT 1 FROM member WHERE first_name IS NULL OR last_name IS NULL) THEN
    RAISE EXCEPTION 'member conversion check failed: a member has no first_name or last_name';
  END IF;

  IF EXISTS (
    SELECT 1 FROM member
    WHERE nullif(trim(title), '') IS NOT NULL AND company_id IS NULL
  ) THEN
    RAISE EXCEPTION 'member conversion check failed: a member with an Ünvan has no company';
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'collection', 'accrual', 'project_pledge',
    'management_board_member', 'committee_member', 'disciplinary_board_member',
    'supervisory_board_member', 'honorary_board_member'
  ] LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I t LEFT JOIN representative_member_map map
         ON map.representative_id = t.representative_id
       WHERE t.member_id IS NULL OR t.member_id IS DISTINCT FROM map.member_id)',
      t
    ) INTO STRICT bad;
    IF bad THEN
      RAISE EXCEPTION 'member conversion check failed: % has a row without the member its yetkili maps to', t;
    END IF;
  END LOOP;

  -- per person, the count and total of each money table before (by yetkili)
  -- and after (by member) are the same
  FOREACH t IN ARRAY ARRAY['collection', 'accrual', 'project_pledge'] LOOP
    EXECUTE format(
      'WITH old AS (
         SELECT map.member_id, o.n, o.total
         FROM (SELECT representative_id, count(*) AS n, sum(%2$s) AS total
               FROM %1$I GROUP BY representative_id) o
         LEFT JOIN representative_member_map map ON map.representative_id = o.representative_id
       ), new AS (
         SELECT member_id, count(*) AS n, sum(%2$s) AS total FROM %1$I GROUP BY member_id
       )
       SELECT EXISTS (
         SELECT 1 FROM old FULL JOIN new ON new.member_id = old.member_id
         WHERE old.member_id IS NULL OR new.member_id IS NULL
           OR old.n IS DISTINCT FROM new.n OR old.total IS DISTINCT FROM new.total
       )',
      t,
      CASE WHEN t = 'project_pledge' THEN 'quantity * amount' ELSE 'amount' END
    ) INTO STRICT bad;
    IF bad THEN
      RAISE EXCEPTION 'member conversion check failed: % counts or totals per person changed', t;
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

-- 10. One system entry in Denetim Kayıtları, counts only (none on an empty
-- database: nothing was converted)
INSERT INTO audit_log (action, entity_type, entity_label, details)
SELECT
  'conversion',
  'member',
  'Yetkililer üyelere dönüştürüldü',
  jsonb_build_array(
    jsonb_build_object('label', 'Korunan üyeler', 'value', b.members::text),
    jsonb_build_object('label', 'Eklenen üyeler', 'value', (SELECT count(*) FROM new_person)::text),
    jsonb_build_object('label', 'Oluşturulan firmalar', 'value', (SELECT count(*) FROM company)::text),
    jsonb_build_object('label', 'Birleştirilen firmalar', 'value',
      ((SELECT count(*) FROM company_source) - (SELECT count(*) FROM company))::text),
    jsonb_build_object('label', 'Tahsilatlar', 'value', (SELECT count(*) FROM collection)::text),
    jsonb_build_object('label', 'Tahakkuk', 'value', (SELECT count(*) FROM accrual)::text),
    jsonb_build_object('label', 'Taahhütler', 'value', (SELECT count(*) FROM project_pledge)::text),
    jsonb_build_object('label', 'Yönetim', 'value', (SELECT count(*) FROM management_board_member)::text),
    jsonb_build_object('label', 'Komiteler', 'value', (SELECT count(*) FROM committee_member)::text),
    jsonb_build_object('label', 'Disiplin Kurulu', 'value', (SELECT count(*) FROM disciplinary_board_member)::text),
    jsonb_build_object('label', 'Denetim Kurulu', 'value', (SELECT count(*) FROM supervisory_board_member)::text),
    jsonb_build_object('label', 'Onur Kurulu', 'value', (SELECT count(*) FROM honorary_board_member)::text)
  )
FROM conversion_before b
WHERE b.members > 0 OR b.representatives > 0;
