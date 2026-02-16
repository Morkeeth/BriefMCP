"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Plug, RefreshCw, Trash2, AlertCircle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { Connector } from "@/types/database";

// Notion OAuth configuration
const NOTION_CLIENT_ID = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID;
const NOTION_REDIRECT_URI = process.env.NEXT_PUBLIC_NOTION_REDIRECT_URI;

interface ConnectorWithUser extends Connector {
  connected_by_email?: string;
}

export default function ConnectorsPage() {
  const [loading, setLoading] = useState(true);
  const [connectors, setConnectors] = useState<ConnectorWithUser[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const [connectorToDelete, setConnectorToDelete] = useState<ConnectorWithUser | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // Show notification helper
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // Sync function
  const handleSync = useCallback(async (connector: ConnectorWithUser, isAutoSync = false) => {
    setSyncing(connector.id);
    setSyncProgress(isAutoSync ? "Connecting to Notion..." : "Starting synchronization...");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from("users")
        .select("mcp_token")
        .eq("id", user.id)
        .single();

      if (!userData?.mcp_token) {
        showNotification('error', "No API key found");
        return;
      }

      setSyncProgress("Fetching pages from Notion...");

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notion-sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-mcp-token": userData.mcp_token,
          },
          body: JSON.stringify({ connector_id: connector.id }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        showNotification('success', `${result.pages_synced} pages synchronized from Notion`);

        // Refresh connector data
        const { data: updated } = await supabase
          .from("connectors")
          .select("*")
          .eq("id", connector.id)
          .single();

        if (updated) {
          setConnectors(prev => prev.map(c =>
            c.id === connector.id ? { ...c, ...updated } : c
          ));
        }
      } else {
        const error = await response.json();
        showNotification('error', error.error || 'Sync failed');
      }
    } catch (error) {
      console.error("Sync error:", error);
      showNotification('error', "Sync failed. Please try again.");
    } finally {
      setSyncing(null);
      setSyncProgress(null);
    }
  }, [supabase]);

  // Load data and handle OAuth callback
  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // Get user's org and role
      const { data: membership } = await supabase
        .from("organization_members")
        .select("org_id, role")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .single();

      if (!membership?.org_id) {
        router.push('/organizations');
        return;
      }

      setUserRole(membership.role);
      setOrgId(membership.org_id);

      // Load connectors
      const { data: connectorsData } = await supabase
        .from("connectors")
        .select("*")
        .eq("org_id", membership.org_id)
        .order("created_at", { ascending: false });

      if (connectorsData) {
        setConnectors(connectorsData);
      }

      setLoading(false);

      // Check for OAuth callback params
      const urlParams = new URLSearchParams(window.location.search);
      const success = urlParams.get('success');
      const needsSync = urlParams.get('sync');
      const error = urlParams.get('error');

      // Clean up URL
      if (success || needsSync || error) {
        window.history.replaceState({}, '', '/settings/connectors');
      }

      if (error) {
        showNotification('error', `Connection failed: ${error}`);
        return;
      }

      // Auto-sync after successful OAuth
      if (success === 'true' || needsSync === 'true') {
        // Reload connectors to get the new one
        const { data: refreshedConnectors } = await supabase
          .from("connectors")
          .select("*")
          .eq("org_id", membership.org_id)
          .order("created_at", { ascending: false });

        if (refreshedConnectors && refreshedConnectors.length > 0) {
          setConnectors(refreshedConnectors);
          const notionConnector = refreshedConnectors.find(c => c.type === 'notion');
          if (notionConnector && !notionConnector.last_sync_at) {
            // Auto-sync the newly connected Notion
            handleSync(notionConnector, true);
          }
        }
      }
    };

    loadData();
  }, [supabase, router, handleSync]);

  const handleConnectNotion = () => {
    if (!NOTION_CLIENT_ID || !NOTION_REDIRECT_URI || !orgId) {
      showNotification('error', "Notion is not configured. Contact your administrator.");
      return;
    }

    const params = new URLSearchParams({
      client_id: NOTION_CLIENT_ID,
      redirect_uri: NOTION_REDIRECT_URI,
      response_type: "code",
      owner: "user",
      state: orgId,
    });

    window.location.href = `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
  };

  const handleDelete = async (connector: ConnectorWithUser) => {
    if (!orgId) return;

    // Security: Always verify org_id to prevent cross-org deletion
    const { error } = await supabase
      .from("connectors")
      .delete()
      .eq("id", connector.id)
      .eq("org_id", orgId);

    if (!error) {
      setConnectors(prev => prev.filter(c => c.id !== connector.id));
      showNotification('success', "Notion disconnected");
    } else {
      showNotification('error', "Failed to disconnect");
    }
    setConnectorToDelete(null);
  };

  const isAdmin = userRole === 'admin';
  const notionConnector = connectors.find(c => c.type === "notion");
  const isSyncing = syncing === notionConnector?.id;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="text-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 text-muted-foreground">
              <AlertCircle className="w-5 h-5" />
              <p>Only administrators can manage connectors.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Notification */}
      {notification && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          notification.type === 'success'
            ? 'bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400'
            : 'bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400'
        }`}>
          {notification.type === 'success' ? (
            <Check className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <p>{notification.message}</p>
        </div>
      )}

      {/* Sync Progress Overlay */}
      {isSyncing && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 flex items-center justify-center rounded-full">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-foreground">Synchronizing with Notion</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {syncProgress || "Please wait..."}
                </p>
              </div>
            </div>
            <div className="mt-4 h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notion Connector Card */}
      {!isSyncing && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-black dark:bg-white flex items-center justify-center rounded-lg">
                  <svg className="w-6 h-6 text-white dark:text-black" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM2.64 1.782L15.997.42c1.636-.14 2.055.093 2.708.607l3.736 2.615c.607.42.793.56.793 1.073v15.704c0 .84-.327 1.307-1.261 1.354l-15.457.886c-.7.047-1.027-.093-1.402-.513l-2.335-3.036c-.373-.513-.56-.886-.56-1.354V3.181c0-.606.327-1.212 1.261-1.399z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-foreground">Notion</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {notionConnector
                      ? `Connected to ${notionConnector.workspace_name || 'your workspace'}`
                      : "Import all your Notion pages automatically"
                    }
                  </p>
                </div>
              </div>

              {notionConnector ? (
                <div className="flex items-center gap-2">
                  <Badge variant={notionConnector.status === 'active' ? 'default' : 'destructive'}>
                    {notionConnector.status === 'active' ? 'Connected' : notionConnector.status}
                  </Badge>
                </div>
              ) : (
                <Button onClick={handleConnectNotion} className="gap-2">
                  <Plug className="w-4 h-4" />
                  Connect Notion
                </Button>
              )}
            </div>

            {notionConnector && (
              <>
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      Last sync: {notionConnector.last_sync_at
                        ? new Date(notionConnector.last_sync_at).toLocaleString()
                        : 'Never'
                      }
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSync(notionConnector)}
                    disabled={isSyncing}
                    className="gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Sync now
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConnectorToDelete(notionConnector)}
                    className="text-muted-foreground hover:text-destructive gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Disconnect
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Google Drive - Coming Soon */}
      <Card className="opacity-50">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-muted flex items-center justify-center rounded-lg">
                <svg className="w-6 h-6 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.71 3.5L1.15 15l3.43 5.97h13.28l3.43-5.97L14.73 3.5H7.71zm.79 1.5h5.13l5.07 8.81-1.97 3.44H5.7l-1.97-3.44L8.5 5zm2.42 3L6.5 15h8.38l-4.42-7z"/>
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-foreground">Google Drive</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Coming soon
                </p>
              </div>
            </div>
            <Badge variant="secondary">Soon</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Slack - Coming Soon */}
      <Card className="opacity-50">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-muted flex items-center justify-center rounded-lg">
                <svg className="w-6 h-6 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-foreground">Slack</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Coming soon
                </p>
              </div>
            </div>
            <Badge variant="secondary">Soon</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Microsoft OneDrive/SharePoint - Coming Soon */}
      <Card className="opacity-50">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-muted flex items-center justify-center rounded-lg">
                <svg className="w-6 h-6 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10.617 9.16c1.078.206 2.137.525 3.158.947.02-.03.038-.06.06-.088a5.762 5.762 0 0 1 4.637-2.353c3.17 0 5.741 2.532 5.741 5.655a5.58 5.58 0 0 1-.878 3.005c.014.11.025.222.025.337 0 1.654-1.36 2.996-3.039 2.996H5.898c-2.122 0-3.843-1.694-3.843-3.784 0-1.31.684-2.514 1.787-3.208a5.67 5.67 0 0 1-.201-1.49c0-3.123 2.571-5.655 5.741-5.655 1.354 0 2.6.47 3.575 1.255a8.913 8.913 0 0 1 1.66-1.617z"/>
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-foreground">Microsoft OneDrive</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Coming soon
                </p>
              </div>
            </div>
            <Badge variant="secondary">Soon</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!connectorToDelete} onOpenChange={(open) => !open && setConnectorToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Notion?</DialogTitle>
            <DialogDescription>
              This will remove the connection to{' '}
              <strong>{connectorToDelete?.workspace_name || 'your Notion workspace'}</strong>.
              Documents already imported will remain in your library.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConnectorToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => connectorToDelete && handleDelete(connectorToDelete)}
            >
              Disconnect
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
