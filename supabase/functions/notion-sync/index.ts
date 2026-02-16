// Edge Function: notion-sync
// Syncs all pages from a Notion workspace to the knowledge base
// POST /functions/v1/notion-sync
// Body: { connector_id: "xxx" }
// Auth: x-mcp-token header

import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mcp-token',
};

// Convert Notion blocks to markdown
function blocksToMarkdown(blocks: any[]): string {
  let markdown = '';

  for (const block of blocks) {
    const type = block.type;
    const content = block[type];

    if (!content) continue;

    switch (type) {
      case 'paragraph':
        markdown += richTextToMarkdown(content.rich_text) + '\n\n';
        break;
      case 'heading_1':
        markdown += '# ' + richTextToMarkdown(content.rich_text) + '\n\n';
        break;
      case 'heading_2':
        markdown += '## ' + richTextToMarkdown(content.rich_text) + '\n\n';
        break;
      case 'heading_3':
        markdown += '### ' + richTextToMarkdown(content.rich_text) + '\n\n';
        break;
      case 'bulleted_list_item':
        markdown += '- ' + richTextToMarkdown(content.rich_text) + '\n';
        break;
      case 'numbered_list_item':
        markdown += '1. ' + richTextToMarkdown(content.rich_text) + '\n';
        break;
      case 'to_do':
        const checked = content.checked ? '[x]' : '[ ]';
        markdown += `- ${checked} ` + richTextToMarkdown(content.rich_text) + '\n';
        break;
      case 'toggle':
        markdown += '> ' + richTextToMarkdown(content.rich_text) + '\n\n';
        break;
      case 'code':
        const lang = content.language || '';
        markdown += '```' + lang + '\n' + richTextToMarkdown(content.rich_text) + '\n```\n\n';
        break;
      case 'quote':
        markdown += '> ' + richTextToMarkdown(content.rich_text) + '\n\n';
        break;
      case 'divider':
        markdown += '---\n\n';
        break;
      case 'callout':
        const emoji = content.icon?.emoji || '💡';
        markdown += `> ${emoji} ` + richTextToMarkdown(content.rich_text) + '\n\n';
        break;
      default:
        // Skip unsupported block types
        break;
    }
  }

  return markdown.trim();
}

// Convert Notion rich text to markdown
function richTextToMarkdown(richText: any[]): string {
  if (!richText || !Array.isArray(richText)) return '';

  return richText.map(text => {
    let content = text.plain_text || '';
    const annotations = text.annotations || {};

    if (annotations.bold) content = `**${content}**`;
    if (annotations.italic) content = `*${content}*`;
    if (annotations.strikethrough) content = `~~${content}~~`;
    if (annotations.code) content = `\`${content}\``;

    if (text.href) {
      content = `[${content}](${text.href})`;
    }

    return content;
  }).join('');
}

// Get page title from Notion page properties
function getPageTitle(page: any): string {
  const properties = page.properties || {};

  // Try common title property names
  for (const key of ['title', 'Title', 'Name', 'name']) {
    if (properties[key]?.title) {
      return richTextToMarkdown(properties[key].title) || 'Untitled';
    }
  }

  // Fallback: find any title property
  for (const prop of Object.values(properties) as any[]) {
    if (prop?.type === 'title' && prop.title) {
      return richTextToMarkdown(prop.title) || 'Untitled';
    }
  }

  return 'Untitled';
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate user
    const mcpToken = req.headers.get('x-mcp-token');
    if (!mcpToken) {
      return new Response(
        JSON.stringify({ error: 'Missing x-mcp-token header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Lookup user by MCP token
    const { data: userData } = await supabase
      .from('users')
      .select('id, org_id, role')
      .eq('mcp_token', mcpToken)
      .single();

    if (!userData) {
      return new Response(
        JSON.stringify({ error: 'Invalid MCP token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { connector_id } = body;

    if (!connector_id) {
      return new Response(
        JSON.stringify({ error: 'Missing connector_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get connector
    const { data: connector, error: connectorError } = await supabase
      .from('connectors')
      .select('*')
      .eq('id', connector_id)
      .single();

    if (connectorError || !connector) {
      return new Response(
        JSON.stringify({ error: 'Connector not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has access to this connector's org
    if (connector.org_id !== userData.org_id) {
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting Notion sync for connector ${connector_id}, workspace: ${connector.workspace_name}`);

    // Fetch all pages from Notion
    const notionHeaders = {
      'Authorization': `Bearer ${connector.access_token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };

    // Search for all pages in the workspace
    let allPages: any[] = [];
    let hasMore = true;
    let startCursor: string | undefined = undefined;

    while (hasMore) {
      const searchResponse = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: notionHeaders,
        body: JSON.stringify({
          filter: { property: 'object', value: 'page' },
          page_size: 100,
          start_cursor: startCursor,
        }),
      });

      if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        console.error('Notion search failed:', errorText);

        // Update connector status to error
        await supabase
          .from('connectors')
          .update({ status: 'error' })
          .eq('id', connector_id);

        return new Response(
          JSON.stringify({ error: 'Failed to fetch pages from Notion', details: errorText }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const searchData = await searchResponse.json();
      allPages = allPages.concat(searchData.results);
      hasMore = searchData.has_more;
      startCursor = searchData.next_cursor;
    }

    console.log(`Found ${allPages.length} pages in Notion workspace`);

    let pagesSynced = 0;
    let pagesSkipped = 0;

    for (const page of allPages) {
      try {
        const pageId = page.id;
        const title = getPageTitle(page);

        // Fetch page blocks (content)
        let allBlocks: any[] = [];
        let blocksHasMore = true;
        let blocksStartCursor: string | undefined = undefined;

        while (blocksHasMore) {
          const blocksResponse = await fetch(
            `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100${blocksStartCursor ? `&start_cursor=${blocksStartCursor}` : ''}`,
            { headers: notionHeaders }
          );

          if (!blocksResponse.ok) {
            console.warn(`Failed to fetch blocks for page ${pageId}:`, await blocksResponse.text());
            pagesSkipped++;
            break;
          }

          const blocksData = await blocksResponse.json();
          allBlocks = allBlocks.concat(blocksData.results);
          blocksHasMore = blocksData.has_more;
          blocksStartCursor = blocksData.next_cursor;
        }

        // Convert blocks to markdown
        const content = blocksToMarkdown(allBlocks);

        if (!content || content.trim().length === 0) {
          console.log(`Skipping empty page: ${title}`);
          pagesSkipped++;
          continue;
        }

        // Check if document already exists (by notion_page_id in metadata)
        const { data: existingDoc } = await supabase
          .from('context_documents')
          .select('id')
          .eq('org_id', connector.org_id)
          .eq('metadata->>notion_page_id', pageId)
          .single();

        if (existingDoc) {
          // Delete existing document and its chunks (will be re-ingested)
          await supabase
            .from('document_chunks')
            .delete()
            .eq('document_id', existingDoc.id);

          await supabase
            .from('context_documents')
            .delete()
            .eq('id', existingDoc.id);

          console.log(`Replacing existing document: ${title}`);
        }

        // Call ingest-context to process the document
        // Use x-mcp-token for authentication (same token as the user who initiated sync)
        const ingestResponse = await fetch(
          `${SUPABASE_URL}/functions/v1/ingest-context`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-mcp-token': mcpToken,
            },
            body: JSON.stringify({
              content,
              title,
              org_id: connector.org_id,
              source_type: 'notion',
              metadata: {
                notion_page_id: pageId,
                notion_url: page.url,
                connector_id: connector.id,
              },
            }),
          }
        );

        if (ingestResponse.ok) {
          pagesSynced++;
          console.log(`Synced page: ${title}`);
        } else {
          const errorText = await ingestResponse.text();
          console.warn(`Failed to ingest page ${title}:`, errorText);
          pagesSkipped++;
        }

      } catch (pageError) {
        console.error(`Error processing page:`, pageError);
        pagesSkipped++;
      }
    }

    // Update connector last_sync_at
    await supabase
      .from('connectors')
      .update({
        last_sync_at: new Date().toISOString(),
        status: 'active',
      })
      .eq('id', connector_id);

    console.log(`Sync complete: ${pagesSynced} synced, ${pagesSkipped} skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        pages_synced: pagesSynced,
        pages_skipped: pagesSkipped,
        total_pages: allPages.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in notion-sync:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
