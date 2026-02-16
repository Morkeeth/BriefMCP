-- Migration: Fix infinite recursion in organization_members RLS policy
-- The policy "Users can view org memberships" was causing infinite recursion
-- by querying organization_members to check if user can view organization_members

-- =============================================================================
-- 1. Drop the problematic policy
-- =============================================================================
DROP POLICY IF EXISTS "Users can view org memberships" ON organization_members;

-- =============================================================================
-- 2. Recreate without recursion (uses users table instead)
-- =============================================================================
CREATE POLICY "Users can view org memberships" ON organization_members
    FOR SELECT USING (
        -- User can view their own memberships
        user_id = auth.uid()
        -- Or user can view memberships of orgs they belong to (via users table)
        OR org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
    );
