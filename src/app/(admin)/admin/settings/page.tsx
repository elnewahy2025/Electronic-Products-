import { SettingsEditor } from './settings-editor';

export default function SettingsPage() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-6">إعدادات المنصة</h1>
      <SettingsEditor />
    </main>
  );
}