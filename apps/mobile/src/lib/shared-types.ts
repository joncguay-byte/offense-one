export type KnownSpeakerHint = {
  speakerKey?: string;
  displayName: string;
  role: "OFFICER" | "CALLER" | "WITNESS" | "SUBJECT" | "OTHER";
};

export type DraftNarrativeRequest = {
  incidentTitle: string;
  officerPerspective: string;
  objective?: string;
  includeSceneSummary: boolean;
  includeWitnessSummary: boolean;
  includeCallForServiceContext?: boolean;
};

export type JobRecord = {
  id: string;
  type: "INGEST_AUDIO" | "GENERATE_REPORT" | "EXPORT_REPORT";
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  incidentId?: string;
  createdAt?: string;
  completedAt?: string | null;
  resultJson?: string | null;
  errorMessage?: string | null;
};

export type NotificationRecord = {
  id: string;
  title: string;
  body: string;
  type: "JOB_COMPLETED" | "JOB_FAILED" | "REPORT_APPROVED" | "REPORT_EXPORTED";
  readAt?: string | null;
  createdAt?: string;
};
