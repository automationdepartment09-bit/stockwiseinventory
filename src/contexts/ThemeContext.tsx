import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type FontFamily = "Inter" | "Roboto" | "Poppins" | "JetBrains Mono";

export interface Palette {
  id: string;
  label: string;
  /** HSL "H S% L%" string */
  primary: string;
  primaryGlow: string;
  secondary: string;
}

export const PALETTES: Palette[] = [
  { id: "emerald", label: "Emerald",  primary: "158 80% 45%", primaryGlow: "158 90% 55%", secondary: "263 70% 60%" },
  { id: "blue",    label: "Blue",     primary: "217 91% 60%", primaryGlow: "217 95% 70%", secondary: "263 70% 60%" },
  { id: "violet",  label: "Violet",   primary: "263 70% 60%", primaryGlow: "263 80% 70%", secondary: "330 80% 60%" },
  { id: "rose",    label: "Rose",     primary: "346 77% 55%", primaryGlow: "346 85% 65%", secondary: "263 70% 60%" },
  { id: "amber",   label: "Amber",    primary: "38 92% 55%",  primaryGlow: "38 95% 65%",  secondary: "263 70% 60%" },
  { id: "teal",    label: "Teal",     primary: "180 70% 45%", primaryGlow: "180 80% 55%", secondary: "263 70% 60%" },
];

export const FONTS: FontFamily[] = ["Inter", "Roboto", "Poppins", "JetBrains Mono"];

interface ThemePrefs {
  mode: ThemeMode;
  paletteId: string;
  customPrimary: string | null; // "H S% L%" overrides palette
  font: FontFamily;
}

const DEFAULTS: ThemePrefs = { mode: "dark", paletteId: "emerald", customPrimary: null, font: "Inter" };
const KEY = "stockwise.theme";

interface Ctx extends ThemePrefs {
  setMode: (m: ThemeMode) => void;
  setPaletteId: (id: string) => void;
  setCustomPrimary: (hsl: string | null) => void;
  setFont: (f: FontFamily) => void;
  reset: () => void;
}

const ThemeCtx = createContext<Ctx | null>(null);

const loadFontLink = (font: FontFamily) => {
  const id = "stockwise-font-link";
  let el = document.getElementById(id) as HTMLLinkElement | null;
  const map: Record<FontFamily, string> = {
    Inter: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    Roboto: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap",
    Poppins: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap",
    "JetBrains Mono": "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap",
  };
  if (!el) {
    el = document.createElement("link");
    el.id = id;
    el.rel = "stylesheet";
    document.head.appendChild(el);
  }
  el.href = map[font];
};

const applyTheme = (p: ThemePrefs) => {
  const root = document.documentElement;

  // Mode
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = p.mode === "dark" || (p.mode === "system" && sysDark);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";

  // Palette / custom primary
  const palette = PALETTES.find((x) => x.id === p.paletteId) ?? PALETTES[0];
  const primary = p.customPrimary ?? palette.primary;
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--primary-glow", palette.primaryGlow);
  root.style.setProperty("--ring", primary);
  root.style.setProperty("--sidebar-primary", primary);
  root.style.setProperty("--sidebar-ring", primary);
  root.style.setProperty("--accent", palette.secondary);
  root.style.setProperty("--secondary", palette.secondary);

  // Font
  loadFontLink(p.font);
  root.style.setProperty("--app-font", `"${p.font}", system-ui, sans-serif`);
  document.body.style.fontFamily = `var(--app-font)`;
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [prefs, setPrefs] = useState<ThemePrefs>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
    } catch { return DEFAULTS; }
  });

  useEffect(() => { applyTheme(prefs); localStorage.setItem(KEY, JSON.stringify(prefs)); }, [prefs]);
  useEffect(() => {
    if (prefs.mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme(prefs);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [prefs]);

  const value = useMemo<Ctx>(() => ({
    ...prefs,
    setMode: (mode) => setPrefs((p) => ({ ...p, mode })),
    setPaletteId: (paletteId) => setPrefs((p) => ({ ...p, paletteId, customPrimary: null })),
    setCustomPrimary: (customPrimary) => setPrefs((p) => ({ ...p, customPrimary })),
    setFont: (font) => setPrefs((p) => ({ ...p, font })),
    reset: () => setPrefs(DEFAULTS),
  }), [prefs]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
};

export const useTheme = () => {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error("useTheme must be used inside ThemeProvider");
  return c;
};
