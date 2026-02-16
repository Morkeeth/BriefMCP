import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IngestionConfig, EmbeddedChunk, IngestOptions } from './types';

export class Store {
    private supabase: SupabaseClient;

    constructor(config: IngestionConfig) {
        this.supabase = createClient(config.supabaseUrl, config.supabaseKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            }
        });
    }

    async saveDocument(options: IngestOptions, chunks: EmbeddedChunk[]): Promise<{ documentId: string }> {
        // 1. Insert the parent document using a direct insert (assuming server role key bypasses or user has RLS access)
        // Note: If using Service Role Key, RLS is bypassed. If using User context, ensure headers are passed (not covered in this basic service).
        const docData = {
            org_id: options.orgId,
            title: options.title,
            source_type: options.sourceType || 'manual',
            content: options.content,
            metadata: options.metadata || {},
            created_by: options.userId || null,
        };

        const { data: doc, error: docError } = await this.supabase
            .from('context_documents')
            .insert(docData)
            .select('id')
            .single();

        if (docError) {
            throw new Error(`Failed to create document: ${docError.message}`);
        }

        if (!doc) throw new Error('Document created but no ID returned');

        const documentId = doc.id;

        // 2. Prepare chunk records
        const chunkRecords = chunks.map(chunk => ({
            document_id: documentId,
            org_id: options.orgId,
            content: chunk.content,
            embedding: chunk.embedding, // Supabase vector extension accepts native array of floats
            chunk_index: chunk.chunkIndex,
            metadata: chunk.metadata,
        }));

        // 3. Batch insert chunks
        // Supabase allows batch inserts. For very large docs, might need to chunk the inserts too (e.g. batches of 100).
        const BATCH_SIZE = 50;
        for (let i = 0; i < chunkRecords.length; i += BATCH_SIZE) {
            const batch = chunkRecords.slice(i, i + BATCH_SIZE);
            const { error: chunkError } = await this.supabase
                .from('document_chunks')
                .insert(batch);

            if (chunkError) {
                // Rollback? Supabase (PostgREST) doesn't support multi-request transactions easily via JS SDK.
                // We would ideally delete the document if chunks fail.
                console.error('Chunk insert failed, attempting rollback of document...', chunkError);
                await this.supabase.from('context_documents').delete().eq('id', documentId);
                throw new Error(`Failed to insert chunks: ${chunkError.message}`);
            }
        }

        return { documentId };
    }
}
