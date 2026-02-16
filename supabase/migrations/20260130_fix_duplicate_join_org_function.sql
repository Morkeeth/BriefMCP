-- =============================================================================
-- Fix duplicate join_organization_by_code functions causing PGRST203 error
-- PostgREST cannot distinguish between VARCHAR and TEXT parameter types
-- =============================================================================

-- Drop the TEXT version (keep VARCHAR veersion)
DROP FUNCTION IF EXISTS join_organization_by_code(TEXT, UUID);
