'use client';

import { useState } from 'react';

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

export type DriveImportResultItem = {
  driveFileId: string;
  name: string;
  status: 'imported' | 'already_imported' | 'skipped';
  fileId?: string;
  fileVersionId?: string;
  sizeBytes?: number;
  error?: string;
};

let pickerLoaderPromise: Promise<void> | null = null;

function loadGooglePickerApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('BROWSER_ONLY'));
  if (window.google?.picker) return Promise.resolve();
  if (pickerLoaderPromise) return pickerLoaderPromise;

  pickerLoaderPromise = new Promise<void>((resolve, reject) => {
    const initPicker = () => {
      if (!window.gapi) {
        pickerLoaderPromise = null;
        return reject(new Error('GAPI_LOAD_FAILED'));
      }
      window.gapi.load('picker', {
        callback: () => resolve(),
        onerror: () => {
          pickerLoaderPromise = null;
          reject(new Error('PICKER_MODULE_FAILED'));
        },
      });
    };

    if (window.gapi) {
      initPicker();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = initPicker;
    script.onerror = () => {
      pickerLoaderPromise = null;
      reject(new Error('GOOGLE_API_SCRIPT_FAILED'));
    };
    document.head.appendChild(script);
  });

  return pickerLoaderPromise;
}

const ERROR_MESSAGES: Record<string, string> = {
  GOOGLE_PICKER_NOT_CONFIGURED: 'مفتاح Google Picker غير مضبوط بعد في إعدادات الخادم.',
  NO_ACTIVE_DRIVE_ACCOUNT: 'لا يوجد حساب Google Drive نشط. اربط حساباً أولاً من صفحة حسابات Google Drive.',
  GOOGLE_DOCS_EXPORT_REQUIRED: 'مستندات Google Docs/Slides الأصلية غير مدعومة مباشرة — صدّرها إلى PDF أو DOCX أولاً.',
  OUTSIDE_STORE_FOLDER: 'يجب اختيار الملفات من داخل مجلد Store المخصص للمتجر فقط.',
  INVALID_STORE_FOLDER: 'العنصر المختار ليس مجلداً صالحاً على Google Drive.',
  FILE_TYPE_NOT_ALLOWED: 'نوع الملف غير مسموح به في المنصة.',
  FILE_TOO_LARGE: 'حجم الملف يتجاوز الحد الأقصى المسموح به لهذا النوع.',
  EMPTY_FILE: 'الملف فارغ (0 بايت).',
  INVALID_FILENAME: 'اسم الملف لا يحتوي على امتداد صالح.',
  GOOGLE_API_SCRIPT_FAILED: 'تعذّر تحميل مكتبة Google Picker. تحقق من الاتصال بالإنترنت.',
};

export function formatDriveImportError(code?: string): string {
  if (!code) return 'تعذّر استيراد الملف.';
  return ERROR_MESSAGES[code] ?? code;
}

export function DrivePickerButton({
  accountId,
  disabled,
  mode = 'pick-files',
  label,
  className,
  onImported,
  onStoreFolderLinked,
  onError,
}: {
  accountId?: string;
  disabled?: boolean;
  mode?: 'pick-files' | 'select-store-folder';
  label?: string;
  className?: string;
  onImported?: (results: DriveImportResultItem[]) => void;
  onStoreFolderLinked?: (info: { storeFolderId: string; storeFolderName: string }) => void;
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function openPicker() {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (accountId) params.set('account_id', accountId);
      if (mode === 'select-store-folder') params.set('mode', 'select_folder');
      const qs = params.toString() ? `?${params.toString()}` : '';

      const [tokenRes] = await Promise.all([
        fetch(`/api/seller/drive/picker-token${qs}`),
        loadGooglePickerApi(),
      ]);

      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) {
        throw new Error(tokenJson.error ?? 'PICKER_TOKEN_FAILED');
      }

      const { accessToken, developerKey, appId, driveAccountId, googleAccountEmail, storeFolderId } =
        tokenJson;
      const gp = window.google?.picker;
      if (!gp) throw new Error('PICKER_MODULE_FAILED');

      if (mode === 'select-store-folder') {
        const folderView = new gp.DocsView(gp.ViewId.FOLDERS)
          .setParent('root')
          .setIncludeFolders(true)
          .setSelectFolderEnabled(true)
          .setMimeTypes('application/vnd.google-apps.folder')
          .setMode(gp.DocsViewMode.LIST);

        const picker = new gp.PickerBuilder()
          .setAppId(appId)
          .setOAuthToken(accessToken)
          .setDeveloperKey(developerKey)
          .setLocale('ar')
          .setTitle(
            googleAccountEmail
              ? `اختر مجلد Store المخصص للمتجر (${googleAccountEmail})`
              : 'اختر مجلد Store المخصص للمتجر',
          )
          .addView(folderView)
          .setCallback(async (data: any) => {
            if (data.action === gp.Action.CANCEL) {
              setBusy(false);
              return;
            }
            if (data.action !== gp.Action.PICKED) return;
            const folder = data.docs?.[0];
            if (!folder?.id) {
              setBusy(false);
              return;
            }
            try {
              const linkRes = await fetch('/api/seller/drive/store-folder', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  drive_account_id: driveAccountId,
                  store_folder_id: folder.id,
                }),
              });
              const linkJson = await linkRes.json();
              if (!linkRes.ok) throw new Error(linkJson.error ?? 'STORE_FOLDER_LINK_FAILED');
              onStoreFolderLinked?.(linkJson);
            } catch (err: any) {
              onError?.(formatDriveImportError(err?.message));
            } finally {
              setBusy(false);
            }
          })
          .build();

        picker.setVisible(true);
        return;
      }

      const storeView = new gp.DocsView(gp.ViewId.DOCS)
        .setParent(storeFolderId || 'root')
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
        .setMode(gp.DocsViewMode.LIST);

      const picker = new gp.PickerBuilder()
        .setAppId(appId)
        .setOAuthToken(accessToken)
        .setDeveloperKey(developerKey)
        .setLocale('ar')
        .setTitle(
          googleAccountEmail
            ? `اختر ملفاتك من مجلد Store (${googleAccountEmail})`
            : 'اختر ملفاتك من مجلد Store لبيعها في المتجر',
        )
        .enableFeature(gp.Feature.MULTISELECT_ENABLED)
        .addView(storeView)
        .setCallback(async (data: any) => {
          if (data.action === gp.Action.CANCEL) {
            setBusy(false);
            return;
          }
          if (data.action !== gp.Action.PICKED) return;

          const pickedDocs: Array<{ id: string; name?: string; mimeType?: string }> =
            data.docs ?? [];
          if (pickedDocs.length === 0) {
            setBusy(false);
            return;
          }

          try {
            const importRes = await fetch('/api/seller/drive/import', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                drive_account_id: driveAccountId,
                files: pickedDocs.map(d => ({
                  drive_file_id: d.id,
                  name: d.name,
                  mime: d.mimeType,
                })),
              }),
            });
            const importJson = await importRes.json();
            if (!importRes.ok) {
              throw new Error(importJson.error ?? 'DRIVE_IMPORT_FAILED');
            }
            onImported?.(importJson.results ?? []);
          } catch (err: any) {
            onError?.(formatDriveImportError(err?.message));
          } finally {
            setBusy(false);
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err: any) {
      onError?.(formatDriveImportError(err?.message));
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={openPicker}
      disabled={disabled || busy}
      className={
        className ??
        'inline-flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-accent text-accent-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50'
      }
    >
      {busy
        ? 'جارٍ فتح Google Drive...'
        : label ??
          (mode === 'select-store-folder'
            ? 'تحديد مجلد Store الموجود'
            : 'اختيار ملفات من مجلد Store')}
    </button>
  );
}
