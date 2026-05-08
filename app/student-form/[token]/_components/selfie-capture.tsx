'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Loader2 } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import toast from 'react-hot-toast';

interface Props {
  token: string;
  initialUrl?: string;
  onUploaded: (url: string) => void;
}

export function SelfieCapture({ token, initialUrl, onUploaded }: Props) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [busy, setBusy] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Photo too large — try again. / படம் மிகப் பெரியது');
      return;
    }
    setBusy(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 720,
        useWebWorker: true,
      });
      const fd = new FormData();
      fd.append('photo', compressed);
      const res = await fetch(`/api/student-form/${encodeURIComponent(token)}/photo`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'upload failed');
      setUrl(data.photo_url);
      onUploaded(data.photo_url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {url && (
        <div className="flex justify-center">
          <img src={url} alt="" className="h-32 w-32 rounded-full object-cover border" />
        </div>
      )}
      <label className="block">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          disabled={busy}
        />
        <Button
          asChild
          type="button"
          variant="outline"
          className="w-full h-12"
          disabled={busy}
        >
          <span>
            {busy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Camera className="h-4 w-4 mr-2" />
            )}
            {url
              ? 'Change photo / படம் மாற்று'
              : 'Add photo / படம் சேர்'}
          </span>
        </Button>
      </label>
    </div>
  );
}
