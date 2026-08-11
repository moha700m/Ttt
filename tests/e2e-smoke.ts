export {};

const base = process.env.TEST_BASE_URL || "http://localhost:3000";
const response = await fetch(`${base}/api/health`);
if (!response.ok) throw new Error(`health failed: ${response.status}`);
console.log("E2E smoke: health endpoint PASS");
