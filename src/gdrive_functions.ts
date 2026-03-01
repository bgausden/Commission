import { google, drive_v3 } from "googleapis";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Result, ok, err } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriveArtifact {
  localPath: string;
  mimeType: string;
  remoteName: string;
}

export interface FolderHierarchy {
  year: string;   // e.g. "2026"
  month: string;  // e.g. "202602"
}

// ---------------------------------------------------------------------------
// Functional core — pure, no I/O
// ---------------------------------------------------------------------------

export function buildFolderHierarchy(payrollYear: string, payrollMonth: string): FolderHierarchy {
  const monthNames: Record<string, string> = {
    January: "01", February: "02", March: "03", April: "04",
    May: "05", June: "06", July: "07", August: "08",
    September: "09", October: "10", November: "11", December: "12",
  };
  const monthNum = monthNames[payrollMonth] ?? "00";
  return {
    year: payrollYear,
    month: `${payrollYear}${monthNum}`,
  };
}

export function buildArtifactList(
  inputFilePath: string,
  paymentsFilePath: string,
  commissionLogPath: string,
  contractorLogPath: string,
  debugLogPath: string,
  staffHurdlePath: string,
): DriveArtifact[] {
  return [
    {
      localPath: inputFilePath,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      remoteName: path.basename(inputFilePath),
    },
    {
      localPath: paymentsFilePath,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      remoteName: path.basename(paymentsFilePath),
    },
    {
      localPath: commissionLogPath,
      mimeType: "text/plain",
      remoteName: path.basename(commissionLogPath),
    },
    {
      localPath: contractorLogPath,
      mimeType: "text/plain",
      remoteName: path.basename(contractorLogPath),
    },
    {
      localPath: debugLogPath,
      mimeType: "text/plain",
      remoteName: path.basename(debugLogPath),
    },
    {
      localPath: staffHurdlePath,
      mimeType: "application/json",
      remoteName: path.basename(staffHurdlePath),
    },
  ];
}

// ---------------------------------------------------------------------------
// Imperative shell — all I/O, returns Result
// ---------------------------------------------------------------------------

export async function authenticate(): Promise<Result<drive_v3.Drive>> {
  const keyFile = process.env.GDRIVE_SERVICE_ACCOUNT_KEY;
  if (!keyFile) {
    return err("GDRIVE_SERVICE_ACCOUNT_KEY is not set in environment");
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    const drive = google.drive({ version: "v3", auth });
    return ok(drive);
  } catch (e) {
    return err(`Failed to authenticate with Google Drive: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function findFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string,
): Promise<Result<string | null>> {
  try {
    const response = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${name}' and '${parentId}' in parents and trashed=false`,
      fields: "files(id)",
      pageSize: 1,
    });
    const files = response.data.files ?? [];
    return ok(files.length > 0 ? (files[0].id ?? null) : null);
  } catch (e) {
    return err(`Failed to search for folder '${name}': ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function getOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string,
): Promise<Result<string>> {
  const findResult = await findFolder(drive, name, parentId);
  if (!findResult.ok) return findResult;

  if (findResult.value !== null) {
    return ok(findResult.value);
  }

  try {
    const response = await drive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      },
      fields: "id",
    });
    const id = response.data.id;
    if (!id) return err(`Created folder '${name}' but received no ID`);
    return ok(id);
  } catch (e) {
    return err(`Failed to create folder '${name}': ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function folderHasFiles(
  drive: drive_v3.Drive,
  folderId: string,
): Promise<Result<boolean>> {
  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id)",
      pageSize: 1,
    });
    return ok((response.data.files ?? []).length > 0);
  } catch (e) {
    return err(`Failed to check folder contents: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function uploadFile(
  drive: drive_v3.Drive,
  folderId: string,
  artifact: DriveArtifact,
): Promise<Result<string>> {
  try {
    const response = await drive.files.create({
      requestBody: {
        name: artifact.remoteName,
        parents: [folderId],
      },
      media: {
        mimeType: artifact.mimeType,
        body: createReadStream(artifact.localPath),
      },
      fields: "id",
    });
    const id = response.data.id;
    if (!id) return err(`Uploaded '${artifact.remoteName}' but received no file ID`);
    return ok(id);
  } catch (e) {
    return err(`Failed to upload '${artifact.remoteName}': ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function uploadRunArtifacts(
  artifacts: DriveArtifact[],
  hierarchy: FolderHierarchy,
): Promise<Result<void>> {
  const rootFolderId = process.env.GDRIVE_TALENOX_FOLDER_ID;
  if (!rootFolderId) {
    return err("GDRIVE_TALENOX_FOLDER_ID is not set in environment");
  }

  const authResult = await authenticate();
  if (!authResult.ok) return authResult;
  const drive = authResult.value;

  const yearFolderResult = await getOrCreateFolder(drive, hierarchy.year, rootFolderId);
  if (!yearFolderResult.ok) return yearFolderResult;
  const yearFolderId = yearFolderResult.value;

  const existingMonthResult = await findFolder(drive, hierarchy.month, yearFolderId);
  if (!existingMonthResult.ok) return existingMonthResult;

  if (existingMonthResult.value !== null) {
    const hasFilesResult = await folderHasFiles(drive, existingMonthResult.value);
    if (!hasFilesResult.ok) return hasFilesResult;
    if (hasFilesResult.value) {
      return err(`Drive folder ${hierarchy.year}/${hierarchy.month} already exists and contains files — skipping upload to avoid overwriting`);
    }
  }

  const monthFolderResult = await getOrCreateFolder(drive, hierarchy.month, yearFolderId);
  if (!monthFolderResult.ok) return monthFolderResult;
  const monthFolderId = monthFolderResult.value;

  for (const artifact of artifacts) {
    const uploadResult = await uploadFile(drive, monthFolderId, artifact);
    if (!uploadResult.ok) return uploadResult;
  }

  return ok(undefined);
}
