// Edge Function: notion-oauth
// Handles OAuth callback from Notion
// GET /functions/v1/notion-oauth?code=XXX&state=ORG_ID

import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); // org_id passed from frontend
    const error = url.searchParams.get('error');

    // Get environment variables
    const NOTION_CLIENT_ID = Deno.env.get('NOTION_CLIENT_ID');
    const NOTION_CLIENT_SECRET = Deno.env.get('NOTION_CLIENT_SECRET');
    const NOTION_REDIRECT_URI = Deno.env.get('NOTION_REDIRECT_URI');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    // APP_URL: use environment variable, with production fallback
    const APP_URL = Deno.env.get('APP_URL') || 'https://parisinnovhack-chi.vercel.app';

    if (!NOTION_CLIENT_ID || !NOTION_CLIENT_SECRET || !NOTION_REDIRECT_URI) {
      console.error('Missing Notion OAuth configuration');
      return Response.redirect(`${APP_URL}/settings/connectors?error=config_missing`, 302);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing Supabase configuration');
      return Response.redirect(`${APP_URL}/settings/connectors?error=config_missing`, 302);
    }

    // Handle OAuth error from Notion
    if (error) {
      console.error('Notion OAuth error:', error);
      return Response.redirect(`${APP_URL}/settings/connectors?error=${error}`, 302);
    }

    // Validate required params
    if (!code || !state) {
      console.error('Missing code or state parameter');
      return Response.redirect(`${APP_URL}/settings/connectors?error=missing_params`, 302);
    }

    const orgId = state;

    // Exchange code for access token
    const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: NOTION_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Notion token exchange failed:', errorData);
      return Response.redirect(`${APP_URL}/settings/connectors?error=token_exchange_failed`, 302);
    }

    const tokenData = await tokenResponse.json();
    console.log('Token exchange successful, workspace:', tokenData.workspace_name);

    // Extract data from Notion response
    const {
      access_token,
      workspace_id,
      workspace_name,
      owner,
    } = tokenData;

    // Get the user who initiated the OAuth flow
    // We need to find the user from the JWT in the original request
    // Since this is a redirect, we'll use the org_id to validate
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if a Notion connector already exists for this org
    const { data: existingConnector } = await supabase
      .from('connectors')
      .select('id')
      .eq('org_id', orgId)
      .eq('type', 'notion')
      .single();

    if (existingConnector) {
      // Update existing connector
      const { error: updateError } = await supabase
        .from('connectors')
        .update({
          access_token,
          workspace_id,
          workspace_name,
          status: 'active',
          last_sync_at: null, // Reset to trigger new sync
        })
        .eq('id', existingConnector.id);

      if (updateError) {
        console.error('Failed to update connector:', updateError);
        return Response.redirect(`${APP_URL}/settings/connectors?error=update_failed`, 302);
      }

      console.log('Updated existing Notion connector for org:', orgId);
    } else {
      // Create new connector
      // Try to get the user who owns this integration from Notion response
      const connectedBy = owner?.user?.id || null;

      const { error: insertError } = await supabase
        .from('connectors')
        .insert({
          org_id: orgId,
          type: 'notion',
          access_token,
          workspace_id,
          workspace_name,
          connected_by: null, // We don't have the user ID in redirect flow
          status: 'active',
        });

      if (insertError) {
        console.error('Failed to create connector:', insertError);
        return Response.redirect(`${APP_URL}/settings/connectors?error=insert_failed`, 302);
      }

      console.log('Created new Notion connector for org:', orgId);
    }

    // Redirect back to connectors page with success
    return Response.redirect(`${APP_URL}/settings/connectors?success=true`, 302);

  } catch (error) {
    console.error('Unexpected error in notion-oauth:', error);
    const APP_URL = Deno.env.get('APP_URL') || 'https://parisinnovhack-chi.vercel.app';
    return Response.redirect(`${APP_URL}/settings/connectors?error=unexpected_error`, 302);
  }
});
