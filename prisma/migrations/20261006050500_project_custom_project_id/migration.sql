-- Optional human-facing Custom Project ID (Edit Project / project hub header).
ALTER TABLE "Project" ADD COLUMN "customProjectId" TEXT NOT NULL DEFAULT '';
