'use client';

// app/(routes)/bos/sop/_components/sop-tamil-keyboard.tsx
//
// On-screen Tamil keyboard. Renders the layout from
// lib/sop/tamil-input.ts#TAMIL_VIRTUAL_KEYBOARD and dispatches insertContent
// commands at the editor's current cursor position. Used both as a
// touchscreen-friendly input and as a way for new Tamil users to discover
// the character set without learning Tamil99.

import type { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { TAMIL_VIRTUAL_KEYBOARD } from '@/lib/sop/tamil-input';

export interface SopTamilKeyboardProps {
  editor: Editor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SopTamilKeyboard({ editor, open, onOpenChange }: SopTamilKeyboardProps) {
  const insert = (key: string) => {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (key === 'SPACE') chain.insertContent(' ').run();
    else if (key === 'BACKSPACE') chain.deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from }).run();
    else chain.insertContent(key).run();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='bottom' className='h-auto'>
        <SheetHeader>
          <SheetTitle>தமிழ் விசைப்பலகை · Tamil Keyboard</SheetTitle>
        </SheetHeader>
        <div className='py-3 space-y-2'>
          {TAMIL_VIRTUAL_KEYBOARD.map((row, i) => (
            <div key={i} className='flex flex-wrap justify-center gap-1'>
              {row.map((k) => {
                const label = k === 'SPACE' ? 'Space' : k === 'BACKSPACE' ? '⌫ Backspace' : k;
                const wide = k === 'SPACE' || k === 'BACKSPACE';
                return (
                  <Button
                    key={k}
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={() => insert(k)}
                    className={wide ? 'min-w-[120px]' : 'min-w-[40px] font-["Noto_Sans_Tamil",_sans-serif] text-base'}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          ))}
          <p className='text-xs text-muted-foreground text-center pt-2'>
            Tip: Use Review → Language to switch typing modes (Phonetic / Tamil99).
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
