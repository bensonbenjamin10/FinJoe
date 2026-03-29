-- Migrate all stored phone numbers to E.164 format (prefix with '+' where missing).
-- Previously phones were stored as bare digits e.g. "919876543210".
-- After this migration they are "+919876543210" matching normalizePhone output.
-- Safe to re-run: WHERE ... NOT LIKE '+%' skips already-migrated rows.
--
-- session_replication_role = replica disables FK trigger checks so we can update
-- both the referenced (fin_joe_contacts.phone) and referencing (fin_joe_conversations.contact_phone)
-- columns in the same migration without ordering constraints.
--> statement-breakpoint
SET session_replication_role = 'replica';
--> statement-breakpoint
UPDATE fin_joe_contacts
SET phone = CONCAT('+', phone)
WHERE phone NOT LIKE '+%'
  AND length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 7;
--> statement-breakpoint
UPDATE fin_joe_conversations
SET contact_phone = CONCAT('+', contact_phone)
WHERE contact_phone NOT LIKE '+%'
  AND length(regexp_replace(contact_phone, '[^0-9]', '', 'g')) >= 7;
--> statement-breakpoint
UPDATE expenses
SET submitted_by_contact_phone = CONCAT('+', submitted_by_contact_phone)
WHERE submitted_by_contact_phone IS NOT NULL
  AND submitted_by_contact_phone NOT LIKE '+%'
  AND length(regexp_replace(submitted_by_contact_phone, '[^0-9]', '', 'g')) >= 7;
--> statement-breakpoint
UPDATE fin_joe_role_change_requests
SET contact_phone = CONCAT('+', contact_phone)
WHERE contact_phone NOT LIKE '+%'
  AND length(regexp_replace(contact_phone, '[^0-9]', '', 'g')) >= 7;
--> statement-breakpoint
UPDATE fin_joe_tasks
SET assigned_to_phone = CONCAT('+', assigned_to_phone)
WHERE assigned_to_phone IS NOT NULL
  AND assigned_to_phone NOT LIKE '+%'
  AND length(regexp_replace(assigned_to_phone, '[^0-9]', '', 'g')) >= 7;
--> statement-breakpoint
SET session_replication_role = 'origin';
