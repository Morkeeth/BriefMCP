import OpenAI from 'openai';
import { IngestionConfig } from './types';

export class Embedder {
    private openai: OpenAI;
    private readonly MODEL_NAME = 'BAAI/bge-large-en-v1.5';

    constructor(config: IngestionConfig) {
        this.openai = new OpenAI({
            apiKey: config.featherlessApiKey,
            baseURL: config.featherlessBaseUrl || 'https://api.featherless.ai/v1',
        });
    }

    async embedBytes(texts: string[]): Promise<number[][]> {
        try {
            // Create embeddings using the OpenAI-compatible API
            const response = await this.openai.embeddings.create({
                model: this.MODEL_NAME,
                input: texts,
                // encoding_format: 'float' // Default
            });

            return response.data.map(item => item.embedding);
        } catch (error) {
            console.error('Error generating embeddings:', error);
            throw new Error(`Featherless API Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // Helper validation to ensure dimensions match expectations (1024)
    static validateDimensions(embedding: number[]): boolean {
        return embedding.length === 1024;
    }
}
