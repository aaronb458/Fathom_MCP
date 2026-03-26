import { createHmac } from "node:crypto";
import { Request, Response } from "express";
import { Meeting, TranscriptResponse } from "./types.js";
import { FathomDB } from "./db.js";
import { FathomClient } from "./api.js";
import { extractFromTranscript } from "./extraction.js";

/**
 * Verify Fathom webhook signature (HMAC-SHA256).
 */
function verifySignature(secret: string, signature: string | undefined, rawBody: string): boolean {
  if (!signature) return false;

  // Format: "v1,<base64_signature> [<base64_signature2> ...]"
  const parts = signature.split(",");
  if (parts.length < 2) return false;

  const signatureBlock = parts[1].trim();
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  const signatures = signatureBlock.split(" ");
  return signatures.includes(expected);
}

/**
 * Process a webhook payload: save to DB + run AI extraction.
 */
async function processWebhook(
  meeting: Meeting,
  db: FathomDB,
  client: FathomClient,
  openaiKey?: string
): Promise<void> {
  const rid = meeting.recording_id;

  // Skip if already processed
  if (db.isProcessed(rid)) {
    console.error(`[webhook] Meeting ${rid} already processed, skipping`);
    return;
  }

  // Save meeting
  db.saveMeeting(meeting);
  console.error(`[webhook] Saved meeting: "${meeting.title}" (${rid})`);

  // Save native action items from Fathom
  if (meeting.action_items?.length > 0) {
    db.saveNativeActionItems(rid, meeting.action_items);
    console.error(`[webhook] Saved ${meeting.action_items.length} native action items`);
  }

  // Get transcript — from payload or fetch from API
  let transcript = meeting.transcript;
  if (!transcript) {
    try {
      const response = await client.getTranscript(rid);
      transcript = (response as TranscriptResponse).transcript ?? [];
    } catch (error) {
      console.error(`[webhook] Failed to fetch transcript for ${rid}:`, error instanceof Error ? error.message : error);
      transcript = [];
    }
  }

  // Save transcript
  if (transcript.length > 0) {
    db.saveTranscript(rid, transcript);
    console.error(`[webhook] Saved transcript: ${transcript.length} entries`);
  }

  // AI extraction
  if (openaiKey && transcript.length > 0) {
    console.error(`[webhook] Running AI extraction for "${meeting.title}"...`);
    const items = await extractFromTranscript(transcript, meeting.title, openaiKey);
    if (items.length > 0) {
      db.saveExtractedItems(rid, items);
      console.error(`[webhook] Extracted ${items.length} items (${items.filter(i => i.type === "action_item").length} actions, ${items.filter(i => i.type === "decision").length} decisions, ${items.filter(i => i.type === "follow_up").length} follow-ups)`);
    } else {
      console.error(`[webhook] No items extracted`);
    }
  } else if (!openaiKey) {
    console.error(`[webhook] Skipping AI extraction (no OPENAI_API_KEY)`);
  }
}

/**
 * Create the webhook Express handler.
 * Uses raw body for signature verification, then parses JSON.
 */
export function createWebhookHandler(
  db: FathomDB,
  client: FathomClient,
  openaiKey?: string
) {
  return async (req: Request, res: Response): Promise<void> => {
    const secret = process.env.FATHOM_WEBHOOK_SECRET;
    const rawBody = typeof req.body === "string" ? req.body : req.body?.toString("utf8") ?? "";

    // Verify signature if secret is configured
    if (secret) {
      const signature = req.headers["webhook-signature"] as string | undefined;
      if (!verifySignature(secret, signature, rawBody)) {
        console.error("[webhook] Invalid signature — rejecting");
        res.status(401).json({ error: "Invalid webhook signature" });
        return;
      }
    }

    // Respond 200 immediately — don't make Fathom wait
    res.status(200).json({ received: true });

    // Parse and process async
    try {
      const meeting: Meeting = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
      if (!meeting.recording_id) {
        console.error("[webhook] Payload missing recording_id, skipping");
        return;
      }
      await processWebhook(meeting, db, client, openaiKey);
    } catch (error) {
      console.error("[webhook] Processing error:", error instanceof Error ? error.message : error);
    }
  };
}

/**
 * Backfill: pull last N days of meetings from Fathom API, save to DB, run AI extraction.
 * Only runs if DB is empty (first boot).
 */
export async function backfillMeetings(
  db: FathomDB,
  client: FathomClient,
  openaiKey?: string,
  daysBack = 30
): Promise<void> {
  if (!db.isEmpty()) {
    console.error("[backfill] DB already has data, skipping backfill");
    return;
  }

  console.error(`[backfill] First boot — pulling last ${daysBack} days of meetings...`);

  const meetings = await client.listAllMeetings({
    created_after: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString(),
    created_before: new Date().toISOString(),
    include_summary: true,
    include_action_items: true,
  });

  console.error(`[backfill] Found ${meetings.length} meetings`);

  for (const meeting of meetings) {
    try {
      // Save meeting
      db.saveMeeting(meeting);

      // Save native action items
      if (meeting.action_items?.length > 0) {
        db.saveNativeActionItems(meeting.recording_id, meeting.action_items);
      }

      // Fetch transcript
      let transcript = meeting.transcript;
      if (!transcript) {
        try {
          const response = await client.getTranscript(meeting.recording_id);
          transcript = (response as TranscriptResponse).transcript ?? [];
        } catch {
          transcript = [];
        }
      }

      if (transcript.length > 0) {
        db.saveTranscript(meeting.recording_id, transcript);
      }

      // AI extraction
      if (openaiKey && transcript.length > 0 && !db.isProcessed(meeting.recording_id)) {
        const items = await extractFromTranscript(transcript, meeting.title, openaiKey);
        if (items.length > 0) {
          db.saveExtractedItems(meeting.recording_id, items);
        }
        console.error(`[backfill] Processed "${meeting.title}" → ${items.length} items`);
      } else {
        console.error(`[backfill] Saved "${meeting.title}" (no AI extraction)`);
      }
    } catch (error) {
      console.error(`[backfill] Error processing "${meeting.title}":`, error instanceof Error ? error.message : error);
    }
  }

  console.error(`[backfill] Complete`);
}
