-- Canonicalise stored emails and enforce case-insensitive uniqueness.
-- Application code always persists lower(trim(email)); this migration hardens the DB.

-- 1) Lower-case rows that would not collide with another account.
UPDATE "User" AS u
SET email = lower(trim(u.email))
WHERE u.email <> lower(trim(u.email))
  AND NOT EXISTS (
    SELECT 1
    FROM "User" AS o
    WHERE o.id <> u.id
      AND lower(trim(o.email)) = lower(trim(u.email))
  );

-- 2) Fail loudly if case-variant duplicates remain (manual resolve required).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    GROUP BY lower(trim(email))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate User.email values after case-folding; resolve before applying this migration';
  END IF;
END $$;

-- 3) Canonicalise any remaining mixed-case singles.
UPDATE "User"
SET email = lower(trim(email))
WHERE email <> lower(trim(email));

-- 4) Functional unique index — defence in depth if a future write skips normalisation.
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_uidx"
  ON "User" ((lower(email)));
