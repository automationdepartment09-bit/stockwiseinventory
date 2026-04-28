import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface PickerItem {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  ref_number?: string | null;
  category_id?: string | null;
}

interface Props {
  value: string;
  onChange: (id: string) => void;
  items?: PickerItem[];
  /** When provided, options are restricted to items with stock in this warehouse. */
  warehouseId?: string;
  /** Show category filter. Defaults true. */
  showCategoryFilter?: boolean;
  /** Show warehouse-stock filter toggle. Defaults true when warehouseId is provided. */
  showWarehouseFilter?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

interface StockRow { item_id: string; warehouse_id: string; quantity: number }
interface Category { id: string; name: string }

/** Reusable searchable item picker. Searches by name, SKU, barcode and ref number. */
export const ItemPicker = ({
  value,
  onChange,
  items: itemsProp,
  warehouseId,
  showCategoryFilter = true,
  showWarehouseFilter,
  placeholder = "Search item by name, SKU, barcode, ref…",
  disabled,
  className,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PickerItem[]>(itemsProp ?? []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, Map<string, number>>>(new Map());
  const [categoryFilter, setCategoryFilter] = useState<string>("__all__");
  const [onlyInWh, setOnlyInWh] = useState<boolean>(!!warehouseId);

  useEffect(() => { if (itemsProp) setItems(itemsProp); }, [itemsProp]);

  useEffect(() => {
    let active = true;
    (async () => {
      const tasks: Promise<any>[] = [];
      if (!itemsProp) {
        tasks.push(supabase.from("items").select("id,name,sku,barcode,ref_number,category_id").eq("is_active", true).order("name"));
      } else { tasks.push(Promise.resolve(null)); }
      tasks.push(supabase.from("categories").select("id,name").order("name"));
      tasks.push(supabase.from("stock_levels").select("item_id,warehouse_id,quantity"));
      const [it, cat, st] = await Promise.all(tasks);
      if (!active) return;
      if (!itemsProp && it?.data) setItems(it.data as PickerItem[]);
      if (cat?.data) setCategories(cat.data as Category[]);
      const m = new Map<string, Map<string, number>>();
      ((st?.data ?? []) as StockRow[]).forEach((r) => {
        if (!m.has(r.item_id)) m.set(r.item_id, new Map());
        m.get(r.item_id)!.set(r.warehouse_id, r.quantity);
      });
      setStockMap(m);
    })();
    return () => { active = false; };
  }, [itemsProp]);

  const totalStock = (id: string) => {
    let total = 0;
    stockMap.get(id)?.forEach((q) => { total += q; });
    return total;
  };
  const stockIn = (id: string, wh?: string) => (wh ? stockMap.get(id)?.get(wh) ?? 0 : totalStock(id));

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (categoryFilter !== "__all__" && i.category_id !== categoryFilter) return false;
      if (onlyInWh && warehouseId && stockIn(i.id, warehouseId) <= 0) return false;
      return true;
    });
  }, [items, categoryFilter, onlyInWh, warehouseId, stockMap]);

  const selected = items.find((i) => i.id === value);
  const showWh = showWarehouseFilter ?? !!warehouseId;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          {selected ? (
            <span className="truncate">
              <span className="font-mono text-xs text-muted-foreground">{selected.sku}</span>
              <span className="mx-1">·</span>
              {selected.name}
            </span>
          ) : (
            <span className="flex items-center gap-2"><Search className="h-3.5 w-3.5" />Select item</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[320px] p-0" align="start">
        {(showCategoryFilter || showWh) && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
            {showCategoryFilter && (
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All categories</SelectItem>
                  {categories.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            )}
            {showWh && warehouseId && (
              <Button
                type="button"
                size="sm"
                variant={onlyInWh ? "default" : "outline"}
                className="h-8"
                onClick={() => setOnlyInWh((v) => !v)}
              >
                In stock here
              </Button>
            )}
          </div>
        )}
        <Command
          filter={(value, search) => {
            // value is "id|name|sku|barcode|ref"
            if (!search) return 1;
            return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>No items found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((i) => {
                const stock = stockIn(i.id, warehouseId);
                const composite = `${i.id}|${i.name}|${i.sku}|${i.barcode ?? ""}|${i.ref_number ?? ""}`;
                return (
                  <CommandItem
                    key={i.id}
                    value={composite}
                    onSelect={() => { onChange(i.id); setOpen(false); }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === i.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-1 flex-col">
                      <span className="text-sm">{i.name}</span>
                      <span className="text-xs text-muted-foreground">
                        <span className="font-mono">{i.sku}</span>
                        {i.barcode ? <> · {i.barcode}</> : null}
                        {i.ref_number ? <> · ref {i.ref_number}</> : null}
                      </span>
                    </div>
                    {warehouseId ? (
                      <Badge variant="outline" className="ml-2">{stock} here</Badge>
                    ) : (
                      <Badge variant="outline" className="ml-2">{totalStock(i.id)} total</Badge>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default ItemPicker;
