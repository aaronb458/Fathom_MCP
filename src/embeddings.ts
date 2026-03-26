import OpenAI from "openai";
import { Meeting, MeetingChunk, EmbeddedChunk, SearchResult } from "./types.js";

/**
 * In-memory embedding store using OpenAI text-embedding-3-small.
 * Optional — gracefully degrades when no OpenAI key is provided.
 */
export class EmbeddingStore {
  private openai: OpenAI | null = null;
  private chunks: EmbeddedChunk[] = [];
  private indexedMeetings: Set<number> = new Set();

  constructor(openaiApiKey?: string) {
    if (openaiApiKey) {
      this.openai = new OpenAI({ apiKey: openaiApiKey });
    }
  }

  isAvailable(): boolean {
    return this.openai !== null;
  }

  isIndexed(recordingId: number): boolean {
    return this.indexedMeetings.has(recordingId);
  }

  async addMeeting(meeting: Meeting): Promise<void> {
    if (!this.openai || this.indexedMeetings.has(meeting.recording_id)) return;

    const chunks = chunkMeeting(meeting);
    if (chunks.length === 0) return;

    try {
      const embedded = await this.embedChunks(chunks);
      this.chunks.push(...embedded);
      this.indexedMeetings.add(meeting.recording_id);
    } catch {
      // OpenAI call failed — don't crash, just skip indexing
    }
  }

  async addMeetings(meetings: Meeting[]): Promise<void> {
    if (!this.openai) return;

    const newMeetings = meetings.filter((m) => !this.indexedMeetings.has(m.recording_id));
    if (newMeetings.length === 0) return;

    const allChunks: MeetingChunk[] = [];
    for (const meeting of newMeetings) {
      allChunks.push(...chunkMeeting(meeting));
    }

    if (allChunks.length === 0) return;

    try {
      const embedded = await this.embedChunks(allChunks);
      this.chunks.push(...embedded);
      for (const meeting of newMeetings) {
        this.indexedMeetings.add(meeting.recording_id);
      }
    } catch {
      // OpenAI call failed — graceful degradation, keyword search will be used
    }
  }

  async search(query: string, topK = 10): Promise<SearchResult[]> {
    if (!this.openai || this.chunks.length === 0) return [];

    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.embed(query);
    } catch {
      return []; // OpenAI failed — caller should fall back to keyword search
    }

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

      const key = `${chunk.recording_id}:${chunk.chunk_type}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const meetingChunks = scored
        .filter((s) => s.chunk.recording_id === chunk.recording_id)
        .slice(0, 3);

      results.push({
        recording_id: chunk.recording_id,
        meeting_title: chunk.meeting_title,
        meeting_date: chunk.meeting_date,
        score,
        matching_excerpts: meetingChunks.map((s) =>
          s.chunk.speaker
            ? `[${s.chunk.speaker}] ${s.chunk.text}`
            : s.chunk.text
        ),
        chunk_type: chunk.chunk_type,
        url: "",
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
 * Uses the real Fathom data structure (markdown summary, speaker objects).
 */
function chunkMeeting(meeting: Meeting): MeetingChunk[] {
  const chunks: MeetingChunk[] = [];
  const base = {
    recording_id: meeting.recording_id,
    meeting_title: meeting.title,
    meeting_date: meeting.created_at,
  };

  // Title
  chunks.push({ ...base, chunk_type: "title", text: meeting.title });

  // Summary — split markdown into paragraph chunks
  if (meeting.default_summary?.markdown_formatted) {
    const sections = meeting.default_summary.markdown_formatted
      .split(/^###\s+/m)
      .filter((s) => s.trim().length > 0);

    for (const section of sections) {
      // Clean markdown links and formatting
      const cleaned = section
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\n/g, " ")
        .trim();
      if (cleaned.length > 0) {
        chunks.push({ ...base, chunk_type: "summary", text: cleaned });
      }
    }
  }

  // Action items
  for (const item of meeting.action_items) {
    const text = item.assignee
      ? `Action item for ${item.assignee.name}: ${item.description}`
      : `Action item: ${item.description}`;
    chunks.push({ ...base, chunk_type: "action_item", text });
  }

  // Transcript — group into ~500-token chunks
  if (meeting.transcript && meeting.transcript.length > 0) {
    let currentChunk = "";
    let currentSpeaker = "";

    for (const entry of meeting.transcript) {
      const speakerName = entry.speaker.display_name;
      const line = `${speakerName}: ${entry.text}`;

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
        currentSpeaker = speakerName;
      } else {
        currentChunk += "\n" + line;
        if (!currentSpeaker) currentSpeaker = speakerName;
      }
    }

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
