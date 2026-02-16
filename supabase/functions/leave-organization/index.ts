// Edge Function: leave-organization
// Gère tous les cas de départ d'une organisation:
// - Quitter l'organisation (delete_account: false)
// - Supprimer son compte (delete_account: true)
//
// Logique SOLID:
// 1. Si dernier membre → supprimer org + docs + chunks
// 2. Si dernier admin mais autres membres → promouvoir le plus ancien
// 3. Sinon → juste détacher le user
// 4. Si delete_account → supprimer le user de la table users

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Get the authorization header
        const authHeader = req.headers.get('authorization');
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Missing authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Parse request body
        const { delete_account = false } = await req.json().catch(() => ({}));

        // Create a client with the user's JWT to get their identity
        const supabaseUser = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            {
                global: { headers: { Authorization: authHeader } },
                auth: { persistSession: false }
            }
        );

        // Get the current user
        const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
        if (userError || !user) {
            return new Response(
                JSON.stringify({ error: 'Invalid token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Create admin client with service role for all operations
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { persistSession: false, autoRefreshToken: false } }
        );

        // Get user's data including org_id and role
        const { data: userData, error: userDataError } = await supabaseAdmin
            .from('users')
            .select('org_id, role, created_at')
            .eq('id', user.id)
            .single();

        if (userDataError) {
            console.error('Error fetching user data:', userDataError);
            return new Response(
                JSON.stringify({ error: 'User not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const orgId = userData?.org_id;
        const userRole = userData?.role;

        // If user is not in an organization, just handle account deletion
        if (!orgId) {
            console.log('User has no organization');

            if (delete_account) {
                const { error: deleteUserError } = await supabaseAdmin
                    .from('users')
                    .delete()
                    .eq('id', user.id);

                if (deleteUserError) {
                    console.error('Error deleting user:', deleteUserError);
                    return new Response(
                        JSON.stringify({ error: 'Failed to delete user' }),
                        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }
                console.log('User deleted successfully (no org)');
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    message: delete_account ? 'Account deleted successfully' : 'No organization to leave'
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Get all members of the organization
        const { data: members, error: membersError } = await supabaseAdmin
            .from('users')
            .select('id, role, created_at')
            .eq('org_id', orgId)
            .order('created_at', { ascending: true });

        if (membersError) {
            console.error('Error fetching members:', membersError);
            return new Response(
                JSON.stringify({ error: 'Failed to fetch organization members' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const memberCount = members?.length || 0;
        const admins = members?.filter(m => m.role === 'admin') || [];
        const isLastMember = memberCount === 1;
        const isLastAdmin = admins.length === 1 && userRole === 'admin';

        console.log(`Organization ${orgId}: ${memberCount} members, ${admins.length} admins`);
        console.log(`User is last member: ${isLastMember}, is last admin: ${isLastAdmin}`);

        // CASE 1: Last member - Delete EVERYTHING
        if (isLastMember) {
            console.log('User is last member, deleting all organization data...');

            // Get all documents for this organization
            const { data: documents } = await supabaseAdmin
                .from('context_documents')
                .select('id')
                .eq('org_id', orgId);

            if (documents && documents.length > 0) {
                const docIds = documents.map(d => d.id);
                console.log(`Deleting ${docIds.length} documents and their chunks...`);

                // Delete all chunks for these documents
                const { error: chunksError } = await supabaseAdmin
                    .from('document_chunks')
                    .delete()
                    .in('document_id', docIds);

                if (chunksError) {
                    console.error('Error deleting chunks:', chunksError);
                } else {
                    console.log('Chunks deleted successfully');
                }

                // Delete all documents
                const { error: docsError } = await supabaseAdmin
                    .from('context_documents')
                    .delete()
                    .eq('org_id', orgId);

                if (docsError) {
                    console.error('Error deleting documents:', docsError);
                } else {
                    console.log('Documents deleted successfully');
                }
            }

            // Delete the organization
            const { error: orgError } = await supabaseAdmin
                .from('organizations')
                .delete()
                .eq('id', orgId);

            if (orgError) {
                console.error('Error deleting organization:', orgError);
            } else {
                console.log('Organization deleted successfully');
            }
        }
        // CASE 2: Last admin but other members exist - Promote the oldest non-admin member
        else if (isLastAdmin && memberCount > 1) {
            console.log('User is last admin, promoting oldest member...');

            // Find the oldest non-admin member
            const oldestMember = members
                ?.filter(m => m.id !== user.id && m.role !== 'admin')
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

            if (oldestMember) {
                const { error: promoteError } = await supabaseAdmin
                    .from('users')
                    .update({ role: 'admin' })
                    .eq('id', oldestMember.id);

                if (promoteError) {
                    console.error('Error promoting member:', promoteError);
                } else {
                    console.log(`Promoted user ${oldestMember.id} to admin`);
                }
            }
        }

        // Detach user from organization (set org_id and role to NULL)
        const { error: detachError } = await supabaseAdmin
            .from('users')
            .update({ org_id: null, role: null })
            .eq('id', user.id);

        if (detachError) {
            console.error('Error detaching user from org:', detachError);
            return new Response(
                JSON.stringify({ error: 'Failed to leave organization' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('User detached from organization');

        // If delete_account is true, delete the user record
        if (delete_account) {
            const { error: deleteUserError } = await supabaseAdmin
                .from('users')
                .delete()
                .eq('id', user.id);

            if (deleteUserError) {
                console.error('Error deleting user:', deleteUserError);
                return new Response(
                    JSON.stringify({ error: 'Failed to delete user' }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            console.log('User deleted successfully');
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: delete_account ? 'Account deleted successfully' : 'Left organization successfully',
                was_last_member: isLastMember,
                promoted_new_admin: isLastAdmin && memberCount > 1
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Leave organization error:', error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
