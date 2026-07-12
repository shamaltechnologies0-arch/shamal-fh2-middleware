import { MongoClient } from "mongodb";
import { config } from "../../config/env.js";

async function migrate() {
  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const db = client.db(config.MONGODB_DB_NAME);
  const events = db.collection("webhook_events");
  await events.createIndex({ received_at: -1 });
  await events.createIndex({ event_type: 1 });
  const platformData = db.collection("platform_data");
  await platformData.createIndex({ updated_at: -1 });
  console.log("MongoDB indexes ensured on webhook_events and platform_data.");
  await client.close();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
