-- Migration: Ensure all organizations have a unique ref for URL routing
-- Format: /dashboard/org/[ref]

-- =============================================================================
-- 1. Backfill refs for any organizations missing them
-- =============================================================================

-- Generate a short unique ref for orgs without one
UPDATE organizations
SET ref = LOWER(
    SUBSTRING(
        REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '', 'g')
        FROM 1 FOR 8
    )
) || '-' || SUBSTRING(id::text FROM 1 FOR 8)
WHERE ref IS NULL;

-- Ensure ref is not null for new inserts
ALTER TABLE organizations ALTER COLUMN ref SET NOT NULL;

-- =============================================================================
-- 2. Add unique constraint on ref if not exists
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'organizations_ref_key'
    ) THEN
        ALTER TABLE organizations ADD CONSTRAINT organizations_ref_key UNIQUE (ref);
    END IF;
END $$;

-- =============================================================================
-- 3. Create index on ref for fast lookups
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_organizations_ref ON organizations(ref);

-- =============================================================================
-- 4. Comments
-- =============================================================================
COMMENT ON COLUMN organizations.ref IS 'Short unique identifier used in URLs: /dashboard/org/[ref]';
