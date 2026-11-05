import { PageTitle } from "@/components/layout/DashboardLayout";
import { STATIC } from "@/services/api";
import { useUi } from "@/stores/ui";

export default function Settings() {
  const { reduceMotion, setReduceMotion, defaultIterations, setDefaultIterations } = useUi();
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
        <label className="block">
          Default simulation size
          <select className="field mt-1" value={defaultIterations} onChange={(e) => setDefaultIterations(Number(e.target.value))}>
            {[1000, 5000, 10000, 25000, 50000].map((n) => <option key={n} value={n}>{n.toLocaleString("en-GB")} seasons</option>)}
          </select>
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
