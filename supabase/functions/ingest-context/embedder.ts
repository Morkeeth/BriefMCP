import OpenAI from 'openai';

export class Embedder {
    private openai: OpenAI;
    private readonly MODEL_NAME = 'text-embedding-3-small'; // 1536 dimensions

    constructor(apiKey: string) {
        this.openai = new OpenAI({
            apiKey: apiKey,
        });
    }

    async embedBytes(texts: string[]): Promise<number[][]> {
        try {
            const response = await this.openai.embeddings.create({
                model: this.MODEL_NAME,
                input: texts,
            });

            return response.data.map(item => item.embedding);
        } catch (error) {
            console.error('Error generating embeddings:', error);
            throw new Error(`OpenAI API Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    static validateDimensions(embedding: number[]): boolean {
        return embedding.length === 1536;
    }
}
