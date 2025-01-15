// server/rag/chunk.ts
export function chunkText(text: string, chunkSize = 1000, chunkOverlap = 100): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end);
    chunks.push(chunk);
    // Move start forward by chunkSize - overlap
    start += (chunkSize - chunkOverlap);
  }

  return chunks;
}
