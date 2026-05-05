import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme, PALETTES, FONTS, FontFamily, ThemeMode } from "@/contexts/ThemeContext";
import { Sun, Moon, Monitor, RotateCcw, Palette as PaletteIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ModeBtn = ({ active, onClick, icon: Icon, label }: any) => (
  <Button type="button" variant={active ? "default" : "outline"} onClick={onClick} className="flex-1 gap-2">
    <Icon className="h-4 w-4" /> {label}
  </Button>
);

const AdminSettings = () => {
  const t = useTheme();

  const customHex = (() => {
    if (!t.customPrimary) return "";
    // Approximate HSL → hex preview not strictly needed; show raw
    return "";
  })();

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" description="Workspace preferences and theming." />

      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><PaletteIcon className="h-4 w-4" /> Appearance</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Theme mode</Label>
            <div className="flex gap-2">
              <ModeBtn active={t.mode === "light"}  onClick={() => t.setMode("light" as ThemeMode)}  icon={Sun}     label="Light" />
              <ModeBtn active={t.mode === "dark"}   onClick={() => t.setMode("dark"  as ThemeMode)}  icon={Moon}    label="Dark" />
              <ModeBtn active={t.mode === "system"} onClick={() => t.setMode("system" as ThemeMode)} icon={Monitor} label="System" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Color palette</Label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => t.setPaletteId(p.id)}
                  className={cn(
                    "group flex flex-col items-center gap-1.5 rounded-lg border p-2 transition hover:border-primary",
                    t.paletteId === p.id && !t.customPrimary && "border-primary ring-2 ring-primary/30",
                  )}
                >
                  <span className="block h-8 w-full rounded-md" style={{ background: `hsl(${p.primary})` }} />
                  <span className="text-xs">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customHsl">Custom primary color (HSL)</Label>
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-9 w-9 shrink-0 rounded-md border"
                style={{ background: `hsl(${t.customPrimary ?? PALETTES.find(x=>x.id===t.paletteId)?.primary})` }}
              />
              <Input
                id="customHsl"
                placeholder="e.g. 217 91% 60%"
                value={t.customPrimary ?? ""}
                onChange={(e) => t.setCustomPrimary(e.target.value.trim() || null)}
              />
              {t.customPrimary && (
                <Button variant="ghost" size="sm" onClick={() => t.setCustomPrimary(null)}>Clear</Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Format: <code>H S% L%</code> — overrides the palette's primary color.</p>
          </div>

          <div className="space-y-2">
            <Label>Font family</Label>
            <Select value={t.font} onValueChange={(v) => t.setFont(v as FontFamily)}>
              <SelectTrigger className="w-full sm:w-[260px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONTS.map((f) => (
                  <SelectItem key={f} value={f}>
                    <span style={{ fontFamily: `"${f}"` }}>{f} — The quick brown fox</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Button variant="outline" size="sm" onClick={t.reset}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset to defaults
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">About Stockwise</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Stockwise is your inventory operating system. Catalog, multi-warehouse stock, automatic SKUs, role-based access, audit log, low-stock alerts, and analytics.</p>
        </CardContent>
      </Card>
    </div>
  );
};
export default AdminSettings;
