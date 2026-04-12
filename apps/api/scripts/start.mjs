import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "..");
const prismaCliEntryCandidates = [
  path.resolve(__dirname, "../node_modules/prisma/build/index.js"),
  path.resolve(__dirname, "../../../node_modules/prisma/build/index.js")
];
const prismaCliEntry = prismaCliEntryCandidates.find((candidate) => existsSync(candidate));

if (!prismaCliEntry) {
  throw new Error("Unable to locate the Prisma CLI entrypoint for API startup.");
}

const databaseUrl = process.env.DATABASE_URL?.trim() || "file:./prisma/dev.db";
const jwtSecret = process.env.JWT_SECRET?.trim() || "offense-one-trial-secret-change-me";
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  JWT_SECRET: jwtSecret
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
      cwd: apiRoot
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}.`));
    });

    child.on("error", reject);
  });
}

await run(process.execPath, [prismaCliEntry, "db", "push", "--schema", "prisma/schema.prisma"]);
await run("node", ["dist/server.js"]);
