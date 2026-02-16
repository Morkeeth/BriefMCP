// Edge Function: ingest-context
// Ingests documents into the knowledge base with chunking and embedding
// Auth: Bearer JWT token OR x-mcp-token header
// Supports org_ref parameter to ingest to specific organization

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Chunker } from './chunker.ts';
import { Embedder } from './embedder.ts';

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

        // Try slug first (most reliable), then ref, then id
        let org = null;

        const { data: orgBySlug } = await supabase
            .from('organizations')
            .select('id, slug, ref')
            .eq('slug', orgRef)
            .single();

        if (orgBySlug) {
            org = orgBySlug;
            console.log('[Auth] Found org by slug:', org);
        } else {
            // Try ref
            const { data: orgByRef } = await supabase
                .from('organizations')
                .select('id, slug, ref')
                .eq('ref', orgRef)
                .single();

            if (orgByRef) {
                org = orgByRef;
                console.log('[Auth] Found org by ref:', org);
            } else {
                // Try id
                const { data: orgById } = await supabase
                    .from('organizations')
                    .select('id, slug, ref')
                    .eq('id', orgRef)
                    .single();

                if (orgById) {
                    org = orgById;
                    console.log('[Auth] Found org by id:', org);
                }
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

    return {
        success: true,
        userId: userId || undefined,
        orgId: orgId || undefined,
        role: role || undefined,
    };
}

// Extract org_ref from various sources
function extractOrgRef(req: Request, body: Record<string, unknown>): string | undefined {
    // From body
    if (body.org_ref && typeof body.org_ref === 'string') return body.org_ref;
    // From query params
    const url = new URL(req.url);
    const queryOrgRef = url.searchParams.get('org_ref');
    if (queryOrgRef) return queryOrgRef;
    // From header
    const headerOrgRef = req.headers.get('x-org-ref');
    if (headerOrgRef) return headerOrgRef;
    return undefined;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mcp-token',
};

Deno.serve(async (req) => {
    console.log('=== [Ingest] Request received ===');
    console.log('[Ingest] Method:', req.method);
    console.log('[Ingest] URL:', req.url);

    // Log all headers (masking sensitive values)
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'authorization') {
            headers[key] = value ? `Bearer ${value.substring(0, 20)}...` : 'MISSING';
        } else if (key.toLowerCase() === 'apikey') {
            headers[key] = value ? `${value.substring(0, 10)}...` : 'MISSING';
        } else {
            headers[key] = value;
        }
    });
    console.log('[Ingest] Headers:', JSON.stringify(headers, null, 2));

    // Handle CORS
    if (req.method === 'OPTIONS') {
        console.log('[Ingest] CORS preflight - returning ok');
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Parse body
        let body;
        try {
            body = await req.json();
            console.log('[Ingest] Body parsed successfully');
            console.log('[Ingest] Body keys:', Object.keys(body));
        } catch (parseError) {
            console.error('[Ingest] ERROR: Failed to parse JSON body:', parseError);
            return new Response(
                JSON.stringify({ error: 'Invalid JSON body' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { content, title, org_id, org_ref, source_type } = body;
        console.log('[Ingest] Received - title:', title, 'org_id:', org_id, 'org_ref:', org_ref, 'content length:', content?.length || 0);

        if (!content) {
            return new Response(
                JSON.stringify({ error: 'Missing content' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        console.log('[Ingest] SUPABASE_URL present:', !!supabaseUrl);
        console.log('[Ingest] SERVICE_ROLE_KEY present:', !!serviceRoleKey);

        if (!supabaseUrl || !serviceRoleKey) {
            console.error('[Ingest] ERROR: Missing Supabase environment variables');
            return new Response(
                JSON.stringify({ error: 'Server Config Error: Missing Supabase credentials' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabaseClient = createClient(
            supabaseUrl,
            serviceRoleKey,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                }
            }
        );
        console.log('[Ingest] Supabase client created');

        // Authenticate user (supports x-mcp-token and Bearer JWT)
        // Use org_ref from body, or org_id as fallback for backward compatibility
        const resolvedOrgRef = org_ref || extractOrgRef(req, body) || org_id;
        const authResult = await authenticateRequest(supabaseClient, req, { orgRef: resolvedOrgRef });

        if (!authResult.success) {
            console.error('[Ingest] Auth failed:', authResult.error);
            return new Response(
                JSON.stringify({ error: authResult.error }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { userId, orgId: authenticatedOrgId } = authResult;
        console.log('[Ingest] Authenticated:', { userId, authenticatedOrgId });

        // Use authenticated org, or verify provided org_id matches user's org
        let targetOrgId = authenticatedOrgId;
        if (org_id && org_id !== authenticatedOrgId) {
            // Verify user has access to the specified org_id
            const { data: membership } = await supabaseClient
                .from('organization_members')
                .select('org_id')
                .eq('user_id', userId)
                .eq('org_id', org_id)
                .single();

            if (membership) {
                targetOrgId = org_id;
            } else {
                // Fallback: check users table for backward compatibility
                const { data: userData } = await supabaseClient
                    .from('users')
                    .select('org_id')
                    .eq('id', userId)
                    .eq('org_id', org_id)
                    .single();

                if (userData) {
                    targetOrgId = org_id;
                } else {
                    return new Response(
                        JSON.stringify({ error: 'Access denied - not a member of the specified organization' }),
                        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }
            }
        }

        if (!targetOrgId) {
            return new Response(
                JSON.stringify({ error: 'No organization specified and user has no default organization' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[Ingest] Target org_id:', targetOrgId);

        // Initialize OpenAI embedder
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
        console.log('[Ingest] OPENAI_API_KEY present:', !!openaiApiKey);
        if (!openaiApiKey) {
            console.error('[Ingest] ERROR: Missing OPENAI_API_KEY');
            return new Response(
                JSON.stringify({ error: 'Server Config Error: Missing OPENAI_API_KEY' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const embedder = new Embedder(openaiApiKey);
        console.log('[Ingest] Embedder initialized');

        // Process Content
        console.log('[Ingest] Processing content...');
        console.log(`[Ingest] Processing "${title}" for Org ${targetOrgId}...`);

        // Chunk
        console.log('[Ingest] Starting chunking...');
        const chunks = Chunker.chunk(content);
        console.log(`[Ingest] Created ${chunks.length} chunks`);

        // Embed
        console.log('[Ingest] Starting embedding...');
        const texts = chunks.map(c => c.content);
        const embeddings = await embedder.embedBytes(texts);
        console.log(`[Ingest] Generated ${embeddings.length} embeddings, first embedding dim: ${embeddings[0]?.length}`);

        // Store (Transactional-ish)
        console.log('[Ingest] Storing in database...');
        const { data: doc, error: docError } = await supabaseClient
            .from('context_documents')
            .insert({
                org_id: targetOrgId,
                title: title || 'Untitled',
                source_type: source_type || 'edge_function',
                content: content,
                created_by: userId,
            })
            .select('id')
            .single();

        if (docError) {
            console.error('[Ingest] ERROR: Failed to insert document:', docError);
            throw new Error(`DB Error (Doc): ${docError.message}`);
        }
        console.log('[Ingest] Document inserted with ID:', doc.id);

        const chunkRecords = chunks.map((chunk, i) => ({
            document_id: doc.id,
            org_id: targetOrgId,
            content: chunk.content,
            embedding: embeddings[i],
            chunk_index: chunk.chunkIndex,
            metadata: chunk.metadata,
        }));

        console.log('[Ingest] Inserting', chunkRecords.length, 'chunks...');
        const { error: chunkError } = await supabaseClient
            .from('document_chunks')
            .insert(chunkRecords);

        if (chunkError) {
            console.error('[Ingest] ERROR: Failed to insert chunks:', chunkError);
            await supabaseClient.from('context_documents').delete().eq('id', doc.id);
            throw new Error(`DB Error (Chunks): ${chunkError.message}`);
        }
        console.log('[Ingest] All chunks inserted successfully');

        console.log('=== [Ingest] SUCCESS ===');
        return new Response(
            JSON.stringify({
                success: true,
                documentId: doc.id,
                chunks: chunks.length,
                org_id: targetOrgId
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('=== [Ingest] FATAL ERROR ===');
        console.error('[Ingest] Error type:', error?.constructor?.name);
        console.error('[Ingest] Error message:', error instanceof Error ? error.message : String(error));
        console.error('[Ingest] Error stack:', error instanceof Error ? error.stack : 'No stack');
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
