import "dotenv/config";
import { closeDatabase, initDatabase, insertWebhookEvent } from "../src/db/index.js";

async function main() {
  await initDatabase();
  const row = await insertWebhookEvent("mission_completed", {
    task_uuid: "0bbc74b4-5e5a-4390-9256-8e4ee08a241b",
    status: "success",
    name: "Facility Perimeter Inspection",
    message: "Demo seed event for Marafiq integration test",
  });
  console.log("Seeded event:", row.id, row.event_type);
  await closeDatabase();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
