"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams, useRouter } from "next/navigation";
import { FileText, Plus, Trash2, Upload } from "lucide-react";

// Notion icon component (same as OAuthButton)
const NotionIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none">
    <path d="M6.017 4.313l55.333 -4.087c6.797 -0.583 8.543 -0.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277 -1.553 6.807 -6.99 7.193L24.467 99.967c-4.08 0.193 -6.023 -0.39 -8.16 -3.113L3.3 79.94c-2.333 -3.113 -3.3 -5.443 -3.3 -8.167V11.113c0 -3.497 1.553 -6.413 6.017 -6.8z" fill="#fff" />
    <path fillRule="evenodd" clipRule="evenodd" d="M61.35 0.227l-55.333 4.087C1.553 4.7 0 7.617 0 11.113v60.66c0 2.723 0.967 5.053 3.3 8.167l13.007 16.913c2.137 2.723 4.08 3.307 8.16 3.113l64.257 -3.89c5.433 -0.387 6.99 -2.917 6.99 -7.193V20.64c0 -2.21 -0.873 -2.847 -3.443 -4.733L74.167 3.143c-4.273 -3.107 -6.02 -3.5 -12.817 -2.917zM25.92 19.523c-5.247 0.353 -6.437 0.433 -9.417 -1.99L8.927 11.507c-0.77 -0.78 -0.383 -1.753 1.557 -1.947l53.193 -3.887c4.467 -0.39 6.793 1.167 8.54 2.527l9.123 6.61c0.39 0.197 1.36 1.36 0.193 1.36l-54.933 3.307 -0.68 0.047zM19.803 88.3V30.367c0 -2.53 0.777 -3.697 3.103 -3.893L86 22.78c2.14 -0.193 3.107 1.167 3.107 3.693v57.547c0 2.53 -0.39 4.67 -3.883 4.863l-60.377 3.5c-3.493 0.193 -5.043 -0.97 -5.043 -4.083zm59.6 -54.827c0.387 1.75 0 3.5 -1.75 3.7l-2.91 0.577v42.773c-2.527 1.36 -4.853 2.137 -6.797 2.137 -3.107 0 -3.883 -0.973 -6.21 -3.887l-19.03 -29.94v28.967l6.02 1.363s0 3.5 -4.857 3.5l-13.39 0.777c-0.39 -0.78 0 -2.723 1.357 -3.11l3.497 -0.97v-38.3L30.48 40.667c-0.39 -1.75 0.58 -4.277 3.3 -4.473l14.367 -0.967 19.8 30.327v-26.83l-5.047 -0.58c-0.39 -2.143 1.163 -3.7 3.103 -3.89l13.4 -0.78z" fill="#000" />
  </svg>
);

// Get icon based on source type
const getSourceIcon = (sourceType: string | null) => {
  switch (sourceType) {
    case "notion":
      return <NotionIcon className="w-5 h-5" />;
    case "manual":
    default:
      return <FileText className="w-5 h-5 text-muted-foreground" />;
  }
};
import { SearchBar } from "@/components/chat";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { useSidebarState } from "@/hooks";

type Document = {
  id: string;
  org_id: string;
  created_by: string | null;
  title: string;
  source_type: string;
  content: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export default function DashboardPage() {
  const params = useParams();
  const router = useRouter();
  const orgRef = params.ref as string;
  const { isExpanded, isHydrated } = useSidebarState(true);
  const sidebarWidth = isHydrated ? (isExpanded ? 220 : 56) : 220;

  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [userOrgId, setUserOrgId] = useState<string | null>(null);
  const [mcpToken, setMcpToken] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const modalFileInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const saveNow = async (docId: string, docTitle: string, docContent: string) => {
    await supabase
      .from("context_documents")
      .update({ title: docTitle, content: docContent })
      .eq("id", docId);

    setDocuments(prev => {
      const updated = prev.find(d => d.id === docId);
      if (!updated) return prev;
      const others = prev.filter(d => d.id !== docId);
      return [{ ...updated, title: docTitle, content: docContent }, ...others];
    });
  };

  const ingestDocument = async (docTitle: string, docContent: string) => {
    if (!userOrgId || !docContent.trim() || !mcpToken) {
      return null;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ingest-context`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            "x-mcp-token": mcpToken,
          },
          body: JSON.stringify({
            content: docContent,
            title: docTitle || "Untitled",
            org_id: userOrgId,
            source_type: "manual",
          }),
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data?.documentId;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges && isEditorOpen) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges, isEditorOpen]);

  useEffect(() => {
    const loadDocuments = async (orgId: string) => {
      const { data } = await supabase
        .from("context_documents")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      setDocuments(data || []);
      setLoading(false);
    };

    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      // Get user data
      const { data: userData } = await supabase
        .from("users")
        .select("mcp_token, avatar_url")
        .eq("id", user.id)
        .single();

      if (userData?.mcp_token) {
        setMcpToken(userData.mcp_token);
      }
      if (userData?.avatar_url) {
        setUserAvatar(userData.avatar_url);
      }

      // Get organization by ref or id (supports both)
      let orgId = orgRef;

      // First try to find by ref
      const { data: orgByRef } = await supabase
        .from("organizations")
        .select("id")
        .eq("ref", orgRef)
        .single();

      if (orgByRef) {
        orgId = orgByRef.id;
      } else {
        // Fallback: check if orgRef is actually a UUID (org id)
        const { data: orgById } = await supabase
          .from("organizations")
          .select("id")
          .eq("id", orgRef)
          .single();

        if (!orgById) {
          // Org not found, redirect to organizations page
          router.push("/organizations");
          return;
        }
        orgId = orgById.id;
      }

      // Check if user is member of this org
      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .single();

      if (membershipError || !membership) {
        // User is not a member, redirect
        router.push("/organizations");
        return;
      }

      setUserRole(membership.role);
      setUserOrgId(orgId);

      // Update user's default org to this one
      await supabase.rpc("switch_default_organization", {
        p_user_id: user.id,
        p_new_org_id: orgId,
      });

      await loadDocuments(orgId);
    };

    loadUser();
  }, [supabase, orgRef, router]);

  useEffect(() => {
    if (isEditorOpen && titleInputRef.current) {
      setTimeout(() => titleInputRef.current?.focus(), 100);
    }
  }, [isEditorOpen]);

  const refreshDocuments = async (orgId: string) => {
    const { data } = await supabase
      .from("context_documents")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    setDocuments(data || []);
  };

  const createDocument = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!userOrgId) return;

    const { data } = await supabase
      .from("context_documents")
      .insert({
        org_id: userOrgId,
        created_by: user?.id || null,
        title: "Untitled",
        source_type: "manual",
        content: "",
        metadata: {}
      })
      .select()
      .single();

    if (data) {
      setDocuments([data, ...documents]);
      openDocument(data);
    }
  };

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/extract-pdf", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to extract PDF");
    }

    const data = await response.json();
    return data.text;
  };

  const handleModalPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPdf(true);

    try {
      const text = await extractTextFromPdf(file);
      const pdfTitle = file.name.replace(/\.pdf$/i, "");

      if (!title.trim() || title.trim() === "Untitled") {
        setTitle(pdfTitle);
      }

      setContent(text);
      setHasChanges(true);
    } catch {
      // PDF extraction failed
    } finally {
      setUploadingPdf(false);
      if (modalFileInputRef.current) {
        modalFileInputRef.current.value = "";
      }
    }
  };

  const deleteDocument = async (id: string) => {
    try {
      if (!mcpToken) {
        alert("Error: MCP token missing. Please refresh the page.");
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-document`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            "x-mcp-token": mcpToken,
          },
          body: JSON.stringify({ document_id: id }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.error || "Error deleting document");
        return;
      }

      setDocuments(documents.filter(d => d.id !== id));
      if (selectedDoc?.id === id) closeEditor();
    } catch {
      // Delete failed silently
    }
  };

  const openDocument = (doc: Document) => {
    setSelectedDoc(doc);
    setTitle(doc.title);
    setContent(doc.content || "");
    setHasChanges(false);
    setIsEditorOpen(true);
  };

  const closeEditor = async () => {
    const docToClose = selectedDoc;
    const finalTitle = title;
    const finalContent = String(content || "");

    setIsEditorOpen(false);
    setSelectedDoc(null);
    setTitle("");
    setContent("");

    const isEmpty = !finalContent.trim() && (!finalTitle.trim() || finalTitle.trim() === "Untitled");

    if (docToClose && isEmpty) {
      setDocuments(prev => prev.filter(d => d.id !== docToClose.id));
      // Security: Always verify org_id to prevent cross-org deletion
      if (userOrgId) {
        supabase.from("context_documents").delete().eq("id", docToClose.id).eq("org_id", userOrgId);
      }
    } else if (docToClose && hasChanges && finalContent.trim()) {
      setDocuments(prev => prev.map(d =>
        d.id === docToClose.id ? { ...d, title: finalTitle, content: finalContent } : d
      ));

      // Security: Always verify org_id to prevent cross-org deletion
      if (userOrgId) {
        await supabase.from("context_documents").delete().eq("id", docToClose.id).eq("org_id", userOrgId);
      }
      ingestDocument(finalTitle, finalContent).then(newDocId => {
        if (newDocId && userOrgId) refreshDocuments(userOrgId);
      });
    } else if (docToClose && hasChanges) {
      setDocuments(prev => prev.map(d =>
        d.id === docToClose.id ? { ...d, title: finalTitle, content: finalContent } : d
      ));
      saveNow(docToClose.id, finalTitle, finalContent);
    }

    setHasChanges(false);
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isEditorOpen) {
        closeEditor();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isEditorOpen]);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner className="text-foreground" />
      </div>
    );
  }

  return (
    <>
      <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          }}
        >
          {userRole !== 'viewer' && (
            <Card
              className="cursor-pointer border-dashed hover:bg-accent transition-colors h-48 flex flex-col items-center justify-center"
              onClick={createDocument}
            >
              <CardContent className="flex flex-col items-center justify-center h-full p-6">
                <div className="w-12 h-12 bg-muted flex items-center justify-center mb-4">
                  <Plus className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Click to create
                </p>
              </CardContent>
            </Card>
          )}

          {documents.map((doc) => (
            <Card
              key={doc.id}
              className="cursor-pointer hover:bg-accent transition-colors h-48 group relative"
              onClick={() => openDocument(doc)}
            >
              <CardContent className="p-4 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-muted flex items-center justify-center">
                    {getSourceIcon(doc.source_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {doc.title || "Untitled"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(doc.created_at)}
                    </p>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden">
                  <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                    {doc.content || "Empty document..."}
                  </p>
                </div>

                {userRole !== 'viewer' && (
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-4 right-4">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDocument(doc.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Search Bar */}
      <SearchBar
        orgRef={orgRef}
        sidebarWidth={sidebarWidth}
        userAvatar={userAvatar}
        onOpenDocument={(documentId: string) => {
          const doc = documents.find((d) => d.id === documentId);
          if (doc) {
            openDocument(doc);
          }
        }}
      />

      {/* Document Editor Dialog */}
      <Dialog open={isEditorOpen} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0" hideCloseButton>
          <VisuallyHidden>
            <DialogTitle>Document Editor</DialogTitle>
          </VisuallyHidden>
          <DialogHeader className="border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-muted flex items-center justify-center">
                <FileText className="w-5 h-5 text-muted-foreground" />
              </div>
              <Input
                ref={titleInputRef}
                value={title}
                onChange={(e) => { setTitle(e.target.value); setHasChanges(true); }}
                placeholder="Untitled"
                className="text-lg font-semibold border-none shadow-none focus-visible:ring-0 px-0 h-auto"
              />
              {selectedDoc && userRole !== 'viewer' && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteDocument(selectedDoc.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 p-6 overflow-hidden">
            <Textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); setHasChanges(true); }}
              placeholder="Start writing..."
              className="w-full h-full border-none shadow-none focus-visible:ring-0 resize-none text-sm"
            />
          </div>

          <div className="border-t border-border px-6 py-3 bg-muted/50">
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <span>{String(content || "").length} characters</span>
                <span>{String(content || "").split(/\s+/).filter(word => word.length > 0).length} words</span>

                <label className={cn(
                  "flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors",
                  uploadingPdf && "opacity-50 pointer-events-none"
                )}>
                  <input
                    ref={modalFileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleModalPdfUpload}
                    className="hidden"
                  />
                  {uploadingPdf ? (
                    <Spinner size="sm" className="text-muted-foreground" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span>{uploadingPdf ? "Importing..." : "Import PDF"}</span>
                </label>
              </div>
              <span>ESC to close</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
