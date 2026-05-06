import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ItemPicker } from "@/components/ItemPicker";

export interface LineItem {
  item_id: string;
  quantity: number;
  note?: string;
  damaged?: number;
}

interface Props {
  value: LineItem[];
  onChange: (next: LineItem[]) => void;
  warehouseId?: string;
  showNote?: boolean;
  notePlaceholder?: string;
  /** Hide the picker's warehouse-stock filter (when warehouse already constrained). */
  hidePickerWarehouseFilter?: boolean;
  minOne?: boolean;
  showDamaged?: boolean;
}

export const emptyLine = (): LineItem => ({ item_id: "", quantity: 1, note: "" });

/**
 * Compact, reusable multi-row line-items editor used by all "create"
 * dialogs that now support multiple items per transaction (withdrawals,
 * returns, requests, movements). Keeps everything in a single batch.
 */
export const MultiLineItems = ({
  value,
  onChange,
  warehouseId,
  showNote,
  notePlaceholder,
  hidePickerWarehouseFilter,
  minOne = true,
}: Props) => {
  const update = (idx: number, patch: Partial<LineItem>) => {
    onChange(value.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const remove = (idx: number) => {
    const next = value.filter((_, i) => i !== idx);
    onChange(next.length === 0 && minOne ? [emptyLine()] : next);
  };
  const add = () => onChange([...value, emptyLine()]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Items *</Label>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="mr-1 h-3.5 w-3.5" />Add item
        </Button>
      </div>
      <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">

        {value.map((line, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 rounded-md border border-border/60 p-2">
            <div className={showNote ? "col-span-6" : "col-span-8"}>
              <ItemPicker
                value={line.item_id}
                onChange={(id) => update(idx, { item_id: id })}
                warehouseId={warehouseId || undefined}
                showWarehouseFilter={hidePickerWarehouseFilter ? false : undefined}
              />
            </div>
            <div className="col-span-3">
              <Input
                type="number"
                min={1}
                value={line.quantity}
                onChange={(e) => update(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                placeholder="Qty"
              />
            </div>
            {showNote && (
              <div className="col-span-2">
                <Input
                  value={line.note ?? ""}
                  onChange={(e) => update(idx, { note: e.target.value })}
                  placeholder={notePlaceholder ?? "Note"}
                  maxLength={120}
                />
              </div>
            )}
            <div className="col-span-1 flex items-start justify-end">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => remove(idx)}
                disabled={minOne && value.length === 1}
                title="Remove"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{value.length} item(s) in this batch</p>
    </div>
  );
};

/** Generate a short batch reference like B-AB12CD34. */
export const newBatchRef = (prefix = "B") =>
  `${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;
