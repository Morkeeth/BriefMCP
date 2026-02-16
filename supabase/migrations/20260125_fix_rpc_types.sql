-- Migration: Fix RPC function return types and sync missing memberships
-- Problem 1: get_user_organizations returns VARCHAR but table has TEXT columns
-- Problem 2: API keys should have 'brf_' prefix
-- Solution: Use TEXT for all string return types, add brf_ prefix to api keys

-- =============================================================================
-- 1. Fix get_user_organizations return types
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
    api_key TEXT,
    is_default BOOLEAN,
    member_count BIGINT,
    joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        o.id,
        o.name::TEXT,
        o.slug::TEXT,
        o.ref::TEXT,
        o.invite_code::TEXT,
        om.role::TEXT,
        om.api_key::TEXT,
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
-- 2. Fix create_organization_for_user to handle is_default properly + brf_ prefix
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
    v_api_key VARCHAR(64);
BEGIN
    v_invite_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    v_ref := SUBSTRING(org_slug FROM 1 FOR 50);
    -- Generate API key with brf_ prefix
    v_api_key := 'brf_' || encode(gen_random_bytes(20), 'hex');

    INSERT INTO organizations (name, slug, ref, invite_code)
    VALUES (org_name, org_slug, v_ref, v_invite_code)
    RETURNING * INTO v_org;

    -- Clear is_default on all existing memberships for this user
    UPDATE organization_members
    SET is_default = FALSE
    WHERE organization_members.user_id = create_organization_for_user.user_id;

    INSERT INTO organization_members (user_id, org_id, role, is_default, api_key)
    VALUES (user_id, v_org.id, 'admin', TRUE, v_api_key);

    UPDATE users
    SET org_id = v_org.id, role = 'admin', mcp_token = v_api_key
    WHERE id = user_id;

    RETURN NEXT v_org;
END;
$$;

GRANT EXECUTE ON FUNCTION create_organization_for_user(TEXT, TEXT, UUID) TO authenticated;

-- =============================================================================
-- 3. Fix join_organization_by_code to use brf_ prefix
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
    v_api_key VARCHAR(64);
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

    -- Generate API key with brf_ prefix
    v_api_key := 'brf_' || encode(gen_random_bytes(20), 'hex');

    -- Create membership in organization_members
    -- Set as default only if user has no other orgs
    INSERT INTO organization_members (user_id, org_id, role, is_default, api_key)
    VALUES (join_organization_by_code.user_id, v_org_id, 'member', NOT v_has_existing_orgs, v_api_key);

    -- Update users table for backward compatibility (only if this is user's first org)
    IF NOT v_has_existing_orgs THEN
        UPDATE users
        SET org_id = v_org_id, role = 'member', mcp_token = v_api_key
        WHERE id = join_organization_by_code.user_id;
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION join_organization_by_code(VARCHAR, UUID) TO authenticated;

-- =============================================================================
-- 4. Sync missing memberships from users table (with brf_ prefix)
-- =============================================================================
INSERT INTO organization_members (user_id, org_id, role, is_default, api_key, joined_at)
SELECT
    u.id as user_id,
    u.org_id,
    COALESCE(u.role, 'member') as role,
    TRUE as is_default,
    CASE
        WHEN u.mcp_token IS NOT NULL AND u.mcp_token LIKE 'brf_%' THEN u.mcp_token
        WHEN u.mcp_token IS NOT NULL THEN 'brf_' || u.mcp_token
        ELSE 'brf_' || encode(gen_random_bytes(20), 'hex')
    END as api_key,
    COALESCE(u.created_at, NOW()) as joined_at
FROM users u
WHERE u.org_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.user_id = u.id AND om.org_id = u.org_id
  );

-- =============================================================================
-- 5. Fix existing api_keys that don't have brf_ prefix
-- =============================================================================
UPDATE organization_members
SET api_key = 'brf_' || SUBSTRING(api_key FROM 1 FOR 40)
WHERE api_key IS NOT NULL
  AND api_key NOT LIKE 'brf_%'
  AND LENGTH(api_key) > 40;

UPDATE users
SET mcp_token = 'brf_' || SUBSTRING(mcp_token FROM 1 FOR 40)
WHERE mcp_token IS NOT NULL
  AND mcp_token NOT LIKE 'brf_%'
  AND LENGTH(mcp_token) > 40;
