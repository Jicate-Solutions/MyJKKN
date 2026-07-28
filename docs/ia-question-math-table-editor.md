# IA Question Paper — Rich Editor (Math Equations + Tables)

**App:** MyJKKN
**Route:** `/academic/question-papers` → authoring grid
**Surface owned:** `ia_question_papers.questions[].question_text`
**Status:** Built, typecheck-clean. Live once COE is deployed (they render as one release).

This documents the MyJKKN half — the **authoring editor**. The COE half (faithful HTML→PDF) is documented in the COE repo: `docs/ia-question-pdf-renderer.md`. The COE port spec (to add this same editor inside COE) is `docs/ia-question-math-table-editor-spec.md`.

---

## 1. What it does

The question box is a Word-style rich editor:

- **Type directly** — normal prose, exactly like before.
- **Equation** button → a Word-style equation editor (structures + categorized symbol palettes + LaTeX field + live preview). Insert or edit inline math.
- **Table** controls → insert a table, add/delete rows & columns, delete table.
- **Formatting** — bold, italic, underline, subscript, superscript.

Approved/locked papers show the content read-only (toolbar hidden, fields disabled) but formulas and tables still render.

---

## 2. The storage contract (the invariant)

`question_text` is **sanitized HTML**. Inline math is an atom node serialized as:

```html
<span data-latex="x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}" class="qp-math"></span>
```

**Only the LaTeX source is stored — never rendered KaTeX.** Three surfaces each render that one string their own way:

```
Author types in the editor
   │  Tiptap → editor.getHTML()
   ▼
question_text (HTML; math = <span data-latex="…">, tables = <table>…)
   ├─► MyJKKN editor : KaTeX HTML (live NodeView)          ← this doc
   ├─► COE editor    : KaTeX HTML (live NodeView)          ← COE port spec
   └─► COE PDF       : KaTeX → MathML + Chromium           ← COE renderer doc
```

Rendered KaTeX HTML depends on ~20 `.woff2` fonts that break serverless file-tracing, so the PDF re-renders LaTeX → MathML at print time. **Any consumer must treat `question_text` as HTML** (parse/sanitize) — printing it as a literal string is the bug that showed raw `<p>` tags in the old jsPDF PDF.

---

## 3. Files

| File | Role |
|---|---|
| `lib/utils/question-papers/math-catalog.ts` | The "all educational symbols" catalog — Word-style STRUCTURE_GROUPS + SYMBOL_GROUPS, each token `{ latex, title, display, renderAsMath? }` |
| `components/question-papers/math-node.ts` | Custom Tiptap inline **atom** node `mathInline` (`data-latex` attr, KaTeX NodeView, `insertMath`/`updateMath` commands) |
| `components/question-papers/equation-editor-dialog.tsx` | Word-style dialog — category ribbon, token grid, LaTeX textarea, live KaTeX preview, insert-at-caret |
| `components/question-papers/question-rich-editor.tsx` | The typeable box — Tiptap editor + toolbar (formatting, Equation, table controls) + table CSS |
| `app/(routes)/academic/question-papers/_components/paper-authoring.tsx` | Integration — `<QuestionRichEditor>` replaces the old `<Textarea>` |

**Dependencies added:** `katex`, `@types/katex`, `isomorphic-dompurify`, and the Tiptap table extensions (already present in MyJKKN).

---

## 4. How the pieces fit

### 4.1 The math node (`math-node.ts`)
`inline: true, atom: true` — a formula is one indivisible character. Two outputs from one node:
- `renderHTML` (save time) → `<span data-latex="…" class="qp-math">` (durable, minimal).
- `addNodeView` (display time) → fills the span with `katex.renderToString(latex)` HTML.

Commands: `insertMath(latex)` (new) and `updateMath(latex)` (replace the selected formula).

### 4.2 The equation dialog (`equation-editor-dialog.tsx`)
- Category ribbon: **Structures** (fraction, script, radical, integral, large operator, bracket, function, accent, matrix) then **Symbols** (basic, relations, Greek lower/upper, arrows, set & logic, calculus, geometry, chemistry, units).
- Clicking a token splices its LaTeX at the caret in the LaTeX field; the caret is restored just after the snippet.
- A live preview renders the current LaTeX with KaTeX (`displayMode`, `throwOnError:false`).
- `initialLatex` pre-fills when editing an existing formula.

### 4.3 The rich editor (`question-rich-editor.tsx`)
Extensions: `StarterKit` (no heading/code/blockquote) + `Underline` + `Subscript` + `Superscript` + `Table` (+ Row/Header/Cell) + `MathInline`.
- Toolbar: B / I / U / x₂ / x² / **Σ Equation** / table controls (table controls show only when the caret is inside a table).
- **Insert vs edit** logic: `openEquation()` seeds the dialog with the selected formula's LaTeX (edit) or empty (insert); `submitEquation()` calls `updateMath` or `insertMath` accordingly.
- Emits `editor.getHTML()` (or `''` when empty) via `onChange`.
- `disabled` hides the toolbar and calls `setEditable(false)`.
- **Tiptap v2.27**: external-value sync uses `setContent(value, false)` (boolean 2nd arg — NOT the v3 `{ emitUpdate }` object) so a server reload doesn't re-mark the row dirty.

### 4.4 Integration (`paper-authoring.tsx`)
The old `<Textarea … onChange={ev => patch(q.id,'question_text',ev.target.value)}>` became:

```tsx
<QuestionRichEditor
  value={e?.question_text ?? ''}
  disabled={!isEditable}
  placeholder='Enter the question…'
  onChange={(html) => patch(q.id, 'question_text', html)}
  onBlur={flushSave}
/>
```

Autosave, optimistic-concurrency guard (`base_updated_at`), and `toDto` are unchanged — `question_text` is still a string, just HTML now.

---

## 5. Catalog coverage ("all educational symbols")

- **Structures:** fraction, linear fraction, super/subscript, pre-scripts, √, ⁿ√, ∛, definite/indefinite/double/triple/contour integrals, ∑, ∏, ∐, ⋃, ⋂, lim, brackets (), [], {}, |·|, ‖·‖, binomial, cases, trig/log/exp functions, accents (bar, vec, hat, dot, tilde, overline, over-arrow), matrices (plain, (), [], det, 3×3).
- **Symbols:** basic ops (± ∓ × ÷ ⋅ ∗ ⋆ mod % ‰ ∞ ! ∝), relations (= ≠ ≈ ≡ ≅ ∼ ≃ < > ≤ ≥ ≪ ≫ ≺ ≻ ≐), full Greek (lower + upper), arrows (← → ↑ ↓ ↔ ↕ ⇒ ⇐ ⇔ ↦ ⟶ ⇌ ↗ ↘), set & logic (∈ ∉ ∋ ⊂ ⊆ ⊃ ⊇ ∪ ∩ ∖ ∅ ⌀ ∀ ∃ ∄ ∧ ∨ ¬ ⊕ ⊗ ∴ ∵ ∣), calculus (∂ ∇ ∫ ∮ ∑ ∏ lim → ∞ ′ ″ d/dx ∂/∂x), geometry (∠ ∡ ° ⊥ ∥ △ □ ≅ ∼ π arc), chemistry (→ ⇌ heat-over-arrow, H₂O, ion charge, Δ, ↑ gas, ↓ precipitate, hydrate ·, ≡), units (°C °F Å µ Ω ℓ ℏ ± ≈ ×10ⁿ).

> KaTeX-invalid commands were avoided: `\text{‰}` (not `\permil`), `\overparen` (not `\overarc`), `\text{Å}` (not `\text{\AA}`).

---

## 6. Usage

1. Open a draft/submitted paper in the authoring grid.
2. Type the question directly in the box.
3. For math: click **Equation** → pick structures/symbols or type LaTeX → watch the preview → **Insert**. Click an existing formula + **Equation** to edit it.
4. For a table: click the table icon → fill cells → use add/delete row/column.
5. Autosaves as you go; **Submit** / **Approve** / **Lock** per the status machine.
6. **PDF** button downloads the faithfully-rendered paper (once COE is deployed).

---

## 7. Verification

Whole-repo `tsc` OOMs (the build uses Turbopack's incremental checker). To typecheck the slice, use a scoped tsconfig that `extends` the base with a narrow `include` and run `tsc -p`. This feature's slice was verified clean that way.

---

## 8. Related docs

- COE PDF renderer: `JKKN_COE/docs/ia-question-pdf-renderer.md`
- COE editor port spec: `JKKN_COE/docs/ia-question-math-table-editor-spec.md`
