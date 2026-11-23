import { z } from 'zod';

export const initUploadSchema = z.object({
  original_name: z.string().min(1).max(255),
  mime: z.string().trim().min(1).max(150),
  size: z.number().int().positive(),
  checksum: z.string().trim().regex(/^[a-f0-9]{64}$/i).optional(),
  drive_account_id: z.string().uuid().optional(),
});

export const completeUploadSchema = z.object({
  session_id: z.string().uuid(),
  drive_file_id: z.string().min(1),
});
