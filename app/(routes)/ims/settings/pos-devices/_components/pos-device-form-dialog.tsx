"use client";

import { useState } from "react";
import { BeatLoader } from "react-spinners";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreateImsPosDevice,
  useUpdateImsPosDevice,
} from "@/hooks/ims/use-ims-pos-devices";
import type {
  ImsPosDeviceMetaInput,
  ImsPosDeviceRow,
  ImsPosDeviceStoreOption,
} from "@/types/ims/pos-devices";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = register a new terminal. */
  device: ImsPosDeviceRow | null;
  stores: ImsPosDeviceStoreOption[];
}

const empty: ImsPosDeviceMetaInput = {
  storeId: "",
  label: "",
  serial: "",
  kind: "razorpay_pos_soundbox",
  accountLabel: null,
  environment: "demo",
};

export function PosDeviceFormDialog({
  open,
  onOpenChange,
  device,
  stores,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        {/* Content unmounts on close, so the form re-seeds from `device` on every open. */}
        <FormBody onOpenChange={onOpenChange} device={device} stores={stores} />
      </DialogContent>
    </Dialog>
  );
}

function FormBody({ onOpenChange, device, stores }: Omit<Props, "open">) {
  const [form, setForm] = useState<ImsPosDeviceMetaInput>(() =>
    device
      ? {
          storeId: device.storeId,
          label: device.label,
          serial: device.serial,
          kind: device.kind,
          accountLabel: device.accountLabel,
          environment: device.environment,
        }
      : empty,
  );
  const create = useCreateImsPosDevice();
  const update = useUpdateImsPosDevice();
  const isMutating = create.isPending || update.isPending;

  // Where a push goes is fixed while the terminal is switched on (the server enforces this too).
  const identityLocked = !!device?.isActive;

  // A terminal's current store may no longer be a selling counter; keep it selectable.
  const storeOptions =
    device && !stores.some((s) => s.id === device.storeId)
      ? [
          ...stores,
          {
            id: device.storeId,
            name: device.storeName ?? "Current store",
            code: device.storeCode,
            institutionId: device.institutionId,
            institutionName: device.institutionName,
          },
        ]
      : stores;
  const multiInstitution =
    new Set(storeOptions.map((s) => s.institutionId)).size > 1;

  const set = <K extends keyof ImsPosDeviceMetaInput>(
    key: K,
    value: ImsPosDeviceMetaInput[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.storeId)
      return toast.error("Choose the store this terminal sits on");
    if (!form.label.trim()) return toast.error("Enter a label");
    if (!form.serial.trim())
      return toast.error("Enter the serial number printed on the device");

    const payload: ImsPosDeviceMetaInput = {
      ...form,
      label: form.label.trim(),
      serial: form.serial.trim(),
      accountLabel: form.accountLabel?.trim() || null,
    };
    try {
      if (device) {
        await update.mutateAsync({ id: device.id, data: payload });
        toast.success("Terminal updated");
      } else {
        await create.mutateAsync(payload);
        toast.success(
          "Terminal added. Save its credentials, send a test, then activate it.",
        );
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not save the terminal",
      );
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{device ? "Edit Terminal" : "Add Terminal"}</DialogTitle>
        <DialogDescription>
          {device
            ? "Update the terminal details. Credentials are changed separately."
            : "Register the payment terminal on a selling counter. It starts switched off."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        {identityLocked && (
          <p className="text-xs rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            This terminal is active. Deactivate it to change its store, serial,
            type or environment.
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="pos-store">
            Store <span className="text-red-500">*</span>
          </Label>
          <Select
            value={form.storeId}
            onValueChange={(v) => set("storeId", v)}
            disabled={identityLocked}
          >
            <SelectTrigger id="pos-store">
              <SelectValue
                placeholder={
                  storeOptions.length
                    ? "Select a selling counter"
                    : "No selling counters available"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {storeOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.code ? ` (${s.code})` : ""}
                  {multiInstitution && s.institutionName
                    ? ` · ${s.institutionName}`
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Only stores with &quot;Has a selling counter (POS)&quot; turned on
            are listed.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="pos-label">
              Label <span className="text-red-500">*</span>
            </Label>
            <Input
              id="pos-label"
              placeholder="e.g. Counter 1 soundbox"
              value={form.label}
              maxLength={80}
              onChange={(e) => set("label", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pos-serial">
              Serial number <span className="text-red-500">*</span>
            </Label>
            <Input
              id="pos-serial"
              placeholder="Printed on the device"
              className="font-mono"
              value={form.serial}
              maxLength={64}
              disabled={identityLocked}
              onChange={(e) => set("serial", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="pos-kind">Device type</Label>
            <Select
              value={form.kind}
              onValueChange={(v) =>
                set("kind", v as ImsPosDeviceMetaInput["kind"])
              }
              disabled={identityLocked}
            >
              <SelectTrigger id="pos-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="razorpay_pos_soundbox">
                  QR soundbox (DQR)
                </SelectItem>
                <SelectItem value="ezetap_android">
                  Android POS (POS Bridge)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pos-env">Environment</Label>
            <Select
              value={form.environment}
              onValueChange={(v) =>
                set("environment", v as ImsPosDeviceMetaInput["environment"])
              }
              disabled={identityLocked}
            >
              <SelectTrigger id="pos-env">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="demo">Demo (simulated money)</SelectItem>
                <SelectItem value="live">Live (real money)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {device && form.environment !== device.environment && (
          <p className="text-xs rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Demo and production use different app keys, so the saved credentials
            are cleared when you switch. Save the{" "}
            {form.environment === "live" ? "production" : "demo"} username and
            app key Razorpay issued before testing or activating.
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="pos-account">Account label (optional)</Label>
          <Input
            id="pos-account"
            placeholder="Only if Razorpay gave one for this device"
            value={form.accountLabel ?? ""}
            maxLength={80}
            onChange={(e) => set("accountLabel", e.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isMutating}
        >
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isMutating}>
          {isMutating && <BeatLoader color="#fff" size={8} className="mr-2" />}
          {device ? "Update Terminal" : "Add Terminal"}
        </Button>
      </DialogFooter>
    </>
  );
}
