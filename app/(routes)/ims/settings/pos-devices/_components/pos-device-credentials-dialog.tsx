"use client";

import { useState } from "react";
import { BeatLoader } from "react-spinners";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSetImsPosDeviceCredentials } from "@/hooks/ims/use-ims-pos-devices";
import type { ImsPosDeviceRow } from "@/types/ims/pos-devices";

interface Props {
  /** The terminal being edited; null = closed. */
  device: ImsPosDeviceRow | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Write-only: the saved app key is encrypted on the server and never sent back,
 * so the key field always starts empty. Saving replaces both username and key.
 */
export function PosDeviceCredentialsDialog({ device, onOpenChange }: Props) {
  return (
    <Dialog open={!!device} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {/* Content unmounts on close: the key field is empty on every open. */}
        {device && (
          <CredentialsBody device={device} onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CredentialsBody({
  device,
  onOpenChange,
}: {
  device: ImsPosDeviceRow;
  onOpenChange: (open: boolean) => void;
}) {
  const [username, setUsername] = useState(device.username ?? "");
  const [appKey, setAppKey] = useState("");
  const save = useSetImsPosDeviceCredentials();

  const handleSave = async () => {
    if (!username.trim() || !appKey.trim()) {
      toast.error("Enter both the username and the app key");
      return;
    }
    try {
      await save.mutateAsync({
        id: device.id,
        username: username.trim(),
        appKey: appKey.trim(),
      });
      toast.success(`Credentials saved for ${device.label}`);
      setAppKey("");
      onOpenChange(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not save the credentials",
      );
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Terminal credentials</DialogTitle>
        <DialogDescription>
          {device.label} ·{" "}
          {device.environment === "live"
            ? "LIVE (production app key)"
            : "DEMO (demo app key)"}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="pos-username">Username</Label>
          <Input
            id="pos-username"
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pos-appkey">App key</Label>
          <Input
            id="pos-appkey"
            type="password"
            autoComplete="new-password"
            placeholder={
              device.hasCredentials
                ? "Saved — enter again to change"
                : "From Razorpay POS"
            }
            value={appKey}
            onChange={(e) => setAppKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            The saved key is never shown again. To change the username, re-enter
            the key as well.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={save.isPending}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={save.isPending || !username.trim() || !appKey.trim()}
        >
          {save.isPending && (
            <BeatLoader color="#fff" size={8} className="mr-2" />
          )}
          Save credentials
        </Button>
      </DialogFooter>
    </>
  );
}
