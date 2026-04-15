import { Directory, File, Paths } from "expo-file-system";

export type LocalEvidenceRecord = {
  id: string;
  incidentId: string;
  type: "AUDIO" | "IMAGE" | "VIDEO";
  sourceUri: string;
  savedUri: string;
  fileName: string;
  createdAt: string;
  createdBy?: string | null;
  selectedForDraft?: boolean;
  label?: string | null;
};

const evidenceDirectory = new Directory(Paths.document, "offense-one-evidence");
const manifestFile = new File(evidenceDirectory, "manifest.json");

function ensureEvidenceDirectory() {
  if (!evidenceDirectory.exists) {
    evidenceDirectory.create({ intermediates: true, idempotent: true });
  }
}

async function loadManifest() {
  ensureEvidenceDirectory();
  if (!manifestFile.exists) {
    return [] as LocalEvidenceRecord[];
  }

  try {
    const parsed = JSON.parse(await manifestFile.text()) as LocalEvidenceRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveManifest(records: LocalEvidenceRecord[]) {
  ensureEvidenceDirectory();
  if (!manifestFile.exists) {
    manifestFile.create({ intermediates: true, overwrite: true });
  }
  manifestFile.write(JSON.stringify(records, null, 2));
}

function timestampForFileName() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function saveLocalAudioEvidence(incidentId: string, sourceUri: string, createdBy?: string | null) {
  ensureEvidenceDirectory();
  const sourceFile = new File(sourceUri);
  const extension = sourceFile.extension || ".m4a";
  const fileName = `${incidentId}-scene-audio-${timestampForFileName()}${extension}`;
  const destination = new File(evidenceDirectory, fileName);

  if (destination.exists) {
    destination.delete();
  }
  sourceFile.copy(destination);

  const record: LocalEvidenceRecord = {
    id: `local-audio-${Date.now()}`,
    incidentId,
    type: "AUDIO",
    sourceUri,
    savedUri: destination.uri,
    fileName,
    createdAt: new Date().toISOString(),
    createdBy
  };
  const records = await loadManifest();
  await saveManifest([record, ...records]);
  return record;
}

export async function saveLocalImageEvidence(incidentId: string, sourceUri: string, label: string, createdBy?: string | null) {
  ensureEvidenceDirectory();
  const sourceFile = new File(sourceUri);
  const fileName = `${incidentId}-${label.toLowerCase().replace(/\s+/g, "-")}-${timestampForFileName()}.jpg`;
  const destination = new File(evidenceDirectory, fileName);

  if (destination.exists) {
    destination.delete();
  }
  sourceFile.copy(destination);

  const record: LocalEvidenceRecord = {
    id: `local-image-${Date.now()}`,
    incidentId,
    type: "IMAGE",
    sourceUri,
    savedUri: destination.uri,
    fileName,
    createdAt: new Date().toISOString(),
    createdBy,
    label
  };
  const records = await loadManifest();
  await saveManifest([record, ...records]);
  return record;
}

export async function saveLocalVideoEvidence(incidentId: string, sourceUri: string, label: string, createdBy?: string | null) {
  ensureEvidenceDirectory();
  const sourceFile = new File(sourceUri);
  const extension = sourceFile.extension || ".mp4";
  const fileName = `${incidentId}-${label.toLowerCase().replace(/\s+/g, "-")}-${timestampForFileName()}${extension}`;
  const destination = new File(evidenceDirectory, fileName);

  if (destination.exists) {
    destination.delete();
  }
  sourceFile.copy(destination);

  const record: LocalEvidenceRecord = {
    id: `local-video-${Date.now()}`,
    incidentId,
    type: "VIDEO",
    sourceUri,
    savedUri: destination.uri,
    fileName,
    createdAt: new Date().toISOString(),
    createdBy,
    label
  };
  const records = await loadManifest();
  await saveManifest([record, ...records]);
  return record;
}

export async function setLocalEvidenceSelected(recordId: string, selectedForDraft: boolean) {
  const records = await loadManifest();
  const nextRecords = records.map((record) => (record.id === recordId ? { ...record, selectedForDraft } : record));
  await saveManifest(nextRecords);
  return nextRecords.find((record) => record.id === recordId) || null;
}

export async function deleteLocalEvidence(recordId: string) {
  const records = await loadManifest();
  const record = records.find((item) => item.id === recordId);
  if (record?.savedUri) {
    try {
      const file = new File(record.savedUri);
      if (file.exists) {
        file.delete();
      }
    } catch {
      // Keep manifest cleanup moving even if the OS has already removed the file.
    }
  }

  const nextRecords = records.filter((item) => item.id !== recordId);
  await saveManifest(nextRecords);
  return record || null;
}

export async function deleteLocalEvidenceForIncident(incidentId: string) {
  const records = await loadManifest();
  const incidentRecords = records.filter((record) => record.incidentId === incidentId);

  for (const record of incidentRecords) {
    if (!record.savedUri) {
      continue;
    }

    try {
      const file = new File(record.savedUri);
      if (file.exists) {
        file.delete();
      }
    } catch {
      // Keep deleting the rest of the incident even if one file is already gone.
    }
  }

  const nextRecords = records.filter((record) => record.incidentId !== incidentId);
  await saveManifest(nextRecords);
  return incidentRecords;
}

export async function loadLocalEvidence(incidentId?: string | null) {
  const records = await loadManifest();
  return incidentId ? records.filter((record) => record.incidentId === incidentId) : records;
}
