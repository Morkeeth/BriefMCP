-- Migration: Multi-Organization Support
-- This allows users to belong to multiple organizations with unique API keys per user-org

-- =============================================================================
-- 1. Add ref column to organizations (short unique identifier)
-- =============================================================================
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ref VARCHAR(50) UNIQUE;

-- Backfill ref from slug for existing organizations
UPDATE organizations
SET ref = SUBSTRING(slug FROM 1 FOR 50)
WHERE ref IS NULL AND slug IS NOT NULL;

-- =============================================================================
-- 2. Create organization_members junction table
-- =============================================================================
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
    api_key VARCHAR(64) UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_default BOOLEAN DEFAULT FALSE,
    UNIQUE(user_id, org_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_api_key ON organization_members(api_key);
CREATE INDEX IF NOT EXISTS idx_org_members_default ON organization_members(user_id, is_default) WHERE is_default = TRUE;

-- =============================================================================
-- 3. Migrate existing data from users table to organization_members
-- =============================================================================
INSERT INTO organization_members (user_id, org_id, role, is_default, api_key, joined_at)
SELECT
    id as user_id,
    org_id,
    COALESCE(role, 'member') as role,
    TRUE as is_default,
    COALESCE(mcp_token, encode(gen_random_bytes(32), 'hex')) as api_key,
    COALESCE(created_at, NOW()) as joined_at
FROM users
WHERE org_id IS NOT NULL
ON CONFLICT (user_id, org_id) DO NOTHING;

-- =============================================================================
-- 4. Create new RPC functions
-- =============================================================================

-- Get all organizations a user belongs to
CREATE OR REPLACE FUNCTION get_user_organizations(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    slug TEXT,
    ref VARCHAR(50),
    invite_code VARCHAR(6),
    role VARCHAR(20),
    api_key VARCHAR(64),
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
        o.name,
        o.slug,
        o.ref,
        o.invite_code,
        om.role,
        om.api_key,
        om.is_default,
        (SELECT COUNT(*) FROM organization_members WHERE org_id = o.id) as member_count,
        om.joined_at
    FROM organization_members om
    JOIN organizations o ON o.id = om.org_id
    WHERE om.user_id = p_user_id
    ORDER BY om.is_default DESC, om.joined_at ASC;
END;
$$;

-- Switch default organization
CREATE OR REPLACE FUNCTION switch_default_organization(p_user_id UUID, p_new_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_membership_exists BOOLEAN;
BEGIN
    -- Check if user is member of the new org
    SELECT EXISTS(
        SELECT 1 FROM organization_members
        WHERE user_id = p_user_id AND org_id = p_new_org_id
    ) INTO v_membership_exists;

    IF NOT v_membership_exists THEN
        RAISE EXCEPTION 'User is not a member of this organization';
    END IF;

    -- Remove default from all orgs for this user
    UPDATE organization_members
    SET is_default = FALSE
    WHERE user_id = p_user_id;

    -- Set new default
    UPDATE organization_members
    SET is_default = TRUE
    WHERE user_id = p_user_id AND org_id = p_new_org_id;

    -- Also update users table for backward compatibility
    UPDATE users
    SET org_id = p_new_org_id,
        role = (SELECT role FROM organization_members WHERE user_id = p_user_id AND org_id = p_new_org_id),
        mcp_token = (SELECT api_key FROM organization_members WHERE user_id = p_user_id AND org_id = p_new_org_id)
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$$;

-- Get user membership info from api_key (for edge function auth)
CREATE OR REPLACE FUNCTION get_membership_by_api_key(p_api_key VARCHAR(64))
RETURNS TABLE (
    user_id UUID,
    org_id UUID,
    role VARCHAR(20),
    user_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        om.user_id,
        om.org_id,
        om.role,
        u.email as user_email
    FROM organization_members om
    JOIN users u ON u.id = om.user_id
    WHERE om.api_key = p_api_key;
END;
$$;

-- =============================================================================
-- 5. Update existing RPC functions
-- =============================================================================

-- Drop existing functions first to allow changing return types
DROP FUNCTION IF EXISTS create_organization_for_user(text, text, uuid);
DROP FUNCTION IF EXISTS join_organization_by_code(varchar, uuid);

-- Update create_organization_for_user to also insert into organization_members
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
    -- Generate unique invite code
    v_invite_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');

    -- Generate ref from slug
    v_ref := SUBSTRING(org_slug FROM 1 FOR 50);

    -- Generate API key
    v_api_key := encode(gen_random_bytes(32), 'hex');

    -- Create organization
    INSERT INTO organizations (name, slug, ref, invite_code)
    VALUES (org_name, org_slug, v_ref, v_invite_code)
    RETURNING * INTO v_org;

    -- Create membership in organization_members (with api_key)
    INSERT INTO organization_members (user_id, org_id, role, is_default, api_key)
    VALUES (user_id, v_org.id, 'admin', TRUE, v_api_key);

    -- Also update users table for backward compatibility
    UPDATE users
    SET org_id = v_org.id, role = 'admin', mcp_token = v_api_key
    WHERE id = user_id;

    RETURN NEXT v_org;
END;
$$;

-- Update join_organization_by_code to also insert into organization_members
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
    IF EXISTS(SELECT 1 FROM organization_members WHERE user_id = join_organization_by_code.user_id AND org_id = v_org_id) THEN
        RETURN TRUE; -- Already a member
    END IF;

    -- Check if user has any existing organizations
    SELECT EXISTS(
        SELECT 1 FROM organization_members WHERE user_id = join_organization_by_code.user_id
    ) INTO v_has_existing_orgs;

    -- Generate API key
    v_api_key := encode(gen_random_bytes(32), 'hex');

    -- Create membership in organization_members
    -- Set as default only if user has no other orgs
    INSERT INTO organization_members (user_id, org_id, role, is_default, api_key)
    VALUES (user_id, v_org_id, 'member', NOT v_has_existing_orgs, v_api_key);

    -- Update users table for backward compatibility (only if this is user's first org or they don't have an org_id)
    IF NOT v_has_existing_orgs THEN
        UPDATE users
        SET org_id = v_org_id, role = 'member', mcp_token = v_api_key
        WHERE id = user_id;
    END IF;

    RETURN TRUE;
END;
$$;

-- =============================================================================
-- 6. Function to leave organization (updated for multi-org)
-- =============================================================================
CREATE OR REPLACE FUNCTION leave_organization(
    p_user_id UUID,
    p_org_id UUID DEFAULT NULL -- If NULL, leaves the default org
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id UUID;
    v_member_count INT;
    v_is_last_admin BOOLEAN;
    v_next_admin_id UUID;
    v_remaining_orgs INT;
    v_next_default_org_id UUID;
BEGIN
    -- Determine which org to leave
    IF p_org_id IS NULL THEN
        SELECT org_id INTO v_org_id
        FROM organization_members
        WHERE user_id = p_user_id AND is_default = TRUE;
    ELSE
        v_org_id := p_org_id;
    END IF;

    IF v_org_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'No organization to leave');
    END IF;

    -- Get member count for this org
    SELECT COUNT(*) INTO v_member_count
    FROM organization_members
    WHERE org_id = v_org_id;

    -- Check if user is the last admin
    SELECT
        (SELECT COUNT(*) FROM organization_members WHERE org_id = v_org_id AND role = 'admin') = 1
        AND EXISTS(SELECT 1 FROM organization_members WHERE org_id = v_org_id AND user_id = p_user_id AND role = 'admin')
    INTO v_is_last_admin;

    -- If last member, delete the organization and all its data
    IF v_member_count = 1 THEN
        -- Delete all document chunks
        DELETE FROM document_chunks
        WHERE document_id IN (SELECT id FROM context_documents WHERE org_id = v_org_id);

        -- Delete all documents
        DELETE FROM context_documents WHERE org_id = v_org_id;

        -- Delete membership
        DELETE FROM organization_members WHERE user_id = p_user_id AND org_id = v_org_id;

        -- Delete organization
        DELETE FROM organizations WHERE id = v_org_id;
    ELSE
        -- If last admin, promote the oldest non-admin member
        IF v_is_last_admin THEN
            SELECT user_id INTO v_next_admin_id
            FROM organization_members
            WHERE org_id = v_org_id AND user_id != p_user_id
            ORDER BY joined_at ASC
            LIMIT 1;

            IF v_next_admin_id IS NOT NULL THEN
                UPDATE organization_members
                SET role = 'admin'
                WHERE user_id = v_next_admin_id AND org_id = v_org_id;
            END IF;
        END IF;

        -- Remove membership
        DELETE FROM organization_members WHERE user_id = p_user_id AND org_id = v_org_id;
    END IF;

    -- Check remaining orgs for user
    SELECT COUNT(*) INTO v_remaining_orgs
    FROM organization_members
    WHERE user_id = p_user_id;

    IF v_remaining_orgs > 0 THEN
        -- Set a new default org if needed
        SELECT org_id INTO v_next_default_org_id
        FROM organization_members
        WHERE user_id = p_user_id AND is_default = TRUE;

        IF v_next_default_org_id IS NULL THEN
            -- No default, set the oldest membership as default
            UPDATE organization_members
            SET is_default = TRUE
            WHERE user_id = p_user_id
            AND org_id = (
                SELECT org_id FROM organization_members
                WHERE user_id = p_user_id
                ORDER BY joined_at ASC
                LIMIT 1
            );

            SELECT org_id INTO v_next_default_org_id
            FROM organization_members
            WHERE user_id = p_user_id AND is_default = TRUE;
        END IF;

        -- Update users table for backward compatibility
        UPDATE users
        SET org_id = v_next_default_org_id,
            role = (SELECT role FROM organization_members WHERE user_id = p_user_id AND org_id = v_next_default_org_id),
            mcp_token = (SELECT api_key FROM organization_members WHERE user_id = p_user_id AND org_id = v_next_default_org_id)
        WHERE id = p_user_id;
    ELSE
        -- No remaining orgs, clear users table
        UPDATE users
        SET org_id = NULL, role = NULL, mcp_token = NULL
        WHERE id = p_user_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'remaining_orgs', v_remaining_orgs,
        'new_default_org_id', v_next_default_org_id
    );
END;
$$;

-- =============================================================================
-- 7. Enable RLS on organization_members
-- =============================================================================
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own memberships
CREATE POLICY "Users can view own memberships" ON organization_members
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can view memberships of orgs they belong to
CREATE POLICY "Users can view org memberships" ON organization_members
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    );

-- Policy: Admins can insert memberships for their orgs
CREATE POLICY "Admins can add members" ON organization_members
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE user_id = auth.uid() AND org_id = organization_members.org_id AND role = 'admin'
        )
    );

-- Policy: Admins can update memberships for their orgs (except their own admin status)
CREATE POLICY "Admins can update members" ON organization_members
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE user_id = auth.uid() AND org_id = organization_members.org_id AND role = 'admin'
        )
    );

-- Policy: Users can delete their own memberships
CREATE POLICY "Users can leave orgs" ON organization_members
    FOR DELETE USING (user_id = auth.uid());

-- Grant execute on functions to authenticated users
GRANT EXECUTE ON FUNCTION get_user_organizations(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION switch_default_organization(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_membership_by_api_key(VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION leave_organization(UUID, UUID) TO authenticated;

-- =============================================================================
-- 8. Comments for documentation
-- =============================================================================
COMMENT ON TABLE organization_members IS 'Junction table for multi-org support. Each user-org relationship has a unique API key for MCP tracking.';
COMMENT ON COLUMN organization_members.api_key IS 'Unique API key for this user-org relationship. Used for MCP authentication.';
COMMENT ON COLUMN organization_members.is_default IS 'Whether this is the user default organization (only one per user should be true)';
COMMENT ON COLUMN organizations.ref IS 'Short unique identifier for the organization, used in API calls';
