'use client';

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Smile } from 'lucide-react';
import { cn } from '@/lib/utils';

const EMOJI_CATEGORIES = {
  'Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
  'Gestures': ['👍','👎','👊','✊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✌️','🤞','🫰','🤟','🤘','👌','🤌','🤏','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','🫱','🫲','👋','🤙','💪','🦾'],
  'Hearts': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟'],
  'Objects': ['📱','💻','📞','📧','📝','📋','📌','📎','✏️','📚','📖','💼','🎓','🏫','🏥','💊','🔬','🧪','⚗️','🩺','💉','🦷','🎯','✅','❌','⚠️','💡','🔔','📢','🎉','🎊','🏆'],
  'Flags': ['🇮🇳','🏳️','🏴','🚩','🎌'],
};

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  trigger?: React.ReactNode;
}

export function EmojiPicker({ onSelect, trigger }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Smileys');

  const categories = Object.keys(EMOJI_CATEGORIES);
  const currentEmojis = EMOJI_CATEGORIES[activeCategory as keyof typeof EMOJI_CATEGORIES] || [];

  // Recent emojis from localStorage
  const [recent, setRecent] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('recent-emojis') || '[]'); } catch { return []; }
  });

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    const newRecent = [emoji, ...recent.filter(e => e !== emoji)].slice(0, 20);
    setRecent(newRecent);
    try { localStorage.setItem('recent-emojis', JSON.stringify(newRecent)); } catch {}
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <button className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <Smile className="h-5 w-5" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" side="top" align="start">
        <div className="border-b p-2">
          <Input
            placeholder="Search emoji..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        {/* Category tabs */}
        <div className="flex border-b overflow-x-auto px-1">
          {recent.length > 0 && (
            <button
              onClick={() => setActiveCategory('Recent')}
              className={cn('px-2 py-1.5 text-lg flex-shrink-0', activeCategory === 'Recent' && 'border-b-2 border-green-500')}
            >🕐</button>
          )}
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn('px-2 py-1.5 text-lg flex-shrink-0', activeCategory === cat && 'border-b-2 border-green-500')}
            >
              {EMOJI_CATEGORIES[cat as keyof typeof EMOJI_CATEGORIES][0]}
            </button>
          ))}
        </div>

        {/* Emoji grid */}
        <div className="h-48 overflow-y-auto p-2">
          <div className="grid grid-cols-8 gap-0.5">
            {(activeCategory === 'Recent' ? recent : currentEmojis)
              .filter(e => !search || e.includes(search))
              .map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  onClick={() => handleSelect(emoji)}
                  className="text-xl p-1 rounded hover:bg-muted transition-colors text-center"
                >
                  {emoji}
                </button>
              ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
