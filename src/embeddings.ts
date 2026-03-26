import OpenAI from "openai";
import { Meeting, MeetingChunk, EmbeddedChunk, SearchResult } from "./types.js";

/**
 * In-memory embedding store using OpenAI text-embedding-3-small.
 * Optional — gracefully degrades when no OpenAI key is provided.
 */
export class EmbeddingStore {
  private openai: OpenAI | null = null;
  private chunks: EmbeddedChunk[] = [];
  private indexedMeetings: Set<string> = new Set();

  constructor(openaiApiKey?: string) {
    if (openaiApiKey) {
      this.openai = new OpenAI({ apiKey: openaiApiKey });
    }
  }

  /** Returns true if OpenAI embeddings are available. */
  isAvailable(): boolean {
    return this.openai !== null;
  }

  /** Check if a meeting has already been indexed. */
  isIndexed(meetingId: string): boolean {
    return this.indexedMeetings.has(meetingId);
  }

  /**
   * Chunk a meeting into searchable pieces, embed them, and store.
   * Skips if already indexed.
   */
  async addMeeting(meeting: Meeting): Promise<void> {
    if (!this.openai || this.indexedMeetings.has(meeting.id)) return;

    const chunks = chunkMeeting(meeting);
    if (chunks.length === 0) return;

    const embedded = await this.embedChunks(chunks);
    this.chunks.push(...embedded);
    this.indexedMeetings.add(meeting.id);
  }

  /**
   * Add multiple meetings. Chunks and embeds in batches for efficiency.
   */
  async addMeetings(meetings: Meeting[]): Promise<void> {
    if (!this.openai) return;

    const newMeetings = meetings.filter((m) => !this.indexedMeetings.has(m.id));
    if (newMeetings.length === 0) return;

    const allChunks: MeetingChunk[] = [];
    for (const meeting of newMeetings) {
      allChunks.push(...chunkMeeting(meeting));
    }

    if (allChunks.length === 0) return;

    const embedded = await this.embedChunks(allChunks);
    this.chunks.push(...embedded);
    for (const meeting of newMeetings) {
      this.indexedMeetings.add(meeting.id);
    }
  }

  /**
   * Semantic search across all indexed chunks.
   * Returns top K results with source meeting info and matching text.
   */
  async search(query: string, topK = 10): Promise<SearchResult[]> {
    if (!this.openai || this.chunks.length === 0) return [];

    const queryEmbedding = await this.embed(query);

    // Score all chunks by cosine similarity
    const scored = this.chunks.map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);

    // Deduplicate by meeting — keep best chunk per meeting
    const seen = new Set<string>();
    const results: SearchResult[] = [];

    for (const { chunk, score } of scored) {
      if (results.length >= topK) break;

      const key = `${chunk.meeting_id}:${chunk.chunk_type}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Find all matching chunks from this meeting for excerpts
      const meetingChunks = scored
        .filter((s) => s.chunk.meeting_id === chunk.meeting_id)
        .slice(0, 3);

      results.push({
        meeting_id: chunk.meeting_id,
        meeting_title: chunk.meeting_title,
        meeting_date: chunk.meeting_date,
        score,
        matching_excerpts: meetingChunks.map((s) =>
          s.chunk.speaker
            ? `[${s.chunk.speaker}] ${s.chunk.text}`
            : s.chunk.text
        ),
        chunk_type: chunk.chunk_type,
      });
    }

    return results;
  }

  private async embed(text: string): Promise<number[]> {
    const response = await this.openai!.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return response.data[0].embedding;
  }

  private async embedChunks(chunks: MeetingChunk[]): Promise<EmbeddedChunk[]> {
    const BATCH_SIZE = 100;
    const results: EmbeddedChunk[] = [];

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map((c) => c.text);

      const response = await this.openai!.embeddings.create({
        model: "text-embedding-3-small",
        input: texts,
      });

      for (let j = 0; j < batch.length; j++) {
        results.push({
          ...batch[j],
          embedding: response.data[j].embedding,
        });
      }
    }

    return results;
  }
}

/**
 * Split a meeting into searchable text chunks.
 */
function chunkMeeting(meeting: Meeting): MeetingChunk[] {
  const chunks: MeetingChunk[] = [];
  const base = {
    meeting_id: meeting.id,
    meeting_title: meeting.title,
    meeting_date: meeting.created_at,
  };

  // Title as a chunk
  chunks.push({ ...base, chunk_type: "title", text: meeting.title });

  // Each summary section as a chunk
  if (meeting.summary) {
    for (const section of meeting.summary) {
      const text = `${section.title}: ${section.bullets.join(". ")}`;
      chunks.push({ ...base, chunk_type: "summary", text });
    }
  }

  // Each action item as a chunk
  if (meeting.action_items) {
    for (const item of meeting.action_items) {
      const text = item.assignee
        ? `Action item for ${item.assignee}: ${item.text}`
        : `Action item: ${item.text}`;
      chunks.push({ ...base, chunk_type: "action_item", text });
    }
  }

  // Transcript: group into ~500-token chunks preserving speaker context
  if (meeting.transcript && meeting.transcript.length > 0) {
    let currentChunk = "";
    let currentSpeaker = "";

    for (const entry of meeting.transcript) {
      const line = `${entry.speaker}: ${entry.text}`;

      // Rough token estimate: ~4 chars per token
      if (currentChunk.length + line.length > 2000) {
        if (currentChunk) {
          chunks.push({
            ...base,
            chunk_type: "transcript",
            speaker: currentSpeaker,
            text: currentChunk.trim(),
          });
        }
        currentChunk = line;
        currentSpeaker = entry.speaker;
      } else {
        currentChunk += "\n" + line;
        if (!currentSpeaker) currentSpeaker = entry.speaker;
      }
    }

    // Flush remaining
    if (currentChunk) {
      chunks.push({
        ...base,
        chunk_type: "transcript",
        speaker: currentSpeaker,
        text: currentChunk.trim(),
      });
    }
  }

  return chunks;
}

/**
 * Cosine similarity between two vectors. Pure JS, no dependencies.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
