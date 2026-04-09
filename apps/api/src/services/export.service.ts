import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config.js";

type ExportInput = {
  incidentId: string;
  reportId: string;
  caseNumber: string;
  title: string;
  body: string;
  reviewNotes?: string | null;
  reportStatus?: string;
  approvedAt?: string | null;
};

type ExportResult = {
  adapter: string;
  path?: string;
  target?: string;
  payload: Record<string, unknown>;
};

function buildPayload(input: ExportInput) {
  return {
    adapterVersion: "1.0",
    exportType: "RMS_INCIDENT_REPORT",
    case: {
      incidentId: input.incidentId,
      caseNumber: input.caseNumber,
      title: input.title
    },
    report: {
      reportId: input.reportId,
      status: input.reportStatus || "APPROVED",
      approvedAt: input.approvedAt || null,
      body: input.body,
      reviewNotes: input.reviewNotes || null
    },
    transmission: {
      exportedAt: new Date().toISOString(),
      sourceSystem: "Offense One"
    }
  };
}

async function exportToLocalJson(input: ExportInput): Promise<ExportResult> {
  const exportDir = path.join(env.EVIDENCE_STORAGE_PATH, "exports");
  await mkdir(exportDir, { recursive: true });

  const payload = buildPayload(input);
  const filePath = path.join(exportDir, `${input.caseNumber}-${input.reportId}.json`);
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");

  return {
    adapter: "local-json",
    path: filePath,
    payload
  };
}

async function exportToWebhook(input: ExportInput): Promise<ExportResult> {
  if (!env.EXPORT_WEBHOOK_URL) {
    throw new Error("Webhook export adapter is selected but EXPORT_WEBHOOK_URL is not configured.");
  }

  const payload = buildPayload(input);
  const response = await fetch(env.EXPORT_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Webhook export failed with status ${response.status}.`);
  }

  return {
    adapter: "webhook",
    target: env.EXPORT_WEBHOOK_URL,
    payload
  };
}

export async function exportApprovedReport(input: ExportInput): Promise<ExportResult> {
  if (env.EXPORT_ADAPTER === "webhook") {
    return exportToWebhook(input);
  }

  return exportToLocalJson(input);
}
