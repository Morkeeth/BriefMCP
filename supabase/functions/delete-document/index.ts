// Edge Function: delete-document
// Supprime un document (seulement si appartient a l'org de l'utilisateur)
// Auth: x-mcp-token header (organization_members.api_key or users.mcp_token) OR Bearer JWT
// Supports org_reff parameter to specify organization context

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mcp-token',
};

// Inline auth helper
async function authenticateRequest(
    supabase: SupabaseClient,
    req: Request,
    orgRef?: string
): Promise<{ success: boolean; userId?: string; orgId?: string; role?: string; error?: string }> {
    let userId: string | null = null;
    let orgId: string | null = null;
    let role: string | null = null;

    // Try x-mcp-token header first (MCP clients)
    // Single API key per user - lookup directly in users.mcp_token
    const mcpToken = req.headers.get('x-mcp-token');
    if (mcpToken) {
        const { data: userData } = await supabase
            .from('users')
            .select('id, org_id, role')
            .eq('mcp_token', mcpToken)
            .single();

        if (userData) {
            userId = userData.id;
            orgId = userData.org_id;
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
    if (orgRef && userId) {
        // Try slug first, then ref/id
        let org = null;

        const { data: orgBySlug } = await supabase
            .from('organizations')
            .select('id')
            .eq('slug', orgRef)
            .single();

        if (orgBySlug) {
            org = orgBySlug;
        } else {
            const { data: orgByRef } = await supabase
                .from('organizations')
                .select('id')
                .or(`ref.eq.${orgRef},id.eq.${orgRef}`)
                .single();
            if (orgByRef) org = orgByRef;
        }

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
            } else {
                return { success: false, error: `Not a member of organization: ${orgRef}` };
            }
        } else {
            return { success: false, error: `Organization not found: ${orgRef}` };
        }
    }

    return {
        success: true,
        userId: userId || undefined,
        orgId: orgId || undefined,
        role: role || undefined,
    };
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { document_id, org_ref } = body;

        if (!document_id) {
            return new Response(
                JSON.stringify({ error: 'Missing document_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { persistSession: false, autoRefreshToken: false } }
        );

        // Authenticate user (supports x-mcp-token and Bearer JWT)
        const authResult = await authenticateRequest(supabase, req, org_ref);

        if (!authResult.success) {
            return new Response(
                JSON.stringify({ error: authResult.error }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { userId, orgId, role } = authResult;

        if (!orgId) {
            return new Response(
                JSON.stringify({ error: 'User has no organization' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Viewers cannot delete documents
        if (role === 'viewer') {
            return new Response(
                JSON.stringify({ error: 'Viewers cannot delete documents' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { data: doc, error: docError } = await supabase
            .from('context_documents')
            .select('id, org_id, title')
            .eq('id', document_id)
            .single();

        if (docError || !doc) {
            return new Response(
                JSON.stringify({ error: 'Document not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (doc.org_id !== orgId) {
            return new Response(
                JSON.stringify({ error: 'Access denied - document belongs to another organization' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        await supabase
            .from('document_chunks')
            .delete()
            .eq('document_id', document_id);

        const { error: deleteError } = await supabase
            .from('context_documents')
            .delete()
            .eq('id', document_id);

        if (deleteError) {
            return new Response(
                JSON.stringify({ error: `Delete error: ${deleteError.message}` }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({
                success: true,
                deleted_id: document_id,
                title: doc.title
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Delete error:', error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
