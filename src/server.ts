import { getApp } from "./bootstrap.js";
import { config } from "./config.js";

async function main() {
  const app = await getApp();
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  const scheme = config.HTTPS_REQUIRED ? "https" : "http";
  app.log.info(
    {
      port: config.PORT,
      fh2Mode: config.FH2_MODE,
      fh2LiveReady: config.fh2LiveReady,
      httpsRequired: config.HTTPS_REQUIRED,
      docs: `${scheme}://localhost:${config.PORT}/docs`,
    },
    "Shamal FH2 middleware started",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
