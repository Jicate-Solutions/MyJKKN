# MyJKKN RCLTP — Sample Content (AI DRAFT — NOT VALIDATED)

> ⚠️ **EVERY item below is an AI draft. It is NOT validated pedagogy.**
> Use only after an educator / MyJKKN reviews and approves it. In the database
> each row lands `source='ai_generated'`, `status='draft'`, with an `ai_meta`
> provenance stamp, and is invisible to students until a human sets `status='approved'`.
> English only (v1). No invented psychometric numbers are presented as final.

---

## A. Sample passages (3, across the content-level ladder)

### Passage 1 — content_level `words` · grade_level 1 · ~28 words
**Title:** *My Cat*
> My cat is small. My cat is black. The cat can run. The cat can jump.
> The cat likes milk. I like my cat. My cat likes me too.

**Part B questions (draft):**
1. *(literal)* What colour is the cat? — A) black ✓ · B) white · C) brown
2. *(literal)* What does the cat like to drink? — A) water · B) milk ✓ · C) juice
3. *(vocabulary)* "The cat can **jump**." Jump means to — A) sleep · B) eat · C) leap up ✓

### Passage 2 — content_level `sentences` · grade_level 2 · ~58 words
**Title:** *The Mango Tree*
> There is a big mango tree near my house. In summer, it gives sweet mangoes.
> Every morning, I see green parrots in the tree. They eat the ripe fruit and
> make a loud noise. My grandmother says the tree is older than her. We sit
> under it when the sun is hot.

**Part B questions (draft):**
1. *(literal)* Where is the mango tree? — A) near my house ✓ · B) in the market · C) on a hill
2. *(literal)* Which birds come to the tree? — A) crows · B) parrots ✓ · C) pigeons
3. *(inference)* Why do they sit under the tree when it is hot? — A) for shade ✓ · B) to sleep · C) to eat parrots

### Passage 3 — content_level `paragraphs` · grade_level 4 · ~118 words
**Title:** *Meera and the Lost Coin*
> Meera was walking home from school when she saw a shiny coin on the road.
> She picked it up and felt happy — she could buy her favourite sweet. But then
> she noticed an old man searching the ground nearby, looking worried. "Have you
> lost something?" Meera asked. "Yes, my bus coin," the man said quietly. Meera
> looked at the coin in her hand. For a moment she wanted to keep it. Then she
> opened her palm and gave it to him. The old man smiled widely and thanked her.
> Meera walked home with empty hands, but somehow she felt richer than before.

**Part B questions (draft):**
1. *(literal)* What did Meera find on the road? — A) a sweet · B) a coin ✓ · C) a bus ticket
2. *(inference)* Why did the old man look worried? — A) he was tired · B) he had lost his bus coin ✓ · C) he was hungry
3. *(inference / SEL)* Why did Meera feel "richer" with empty hands? — A) she found more coins · B) she felt good for helping ✓ · C) she bought a sweet

---

## B. Provisional scoring rubric (PROVISIONAL — must be calibrated by MyJKKN)

> ⚠️ These are STRUCTURE placeholders, not validated cutoffs. Band thresholds for a
> reading instrument must be normed against real children. Do NOT ship the numbers
> below as authoritative. They seed the policy rows `is_active=false`.

**Part A — Read & Record (voice, engine-scored → gated):** accuracy %, oral-reading-fluency (words/min), pronunciation, expression.
- **NIPUN Bharat** defines official per-grade ORF (oral reading fluency) targets. ⚠️ The exact wpm figures **must be taken from the official NIPUN Bharat guidelines** — placeholder only: *(e.g., G2 ≈ 45 wpm, G3 ≈ 60 wpm — VERIFY against NIPUN, do not use as-is).*

**Part B — Comprehension:** % of questions correct (auto-graded once approved questions carry `correct_answer`).

**Composite (provisional weights):** Overall = 0.5 × Reading + 0.5 × Comprehension. ⚠️ Weights provisional — MyJKKN to confirm.

**Bands (fixed ladder; cutoffs PROVISIONAL):**
| Band | Provisional overall range | Note |
|---|---|---|
| emergent | 0–39 | placeholder |
| transitional | 40–59 | placeholder |
| proficient | 60–84 | placeholder |
| super_proficient | 85–100 | placeholder |

---

## C. Sample badges (draft catalog — criteria PROVISIONAL)

| slug | name | description | provisional criteria (gated) |
|---|---|---|---|
| `first-reading` | First Reading | Completed your first reading assessment | on first `submit` |
| `streak-5` | 5-Day Streak | Practised 5 days in a row | `current_streak >= 5` |
| `level-up` | Level Up | Moved up a content level | served_content_level increased |
| `comprehension-star` | Comprehension Star | Strong comprehension result | ⚠️ needs MyJKKN score threshold |

---

## D. How this loads (safe path)
This file is the human-readable draft for review. On approval, it converts to a
seed (`status='draft'`, stamped) the Director loads via the gated Management-API
flow — OR a teacher recreates/edits it in the Phase-4a authoring console. Either
way it stays `draft` until a human approves each item.
