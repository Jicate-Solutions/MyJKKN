'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { BeatLoader } from 'react-spinners';
import { useAuth } from '@/hooks/use-auth';
// Still used by the edit dialog's stock-diff path, which books a correction when
// someone changes the current quantity — separate from the removed Adjust Stock
// dialog, which is now at /ims/stock/adjustments.
import { ImsStockAdjustmentService } from '@/lib/services/ims/stock-adjustment-service';
import { ImsStockService } from '@/lib/services/ims/stock-service';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { PaginationWithControls } from '@/components/ui/pagination';
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  ToggleLeft,
  Trash2,
  Package,
  Layers,
  Upload,
  UploadCloud,
  IndianRupee,
  Eye,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import {
  useImsItems,
  useCreateImsItem,
  useUpdateImsItem,
  useDeleteImsItem,
  useToggleImsItemActive,
  useImsCategoriesForSelect,
  useSetPosVisibility,
  useAddItemsToStore,
  useRemoveItemsFromStore,
} from '@/hooks/ims/use-ims-inventory';
import { useImsStore } from '@/hooks/ims/use-ims-stores';
import {
  useCreateImsItemChangeRequest,
  useImsPendingItemChangeIds,
} from '@/hooks/ims/use-ims-item-change-requests';
import { useImsUnitsForSelect } from '@/hooks/ims/use-ims-settings';
import type {
  ImsItemFilters,
  ImsItemType,
  ImsItemWithRelations,
  CreateImsItemDto,
  UpdateImsItemDto,
} from '@/types/ims';
import { BulkImportDialog } from './_components/bulk-import-dialog';
import { PriceUpdateDialog } from './_components/price-update-dialog';
import { AddBatchModal } from '@/components/ims/add-batch-modal';
import { BatchesDialog } from '@/components/ims/batches-dialog';
import { ImsPageGuard } from '@/components/ims/ims-page-guard';
import { usePermissions } from '@/hooks/use-permissions';
import { StorageService } from '@/lib/storage/storage-service';

// Server-side page size. getItems() defaults to 20 when filters.limit is unset;
// we set it explicitly here so the UI and the query agree on the boundary.
const PAGE_SIZE = 20;

const ITEM_TYPES: { label: string; value: ImsItemType }[] = [
  { label: 'Consumable', value: 'consumable' },
  { label: 'Equipment', value: 'equipment' },
  { label: 'Medicine', value: 'medicine' },
  { label: 'Stationery', value: 'stationery' },
  { label: 'Other', value: 'other' },
];

function itemTypeBadgeVariant(type: ImsItemType) {
  switch (type) {
    case 'consumable':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'equipment':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
    case 'medicine':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'stationery':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
  }
}

function formatPrice(amount: number): string {
  return amount.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  });
}

// ── Read-only detail view helpers ──────────────────────────────────────────
// Kept at module scope so they are not redefined on every render of the page.

function unitLabel(unit?: { name: string; abbreviation: string } | null): string | null {
  if (!unit) return null;
  // Both when they differ, because "Nos" alone is not always self-explanatory
  // and the full name alone is long in a two-column grid.
  return unit.abbreviation && unit.abbreviation !== unit.name
    ? `${unit.name} (${unit.abbreviation})`
    : unit.name || unit.abbreviation;
}

function ViewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </h4>
      <dl className="divide-y divide-border/60 rounded-md border">{children}</dl>
    </div>
  );
}

/**
 * One label/value pair. Renders an em dash for anything empty rather than
 * hiding the row — "we hold no company name for this item" and "this dialog
 * does not show company names" look identical if the row simply vanishes.
 */
function ViewRow({
  label,
  children,
  mono,
}: {
  label: string;
  children?: ReactNode;
  mono?: boolean;
}) {
  const empty =
    children === null || children === undefined || children === '' || children === false;
  return (
    <div className="flex items-baseline justify-between gap-4 px-3 py-2">
      <dt className="text-xs text-muted-foreground shrink-0">{label}</dt>
      <dd
        className={`text-sm text-right break-words ${mono ? 'font-mono' : ''} ${
          empty ? 'text-muted-foreground' : ''
        }`}
      >
        {empty ? '—' : children}
      </dd>
    </div>
  );
}

interface ItemFormData {
  code: string;
  name: string;
  description: string;
  company_name: string;
  category_id: string;
  item_type: ImsItemType;
  base_unit_id: string;
  purchase_unit_id: string;
  sale_unit_id: string;
  indent_unit_id: string;
  cost_price: number;
  mrp: number;
  selling_price: number;
  hsn_code: string;
  gst_rate: number; // 0 | 5 | 12 | 18 | 28
  reorder_level: number;
  max_stock_level: number;
  track_batch: boolean;
  track_expiry: boolean;
  is_sellable_to_students: boolean;
  opening_stock: number; // only used on create
  opening_batch_number: string; // optional override; auto-generates BTH-YYMMDD-XXXXX if blank
  opening_expiry_date: string; // only relevant if track_expiry is true
  image_url: string;
  // Edit-mode only: when editing, these mirror ims_stock_summary so the user can
  // adjust the recorded opening_quantity and current stock balance from the dialog.
  edit_opening_quantity: number;
  edit_current_quantity: number;
}

const emptyFormData: ItemFormData = {
  code: '',
  name: '',
  description: '',
  company_name: '',
  category_id: '',
  item_type: 'consumable',
  base_unit_id: '',
  purchase_unit_id: '',
  sale_unit_id: '',
  indent_unit_id: '',
  cost_price: 0,
  mrp: 0,
  selling_price: 0,
  hsn_code: '',
  gst_rate: 0,
  reorder_level: 10,
  max_stock_level: 100,
  track_batch: false,
  track_expiry: false,
  is_sellable_to_students: false,
  image_url: '',
  opening_stock: 0,
  opening_batch_number: '',
  opening_expiry_date: '',
  edit_opening_quantity: 0,
  edit_current_quantity: 0,
};

export default function InventoryItemsPage() {
  return (
    <ImsPageGuard module="ims.inventory" action="view">
      <InventoryItemsPageInner />
    </ImsPageGuard>
  );
}

function InventoryItemsPageInner() {
  const { storeId, institutionId, isSuperAdmin } = useImsStoreContext();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { canAccess, isSuperAdmin: permsIsSuperAdmin } = usePermissions();
  const canCreate = permsIsSuperAdmin || canAccess('ims.inventory', 'create');
  const canEdit = permsIsSuperAdmin || canAccess('ims.inventory', 'edit');
  // A third state between "can edit" and "cannot touch": may open the form and
  // Save, but Save raises a change request for a super admin instead of writing
  // to the item. Only meaningful when canEdit is false.
  const canProposeEdit = !canEdit && canAccess('ims.inventory', 'propose_edit');
  const router = useRouter();
  const canDelete = permsIsSuperAdmin || canAccess('ims.inventory', 'delete');

  // Filters state
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [posFilter, setPosFilter] = useState<'all' | 'at_pos' | 'not_at_pos'>('all');

  // Which catalogue is on screen: what THIS store carries, or everything the
  // institution has. Only the warehouse and super admins get the choice — the
  // warehouse distributes, so it has to be able to see an item before any store
  // stocks it. Everyone else sees their own store, full stop.
  const { data: currentStore } = useImsStore(storeId ?? '');
  const isWarehouse = currentStore?.is_central_supply_store ?? false;
  const canSeeInstitutionCatalog = isSuperAdmin || permsIsSuperAdmin || isWarehouse;
  const [catalogScope, setCatalogScope] = useState<'store' | 'institution'>('store');
  const scope: 'store' | 'institution' =
    canSeeInstitutionCatalog && catalogScope === 'institution' ? 'institution' : 'store';
  const storeScoped = scope === 'store' && !!storeId;

  // Bulk selection. `selectAllMatching` is the difference between "these 20 rows"
  // and "every row this filter matches" — the second cannot be a list of ids,
  // because only one page of them has ever been loaded.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<'add' | 'remove' | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ImsItemWithRelations | null>(null);
  const [formData, setFormData] = useState<ItemFormData>(emptyFormData);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Batch modals state
  const [batchItem, setBatchItem] = useState<ImsItemWithRelations | null>(null);
  const [viewBatchItem, setViewBatchItem] = useState<ImsItemWithRelations | null>(null);

  // Read-only detail view. Holds the row itself rather than an id — the list
  // query already carries every field the dialog shows, including the joins and
  // the store's listing, so opening it costs no extra fetch.
  const [viewItem, setViewItem] = useState<ImsItemWithRelations | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Any filter change reshuffles the result set, so a previously-selected page
  // number may no longer exist (e.g. on page 5, then filter down to 2 pages).
  // Snap back to page 1 whenever the active filters change.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryFilter, typeFilter, posFilter, scope]);

  // A selection describes rows in a particular result set. Once the filters move,
  // those rows may not even be on screen — carrying the selection across would let
  // someone act on items they can no longer see.
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
  }, [debouncedSearch, categoryFilter, typeFilter, posFilter, scope, page]);

  // Build filters
  const filters: ImsItemFilters = {
    search: debouncedSearch || undefined,
    category_id: categoryFilter || undefined,
    item_type: (typeFilter as ImsItemType) || undefined,
    store_id: storeId || '',
    institution_id: institutionId,
    scope,
    pos_visibility: posFilter === 'all' ? undefined : posFilter,
    page,
    limit: PAGE_SIZE,
  };

  // Queries
  const { data: items, isLoading: itemsLoading } = useImsItems(filters);
  const { data: categories } = useImsCategoriesForSelect(storeId || undefined);
  const { data: units } = useImsUnitsForSelect();

  // Mutations
  const createItem = useCreateImsItem();
  const updateItem = useUpdateImsItem();
  const createChangeRequest = useCreateImsItemChangeRequest();
  const setPosVisibility = useSetPosVisibility();

  // ── Bulk selection ────────────────────────────────────────────────────────
  const rows = items?.data ?? [];
  const totalMatching = items?.metadata?.total ?? 0;

  const toggleSelect = (id: string) => {
    setSelectAllMatching(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectAllMatching(false);
    setSelectedIds((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    );
  };

  // What the buttons promise, and what the server will be told to expect.
  const affectedCount = selectAllMatching ? totalMatching : selectedIds.size;

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
    setBulkConfirm(null);
  };

  const runBulk = (action: 'add' | 'remove') => {
    setPosVisibility.mutate(
      selectAllMatching
        ? {
            action,
            institutionId: institutionId || '',
            storeId: storeId || '',
            expectedCount: totalMatching,
            mode: 'filter',
            filter: {
              search: debouncedSearch || undefined,
              category_id: categoryFilter || undefined,
              item_type: typeFilter || undefined,
              pos_visibility: posFilter === 'all' ? undefined : posFilter,
            },
          }
        : {
            action,
            institutionId: institutionId || '',
            storeId: storeId || '',
            expectedCount: selectedIds.size,
            mode: 'ids',
            ids: [...selectedIds],
          },
      { onSuccess: clearSelection, onError: () => setBulkConfirm(null) },
    );
  };

  // Assortment, not stock: listing an item here means this store's catalogue
  // shows it, so it can be requested and received. It arrives with no quantity.
  const addToStore = useAddItemsToStore();
  const removeFromStore = useRemoveItemsFromStore();

  const runAssortment = (action: 'add' | 'remove') => {
    if (!storeId || selectedIds.size === 0) return;
    const input = { storeId, itemIds: [...selectedIds] };
    const mutation = action === 'add' ? addToStore : removeFromStore;
    mutation.mutate(input, { onSuccess: clearSelection });
  };
  const { data: pendingChangeIds } = useImsPendingItemChangeIds(institutionId);
  const deleteItem = useDeleteImsItem();
  const toggleActive = useToggleImsItemActive();

  // Upload product image to Supabase Storage; URL is stored in formData so it
  // gets saved to ims_items.image_url when the form submits.
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const scopeId = editingItem?.id || `temp-${Date.now()}`;
      const { publicUrl, error } = await StorageService.uploadImsItemImage(file, scopeId);
      if (error) throw error;
      setFormData((prev) => ({ ...prev, image_url: publicUrl || '' }));
    } catch (error: any) {
      toast.error(error?.message || 'Failed to upload image');
    } finally {
      setIsUploadingImage(false);
      e.target.value = '';
    }
  };

  // Open dialog for new item
  const handleAddNew = () => {
    setEditingItem(null);
    setFormData(emptyFormData);
    setDialogOpen(true);
  };

  // Invalidate item caches after bulk import completes
  const handleImportComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['ims-items'] });
    queryClient.invalidateQueries({ queryKey: ['ims-items-select'] });
  };

  // Open dialog for editing.
  // Postgres NUMERIC columns come back from PostgREST as strings to preserve precision —
  // <Input type="number"> won't render strings like "0.00" reliably, so coerce with Number().
  const handleEdit = (item: ImsItemWithRelations) => {
    setEditingItem(item);
    setFormData({
      code: item.code,
      name: item.name,
      description: item.description || '',
      company_name: item.company_name ?? '',
      category_id: item.category_id ?? '',
      item_type: item.item_type,
      base_unit_id: item.base_unit_id ?? '',
      purchase_unit_id: item.purchase_unit_id || '',
      sale_unit_id: item.sale_unit_id || '',
      indent_unit_id: item.indent_unit_id || '',
      cost_price: Number(item.cost_price) || 0,
      mrp: Number(item.mrp) || 0,
      selling_price: Number(item.selling_price) || 0,
      hsn_code: item.hsn_code ?? '',
      gst_rate: Number(item.gst_rate) || 0,
      reorder_level: Number(item.reorder_level) || 0,
      max_stock_level: Number(item.max_stock_level) || 0,
      track_batch: item.track_batch,
      track_expiry: item.track_expiry,
      // The store's listing wins over the catalogue default — the checkbox is
      // about this counter, so it has to open showing this counter's answer.
      is_sellable_to_students:
        item.store_link?.is_sellable_to_students ?? item.is_sellable_to_students,
      image_url: item.image_url || '',
      opening_stock: 0,
      opening_batch_number: '',
      opening_expiry_date: '',
      edit_opening_quantity: Number(item.stock?.opening_quantity) || 0,
      edit_current_quantity: Number(item.stock?.current_quantity) || 0,
    });
    setDialogOpen(true);
  };

  // Submit form
  const handleSubmit = async () => {
    // `code` is deliberately absent: it is generated, so it is never a thing the
    // user can fail to fill in.
    if (!formData.name || !formData.category_id || !formData.base_unit_id) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      if (editingItem) {
        const updateData: UpdateImsItemDto = {
          // No `code` here. It is assigned once and immutable — an update that
          // carried it could collide on ims_items_institution_code_unique, and
          // updateItem has no 23505 handling.
          name: formData.name,
          description: formData.description || null,
          company_name: formData.company_name || null,
          category_id: formData.category_id,
          item_type: formData.item_type,
          base_unit_id: formData.base_unit_id,
          purchase_unit_id: formData.purchase_unit_id || null,
          sale_unit_id: formData.sale_unit_id || null,
          indent_unit_id: formData.indent_unit_id || null,
          cost_price: formData.cost_price,
          mrp: formData.mrp,
          selling_price: formData.selling_price,
          hsn_code: formData.hsn_code || null,
          gst_rate: formData.gst_rate,
          reorder_level: formData.reorder_level,
          max_stock_level: formData.max_stock_level,
          track_batch: formData.track_batch,
          track_expiry: formData.track_expiry,
          is_sellable_to_students: formData.is_sellable_to_students,
          image_url: formData.image_url || null,
        };
        // ── Propose, don't apply ────────────────────────────────────────────
        // A role that may REQUEST item changes but not make them (POS store
        // manager) gets the same form and the same Save button — only the
        // destination differs. The request records what changed and what those
        // fields held, and a super admin's approval is what writes to the item.
        //
        // Returns early: the stock operations below adjust quantities directly,
        // which this role has no permission for and which are not part of what
        // is being approved.
        if (!canEdit && canProposeEdit) {
          await createChangeRequest.mutateAsync({
            itemId: editingItem.id,
            institutionId: institutionId || '',
            storeId: storeId || null,
            requestedBy: profile?.id || '',
            original: editingItem as unknown as Record<string, unknown>,
            proposed: updateData as unknown as Record<string, unknown>,
          });
          setDialogOpen(false);
          setEditingItem(null);
          setFormData(emptyFormData);
          return;
        }

        await updateItem.mutateAsync({ id: editingItem.id, data: updateData });

        // The POS checkbox on this form means "sell it at the counter I am
        // standing at". It still writes the item-level column above — that is the
        // catalogue default, and the change-request allowlist is built around it —
        // but the counter reads the store's listing, so that is what has to move.
        // Only when the listing exists: the form must not quietly add the item to
        // a store's catalogue as a side effect of ticking a checkbox.
        if (
          storeId &&
          editingItem.store_link &&
          editingItem.store_link.is_sellable_to_students !== formData.is_sellable_to_students
        ) {
          await setPosVisibility.mutateAsync({
            action: formData.is_sellable_to_students ? 'add' : 'remove',
            institutionId: institutionId || '',
            storeId,
            expectedCount: 1,
            mode: 'ids',
            ids: [editingItem.id],
          });
        }

        // Stock-side updates: opening_quantity and current_quantity live on
        // ims_stock_summary, not ims_items, so they take different service calls.
        // Diff against the original values and only fire if changed — avoids creating
        // phantom audit-trail rows on no-op saves.
        const originalOpening = Number(editingItem.stock?.opening_quantity) || 0;
        const originalCurrent = Number(editingItem.stock?.current_quantity) || 0;
        const stockOps: Promise<unknown>[] = [];

        if (formData.edit_opening_quantity !== originalOpening) {
          stockOps.push(
            ImsStockService.updateOpeningQuantity(
              editingItem.id,
              formData.edit_opening_quantity,
              storeId ?? '',
              institutionId ?? ''
            )
          );
        }

        const currentDiff = formData.edit_current_quantity - originalCurrent;
        if (currentDiff !== 0) {
          stockOps.push(
            ImsStockAdjustmentService.createAdjustment(
              {
                item_id: editingItem.id,
                adjustment_type: currentDiff > 0 ? 'correction' : 'damage',
                quantity: Math.abs(currentDiff),
                reason: 'Manual edit via item dialog',
                institution_id: institutionId || '',
                store_id: storeId || undefined,
              },
              profile?.id || ''
            )
          );
        }

        if (stockOps.length > 0) {
          await Promise.all(stockOps);
          queryClient.invalidateQueries({ queryKey: ['ims-items'] });
        }

        toast.success('Item updated successfully');
      } else {
        const createData: CreateImsItemDto = {
          // `code` omitted on purpose — the ims_items_autofill_code trigger
          // allocates it inside the inserting transaction, so a failed save
          // cannot burn a number the way client-side generation used to.
          name: formData.name,
          description: formData.description || null,
          company_name: formData.company_name || null,
          category_id: formData.category_id,
          item_type: formData.item_type,
          base_unit_id: formData.base_unit_id,
          purchase_unit_id: formData.purchase_unit_id || null,
          sale_unit_id: formData.sale_unit_id || null,
          indent_unit_id: formData.indent_unit_id || null,
          cost_price: formData.cost_price,
          mrp: formData.mrp,
          selling_price: formData.selling_price,
          hsn_code: formData.hsn_code || null,
          gst_rate: formData.gst_rate,
          reorder_level: formData.reorder_level,
          max_stock_level: formData.max_stock_level,
          is_active: true,
          track_batch: formData.track_batch,
          track_expiry: formData.track_expiry,
          is_sellable_to_students: formData.is_sellable_to_students,
          image_url: formData.image_url || null,
          store_id: storeId || null,
          institution_id: institutionId || null,
        };
        const item = await createItem.mutateAsync(createData);
        // Apply opening stock as a real batch (so /ims/stock/batches and FIFO
        // issuing work end-to-end). Auto-generates BTH-YYMMDD-XXXXX if the user
        // didn't enter their own batch number.
        if (formData.opening_stock > 0) {
          await ImsStockService.addBatch({
            item_id: item.id,
            batch_number: formData.opening_batch_number.trim() || undefined,
            quantity: formData.opening_stock,
            cost_price: formData.cost_price,
            gst_rate: formData.gst_rate,
            entry_date: new Date().toISOString().split('T')[0],
            expiry_date: formData.opening_expiry_date || undefined,
            notes: 'Opening stock',
            store_id: storeId || undefined,
            institution_id: institutionId || '',
          });
        }
        // Show the assigned code. The user never chose it, so telling them what
        // it turned out to be is the least the confirmation can do.
        toast.success(`Item created as ${item.code}`);
      }
      setDialogOpen(false);
      setEditingItem(null);
      setFormData(emptyFormData);
    } catch (error: any) {
      toast.error(error?.message || 'An error occurred');
    }
  };

  // Toggle active
  const handleToggleActive = async (item: ImsItemWithRelations) => {
    try {
      await toggleActive.mutateAsync({ id: item.id, isActive: !item.is_active });
      toast.success(
        `Item ${item.is_active ? 'deactivated' : 'activated'} successfully`
      );
    } catch (error: any) {
      toast.error(error?.message || 'Failed to toggle item status');
    }
  };

  // Delete item
  const handleDelete = async (item: ImsItemWithRelations) => {
    // Name the consequence before asking. An item that appears on no document can
    // be deleted even while it holds stock — that is deliberate (blocking on stock
    // would make a mistaken item impossible to remove, because zeroing it writes a
    // movement) — but discarding a hundred units should never be a surprise.
    const onHand = Number(item.stock?.current_quantity) || 0;
    const warning =
      onHand > 0
        ? `\n\nThis will also discard ${onHand} unit${onHand === 1 ? '' : 's'} of on-hand stock and its batch records.`
        : '';
    if (!confirm(`Delete "${item.name}"?${warning}`)) return;

    try {
      const result = await deleteItem.mutateAsync(item.id);
      toast.success(
        result?.discarded_qty
          ? `${result.name} deleted — ${result.discarded_qty} unit(s) of stock discarded`
          : `${result?.name ?? 'Item'} deleted`,
      );
    } catch (error: any) {
      // The RPC's refusal names the documents that block it and suggests
      // deactivating, so it is worth more screen time than a one-line toast.
      toast.error(error?.message || 'Failed to delete item', { duration: 10000 });
    }
  };

  // Stock adjustment used to live here as a dialog off the Actions menu. The menu
  // entry is gone (View took its place), which left the dialog unreachable, so it
  // went with it. The capability is unaffected — /ims/stock/adjustments is the
  // real home for it and has its own "New Adjustment" flow.

  const isMutating =
    createItem.isPending ||
    updateItem.isPending ||
    createChangeRequest.isPending ||
    isUploadingImage;

  return (
    <ContentLayout title="Inventory Items">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Inventory Items</h1>
            <p className="text-muted-foreground mt-1">
              Manage your item catalog and pricing
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canCreate && (
              <Button
                variant="outline"
                onClick={() => setImportDialogOpen(true)}
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Items
              </Button>
            )}
            {/* Secondary page actions, collapsed behind one trigger. Both are
                occasional — a bulk price sheet and an approval queue — and neither
                earns permanent space next to Add Item.
                The pending count stays ON THE TRIGGER, not only inside the menu:
                a notification nobody can see until they open a dropdown has
                stopped being a notification. */}
            {(canEdit || canProposeEdit) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                    {pendingChangeIds && pendingChangeIds.size > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {pendingChangeIds.size}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {canEdit && (
                    <DropdownMenuItem onClick={() => setPriceDialogOpen(true)}>
                      <IndianRupee className="h-4 w-4 mr-2" />
                      Update Prices
                    </DropdownMenuItem>
                  )}
                  {/* Shown to whoever can approve AND to whoever can only propose —
                      the requester needs somewhere to see what happened to their
                      request. */}
                  <DropdownMenuItem
                    onClick={() => router.push('/ims/inventory/item-approvals')}
                  >
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    Change Requests
                    {pendingChangeIds && pendingChangeIds.size > 0 && (
                      <Badge variant="secondary" className="ml-auto">
                        {pendingChangeIds.size}
                      </Badge>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            {canCreate && (
              <DialogTrigger asChild>
                <Button onClick={handleAddNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </DialogTrigger>
            )}
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingItem ? 'Edit Item' : 'Add New Item'}
                </DialogTitle>
                <DialogDescription>
                  {editingItem
                    ? 'Update the item details below.'
                    : 'Fill in the details to create a new inventory item.'}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                {/* Row: Code + Name */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Generated, never typed. The sequence lives in
                      ims_item_code_counters and is drawn by a BEFORE INSERT
                      trigger, so the value does not exist until the row does —
                      hence a promise on create rather than a preview. */}
                  <div className="space-y-2">
                    <Label htmlFor="code">Code</Label>
                    <Input
                      id="code"
                      value={editingItem ? formData.code : ''}
                      placeholder="Auto-generated on save"
                      disabled
                      readOnly
                      className="font-mono disabled:opacity-100 disabled:cursor-default"
                    />
                    <p className="text-xs text-muted-foreground">
                      {editingItem
                        ? 'Item codes cannot be changed once assigned.'
                        : 'Assigned automatically from this institution’s sequence.'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="name"
                      placeholder="Item name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Optional description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, description: e.target.value }))
                    }
                    rows={2}
                  />
                </div>

                {/* Product Image */}
                <div className="space-y-2">
                  <Label>Product Image</Label>
                  {formData.image_url ? (
                    <div className="relative w-full h-40 border rounded-lg overflow-hidden bg-muted">
                      <img
                        src={formData.image_url}
                        alt="Product thumbnail"
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, image_url: '' }))}
                        className="absolute top-2 right-2 rounded-full bg-destructive text-destructive-foreground p-1 hover:opacity-90"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
                      {isUploadingImage ? (
                        <BeatLoader color="hsl(var(--primary))" size={8} />
                      ) : (
                        <>
                          <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
                          <span className="text-sm text-muted-foreground">Click to upload image</span>
                          <span className="text-xs text-muted-foreground">PNG, JPG, WebP · max 5 MB</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={isUploadingImage}
                      />
                    </label>
                  )}
                </div>

                {/* Company / Manufacturer */}
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company / Manufacturer</Label>
                  <Input
                    id="company_name"
                    placeholder="e.g. Sun Pharma, 3M, Natraj"
                    value={formData.company_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, company_name: e.target.value }))
                    }
                  />
                </div>

                {/* Row: Category + Item Type */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>
                      Category <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={formData.category_id}
                      onValueChange={(val) =>
                        setFormData((prev) => ({ ...prev, category_id: val }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories?.map((cat: { id: string; name: string }) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Item Type <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={formData.item_type}
                      onValueChange={(val) =>
                        setFormData((prev) => ({
                          ...prev,
                          item_type: val as ImsItemType,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {ITEM_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Base Unit */}
                <div className="space-y-2">
                  <Label>
                    Base Unit <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.base_unit_id}
                    onValueChange={(val) =>
                      setFormData((prev) => ({ ...prev, base_unit_id: val }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select base unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {units?.map((unit: { id: string; name: string; abbreviation: string }) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name} ({unit.abbreviation})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Alternate Units Section */}
                <div className="space-y-2 pt-2">
                  <Label className="text-sm font-medium text-muted-foreground">
                    Alternate Units (Optional)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Define different units for purchasing, selling, and indent requests
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {/* Purchase Unit */}
                  <div className="space-y-2">
                    <Label>Purchase Unit</Label>
                    <Select
                      value={formData.purchase_unit_id}
                      onValueChange={(val) =>
                        setFormData((prev) => ({ ...prev, purchase_unit_id: val === 'none' ? '' : val }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Same as base" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Same as base unit</SelectItem>
                        {units?.map((unit: { id: string; name: string; abbreviation: string }) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name} ({unit.abbreviation})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sale Unit */}
                  <div className="space-y-2">
                    <Label>Sale Unit</Label>
                    <Select
                      value={formData.sale_unit_id}
                      onValueChange={(val) =>
                        setFormData((prev) => ({ ...prev, sale_unit_id: val === 'none' ? '' : val }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Same as base" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Same as base unit</SelectItem>
                        {units?.map((unit: { id: string; name: string; abbreviation: string }) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name} ({unit.abbreviation})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Indent Unit */}
                  <div className="space-y-2">
                    <Label>Indent Unit</Label>
                    <Select
                      value={formData.indent_unit_id}
                      onValueChange={(val) =>
                        setFormData((prev) => ({ ...prev, indent_unit_id: val === 'none' ? '' : val }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Same as base" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Same as base unit</SelectItem>
                        {units?.map((unit: { id: string; name: string; abbreviation: string }) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name} ({unit.abbreviation})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Row: Cost Price + MRP + Selling Price */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cost_price">Cost Price (excl. GST)</Label>
                    <Input
                      id="cost_price"
                      type="number"
                      min={0}
                      step={0.01}
                      value={formData.cost_price}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          cost_price: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mrp">MRP</Label>
                    <Input
                      id="mrp"
                      type="number"
                      min={0}
                      step={0.01}
                      value={formData.mrp}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          mrp: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="selling_price">Selling Price</Label>
                    <Input
                      id="selling_price"
                      type="number"
                      min={0}
                      step={0.01}
                      value={formData.selling_price}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          selling_price: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                </div>

                {/* GST Settings */}
                <div className="space-y-2 border-t pt-4">
                  <Label className="text-sm font-medium text-muted-foreground">
                    GST Settings
                  </Label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hsn_code">HSN Code</Label>
                    <Input
                      id="hsn_code"
                      placeholder="e.g. 4820"
                      value={formData.hsn_code}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, hsn_code: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>GST Rate</Label>
                    <Select
                      value={String(formData.gst_rate)}
                      onValueChange={(val) =>
                        setFormData((prev) => ({ ...prev, gst_rate: Number(val) }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0% (Exempt)</SelectItem>
                        <SelectItem value="5">5%</SelectItem>
                        <SelectItem value="12">12%</SelectItem>
                        <SelectItem value="18">18%</SelectItem>
                        <SelectItem value="28">28%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Auto-calculated: Cost Price with GST */}
                {formData.cost_price > 0 && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Cost Price with GST</Label>
                      <div className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm font-medium">
                        {formatPrice(formData.cost_price * (1 + formData.gst_rate / 100))}
                      </div>
                      <p className="text-xs text-muted-foreground">Auto-calculated</p>
                    </div>
                  </div>
                )}

                {/* Row: Reorder Level + Max Stock Level */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="reorder_level">Reorder Level</Label>
                    <Input
                      id="reorder_level"
                      type="number"
                      min={0}
                      value={formData.reorder_level}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          reorder_level: parseInt(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max_stock_level">Max Stock Level</Label>
                    <Input
                      id="max_stock_level"
                      type="number"
                      min={0}
                      value={formData.max_stock_level}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          max_stock_level: parseInt(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                </div>

                {/* Checkboxes */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="track_batch"
                      checked={formData.track_batch}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          track_batch: checked === true,
                        }))
                      }
                    />
                    <Label htmlFor="track_batch" className="font-normal">
                      Track batch numbers
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="track_expiry"
                      checked={formData.track_expiry}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          track_expiry: checked === true,
                        }))
                      }
                    />
                    <Label htmlFor="track_expiry" className="font-normal">
                      Track expiry dates
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_sellable_to_students"
                      checked={formData.is_sellable_to_students}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          is_sellable_to_students: checked === true,
                        }))
                      }
                    />
                    <Label htmlFor="is_sellable_to_students" className="font-normal">
                      Sellable to students (POS)
                    </Label>
                  </div>
                </div>

                {/* Stock section — edit mode: lets admin adjust opening_quantity
                    (direct write to ims_stock_summary) and current stock balance
                    (creates a correction/damage adjustment for the delta) */}
                {editingItem && (
                  <div className="space-y-4 border-t pt-4">
                    <Label className="text-sm font-medium text-muted-foreground">
                      Stock
                    </Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit_opening_quantity">Opening Stock</Label>
                        <Input
                          id="edit_opening_quantity"
                          type="number"
                          min={0}
                          value={formData.edit_opening_quantity}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              edit_opening_quantity: parseFloat(e.target.value) || 0,
                            }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Recorded opening quantity. Direct override — no adjustment row created.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit_current_quantity">Stock Balance</Label>
                        <Input
                          id="edit_current_quantity"
                          type="number"
                          min={0}
                          value={formData.edit_current_quantity}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              edit_current_quantity: parseFloat(e.target.value) || 0,
                            }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Current available quantity. Saving creates a{' '}
                          {formData.edit_current_quantity >
                          (Number(editingItem.stock?.current_quantity) || 0)
                            ? "'correction'"
                            : formData.edit_current_quantity <
                              (Number(editingItem.stock?.current_quantity) || 0)
                            ? "'damage'"
                            : 'no'}{' '}
                          stock-adjustment row for the delta.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Opening Stock — only shown on create */}
                {!editingItem && (
                  <div className="space-y-4 border-t pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="opening_stock">Opening Stock</Label>
                      <p className="text-xs text-muted-foreground">
                        Set the initial stock quantity for this item (optional).
                        A batch will be created so this stock is FIFO-trackable.
                      </p>
                      <Input
                        id="opening_stock"
                        type="number"
                        min={0}
                        value={formData.opening_stock}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            opening_stock: parseInt(e.target.value) || 0,
                          }))
                        }
                      />
                    </div>

                    {formData.opening_stock > 0 && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="opening_batch_number">
                            Batch Number
                            <span className="text-muted-foreground font-normal"> (optional)</span>
                          </Label>
                          <Input
                            id="opening_batch_number"
                            type="text"
                            placeholder="Auto-generated (e.g. BTH-260427-00001)"
                            value={formData.opening_batch_number}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                opening_batch_number: e.target.value,
                              }))
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            Leave blank to auto-generate, or enter the supplier&apos;s lot number.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="opening_expiry_date">
                            Expiry Date
                            <span className="text-muted-foreground font-normal"> (optional)</span>
                          </Label>
                          <Input
                            id="opening_expiry_date"
                            type="date"
                            value={formData.opening_expiry_date}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                opening_expiry_date: e.target.value,
                              }))
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            {formData.track_expiry
                              ? 'This batch will appear in expiry-soon reports and alerts.'
                              : 'Leave blank for non-perishable items. Enable "Track expiry dates" above to get alerts.'}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Say what Save will do BEFORE it is pressed. Someone who thinks
                  they just edited a price, and later finds it unchanged, has been
                  misled by the form — the approval step has to be visible here,
                  not discovered afterwards. */}
              {editingItem && canProposeEdit && (
                <Alert className="border-amber-500/50">
                  <ShieldCheck className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-sm">
                    You can request changes but not apply them. Saving sends what you
                    changed to a super admin for approval — the item stays as it is
                    until they approve it.
                  </AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={isMutating}
                >
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={isMutating}>
                  {isMutating && <BeatLoader color="#fff" size={8} className="mr-2" />}
                  {editingItem
                    ? canProposeEdit
                      ? 'Send for approval'
                      : 'Update Item'
                    : 'Create Item'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Bulk Import Dialog */}
        <BulkImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          storeId={storeId}
          institutionId={institutionId || ''}
          onImportComplete={handleImportComplete}
        />

        {/* Price & POS-sellability update — updates existing items only, unlike
            BulkImportDialog above which is insert-only. */}
        <PriceUpdateDialog
          open={priceDialogOpen}
          onOpenChange={setPriceDialogOpen}
          institutionId={institutionId || ''}
          onUpdateComplete={handleImportComplete}
        />

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={categoryFilter}
                onValueChange={(val) => setCategoryFilter(val === 'all' ? '' : val)}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories?.map((cat: { id: string; name: string }) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={typeFilter}
                onValueChange={(val) => setTypeFilter(val === 'all' ? '' : val)}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {ITEM_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Finding what is NOT on the counter is the reason this exists —
                  with most of a catalogue hidden, scanning pages is not a search. */}
              <Select
                value={posFilter}
                onValueChange={(val) => setPosFilter(val as typeof posFilter)}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="POS" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All items</SelectItem>
                  <SelectItem value="at_pos">At POS</SelectItem>
                  <SelectItem value="not_at_pos">Not at POS</SelectItem>
                </SelectContent>
              </Select>

              {/* Which catalogue. The warehouse holds nothing it has not been
                  sent, but it decides what gets sent — so it needs to reach items
                  no store carries yet. Making the choice visible matters more
                  than the choice itself: two lists that look identical but hold
                  different rows is how the original confusion started. */}
              {canSeeInstitutionCatalog && (
                <Select
                  value={catalogScope}
                  onValueChange={(val) => setCatalogScope(val as typeof catalogScope)}
                >
                  <SelectTrigger className="w-full sm:w-[210px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">In this store</SelectItem>
                    <SelectItem value="institution">Whole institution</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {scope === 'institution' && (
              <p className="mt-3 text-xs text-muted-foreground">
                Showing every item in the institution, including ones {currentStore?.name || 'this store'}
                {' '}does not carry. Stock and POS status are still {currentStore?.name || 'this store'}&apos;s.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Bulk action bar — only while something is selected. */}
        {canEdit && selectedIds.size > 0 && (
          <Card className="border-primary/40">
            <CardContent className="py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <span className="font-medium">
                    {affectedCount} item{affectedCount === 1 ? '' : 's'} selected
                  </span>
                  {/* The page holds 20 ids; "all matching" cannot be a list, so it
                      switches the request to filter mode server-side. */}
                  {!selectAllMatching &&
                    selectedIds.size === rows.length &&
                    totalMatching > rows.length && (
                      <button
                        type="button"
                        className="ml-2 underline text-primary"
                        onClick={() => setSelectAllMatching(true)}
                      >
                        Select all {totalMatching} matching
                      </button>
                    )}
                  {selectAllMatching && (
                    <button
                      type="button"
                      className="ml-2 underline text-muted-foreground"
                      onClick={() => setSelectAllMatching(false)}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* POS is a property of a counter, so these only make sense
                      against one store. In the institution view the useful action
                      is the other one: start carrying the item here at all. */}
                  {storeScoped ? (
                    <>
                      <Button
                        size="sm"
                        disabled={setPosVisibility.isPending}
                        onClick={() =>
                          selectAllMatching ? setBulkConfirm('add') : runBulk('add')
                        }
                      >
                        <ShieldCheck className="h-4 w-4 mr-1" />
                        Add to POS ({affectedCount})
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={setPosVisibility.isPending}
                        onClick={() =>
                          selectAllMatching ? setBulkConfirm('remove') : runBulk('remove')
                        }
                      >
                        Remove from POS ({affectedCount})
                      </Button>
                      {/* "All matching" is a filter, not a list of ids, and the
                          assortment mutations take ids — so this stays on the
                          explicit selection rather than silently doing less. */}
                      {!selectAllMatching && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={removeFromStore.isPending}
                          onClick={() => runAssortment('remove')}
                        >
                          Remove from this store ({selectedIds.size})
                        </Button>
                      )}
                    </>
                  ) : (
                    !selectAllMatching && (
                      <Button
                        size="sm"
                        disabled={addToStore.isPending || !storeId}
                        onClick={() => runAssortment('add')}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add to {currentStore?.name || 'this store'} ({selectedIds.size})
                      </Button>
                    )
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectedIds(new Set());
                      setSelectAllMatching(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Items Table */}
        <Card>
          <CardContent className="pt-6">
            {itemsLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="#6366f1" size={12} />
              </div>
            ) : !items?.data || items.data.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">No items found</p>
                <p className="text-sm mt-1">
                  {debouncedSearch || categoryFilter || typeFilter
                    ? 'Try adjusting your filters'
                    : 'Add your first inventory item to get started'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {canEdit && (
                        <TableHead className="w-[36px]">
                          <input
                            type="checkbox"
                            checked={rows.length > 0 && selectedIds.size === rows.length}
                            onChange={toggleSelectAll}
                            className="h-4 w-4 rounded border-border"
                            aria-label="Select all rows on this page"
                          />
                        </TableHead>
                      )}
                      <TableHead className="w-14">Image</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      {/* Code, Company, Type, Base Unit, GST % and At POS are all
                          still fetched and still stored — they moved to the View
                          dialog so the grid fits without sideways scrolling.
                          Search still matches on code, so it stays findable. */}
                      <TableHead className="text-right">Opening Stock</TableHead>
                      <TableHead className="text-right">Stock Balance</TableHead>
                      <TableHead className="text-right">Cost Price</TableHead>
                      <TableHead className="text-right">MRP</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(items?.data ?? []).map((item: ImsItemWithRelations) => (
                      <TableRow key={item.id}>
                        {canEdit && (
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectAllMatching || selectedIds.has(item.id)}
                              onChange={() => toggleSelect(item.id)}
                              className="h-4 w-4 rounded border-border"
                              aria-label={`Select ${item.name}`}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center overflow-hidden">
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.name}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <Package className="h-4 w-4 text-muted-foreground/40" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{item.name}</p>
                          {/* Visible to everyone who can see the item, not just
                              the requester: it explains why a value someone
                              expected to have changed still reads the old one. */}
                          {pendingChangeIds?.has(item.id) && (
                            <Badge
                              variant="outline"
                              className="mt-1 text-amber-600 border-amber-500/50 text-[10px]"
                            >
                              Change awaiting approval
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.category?.name || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-muted-foreground font-medium tabular-nums">
                            {item.stock?.opening_quantity ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {item.stock != null ? (
                            <span className={
                              item.stock.current_quantity === 0
                                ? 'text-red-500 font-medium tabular-nums'
                                : item.stock.current_quantity <= (item.reorder_level || 0)
                                ? 'text-yellow-600 font-medium tabular-nums'
                                : 'text-green-600 font-medium tabular-nums'
                            }>
                              {item.stock.current_quantity}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatPrice(Number(item.cost_price) || 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatPrice(Number(item.mrp) || 0)}
                        </TableCell>
                        <TableCell>
                          {item.is_active ? (
                            <Badge variant="success">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {/* First, and available to everyone who can see the
                                  row: with five columns now hidden, View is the
                                  only way to read the whole item. */}
                              <DropdownMenuItem onClick={() => setViewItem(item)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View
                              </DropdownMenuItem>
                              {(canEdit || canProposeEdit) && (
                                <DropdownMenuItem onClick={() => handleEdit(item)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  {/* Same form either way — only where Save lands
                                      differs, and the dialog says so. */}
                                  {canEdit ? 'Edit' : 'Request change'}
                                </DropdownMenuItem>
                              )}
                              {canEdit && (
                                <DropdownMenuItem onClick={() => setBatchItem(item)}>
                                  <Package className="h-4 w-4 mr-2" />
                                  Add Batch Stock
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => setViewBatchItem(item)}>
                                <Layers className="h-4 w-4 mr-2" />
                                View Batches
                              </DropdownMenuItem>
                              {canEdit && (
                                <DropdownMenuItem onClick={() => handleToggleActive(item)}>
                                  <ToggleLeft className="h-4 w-4 mr-2" />
                                  {item.is_active ? 'Deactivate' : 'Activate'}
                                </DropdownMenuItem>
                              )}
                              {canDelete && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600"
                                    onClick={() => handleDelete(item)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination — driven by server-side metadata. Self-hides on a
                single page, so the footer only appears once results overflow. */}
            {items?.metadata && items.metadata.total > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t pt-4 mt-2">
                <p className="text-sm text-muted-foreground">
                  Showing{' '}
                  {(items.metadata.page - 1) * items.metadata.limit + 1}
                  –
                  {Math.min(
                    items.metadata.page * items.metadata.limit,
                    items.metadata.total
                  )}{' '}
                  of {items.metadata.total} items
                </p>
                <PaginationWithControls
                  currentPage={items.metadata.page}
                  totalPages={items.metadata.totalPages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Batch Modals */}
      <AddBatchModal
        open={!!batchItem}
        itemId={batchItem?.id ?? ''}
        itemName={batchItem?.name ?? ''}
        storeId={storeId ?? ''}
        institutionId={institutionId ?? ''}
        onClose={() => setBatchItem(null)}
      />
      <BatchesDialog
        open={!!viewBatchItem}
        itemId={viewBatchItem?.id ?? ''}
        itemName={viewBatchItem?.name ?? ''}
        storeId={storeId ?? ''}
        onClose={() => setViewBatchItem(null)}
      />

      {/* Item detail. The home for everything the table no longer shows —
          Company, Type, Base Unit, GST and At POS — plus the fields that were
          never on the grid at all (the other three units, HSN, selling price,
          stock levels, tracking flags). Read-only by design: editing has its own
          dialog, and this one is available to anyone who can see the row. */}
      <Dialog open={!!viewItem} onOpenChange={(o) => !o && setViewItem(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          {viewItem && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <span>{viewItem.name}</span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {viewItem.code}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {viewItem.description || 'No description recorded.'}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col sm:flex-row gap-5 py-2">
                <div className="w-28 h-28 shrink-0 rounded border bg-muted flex items-center justify-center overflow-hidden">
                  {viewItem.image_url ? (
                    <img
                      src={viewItem.image_url}
                      alt={viewItem.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <Package className="h-8 w-8 text-muted-foreground/40" />
                  )}
                </div>

                <div className="flex-1 flex flex-wrap gap-2 content-start">
                  <Badge variant="outline" className={itemTypeBadgeVariant(viewItem.item_type)}>
                    {viewItem.item_type}
                  </Badge>
                  {viewItem.is_active ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                  {/* The store's own listing, not the item-level default —
                      the same rule the removed column followed. */}
                  {(storeId ? viewItem.store_link?.is_sellable_to_students : viewItem.is_sellable_to_students) ? (
                    <Badge variant="outline" className="text-green-600 border-green-500/50">
                      At POS{currentStore?.name ? ` · ${currentStore.name}` : ''}
                    </Badge>
                  ) : storeId && !viewItem.store_link ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      Not carried by {currentStore?.name || 'this store'}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">Not at POS</Badge>
                  )}
                  {viewItem.track_batch && <Badge variant="outline">Batch tracked</Badge>}
                  {viewItem.track_expiry && <Badge variant="outline">Expiry tracked</Badge>}
                  {viewItem.is_bundle && <Badge variant="outline">Bundle</Badge>}
                  {!viewItem.is_distributable && (
                    <Badge variant="outline" className="text-muted-foreground">Not distributable</Badge>
                  )}
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <ViewSection title="Details">
                  <ViewRow label="Code" mono>{viewItem.code}</ViewRow>
                  <ViewRow label="Category">{viewItem.category?.name}</ViewRow>
                  <ViewRow label="Company">{viewItem.company_name}</ViewRow>
                  <ViewRow label="Brand">{viewItem.brand}</ViewRow>
                  <ViewRow label="Type">{viewItem.item_type}</ViewRow>
                  <ViewRow label="HSN code" mono>{viewItem.hsn_code}</ViewRow>
                </ViewSection>

                <ViewSection title="Units">
                  <ViewRow label="Base unit">{unitLabel(viewItem.base_unit)}</ViewRow>
                  <ViewRow label="Purchase unit">{unitLabel(viewItem.purchase_unit)}</ViewRow>
                  <ViewRow label="Sale unit">{unitLabel(viewItem.sale_unit)}</ViewRow>
                  <ViewRow label="Indent unit">{unitLabel(viewItem.indent_unit)}</ViewRow>
                </ViewSection>

                <ViewSection title="Pricing &amp; tax">
                  <ViewRow label="Cost price">{formatPrice(Number(viewItem.cost_price) || 0)}</ViewRow>
                  <ViewRow label="MRP">{formatPrice(Number(viewItem.mrp) || 0)}</ViewRow>
                  <ViewRow label="Selling price">{formatPrice(Number(viewItem.selling_price) || 0)}</ViewRow>
                  <ViewRow label="GST">
                    {Number(viewItem.gst_rate) > 0 ? `${viewItem.gst_rate}%` : 'Nil'}
                  </ViewRow>
                </ViewSection>

                <ViewSection
                  title={`Stock${currentStore?.name ? ` · ${currentStore.name}` : ''}`}
                >
                  <ViewRow label="Opening">{viewItem.stock?.opening_quantity ?? null}</ViewRow>
                  <ViewRow label="Current">{viewItem.stock?.current_quantity ?? null}</ViewRow>
                  <ViewRow label="Available">{viewItem.stock?.available_quantity ?? null}</ViewRow>
                  <ViewRow label="Reorder level">{viewItem.reorder_level}</ViewRow>
                  <ViewRow label="Max stock level">{viewItem.max_stock_level}</ViewRow>
                </ViewSection>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => {
                  const item = viewItem;
                  setViewItem(null);
                  setViewBatchItem(item);
                }}>
                  <Layers className="h-4 w-4 mr-2" />
                  View Batches
                </Button>
                {(canEdit || canProposeEdit) && (
                  <Button onClick={() => {
                    const item = viewItem;
                    setViewItem(null);
                    handleEdit(item);
                  }}>
                    <Pencil className="h-4 w-4 mr-2" />
                    {canEdit ? 'Edit' : 'Request change'}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm only for "all matching" — that path can touch hundreds of rows the
          user never saw, so the count is worth stating before it happens. A plain
          20-row selection is visible on screen and needs no ceremony. */}
      <Dialog open={!!bulkConfirm} onOpenChange={(o) => !o && setBulkConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {bulkConfirm === 'add' ? 'Add to POS' : 'Remove from POS'}
            </DialogTitle>
            <DialogDescription>
              This will {bulkConfirm === 'add' ? 'put' : 'take'}{' '}
              <strong>{totalMatching} items</strong>{' '}
              {bulkConfirm === 'add' ? 'on' : 'off'}{' '}
              <strong>{currentStore?.name || 'this store'}</strong>&apos;s counter — every
              item matching your current filters, including those on other pages.
              Other stores&apos; counters are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkConfirm(null)}>
              Cancel
            </Button>
            <Button
              disabled={setPosVisibility.isPending}
              onClick={() => bulkConfirm && runBulk(bulkConfirm)}
            >
              {setPosVisibility.isPending && (
                <BeatLoader color="#fff" size={8} className="mr-2" />
              )}
              {bulkConfirm === 'add' ? 'Add all' : 'Remove all'} {totalMatching}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
