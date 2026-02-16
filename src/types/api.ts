/**
 * Types pour les requêtes et réponses API
 */

// PDF Extraction
export interface ExtractPdfRequest {
  file: File;
}

export interface ExtractPdfResponse {
  text: string;
  pages: number;
}

// Document Ingestion
export interface IngestDocumentRequest {
  title: string;
  content: string;
  orgId: string;
  fileType?: string;
  fileSize?: number;
}

export interface IngestDocumentResponse {
  documentId: string;
  chunksCreated: number;
}

// Search Context
export interface SearchContextRequest {
  query: string;
  orgId: string;
  topK?: number;
}

export interface SearchContextResponse {
  results: SearchResult[];
  answer?: string;
}

export interface SearchResult {
  content: string;
  documentId: string;
  documentTitle: string;
  similarity: number;
}

// List Documents
export interface ListDocumentsResponse {
  documents: DocumentSummary[];
}

export interface DocumentSummary {
  id: string;
  title: string;
  fileType: string | null;
  fileSize: number | null;
  chunksCount: number;
  createdAt: string;
}

// Error Response
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
