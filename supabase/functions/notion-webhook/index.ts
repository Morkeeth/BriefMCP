// Edge Function: notion-webhook
// Receives webhook events from Notion and triggers incremental sync
// POST /functions/v1/notion-webhook

import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
        break;
    }
  }

  return markdown.trim();
}

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

function getPageTitle(page: any): string {
  const properties = page.properties || {};

  for (const key of ['title', 'Title', 'Name', 'name']) {
    if (properties[key]?.title) {
      return richTextToMarkdown(properties[key].title) || 'Untitled';
    }
  }

  for (const prop of Object.values(properties) as any[]) {
    if (prop?.type === 'title' && prop.title) {
      return richTextToMarkdown(prop.title) || 'Untitled';
    }
  }

  return 'Untitled';
}

async function syncPage(
  pageId: string,
  connector: any,
  supabase: any,
  SUPABASE_URL: string
) {
  const notionHeaders = {
    'Authorization': `Bearer ${connector.access_token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  // Fetch page details
  const pageResponse = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: notionHeaders,
  });

  if (!pageResponse.ok) {
    console.error('Failed to fetch page:', await pageResponse.text());
    return false;
  }

  const page = await pageResponse.json();
  const title = getPageTitle(page);

  // Fetch page blocks
  let allBlocks: any[] = [];
  let hasMore = true;
  let startCursor: string | undefined = undefined;

  while (hasMore) {
    const blocksResponse = await fetch(
      `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100${startCursor ? `&start_cursor=${startCursor}` : ''}`,
      { headers: notionHeaders }
    );

    if (!blocksResponse.ok) {
      console.error('Failed to fetch blocks:', await blocksResponse.text());
      return false;
    }

    const blocksData = await blocksResponse.json();
    allBlocks = allBlocks.concat(blocksData.results);
    hasMore = blocksData.has_more;
    startCursor = blocksData.next_cursor;
  }

  const content = blocksToMarkdown(allBlocks);

  if (!content || content.trim().length === 0) {
    console.log(`Skipping empty page: ${title}`);
    return false;
  }

  // Delete existing document if exists
  const { data: existingDoc } = await supabase
    .from('context_documents')
    .select('id')
    .eq('org_id', connector.org_id)
    .eq('metadata->>notion_page_id', pageId)
    .single();

  if (existingDoc) {
    await supabase.from('document_chunks').delete().eq('document_id', existingDoc.id);
    await supabase.from('context_documents').delete().eq('id', existingDoc.id);
  }

  // Get a user's mcp_token from the org to call ingest-context
  const { data: orgUser } = await supabase
    .from('users')
    .select('mcp_token')
    .eq('org_id', connector.org_id)
    .not('mcp_token', 'is', null)
    .limit(1)
    .single();

  if (!orgUser?.mcp_token) {
    console.error('No user with mcp_token found for org');
    return false;
  }

  // Ingest the document
  const ingestResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/ingest-context`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mcp-token': orgUser.mcp_token,
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
    console.log(`Synced page: ${title}`);
    return true;
  } else {
    console.error(`Failed to ingest page ${title}:`, await ingestResponse.text());
    return false;
  }
}

async function deletePage(pageId: string, connector: any, supabase: any) {
  const { data: existingDoc } = await supabase
    .from('context_documents')
    .select('id')
    .eq('org_id', connector.org_id)
    .eq('metadata->>notion_page_id', pageId)
    .single();

  if (existingDoc) {
    await supabase.from('document_chunks').delete().eq('document_id', existingDoc.id);
    await supabase.from('context_documents').delete().eq('id', existingDoc.id);
    console.log(`Deleted document for page: ${pageId}`);
    return true;
  }
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    console.log('Webhook received:', JSON.stringify(body, null, 2));

    // Handle Notion webhook verification (ping)
    if (body.type === 'url_verification' || body.verification_token) {
      console.log('Webhook verification request');
      return new Response(
        JSON.stringify({ challenge: body.challenge }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract event data
    const eventType = body.type;
    const pageId = body.data?.page?.id || body.entity?.id || body.page_id;
    const workspaceId = body.workspace_id;

    if (!pageId && !workspaceId) {
      console.log('No page_id or workspace_id in webhook payload');
      return new Response(
        JSON.stringify({ received: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find connector by workspace_id
    let connector;
    if (workspaceId) {
      const { data } = await supabase
        .from('connectors')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('type', 'notion')
        .eq('status', 'active')
        .single();
      connector = data;
    }

    if (!connector && pageId) {
      // Try to find connector by checking existing synced pages
      const { data: doc } = await supabase
        .from('context_documents')
        .select('metadata')
        .eq('metadata->>notion_page_id', pageId)
        .single();

      if (doc?.metadata?.connector_id) {
        const { data } = await supabase
          .from('connectors')
          .select('*')
          .eq('id', doc.metadata.connector_id)
          .single();
        connector = data;
      }
    }

    if (!connector) {
      console.log('No matching connector found');
      return new Response(
        JSON.stringify({ received: true, message: 'No matching connector' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle different event types
    if (eventType?.includes('page.content_updated') ||
        eventType?.includes('page.created') ||
        eventType?.includes('page.properties_updated') ||
        eventType === 'page.changed') {

      if (pageId) {
        await syncPage(pageId, connector, supabase, SUPABASE_URL);
      }
    } else if (eventType?.includes('page.deleted') || eventType?.includes('page.moved_to_trash')) {
      if (pageId) {
        await deletePage(pageId, connector, supabase);
      }
    } else {
      console.log(`Unhandled event type: ${eventType}`);
    }

    // Update connector last_sync_at
    await supabase
      .from('connectors')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connector.id);

    return new Response(
      JSON.stringify({ received: true, success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
