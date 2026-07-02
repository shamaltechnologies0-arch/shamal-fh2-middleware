import { MongoClient } from "mongodb";
import { config } from "../config.js";

async function migrate() {
  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const collection = client.db(config.MONGODB_DB_NAME).collection("webhook_events");
  await collection.createIndex({ received_at: -1 });
  await collection.createIndex({ event_type: 1 });
  console.log("MongoDB indexes ensured on webhook_events.");
  await client.close();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
