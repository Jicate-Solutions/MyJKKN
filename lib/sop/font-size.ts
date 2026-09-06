// lib/sop/font-size.ts
//
// Tiptap has no built-in font-size extension (unlike Color / FontFamily, which
// ship as packages). Without one, `setMark('textStyle', { fontSize })` is a
// no-op: ProseMirror drops any attribute the schema doesn't declare, silently.
//
// This adds `fontSize` as a global attribute on the `textStyle` mark — the same
// mark Color and FontFamily extend — so all three coexist on one <span> and
// merge into a single `style` attribute (Tiptap's mergeAttributes concatenates
// `style` rather than overwriting it).
//
// The HTML shape produced here (`<span style="font-size: 12pt">`) matches what
// lib/sop/render.ts already reads back when exporting to PDF/DOCX/HTML.

import { Extension } from '@tiptap/core';

export interface FontSizeOptions {
  /** Mark types the attribute is attached to. Only `textStyle` in practice. */
  types: string[];
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      /** Set a CSS font size on the selection, e.g. '12pt' or '1.5rem'. */
      setFontSize: (size: string) => ReturnType;
      /** Clear the font size, falling back to the stylesheet default. */
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FontSize = Extension.create<FontSizeOptions>({
  name: 'fontSize',

  addOptions() {
    return { types: ['textStyle'] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            // Pasted/loaded HTML: read the inline style back into the schema.
            parseHTML: (element: HTMLElement) =>
              element.style.fontSize?.replace(/['"]/g, '') || null,
            renderHTML: (attributes) =>
              attributes.fontSize
                ? { style: `font-size: ${attributes.fontSize}` }
                : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: size }).run(),

      unsetFontSize:
        () =>
        ({ chain }) =>
          chain()
            .setMark('textStyle', { fontSize: null })
            // Drops the now-attribute-less <span> so the HTML stays clean.
            .removeEmptyTextStyle()
            .run(),
    };
  },
});
