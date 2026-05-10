'use client';

interface TransferModeBadgeProps {
  isCentralStore: boolean;
  centralStoreName?: string;
}

export function TransferModeBadge({ isCentralStore, centralStoreName }: TransferModeBadgeProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-muted border text-sm">
      <span>{isCentralStore ? '📥' : '📤'}</span>
      <span className="font-medium">
        {isCentralStore
          ? 'DISPATCH MODE — Managing incoming requests from department stores'
          : `REQUEST MODE — Requesting from: ${centralStoreName ?? 'Central Store'}`}
      </span>
    </div>
  );
}
