/**
 * Types générés pour la base de données Supabase
 * Pour régénérer: npx supabase gen types typescript --project-id <project-id> > src/types/database.ts
 */

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          org_id: string | null;
          mcp_token: string | null;
          role: UserRole;
          avatar_url: string | null;
          llm_model: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          org_id?: string | null;
          mcp_token?: string | null;
          role?: UserRole;
          avatar_url?: string | null;
          llm_model?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          org_id?: string | null;
          mcp_token?: string | null;
          role?: UserRole;
          avatar_url?: string | null;
          llm_model?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          owner_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          invite_code: string;
          owner_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          invite_code?: string;
          owner_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      context_documents: {
        Row: {
          id: string;
          org_id: string;
          title: string;
          content: string;
          source_type: string | null;
          file_type: string | null;
          file_size: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          title: string;
          content: string;
          source_type?: string | null;
          file_type?: string | null;
          file_size?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          title?: string;
          content?: string;
          source_type?: string | null;
          file_type?: string | null;
          file_size?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      document_chunks: {
        Row: {
          id: string;
          document_id: string;
          org_id: string;
          content: string;
          embedding: number[] | null;
          chunk_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          org_id: string;
          content: string;
          embedding?: number[] | null;
          chunk_index: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          org_id?: string;
          content?: string;
          embedding?: number[] | null;
          chunk_index?: number;
          created_at?: string;
        };
      };
    };
  };
}

// Enums
export type UserRole = "owner" | "admin" | "member";

// Convenience type aliases
export type User = Database["public"]["Tables"]["users"]["Row"];
export type UserInsert = Database["public"]["Tables"]["users"]["Insert"];
export type UserUpdate = Database["public"]["Tables"]["users"]["Update"];

export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type OrganizationInsert = Database["public"]["Tables"]["organizations"]["Insert"];
export type OrganizationUpdate = Database["public"]["Tables"]["organizations"]["Update"];

export type ContextDocument = Database["public"]["Tables"]["context_documents"]["Row"];
export type ContextDocumentInsert = Database["public"]["Tables"]["context_documents"]["Insert"];
export type ContextDocumentUpdate = Database["public"]["Tables"]["context_documents"]["Update"];

export type DocumentChunk = Database["public"]["Tables"]["document_chunks"]["Row"];
export type DocumentChunkInsert = Database["public"]["Tables"]["document_chunks"]["Insert"];
export type DocumentChunkUpdate = Database["public"]["Tables"]["document_chunks"]["Update"];

// Organization member types (multi-org support)
export type MemberRole = "admin" | "member" | "viewer";

export interface OrganizationMember {
  id: string;
  user_id: string;
  org_id: string;
  role: MemberRole;
  api_key: string | null;
  is_default: boolean;
  llm_model: string | null;
  joined_at: string;
}

// Connector types
export type ConnectorType = "notion" | "gdrive";
export type ConnectorStatus = "active" | "error" | "disconnected";

export interface Connector {
  id: string;
  org_id: string;
  type: ConnectorType;
  access_token: string;
  refresh_token: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  connected_by: string | null;
  status: ConnectorStatus;
  last_sync_at: string | null;
  created_at: string;
}
