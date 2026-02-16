-- Migration: Single API key per user (not per organization)
-- This simplifies the API key model: one key per user to access all their orgs

-- =============================================================================
-- 0. Remove UNIQUE constraint on organization_members.api_key
-- Now the same API key (user's key) can be used across all their org memberships
-- =============================================================================
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_api_key_key;
DROP INDEX IF EXISTS idx_org_members_api_key;

-- Make api_key nullable in organization_members (it's now just a reference to user's key)
ALTER TABLE organization_members ALTER COLUMN api_key DROP NOT NULL;

-- =============================================================================
-- 1. Ensure users.mcp_token has brf_ prefix and is unique
-- =============================================================================

-- Add brf_ prefix to existing tokens that don't have it
UPDATE users
SET mcp_token = 'brf_' || encode(gen_random_bytes(20), 'hex')
WHERE mcp_token IS NULL;

UPDATE users
SET mcp_token = 'brf_' || mcp_token
WHERE mcp_token IS NOT NULL
  AND mcp_token NOT LIKE 'brf_%';

-- Make mcp_token unique (if not already)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'users_mcp_token_unique'
    ) THEN
        CREATE UNIQUE INDEX users_mcp_token_unique ON users(mcp_token) WHERE mcp_token IS NOT NULL;
    END IF;
END $$;

-- =============================================================================
-- 2. Create new function to get user by API key (returns user + all orgs)
-- =============================================================================
DROP FUNCTION IF EXISTS get_user_by_api_key(VARCHAR);

CREATE OR REPLACE FUNCTION get_user_by_api_key(p_api_key VARCHAR(64))
RETURNS TABLE (
    user_id UUID,
    user_email TEXT,
    default_org_id UUID,
    default_org_role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id as user_id,
        u.email::TEXT as user_email,
        u.org_id as default_org_id,
        u.role::TEXT as default_org_role
    FROM users u
    WHERE u.mcp_token = p_api_key;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_by_api_key(VARCHAR) TO authenticated, service_role;

-- =============================================================================
-- 3. Update create_organization_for_user to NOT create new api_key
-- =============================================================================
CREATE OR REPLACE FUNCTION create_organization_for_user(
    org_name TEXT,
    org_slug TEXT,
    user_id UUID
)
RETURNS SETOF organizations
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org organizations;
    v_invite_code VARCHAR(6);
    v_ref VARCHAR(50);
    v_user_api_key VARCHAR(64);
BEGIN
    v_invite_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    v_ref := SUBSTRING(org_slug FROM 1 FOR 50);

    -- Get user's existing API key (or create one if missing)
    SELECT mcp_token INTO v_user_api_key FROM users WHERE id = user_id;
    IF v_user_api_key IS NULL THEN
        v_user_api_key := 'brf_' || encode(gen_random_bytes(20), 'hex');
        UPDATE users SET mcp_token = v_user_api_key WHERE id = user_id;
    END IF;

    INSERT INTO organizations (name, slug, ref, invite_code)
    VALUES (org_name, org_slug, v_ref, v_invite_code)
    RETURNING * INTO v_org;

    -- Clear is_default on all existing memberships for this user
    UPDATE organization_members
    SET is_default = FALSE
    WHERE organization_members.user_id = create_organization_for_user.user_id;

    -- Insert membership (api_key is optional now, we keep user's api_key for backward compat)
    INSERT INTO organization_members (user_id, org_id, role, is_default, api_key)
    VALUES (user_id, v_org.id, 'admin', TRUE, v_user_api_key);

    -- Update users table
    UPDATE users
    SET org_id = v_org.id, role = 'admin'
    WHERE id = user_id;

    RETURN NEXT v_org;
END;
$$;

GRANT EXECUTE ON FUNCTION create_organization_for_user(TEXT, TEXT, UUID) TO authenticated;

-- =============================================================================
-- 4. Update join_organization_by_code to NOT create new api_key
-- =============================================================================
CREATE OR REPLACE FUNCTION join_organization_by_code(
    invite_code_input VARCHAR(6),
    user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id UUID;
    v_user_api_key VARCHAR(64);
    v_has_existing_orgs BOOLEAN;
BEGIN
    -- Find organization by invite code
    SELECT id INTO v_org_id
    FROM organizations
    WHERE invite_code = invite_code_input;

    IF v_org_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check if user already member
    IF EXISTS(SELECT 1 FROM organization_members WHERE organization_members.user_id = join_organization_by_code.user_id AND org_id = v_org_id) THEN
        RETURN TRUE; -- Already a member
    END IF;

    -- Check if user has any existing organizations
    SELECT EXISTS(
        SELECT 1 FROM organization_members WHERE organization_members.user_id = join_organization_by_code.user_id
    ) INTO v_has_existing_orgs;

    -- Get user's existing API key (or create one if missing)
    SELECT mcp_token INTO v_user_api_key FROM users WHERE id = join_organization_by_code.user_id;
    IF v_user_api_key IS NULL THEN
        v_user_api_key := 'brf_' || encode(gen_random_bytes(20), 'hex');
        UPDATE users SET mcp_token = v_user_api_key WHERE id = join_organization_by_code.user_id;
    END IF;

    -- Create membership (api_key is the user's single key)
    INSERT INTO organization_members (user_id, org_id, role, is_default, api_key)
    VALUES (join_organization_by_code.user_id, v_org_id, 'member', NOT v_has_existing_orgs, v_user_api_key);

    -- Update users table for backward compatibility (only if this is user's first org)
    IF NOT v_has_existing_orgs THEN
        UPDATE users
        SET org_id = v_org_id, role = 'member'
        WHERE id = join_organization_by_code.user_id;
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION join_organization_by_code(VARCHAR, UUID) TO authenticated;

-- =============================================================================
-- 5. Update get_user_organizations to return the user's single api_key
-- =============================================================================
DROP FUNCTION IF EXISTS get_user_organizations(UUID);

CREATE OR REPLACE FUNCTION get_user_organizations(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    slug TEXT,
    ref TEXT,
    invite_code TEXT,
    role TEXT,
    api_key TEXT,  -- This will be the same for all orgs (user's single key)
    is_default BOOLEAN,
    member_count BIGINT,
    joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_api_key TEXT;
BEGIN
    -- Get the user's single API key
    SELECT mcp_token INTO v_user_api_key FROM users WHERE users.id = p_user_id;

    RETURN QUERY
    SELECT
        o.id,
        o.name::TEXT,
        o.slug::TEXT,
        o.ref::TEXT,
        o.invite_code::TEXT,
        om.role::TEXT,
        v_user_api_key as api_key,  -- Same key for all orgs
        om.is_default,
        (SELECT COUNT(*) FROM organization_members WHERE org_id = o.id) as member_count,
        om.joined_at
    FROM organization_members om
    JOIN organizations o ON o.id = om.org_id
    WHERE om.user_id = p_user_id
    ORDER BY om.is_default DESC, om.joined_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_organizations(UUID) TO authenticated;

-- =============================================================================
-- 6. Sync all org_members to use user's single api_key
-- =============================================================================
UPDATE organization_members om
SET api_key = u.mcp_token
FROM users u
WHERE om.user_id = u.id
  AND u.mcp_token IS NOT NULL;

-- =============================================================================
-- 7. Comments
-- =============================================================================
COMMENT ON COLUMN users.mcp_token IS 'Single API key for this user. Used to access all their organizations via x-mcp-token header.';
