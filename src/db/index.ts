import { randomUUID } from "node:crypto";
import { type Collection, MongoClient } from "mongodb";
import { config } from "../config.js";

export interface WebhookEventRow {
  id: string;
  source: string;
  event_type: string;
  payload: Record<string, unknown>;
  received_at: Date;
}

interface WebhookEventDoc {
  _id: string;
  source: string;
  event_type: string;
  payload: Record<string, unknown>;
  received_at: Date;
}

let client: MongoClient | null = null;
let eventsCollection: Collection<WebhookEventDoc> | null = null;
let platformDataCollection: Collection<PlatformDataDoc> | null = null;

interface PlatformDataDoc {
  _id: string;
  data: unknown;
  updated_at: Date;
}

function mapDoc(doc: WebhookEventDoc): WebhookEventRow {
  return {
    id: doc._id,
    source: doc.source,
    event_type: doc.event_type,
    payload: doc.payload,
    received_at: doc.received_at,
  };
}

function requireEventsCollection(): Collection<WebhookEventDoc> {
  if (!eventsCollection) {
    throw new Error(
      "MongoDB is not initialized. Ensure MONGODB_URI is set and the server started successfully.",
    );
  }
  return eventsCollection;
}

export function isDatabaseReady(): boolean {
  return client !== null && platformDataCollection !== null;
}

export async function getPlatformStoreDocument(
  key: string,
): Promise<unknown | undefined> {
  if (!platformDataCollection) return undefined;
  const doc = await platformDataCollection.findOne({ _id: key });
  return doc?.data;
}

export async function setPlatformStoreDocument(
  key: string,
  data: unknown,
): Promise<void> {
  const collection = requirePlatformDataCollection();
  await collection.updateOne(
    { _id: key },
    { $set: { data, updated_at: new Date() } },
    { upsert: true },
  );
}

function requirePlatformDataCollection(): Collection<PlatformDataDoc> {
  if (!platformDataCollection) {
    throw new Error(
      "MongoDB platform store is not initialized. Ensure MONGODB_URI is set.",
    );
  }
  return platformDataCollection;
}

export async function initDatabase(): Promise<void> {
  client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const db = client.db(config.MONGODB_DB_NAME);
  eventsCollection = db.collection<WebhookEventDoc>("webhook_events");
  platformDataCollection = db.collection<PlatformDataDoc>("platform_data");
  await eventsCollection.createIndex({ received_at: -1 });
  await eventsCollection.createIndex({ event_type: 1 });
  await platformDataCollection.createIndex({ updated_at: -1 });
  console.info(
    `[db] MongoDB connected (database: ${config.MONGODB_DB_NAME})`,
  );
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    eventsCollection = null;
    platformDataCollection = null;
  }
}

export async function insertWebhookEvent(
  eventType: string,
  payload: Record<string, unknown>,
  source = "fh2",
): Promise<WebhookEventRow> {
  const row: WebhookEventRow = {
    id: randomUUID(),
    source,
    event_type: eventType,
    payload,
    received_at: new Date(),
  };

  const collection = requireEventsCollection();
  await collection.insertOne({
    _id: row.id,
    source,
    event_type: eventType,
    payload,
    received_at: row.received_at,
  });
  return row;
}

export async function listWebhookEvents(
  since?: string,
  limit = 50,
): Promise<WebhookEventRow[]> {
  const collection = requireEventsCollection();
  const filter = since ? { received_at: { $gt: new Date(since) } } : {};
  const docs = await collection
    .find(filter)
    .sort({ received_at: -1 })
    .limit(limit)
    .toArray();
  return docs.map(mapDoc);
}

export function mapFh2PayloadToEventType(payload: Record<string, unknown>): string {
  const raw =
    (payload.event_type as string | undefined) ??
    (payload.type as string | undefined) ??
    (payload.event as string | undefined);

  if (!raw) {
    if (payload.task_uuid && payload.status === "success") return "mission_completed";
    if (payload.task_uuid) return "mission_updated";
    if (payload.device_sn) return "device_event";
    return "unknown";
  }

  const normalized = raw.toLowerCase().replace(/\s+/g, "_");
  const mapping: Record<string, string> = {
    task_success: "mission_completed",
    flight_task_success: "mission_completed",
    media_ready: "media_ready",
    media_upload_finished: "media_ready",
    device_offline: "device_offline",
    device_online: "device_online",
    battery_low: "battery_low",
    mission_failed: "mission_failed",
  };
  return mapping[normalized] ?? normalized;
}
