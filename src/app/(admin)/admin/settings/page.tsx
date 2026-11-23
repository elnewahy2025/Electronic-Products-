import { SettingsEditor } from './settings-editor';

export default function SettingsPage() {
  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">النظام</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          إعدادات المنصة
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          إدارة الإعدادات العامة والتشغيلية لجميع أقسام المنصة من مكان واحد.
        </p>
      </header>
      <SettingsEditor />
    </main>
  );
}
