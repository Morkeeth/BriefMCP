// Shared authentication utilities for edge functions
// Supports multi-org auth with backward compatibility

import { SupabaseClient } from '@supabase/supabase-js';

export interface AuthResult {
    success: boolean;
    userId?: string;
    orgId?: string;
    email?: string;
    role?: string;
    error?: string;
}

export interface AuthOptions {
    /** If provided, resolve to this specific org (by ref or id) */
    orgRef?: string;
    /** Require a specific org context */
    requireOrg?: boolean;
}

/**
 * Authenticate a request using x-mcp-token header or Bearer JWT
 * Supports both new organization_members.api_key and legacy users.mcp_token
 *
 * @param supabase - Supabase client with service role
 * @param req - The incoming request
 * @param options - Optional auth options
 */
export async function authenticateRequest(
    supabase: SupabaseClient,
    req: Request,
    options: AuthOptions = {}
): Promise<AuthResult> {
    const { orgRef, requireOrg = true } = options;

    let userId: string | null = null;
    let orgId: string | null = null;
    let email: string | null = null;
    let role: string | null = null;

    // Try x-mcp-token header first (MCP clients)
    // Single API key per user - looks up in users.mcp_token
    const mcpToken = req.headers.get('x-mcp-token');
    if (mcpToken) {
        console.log('[Auth] Authenticating via x-mcp-token (user API key)');

        // Look up user by their single API key
        const { data: userData, error: userError } = await supabase
            .rpc('get_user_by_api_key', { p_api_key: mcpToken });

        if (userData && userData.length > 0) {
            userId = userData[0].user_id;
            orgId = userData[0].default_org_id;
            email = userData[0].user_email;
            role = userData[0].default_org_role;
            console.log('[Auth] Found user via API key:', { userId, orgId, role });
        } else {
            // Fallback: direct lookup in users.mcp_token
            const { data: userDirect, error: directError } = await supabase
                .from('users')
                .select('id, org_id, email, role')
                .eq('mcp_token', mcpToken)
                .single();

            if (userDirect) {
                userId = userDirect.id;
                orgId = userDirect.org_id;
                email = userDirect.email;
                role = userDirect.role;
                console.log('[Auth] Found user via direct mcp_token lookup:', { userId, orgId, role });
            }
        }
    }

    // Try Bearer token (JWT) if no user found yet
    if (!userId) {
        const authHeader = req.headers.get('authorization');
        if (authHeader?.startsWith('Bearer ')) {
            console.log('[Auth] Authenticating via Bearer token');
            const token = authHeader.replace('Bearer ', '');

            // Verify JWT and get user
            const { data: { user }, error: authError } = await supabase.auth.getUser(token);

            if (user && !authError) {
                userId = user.id;
                email = user.email || null;

                // Get user's default org from organization_members
                const { data: defaultOrg } = await supabase
                    .from('organization_members')
                    .select('org_id, role')
                    .eq('user_id', userId)
                    .eq('is_default', true)
                    .single();

                if (defaultOrg) {
                    orgId = defaultOrg.org_id;
                    role = defaultOrg.role;
                } else {
                    // Fallback to users table
                    const { data: userData } = await supabase
                        .from('users')
                        .select('org_id, role')
                        .eq('id', userId)
                        .single();

                    if (userData) {
                        orgId = userData.org_id;
                        role = userData.role;
                    }
                }
                console.log('[Auth] Found via JWT:', { userId, orgId, role });
            }
        }
    }

    if (!userId) {
        return {
            success: false,
            error: 'Unauthorized. Provide x-mcp-token header or Bearer token.',
        };
    }

    // If orgRef is provided, resolve to that specific org
    if (orgRef && userId) {
        console.log('[Auth] Resolving org_ref:', orgRef);

        // Check if user is member of the requested org
        const { data: membership, error: membershipError } = await supabase
            .from('organization_members')
            .select('org_id, role, organizations!inner(id, ref, slug)')
            .eq('user_id', userId)
            .or(`organizations.ref.eq.${orgRef},organizations.slug.eq.${orgRef},organizations.id.eq.${orgRef}`)
            .single();

        if (membership) {
            orgId = membership.org_id;
            role = membership.role;
            console.log('[Auth] Resolved to org:', orgId);
        } else {
            // Try direct lookup by org ID/ref and check membership separately
            const { data: org } = await supabase
                .from('organizations')
                .select('id')
                .or(`ref.eq.${orgRef},slug.eq.${orgRef},id.eq.${orgRef}`)
                .single();

            if (org) {
                const { data: isMember } = await supabase
                    .from('organization_members')
                    .select('org_id, role')
                    .eq('user_id', userId)
                    .eq('org_id', org.id)
                    .single();

                if (isMember) {
                    orgId = isMember.org_id;
                    role = isMember.role;
                    console.log('[Auth] Resolved to org via separate lookup:', orgId);
                } else {
                    return {
                        success: false,
                        error: `Not a member of organization: ${orgRef}`,
                    };
                }
            } else {
                return {
                    success: false,
                    error: `Organization not found: ${orgRef}`,
                };
            }
        }
    }

    if (requireOrg && !orgId) {
        return {
            success: false,
            error: 'User has no organization. Please join an organization first.',
        };
    }

    return {
        success: true,
        userId: userId || undefined,
        orgId: orgId || undefined,
        email: email || undefined,
        role: role || undefined,
    };
}

/**
 * Extract org_ref from request body or query params
 */
export function extractOrgRef(req: Request, body?: Record<string, unknown>): string | undefined {
    // From body
    if (body?.org_ref && typeof body.org_ref === 'string') {
        return body.org_ref;
    }

    // From query params
    const url = new URL(req.url);
    const orgRefParam = url.searchParams.get('org_ref');
    if (orgRefParam) {
        return orgRefParam;
    }

    return undefined;
}
