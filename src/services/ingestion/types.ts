export interface IngestionConfig {
    supabaseUrl: string;
    supabaseKey: string;
    featherlessApiKey: string;
    featherlessBaseUrl?: string; // Defaults to https://api.featherless.ai/v1
}

export interface IngestOptions {
    content: string;
    title: string;
    orgId: string;
    sourceType?: string; // 'manual', 'file_upload', 'api'
    metadata?: Record<string, unknown>;
    userId?: string; // Optional user ID if initiated by a specific user
}

export interface DocumentChunk {
    content: string;
    chunkIndex: number;
    metadata: {
        startIndex: number;
        endIndex: number;
        headerPath?: string[]; // e.g., ["Phase 1", "Database Setup"]
    };
}

export interface EmbeddedChunk extends DocumentChunk {
    embedding: number[];
}
