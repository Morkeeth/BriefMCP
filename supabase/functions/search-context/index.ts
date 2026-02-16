// Edge Function: search-context
// Recherche dans la base de connaissances avec RAG
// Auth: x-mcp-token header (organization_members.api_key or users.mcp_token) OR Bearer JWT
// Model: configurable per organization
// Supports org_ref parameter to query specific organization

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

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
            } else {
                return { success: false, error: `Not a member of organization: ${orgRef}` };
            }
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

// =============================================================================
// Model Configuration
// =============================================================================

type LLMProvider =
    | 'qwen-72b'        // Intelligent - Qwen 2.5 72B
    | 'deepseek-v3'     // Reasoning - DeepSeek V3
    | 'qwen-coder'      // Code - Qwen 2.5 Coder 32B
    | 'mistral-small'   // Fast - Mistral Small 24B
    | 'mistral-nemo'    // Ultra fast - Mistral Nemo 12B
    | 'llama-70b'       // Balanced - Llama 3.3 70B
    | 'glm'             // Legacy - GLM 4.7
    | 'openai';         // Fallback - GPT-4o Mini

interface ModelConfig {
    displayName: string;
    description: string;
    category: 'fast' | 'balanced' | 'smart' | 'code' | 'reasoning';
    baseURL?: string;
    apiKeyEnv: string;
    model: string;
    maxTokens: number;
    temperature: number;
    topP?: number;
}

const MODEL_CONFIGS: Record<LLMProvider, ModelConfig> = {
    'mistral-nemo': {
        displayName: 'Mistral Nemo 12B',
        description: 'Ultra rapide, ideal pour des reponses simples',
        category: 'fast',
        baseURL: 'https://api.featherless.ai/v1',
        apiKeyEnv: 'FEATHERLESS_API_KEY',
        model: 'mistralai/Mistral-Nemo-Instruct-2407',
        maxTokens: 2048,
        temperature: 0.7,
        topP: 0.95,
    },
    'mistral-small': {
        displayName: 'Mistral Small 24B',
        description: 'Rapide et efficace, bon equilibre',
        category: 'fast',
        baseURL: 'https://api.featherless.ai/v1',
        apiKeyEnv: 'FEATHERLESS_API_KEY',
        model: 'mistralai/Mistral-Small-24B-Instruct-2501',
        maxTokens: 4096,
        temperature: 0.7,
        topP: 0.95,
    },
    'llama-70b': {
        displayName: 'Llama 3.3 70B',
        description: 'Modele Meta equilibre et polyvalent',
        category: 'balanced',
        baseURL: 'https://api.featherless.ai/v1',
        apiKeyEnv: 'FEATHERLESS_API_KEY',
        model: 'meta-llama/Llama-3.3-70B-Instruct',
        maxTokens: 4096,
        temperature: 0.7,
        topP: 0.95,
    },
    'qwen-72b': {
        displayName: 'Qwen 2.5 72B',
        description: 'Tres intelligent, excellent pour les taches complexes',
        category: 'smart',
        baseURL: 'https://api.featherless.ai/v1',
        apiKeyEnv: 'FEATHERLESS_API_KEY',
        model: 'Qwen/Qwen2.5-72B-Instruct',
        maxTokens: 4096,
        temperature: 0.7,
        topP: 0.95,
    },
    'deepseek-v3': {
        displayName: 'DeepSeek V3',
        description: 'Specialise dans le raisonnement et l\'analyse',
        category: 'reasoning',
        baseURL: 'https://api.featherless.ai/v1',
        apiKeyEnv: 'FEATHERLESS_API_KEY',
        model: 'deepseek-ai/DeepSeek-V3-0324',
        maxTokens: 4096,
        temperature: 0.7,
        topP: 0.95,
    },
    'qwen-coder': {
        displayName: 'Qwen 2.5 Coder 32B',
        description: 'Optimise pour le code et les taches techniques',
        category: 'code',
        baseURL: 'https://api.featherless.ai/v1',
        apiKeyEnv: 'FEATHERLESS_API_KEY',
        model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
        maxTokens: 4096,
        temperature: 0.5,
        topP: 0.95,
    },
    'glm': {
        displayName: 'GLM 4.7',
        description: 'Bon pour le raisonnement et le code',
        category: 'balanced',
        baseURL: 'https://api.featherless.ai/v1',
        apiKeyEnv: 'FEATHERLESS_API_KEY',
        model: 'zai-org/GLM-4.7',
        maxTokens: 4096,
        temperature: 0.7,
        topP: 0.95,
    },
    'openai': {
        displayName: 'GPT-4o Mini',
        description: 'Modele OpenAI fiable en fallback',
        category: 'balanced',
        apiKeyEnv: 'OPENAI_API_KEY',
        model: 'gpt-4o-mini',
        maxTokens: 1000,
        temperature: 0.1,
    },
};

// Default fallback order
const FALLBACK_ORDER: LLMProvider[] = ['mistral-small', 'qwen-72b', 'llama-70b', 'glm', 'openai'];

function getClient(provider: LLMProvider): OpenAI | null {
    const config = MODEL_CONFIGS[provider];
    const apiKey = Deno.env.get(config.apiKeyEnv);
    if (!apiKey) return null;
    return new OpenAI({ apiKey, baseURL: config.baseURL });
}

// =============================================================================
// Types
// =============================================================================

interface SearchResult {
    id: string;
    document_id: string;
    content: string;
    similarity: number;
}

// =============================================================================
// Main Handler
// =============================================================================

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { question, match_count = 5, match_threshold = 0.3, org_ref, stream = false } = body;

        if (!question) {
            return new Response(
                JSON.stringify({ error: 'Missing question' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { persistSession: false, autoRefreshToken: false } }
        );

        const openaiKey = Deno.env.get('OPENAI_API_KEY');
        if (!openaiKey) {
            return new Response(
                JSON.stringify({ error: 'Server config error: Missing OPENAI_API_KEY' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Authenticate user (supports x-mcp-token and Bearer JWT)
        const resolvedOrgRef = org_ref || extractOrgRef(req, body);
        const authResult = await authenticateRequest(supabase, req, { orgRef: resolvedOrgRef });

        if (!authResult.success) {
            return new Response(
                JSON.stringify({ error: authResult.error }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { userId, orgId } = authResult;

        if (!orgId) {
            return new Response(
                JSON.stringify({ error: 'User has no organization. Please join an organization first.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Get user's preferred LLM model for this organization
        const { data: memberPrefs } = await supabase
            .from('organization_members')
            .select('llm_model')
            .eq('user_id', userId)
            .eq('org_id', orgId)
            .single();

        const preferredProvider: LLMProvider = (memberPrefs?.llm_model as LLMProvider) || 'mistral-small';

        const startTime = Date.now();

        // Generate embedding for the question
        const openai = new OpenAI({ apiKey: openaiKey });
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: question,
        });
        const queryEmbedding = embeddingResponse.data[0].embedding;

        // Search for matching documents
        const { data: chunks, error: searchError } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: match_threshold,
            match_count: match_count,
            filter_org_id: orgId,
        });

        if (searchError) {
            console.error('Search error:', searchError);
            return new Response(
                JSON.stringify({ error: `Search error: ${searchError.message}` }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const results = (chunks || []) as SearchResult[];

        if (results.length === 0) {
            if (stream) {
                const encoder = new TextEncoder();
                const noResultStream = new ReadableStream({
                    start(controller) {
                        controller.enqueue(encoder.encode(`event: sources\ndata: ${JSON.stringify({ sources: [] })}\n\n`));
                        controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify({ content: "Je n'ai pas trouve d'informations pertinentes dans la base de connaissances pour repondre a cette question." })}\n\n`));
                        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ model: 'none', processingTime: Date.now() - startTime })}\n\n`));
                        controller.close();
                    }
                });
                return new Response(noResultStream, {
                    headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
                });
            }
            return new Response(
                JSON.stringify({
                    answer: "Je n'ai pas trouve d'informations pertinentes dans la base de connaissances pour repondre a cette question.",
                    sources: [],
                    metadata: {
                        documents_found: 0,
                        processing_time_ms: Date.now() - startTime,
                        model: 'none',
                        provider: 'none',
                        org_id: orgId
                    }
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Get document titles
        const docIds = [...new Set(results.map(r => r.document_id))];
        const { data: docs } = await supabase
            .from('context_documents')
            .select('id, title')
            .in('id', docIds);

        const docTitles = new Map((docs || []).map(d => [d.id, d.title]));

        // Build context from chunks
        const context = results
            .map((r, i) => `[${i + 1}] ${r.content}`)
            .join('\n\n');

        const systemPrompt = `Tu es un assistant expert qui repond aux questions en utilisant UNIQUEMENT le contexte fourni ci-dessous.

REGLES IMPORTANTES:
1. Tu DOIS utiliser les informations du contexte pour repondre
2. Cite TOUJOURS tes sources avec [1], [2], etc. quand tu utilises une information
3. Si plusieurs sources contiennent des infos pertinentes, utilise-les toutes
4. Sois precis et structure ta reponse clairement
5. Si vraiment aucune info n'est pertinente, dis-le mais c'est rare`;

        const userPrompt = `Contexte:\n${context}\n\nQuestion: ${question}`;

        // Try providers in order: preferred first, then fallbacks
        const providerOrder = [
            preferredProvider,
            ...FALLBACK_ORDER.filter(p => p !== preferredProvider)
        ];

        let model = '';
        let usedProvider: LLMProvider = 'openai';

        const sources = results.map(r => ({
            chunk_id: r.id,
            document_id: r.document_id,
            title: docTitles.get(r.document_id) || 'Untitled',
            snippet: r.content.substring(0, 200) + (r.content.length > 200 ? '...' : ''),
            similarity: r.similarity,
        }));

        // Streaming response
        if (stream) {
            const encoder = new TextEncoder();

            const readableStream = new ReadableStream({
                async start(controller) {
                    // Send sources first
                    controller.enqueue(encoder.encode(`event: sources\ndata: ${JSON.stringify({ sources })}\n\n`));

                    // Try providers in order for streaming
                    for (const provider of providerOrder) {
                        const client = getClient(provider);
                        if (!client) continue;

                        const config = MODEL_CONFIGS[provider];

                        try {
                            const completion = await client.chat.completions.create({
                                model: config.model,
                                messages: [
                                    { role: 'system', content: systemPrompt },
                                    { role: 'user', content: userPrompt }
                                ],
                                max_tokens: config.maxTokens,
                                temperature: config.temperature,
                                ...(config.topP && { top_p: config.topP }),
                                stream: true,
                            });

                            model = config.displayName;
                            usedProvider = provider;

                            for await (const chunk of completion) {
                                const content = chunk.choices[0]?.delta?.content || '';
                                if (content) {
                                    controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify({ content })}\n\n`));
                                }
                            }
                            break; // Success, exit provider loop
                        } catch (e) {
                            console.error(`[Search Stream] ${config.displayName} error:`, e);
                        }
                    }

                    // Send done event
                    controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({
                        model,
                        processingTime: Date.now() - startTime,
                        provider: usedProvider
                    })}\n\n`));

                    controller.close();
                }
            });

            return new Response(readableStream, {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                }
            });
        }

        // Non-streaming response
        let answer = '';
        for (const provider of providerOrder) {
            const client = getClient(provider);
            if (!client) continue;

            const config = MODEL_CONFIGS[provider];

            try {
                const completion = await client.chat.completions.create({
                    model: config.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: config.maxTokens,
                    temperature: config.temperature,
                    ...(config.topP && { top_p: config.topP }),
                });

                answer = completion.choices[0]?.message?.content?.trim() || '';
                model = config.displayName;
                usedProvider = provider;
                break;
            } catch (e) {
                console.error(`[Search] ${config.displayName} error:`, e);
            }
        }

        // Final fallback if all providers failed
        if (!answer) {
            answer = "Erreur: Impossible de generer une reponse. Tous les modeles sont indisponibles.";
            model = 'error';
        }

        return new Response(
            JSON.stringify({
                answer,
                sources,
                metadata: {
                    documents_found: results.length,
                    processing_time_ms: Date.now() - startTime,
                    model,
                    provider: usedProvider,
                    org_id: orgId
                }
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Search error:', error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
