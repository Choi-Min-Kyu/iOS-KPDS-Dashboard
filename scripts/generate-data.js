const fs = require("fs");
const path = require("path");
const { fetchDashboardPayload } = require("./lib/kpds-data");

async function main() {
  const payload = await fetchDashboardPayload();
  const outPath = path.join(__dirname, "..", "data", "dashboard.json");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");

  console.log(`Dashboard data written to ${outPath}`);
  console.log(`Generated at: ${payload.generatedAt}`);
  console.log(`Modules: ${payload.summary.moduleCount}, Children: ${payload.summary.childCount}`);
}

main().catch((error) => {
  console.error("Failed to generate dashboard data:", error.message);
  process.exit(1);
});
