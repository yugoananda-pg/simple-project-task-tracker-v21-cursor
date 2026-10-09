-- Wave 4C-3: portfolio notes, and row-level security on the three Wave 4C tables
-- that were created without it. The app reaches Postgres through Prisma only;
-- RLS with no policy keeps the Supabase REST API (anon key) from reading them.

CREATE TABLE "PortfolioNote" (
    "id" UUID NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" UUID NOT NULL,

    CONSTRAINT "PortfolioNote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PortfolioNote_scopeKey_format" CHECK (
        "scopeKey" = 'ALL'
        OR "scopeKey" ~ '^PM:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ),
    CONSTRAINT "PortfolioNote_bodyHtml_length" CHECK (char_length("bodyHtml") <= 20000)
);

CREATE UNIQUE INDEX "PortfolioNote_scopeKey_key" ON "PortfolioNote"("scopeKey");

ALTER TABLE "PortfolioNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalyticsNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskProgressEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomAssignee" ENABLE ROW LEVEL SECURITY;

-- Same ceiling for the existing per-project note.
ALTER TABLE "AnalyticsNote"
    ADD CONSTRAINT "AnalyticsNote_bodyHtml_length" CHECK (char_length("bodyHtml") <= 20000);
