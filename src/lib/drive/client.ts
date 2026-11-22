import 'server-only';
import { google } from 'googleapis';

export async function getDriveClient(refreshToken: string) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2 });
}

export type DriveFileMeta = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  md5Checksum?: string;
};

export async function getDriveFileMeta(
  refreshToken: string,
  fileId: string
): Promise<DriveFileMeta> {
  const drive = await getDriveClient(refreshToken);
  const { data } = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size, md5Checksum',
  });
  if (!data.id) throw new Error('DRIVE_FILE_NOT_FOUND');
  return {
    id: data.id,
    name: data.name ?? '',
    mimeType: data.mimeType ?? 'application/octet-stream',
    size: Number(data.size ?? 0),
    md5Checksum: data.md5Checksum ?? undefined,
  };
}

export async function getDriveQuota(refreshToken: string): Promise<{
  total: number;
  used: number;
}> {
  const drive = await getDriveClient(refreshToken);
  const { data } = await drive.about.get({ fields: 'storageQuota' });
  return {
    total: Number(data.storageQuota?.limit ?? 0),
    used: Number(data.storageQuota?.usage ?? 0),
  };
}

export async function deleteDriveFile(refreshToken: string, fileId: string): Promise<void> {
  const drive = await getDriveClient(refreshToken);
  await drive.files.delete({ fileId });
}

const EXTENSION_FOLDER_MAP: Record<string, string> = {
  pdf: 'PDFs',
  doc: 'Docx',
  docx: 'Docx',
  odt: 'Docx',
  rtf: 'Docx',
  txt: 'Docx',
  ppt: 'PowerPoints',
  pptx: 'PowerPoints',
  odp: 'PowerPoints',
  key: 'PowerPoints',
  xls: 'Excel',
  xlsx: 'Excel',
  csv: 'Excel',
  ods: 'Excel',
  png: 'Images',
  jpg: 'Images',
  jpeg: 'Images',
  webp: 'Images',
  gif: 'Images',
  svg: 'Images',
  avif: 'Images',
  mp4: 'Videos',
  webm: 'Videos',
  mov: 'Videos',
  avi: 'Videos',
  mkv: 'Videos',
  mp3: 'Audio',
  wav: 'Audio',
  m4a: 'Audio',
  ogg: 'Audio',
  aac: 'Audio',
  zip: 'Archives',
  rar: 'Archives',
  '7z': 'Archives',
  tar: 'Archives',
  gz: 'Archives',
};

/**
 * Resolves the subfolder name inside `Store/` for a given file extension
 * (e.g. pdf -> PDFs, docx -> Docx, pptx -> PowerPoints).
 * Any new/unmapped extension automatically gets its own clean folder name.
 */
export function resolveFileTypeFolderName(extension: string, customCategoryName?: string | null): string {
  const custom = customCategoryName?.trim();
  if (custom) {
    return custom.replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);
  }
  const cleanExt = extension.trim().toLowerCase().replace(/^\./, '');
  if (!cleanExt) return 'Other';
  return EXTENSION_FOLDER_MAP[cleanExt] ?? cleanExt.toUpperCase();
}

function escapeDriveQueryValue(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Finds an existing non-trashed folder by name under `parentId`, or creates it.
 */
export async function ensureDriveFolder(
  refreshToken: string,
  folderName: string,
  parentId: string = 'root',
): Promise<string> {
  const drive = await getDriveClient(refreshToken);
  const safeName = escapeDriveQueryValue(folderName);
  const safeParent = escapeDriveQueryValue(parentId);

  const { data: list } = await drive.files.list({
    q: `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and '${safeParent}' in parents and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
    spaces: 'drive',
  });

  if (list.files?.[0]?.id) {
    return list.files[0].id;
  }

  const { data: created } = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });

  if (!created.id) {
    throw new Error('DRIVE_FOLDER_CREATE_FAILED');
  }
  return created.id;
}

/**
 * Ensures the seller has a valid `Store` folder on Google Drive.
 * Reuses `existingStoreFolderId` if still accessible and not trashed;
 * otherwise finds or creates `Store` under My Drive root.
 */
export async function ensureStoreFolder(
  refreshToken: string,
  existingStoreFolderId?: string | null,
): Promise<string> {
  if (existingStoreFolderId) {
    try {
      const drive = await getDriveClient(refreshToken);
      const { data } = await drive.files.get({
        fileId: existingStoreFolderId,
        fields: 'id, mimeType, trashed',
      });
      if (
        data.id &&
        !data.trashed &&
        data.mimeType === 'application/vnd.google-apps.folder'
      ) {
        return data.id;
      }
    } catch {
      // Folder was deleted or inaccessible — fall through to find/create Store
    }
  }

  return ensureDriveFolder(refreshToken, 'Store', 'root');
}

/**
 * Ensures the type/category subfolder exists inside the seller's `Store` folder.
 */
export async function ensureTypeSubfolderInStore(
  refreshToken: string,
  storeFolderId: string,
  extension: string,
  customCategoryName?: string | null,
): Promise<{ folderId: string; folderName: string }> {
  const folderName = resolveFileTypeFolderName(extension, customCategoryName);
  const folderId = await ensureDriveFolder(refreshToken, folderName, storeFolderId);
  return { folderId, folderName };
}

/**
 * Checks whether `fileId` resides directly inside `targetFolderId` or any of its nested subfolders.
 */
export async function isFileInsideFolder(
  refreshToken: string,
  fileId: string,
  targetFolderId: string,
  maxDepth = 6,
): Promise<boolean> {
  const drive = await getDriveClient(refreshToken);
  let currentIds = [fileId];
  const visited = new Set<string>();

  for (let depth = 0; depth < maxDepth && currentIds.length > 0; depth++) {
    const nextIds: string[] = [];
    for (const id of currentIds) {
      if (visited.has(id)) continue;
      visited.add(id);
      try {
        const { data } = await drive.files.get({
          fileId: id,
          fields: 'id, parents',
        });
        const parents = data.parents ?? [];
        if (parents.includes(targetFolderId)) {
          return true;
        }
        for (const p of parents) {
          if (!visited.has(p)) nextIds.push(p);
        }
      } catch {
        // Parent outside drive.file scope cannot be traversed further
      }
    }
    currentIds = nextIds;
  }

  return false;
}