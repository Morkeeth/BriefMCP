export interface DocumentChunk {
    content: string;
    chunkIndex: number;
    metadata: {
        startIndex: number;
        endIndex: number;
        headerPath?: string[];
    };
}

export class Chunker {
    private static readonly MAX_CHUNK_SIZE_CHARS = 1000 * 4; // ~1000 tokens
    private static readonly OVERLAP_CHARS = 200;

    static chunk(markdown: string): DocumentChunk[] {
        const chunks: DocumentChunk[] = [];
        const text = markdown.replace(/\r\n/g, '\n');
        const sections = this.splitByHeaders(text);

        let globalChunkIndex = 0;

        for (const section of sections) {
            if (!section.content.trim()) continue;

            if (section.content.length <= this.MAX_CHUNK_SIZE_CHARS) {
                chunks.push({
                    content: section.content.trim(),
                    chunkIndex: globalChunkIndex++,
                    metadata: {
                        startIndex: -1,
                        endIndex: -1,
                        headerPath: section.headers
                    }
                });
            } else {
                const subChunks = this.recursiveSplit(section.content, this.MAX_CHUNK_SIZE_CHARS, this.OVERLAP_CHARS);
                subChunks.forEach(sub => {
                    chunks.push({
                        content: sub.trim(),
                        chunkIndex: globalChunkIndex++,
                        metadata: {
                            startIndex: -1,
                            endIndex: -1,
                            headerPath: section.headers
                        }
                    });
                });
            }
        }

        return chunks;
    }

    private static splitByHeaders(text: string): { headers: string[], content: string }[] {
        const lines = text.split('\n');
        const sections: { headers: string[], content: string }[] = [];

        let currentHeaders: string[] = [];
        let currentContent: string[] = [];

        for (const line of lines) {
            const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

            if (headerMatch) {
                if (currentContent.length > 0) {
                    sections.push({
                        headers: [...currentHeaders],
                        content: currentContent.join('\n')
                    });
                    currentContent = [];
                }

                const level = headerMatch[1].length;
                const text = headerMatch[2];

                if (level === 1) {
                    currentHeaders = [text];
                } else {
                    currentHeaders = currentHeaders.slice(0, level - 1);
                    currentHeaders.push(text);
                }
                currentContent.push(line);
            } else {
                currentContent.push(line);
            }
        }

        if (currentContent.length > 0) {
            sections.push({
                headers: [...currentHeaders],
                content: currentContent.join('\n')
            });
        }

        return sections;
    }

    private static recursiveSplit(text: string, maxSize: number, overlap: number): string[] {
        if (text.length <= maxSize) return [text];

        const chunks: string[] = [];
        let start = 0;

        while (start < text.length) {
            let end = start + maxSize;

            if (end >= text.length) {
                chunks.push(text.slice(start));
                break;
            }

            const lookbackWindow = Math.min(overlap, 500);
            const sliceEnd = text.slice(start, end + lookbackWindow);

            let effectiveEnd = sliceEnd.lastIndexOf('\n\n', maxSize);
            if (effectiveEnd === -1) effectiveEnd = sliceEnd.lastIndexOf('\n', maxSize);
            if (effectiveEnd === -1) effectiveEnd = sliceEnd.lastIndexOf('. ', maxSize);
            if (effectiveEnd === -1 || effectiveEnd < overlap) effectiveEnd = maxSize;

            chunks.push(text.slice(start, start + effectiveEnd));
            start += effectiveEnd - overlap;
        }

        return chunks;
    }
}
