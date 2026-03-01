/**
 * Load .env from project root (parent of backend/) so OPENAI_API_KEY etc.
 * are available when the server runs from backend/ (e.g. npm run start).
 */
import path from "path";
import { config } from "dotenv";

// __dirname = backend/ when running ts-node index.ts from backend/
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");
config({ path: envPath });
