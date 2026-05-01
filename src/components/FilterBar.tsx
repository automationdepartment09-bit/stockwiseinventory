import { useMemo } from "react";
import { format } from "date-fns";
import { CalendarIcon, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface FilterOption { value: string; label: string }

export interface FilterValues {
  q: string;
  category: string;       // "all" or id
  warehouse: string;      // "all" or id
  status: string;         // "all" or status value
  project: string;        // "all" or id or "__none__"
  requester: string;      // "all" or user id
  from: Date | undefined; // inclusive
  to: Date | undefined;   // inclusive
}

export const EMPTY_FILTERS: FilterValues = {
  q: "", category: "all", warehouse: "all", status: "all",
  project: "all", requester: "all", from: undefined, to: undefined,
};

interface Props {
  values: FilterValues;
  onChange: (next: FilterValues) => void;
  searchPlaceholder?: string;
  show?: Partial<Record<keyof FilterValues, boolean>>;
  categories?: FilterOption[];
  warehouses?: FilterOption[];
  statuses?: FilterOption[];
  projects?: FilterOption[];
  requesters?: FilterOption[];
  rightSlot?: React.ReactNode;
  className?: string;
}

const DateBtn = ({ label, value, onChange }: { label: string; value: Date | undefined; onChange: (d: Date | undefined) => void }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant="outline"
        className={cn("h-9 justify-start gap-2 px-3 text-left font-normal", !value && "text-muted-foreground")}
      >
        <CalendarIcon className="h-3.5 w-3.5" />
        {value ? format(value, "MMM d, yyyy") : <span>{label}</span>}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start">
      <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className={cn("p-3 pointer-events-auto")} />
      {value && (
        <div className="flex justify-end border-t p-2">
          <Button size="sm" variant="ghost" onClick={() => onChange(undefined)}>Clear</Button>
        </div>
      )}
    </PopoverContent>
  </Popover>
);

export const FilterBar = ({
  values, onChange, searchPlaceholder = "Search…",
  show = {}, categories = [], warehouses = [], statuses = [], projects = [], requesters = [],
  rightSlot, className,
}: Props) => {
  const v = values;
  const set = <K extends keyof FilterValues,>(k: K, val: FilterValues[K]) => onChange({ ...v, [k]: val });

  const showSearch = show.q ?? true;
  const showCategory = (show.category ?? false) && categories.length > 0;
  const showWarehouse = (show.warehouse ?? false) && warehouses.length > 0;
  const showStatus = (show.status ?? false) && statuses.length > 0;
  const showProject = (show.project ?? false) && projects.length > 0;
  const showRequester = (show.requester ?? false) && requesters.length > 0;
  const showDate = (show.from ?? false) || (show.to ?? false);

  const activeChips = useMemo(() => {
    const chips: { key: keyof FilterValues; label: string }[] = [];
    if (showCategory && v.category !== "all") {
      const lbl = categories.find((c) => c.value === v.category)?.label ?? v.category;
      chips.push({ key: "category", label: `Category: ${lbl}` });
    }
    if (showWarehouse && v.warehouse !== "all") {
      const lbl = warehouses.find((c) => c.value === v.warehouse)?.label ?? v.warehouse;
      chips.push({ key: "warehouse", label: `Warehouse: ${lbl}` });
    }
    if (showStatus && v.status !== "all") {
      const lbl = statuses.find((c) => c.value === v.status)?.label ?? v.status;
      chips.push({ key: "status", label: `Status: ${lbl}` });
    }
    if (showProject && v.project !== "all") {
      const lbl = projects.find((c) => c.value === v.project)?.label ?? v.project;
      chips.push({ key: "project", label: `Project: ${lbl}` });
    }
    if (showRequester && v.requester !== "all") {
      const lbl = requesters.find((c) => c.value === v.requester)?.label ?? v.requester;
      chips.push({ key: "requester", label: `By: ${lbl}` });
    }
    if (v.from) chips.push({ key: "from", label: `From ${format(v.from, "MMM d, yyyy")}` });
    if (v.to) chips.push({ key: "to", label: `To ${format(v.to, "MMM d, yyyy")}` });
    return chips;
  }, [v, categories, warehouses, statuses, projects, requesters, showCategory, showWarehouse, showStatus, showProject, showRequester]);

  const reset = () => onChange({ ...EMPTY_FILTERS, q: v.q });

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {showSearch && (
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={v.q}
              onChange={(e) => set("q", e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
            />
          </div>
        )}
        {showCategory && (
          <Select value={v.category} onValueChange={(x) => set("category", x)}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}
            </SelectContent>
          </Select>
        )}
        {showWarehouse && (
          <Select value={v.warehouse} onValueChange={(x) => set("warehouse", x)}>
            <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All warehouses</SelectItem>
              {warehouses.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}
            </SelectContent>
          </Select>
        )}
        {showStatus && (
          <Select value={v.status} onValueChange={(x) => set("status", x)}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statuses.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}
            </SelectContent>
          </Select>
        )}
        {showProject && (
          <Select value={v.project} onValueChange={(x) => set("project", x)}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              <SelectItem value="__none__">— No project —</SelectItem>
              {projects.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}
            </SelectContent>
          </Select>
        )}
        {showRequester && (
          <Select value={v.requester} onValueChange={(x) => set("requester", x)}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Anyone</SelectItem>
              {requesters.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}
            </SelectContent>
          </Select>
        )}
        {showDate && (
          <>
            {(show.from ?? false) && <DateBtn label="From" value={v.from} onChange={(d) => set("from", d)} />}
            {(show.to ?? false) && <DateBtn label="To" value={v.to} onChange={(d) => set("to", d)} />}
          </>
        )}
        {rightSlot}
      </div>
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {activeChips.map((c) => (
            <Badge key={c.key} variant="secondary" className="gap-1 font-normal">
              {c.label}
              <button
                type="button"
                onClick={() => set(c.key, (c.key === "from" || c.key === "to" ? undefined : "all") as any)}
                className="ml-1 rounded hover:text-destructive"
                aria-label="Clear filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={reset}>Clear all</Button>
        </div>
      )}
    </div>
  );
};

/** Helper: matches a record date against from/to (inclusive). */
export const inDateRange = (iso: string, from?: Date, to?: Date) => {
  const t = new Date(iso).getTime();
  if (from && t < new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) return false;
  if (to && t > new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).getTime()) return false;
  return true;
};

/** Helper: case-insensitive multi-field search. */
export const matchesQuery = (q: string, fields: Array<string | null | undefined>) => {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return fields.some((f) => (f ?? "").toString().toLowerCase().includes(s));
};
