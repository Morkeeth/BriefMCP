// Edge Function: list-documents
// Lists all documents for an organization
// Auth: x-mcp-token header (organization_members.api_key or users.mcp_token) OR Bearer JWT
// Supports org_ref parameter to query specific organization

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Inline auth helper
async function authenticateRequest(
    supabase: SupabaseClient,
    req: Request,
    options?: { orgRef?: string }
): Promise<{ success: boolean; userId?: string; orgId?: string; role?: string; error?: string }> {
    let userId: string | null = null;
    let orgId: string | null = null;
    let role: string | null = null;

    // Try x-mcp-token header first (MCP clients)
    // Single API key per user - lookup directly in users.mcp_token
    const mcpToken = req.headers.get('x-mcp-token');
    if (mcpToken) {
        // Look up user by their single API key
        const { data: userData } = await supabase
            .from('users')
            .select('id, org_id, role')
            .eq('mcp_token', mcpToken)
            .single();

        if (userData) {
            userId = userData.id;
            orgId = userData.org_id; // Default org, will be overridden by orgRef if provided
            role = userData.role;
        }
    }

    // Try Bearer token (JWT) if no user found yet
    if (!userId) {
        const authHeader = req.headers.get('authorization');
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.replace('Bearer ', '');
            const { data: { user } } = await supabase.auth.getUser(token);

            if (user) {
                userId = user.id;
                // Get user's default org
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
            }
        }
    }

    if (!userId) {
        return { success: false, error: 'Unauthorized. Provide x-mcp-token header or Bearer token.' };
    }

    // If orgRef is provided, resolve to that specific org
    const orgRef = options?.orgRef;
    if (orgRef && userId) {
        console.log('[Auth] Resolving orgRef:', orgRef);

        // Try to find org by slug first (most common), then ref, then id
        let org = null;

        // Try slug
        const { data: orgBySlug } = await supabase
            .from('organizations')
            .select('id, slug, ref')
            .eq('slug', orgRef)
            .single();

        if (orgBySlug) {
            org = orgBySlug;
            console.log('[Auth] Found org by slug:', org);
        } else {
            // Try ref or id
            const { data: orgByRef } = await supabase
                .from('organizations')
                .select('id, slug, ref')
                .or(`ref.eq.${orgRef},id.eq.${orgRef}`)
                .single();

            if (orgByRef) {
                org = orgByRef;
                console.log('[Auth] Found org by ref/id:', org);
            }
        }

        if (org) {
            const { data: isMember } = await supabase
                .from('organization_members')
                .select('org_id, role')
                .eq('user_id', userId)
                .eq('org_id', org.id)
                .single();

            console.log('[Auth] Membership check:', { orgId: org.id, isMember });

            if (isMember) {
                orgId = isMember.org_id;
                role = isMember.role;
                console.log('[Auth] Resolved to org:', orgId);
            } else {
                return { success: false, error: `Not a member of organization: ${orgRef}` };
            }
        } else {
            console.log('[Auth] Organization not found for orgRef:', orgRef);
            return { success: false, error: `Organization not found: ${orgRef}` };
        }
    }

    console.log('[Auth] Final orgId:', orgId);

    return {
        success: true,
        userId: userId || undefined,
        orgId: orgId || undefined,
        role: role || undefined,
    };
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mcp-token',
};

Deno.serve(async (req) => {
    console.log('=== [ListDocs] Request received ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                }
            }
        );

        // Get org_ref from query params
        const url = new URL(req.url);
        const orgRef = url.searchParams.get('org_ref') || undefined;
        const limit = parseInt(url.searchParams.get('limit') || '20');

        // Authenticate user (supports x-mcp-token and Bearer JWT)
        const authResult = await authenticateRequest(supabaseClient, req, { orgRef });

        if (!authResult.success) {
            console.log('[ListDocs] Auth failed:', authResult.error);
            return new Response(
                JSON.stringify({ error: authResult.error }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { userId, orgId } = authResult;
        console.log('[ListDocs] Authenticated:', { userId, orgId });

        if (!orgId) {
            return new Response(
                JSON.stringify({ error: 'User has no organization' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // List documents from organization
        const { data: documents, error: docsError } = await supabaseClient
            .from('context_documents')
            .select('id, title, content, created_at')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false })
            .limit(limit);

        console.log('[ListDocs] Documents found:', documents?.length || 0);

        if (docsError) {
            console.error('[ListDocs] Error:', docsError);
            throw new Error(`Error fetching documents: ${docsError.message}`);
        }

        // Format response for MCP
        const formattedDocs = (documents || []).map(doc => ({
            id: doc.id,
            title: doc.title || 'Untitled',
            snippet: doc.content ? doc.content.substring(0, 150) + '...' : '',
            created_at: doc.created_at
        }));

        return new Response(
            JSON.stringify({
                documents: formattedDocs,
                org_id: orgId
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[ListDocs] Error:', error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
