import { Chunker } from './chunker';
import { Embedder } from './embedder';
import { Store } from './store';
import { IngestionConfig, IngestOptions } from './types';

export class IngestionService {
    private chunker: typeof Chunker;
    private embedder: Embedder;
    private store: Store;

    constructor(config: IngestionConfig) {
        this.chunker = Chunker;
        this.embedder = new Embedder(config);
        this.store = new Store(config);
    }

    /**
     * Main entry point to ingest a markdown document
     */
    async ingest(options: IngestOptions): Promise<{ documentId: string; chunks: number }> {
        // 1. Chunk
        const chunks = this.chunker.chunk(options.content);

        if (chunks.length === 0) {
            throw new Error('No content content found to ingest');
        }

        // 2. Embed
        const textsToEmbed = chunks.map(c => c.content);
        const embeddings = await this.embedder.embedBytes(textsToEmbed);

        if (embeddings.length !== chunks.length) {
            throw new Error(`Mismatch: ${chunks.length} chunks but ${embeddings.length} embeddings returned`);
        }

        // Merge embeddings into chunks
        const embeddedChunks = chunks.map((chunk, i) => ({
            ...chunk,
            embedding: embeddings[i]
        }));

        // 3. Store
        const result = await this.store.saveDocument(options, embeddedChunks);

        return {
            documentId: result.documentId,
            chunks: chunks.length
        };
    }
}

// Re-export parts for individual use if needed
export * from './types';
export * from './chunker';
export * from './embedder';
export * from './store';
