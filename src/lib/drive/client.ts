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