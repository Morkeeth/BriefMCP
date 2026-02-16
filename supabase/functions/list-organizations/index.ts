// Edge Function: list-organizations
// Lists all organizations a user belongs to
// Auth: x-mcp-token header (api_key from organization_members) OR Bearer JWT

import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mcp-token',
};

interface OrganizationMembership {
    id: string;
    name: string;
    slug: string;
    ref: string | null;
    invite_code: string;
    role: string;
    api_key: string;
    is_default: boolean;
    member_count: number;
    joined_at: string;
}

Deno.serve(async (req) => {
    console.log('=== [ListOrgs] Request received ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                }
            }
        );

        let userId: string | null = null;

        // Try x-mcp-token header first (MCP clients)
        const mcpToken = req.headers.get('x-mcp-token');
        if (mcpToken) {
            console.log('[ListOrgs] Authenticating via x-mcp-token');

            // First try organization_members.api_key (new)
            const { data: membership, error: membershipError } = await supabase
                .rpc('get_membership_by_api_key', { p_api_key: mcpToken });

            if (membership && membership.length > 0) {
                userId = membership[0].user_id;
                console.log('[ListOrgs] Found user via organization_members:', userId);
            } else {
                // Fallback to users.mcp_token (backward compatibility)
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('id')
                    .eq('mcp_token', mcpToken)
                    .single();

                if (userData) {
                    userId = userData.id;
                    console.log('[ListOrgs] Found user via users.mcp_token (legacy):', userId);
                }
            }
        }

        // Try Bearer token (JWT) if no user found yet
        if (!userId) {
            const authHeader = req.headers.get('authorization');
            if (authHeader?.startsWith('Bearer ')) {
                console.log('[ListOrgs] Authenticating via Bearer token');
                const token = authHeader.replace('Bearer ', '');

                // Verify JWT and get user
                const { data: { user }, error: authError } = await supabase.auth.getUser(token);

                if (user && !authError) {
                    userId = user.id;
                    console.log('[ListOrgs] Found user via JWT:', userId);
                }
            }
        }

        if (!userId) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized. Provide x-mcp-token or Bearer token.' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Get all organizations for this user
        const { data: organizations, error: orgsError } = await supabase
            .rpc('get_user_organizations', { p_user_id: userId });

        if (orgsError) {
            console.error('[ListOrgs] Error fetching organizations:', orgsError);
            return new Response(
                JSON.stringify({ error: `Error fetching organizations: ${orgsError.message}` }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const orgs = (organizations || []) as OrganizationMembership[];

        console.log(`[ListOrgs] Found ${orgs.length} organizations for user ${userId}`);

        return new Response(
            JSON.stringify({
                organizations: orgs.map(org => ({
                    id: org.id,
                    name: org.name,
                    slug: org.slug,
                    ref: org.ref || org.slug,
                    invite_code: org.invite_code,
                    role: org.role,
                    api_key: org.api_key,
                    is_default: org.is_default,
                    member_count: org.member_count,
                    joined_at: org.joined_at,
                })),
                user_id: userId,
                total_count: orgs.length,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[ListOrgs] Error:', error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
