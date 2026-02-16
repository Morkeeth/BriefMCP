import { DocumentChunk } from './types';

/**
 * A robust Markdown chunker that respects semantic boundaries.
 * Limitation: Does not use a tokenizer (tiktoken) to keep dependencies low, 
 * uses character count approximation (1 token ~= 4 chars).
 */
export class Chunker {
    private static readonly MAX_CHUNK_SIZE_CHARS = 1000 * 4; // ~1000 tokens
    private static readonly OVERLAP_CHARS = 200;

    static chunk(markdown: string): DocumentChunk[] {
        const chunks: DocumentChunk[] = [];

        // 1. Normalize line endings
        const text = markdown.replace(/\r\n/g, '\n');

        // 2. Split by double newlines to get paragraphs/blocks
        // This is a naive approach; a full parser would be better but significantly more complex.
        // For a "noob friendly" setup, splitting by headers and paragraphs is standard.

        // We will use a regex to identify headers, but primarily split by paragraphs first
        const sections = this.splitByHeaders(text);

        let globalChunkIndex = 0;

        for (const section of sections) {
            if (!section.content.trim()) continue;

            // If section is small enough, keep as is
            if (section.content.length <= this.MAX_CHUNK_SIZE_CHARS) {
                chunks.push({
                    content: section.content.trim(),
                    chunkIndex: globalChunkIndex++,
                    metadata: {
                        startIndex: -1, // We aren't tracking precise offsets in this simple version
                        endIndex: -1,
                        headerPath: section.headers
                    }
                });
            } else {
                // Recursively split large sections
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
                // If we have content accumulated, push it
                if (currentContent.length > 0) {
                    sections.push({
                        headers: [...currentHeaders],
                        content: currentContent.join('\n')
                    });
                    currentContent = [];
                }

                const level = headerMatch[1].length;
                const text = headerMatch[2];

                // Adjust header stack
                // If header layer is same or shallower than current deep header, pop until we match hierarchy
                // Actually, for simplicity, we'll just track the "path" loosely.
                // A proper stack approach:
                // Level 1 replaces everything
                // Level 2 replaces Level 2+
                // ...

                // Reset stack if H1
                if (level === 1) {
                    currentHeaders = [text];
                } else {
                    // Keep headers up to level-1
                    currentHeaders = currentHeaders.slice(0, level - 1);
                    currentHeaders.push(text);
                }

                // Add header to content too, so it's searchable
                currentContent.push(line);
            } else {
                currentContent.push(line);
            }
        }

        // Push last section
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
            const end = start + maxSize;

            if (end >= text.length) {
                chunks.push(text.slice(start));
                break;
            }

            // Try to find a nice break point (newline or period)
            const lookbackWindow = Math.min(overlap, 500); // Look back up to 500 chars driven by overlap
            const sliceEnd = text.slice(start, end + lookbackWindow);

            // Preferred split: Double newline
            let effectiveEnd = sliceEnd.lastIndexOf('\n\n', maxSize);

            if (effectiveEnd === -1) {
                // Fallback: Single newline
                effectiveEnd = sliceEnd.lastIndexOf('\n', maxSize);
            }

            if (effectiveEnd === -1) {
                // Fallback: Period
                effectiveEnd = sliceEnd.lastIndexOf('. ', maxSize);
            }

            if (effectiveEnd === -1 || effectiveEnd < overlap) {
                // Hard split if no punctuation found
                effectiveEnd = maxSize;
            }

            chunks.push(text.slice(start, start + effectiveEnd));
            start += effectiveEnd - overlap; // Move back by overlap amount
        }

        return chunks;
    }
}
