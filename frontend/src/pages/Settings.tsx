import { PageTitle } from "@/components/layout/DashboardLayout";
import { STATIC } from "@/services/api";
import { useUi } from "@/stores/ui";

export default function Settings() {
  const { reduceMotion, setReduceMotion } = useUi();
  return (
    <>
      <PageTitle title="Settings" intro="Saved in this browser." />
      <div className="max-w-xl space-y-6">
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-5 accent-[#0B7A43]" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} />
          <span>
            Reduce motion
            <span className="block text-sm text-muted">Applies on top of your device setting, which is always respected.</span>
          </span>
        </label>
        {!STATIC && (
          <p className="text-muted">
            Developers can read the <a className="underline underline-offset-4" href="/api/docs">API reference</a>.
          </p>
        )}
      </div>
    </>
  );
}
