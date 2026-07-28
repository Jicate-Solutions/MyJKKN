/**
 * Educational math catalog — the palette behind the Word-style equation editor.
 *
 * Every entry carries a LaTeX string. The SAME LaTeX is rendered by KaTeX in the
 * MyJKKN editor and expanded by KaTeX server-side for the COE PDF, so what the
 * author sees is exactly what prints (see build-paper-pdf-html.ts on the COE side).
 *
 * Two kinds of entries:
 *   - SYMBOLS    — atomic tokens (α, ≤, →, ∫ …). `display` is a Unicode glyph so
 *                  the palette button is cheap to render (no KaTeX per button).
 *   - STRUCTURES — templates with sample slots (\frac{a}{b}, x^{2}, matrices …).
 *                  Rendered as a small KaTeX preview on the button; the author
 *                  replaces the sample letters in the LaTeX field afterwards.
 *
 * This is the "all educational related symbols" set: arithmetic, relations, the
 * full Greek alphabet, arrows (incl. chemistry equilibrium ⇌), set/logic,
 * calculus, geometry, chemistry/science and common units.
 */

export interface MathToken {
  /** LaTeX inserted into the formula. */
  latex: string;
  /** Short human label (tooltip). */
  title: string;
  /**
   * What to show on the palette button. For symbols this is a Unicode glyph; for
   * structures it is a LaTeX string that the button renders via KaTeX.
   */
  display: string;
  /** When true, `display` is LaTeX to render with KaTeX (used for structures). */
  renderAsMath?: boolean;
}

export interface MathGroup {
  key: string;
  label: string;
  tokens: MathToken[];
}

/** Word "Structures" ribbon — fraction, script, radical, integral, large op, etc. */
export const STRUCTURE_GROUPS: MathGroup[] = [
  {
    key: 'fraction-script',
    label: 'Fraction & Script',
    tokens: [
      { latex: '\\frac{a}{b}', title: 'Fraction', display: '\\frac{a}{b}', renderAsMath: true },
      { latex: '{a}/{b}', title: 'Linear fraction', display: 'a/b', renderAsMath: true },
      { latex: 'x^{2}', title: 'Superscript', display: 'x^{2}', renderAsMath: true },
      { latex: 'x_{n}', title: 'Subscript', display: 'x_{n}', renderAsMath: true },
      { latex: 'x_{a}^{b}', title: 'Sub & superscript', display: 'x_{a}^{b}', renderAsMath: true },
      { latex: '{}^{a}_{b}X', title: 'Pre sub/superscript', display: '{}^{a}_{b}X', renderAsMath: true },
    ],
  },
  {
    key: 'radical',
    label: 'Radical',
    tokens: [
      { latex: '\\sqrt{x}', title: 'Square root', display: '\\sqrt{x}', renderAsMath: true },
      { latex: '\\sqrt[n]{x}', title: 'nth root', display: '\\sqrt[n]{x}', renderAsMath: true },
      { latex: '\\sqrt[3]{x}', title: 'Cube root', display: '\\sqrt[3]{x}', renderAsMath: true },
    ],
  },
  {
    key: 'integral',
    label: 'Integral',
    tokens: [
      { latex: '\\int_{a}^{b} f(x)\\,dx', title: 'Definite integral', display: '\\int_a^b', renderAsMath: true },
      { latex: '\\int f(x)\\,dx', title: 'Indefinite integral', display: '\\int', renderAsMath: true },
      { latex: '\\iint', title: 'Double integral', display: '\\iint', renderAsMath: true },
      { latex: '\\iiint', title: 'Triple integral', display: '\\iiint', renderAsMath: true },
      { latex: '\\oint', title: 'Contour integral', display: '\\oint', renderAsMath: true },
    ],
  },
  {
    key: 'large-operator',
    label: 'Large Operator',
    tokens: [
      { latex: '\\sum_{i=1}^{n}', title: 'Summation', display: '\\sum', renderAsMath: true },
      { latex: '\\prod_{i=1}^{n}', title: 'Product', display: '\\prod', renderAsMath: true },
      { latex: '\\coprod_{i=1}^{n}', title: 'Coproduct', display: '\\coprod', renderAsMath: true },
      { latex: '\\bigcup_{i=1}^{n}', title: 'Union', display: '\\bigcup', renderAsMath: true },
      { latex: '\\bigcap_{i=1}^{n}', title: 'Intersection', display: '\\bigcap', renderAsMath: true },
      { latex: '\\lim_{x \\to \\infty}', title: 'Limit', display: '\\lim', renderAsMath: true },
    ],
  },
  {
    key: 'bracket',
    label: 'Bracket',
    tokens: [
      { latex: '\\left( a \\right)', title: 'Parentheses', display: '(\\;)', renderAsMath: true },
      { latex: '\\left[ a \\right]', title: 'Square brackets', display: '[\\;]', renderAsMath: true },
      { latex: '\\left\\{ a \\right\\}', title: 'Braces', display: '\\{\\;\\}', renderAsMath: true },
      { latex: '\\left| a \\right|', title: 'Absolute value', display: '|\\;|', renderAsMath: true },
      { latex: '\\left\\| a \\right\\|', title: 'Norm', display: '\\|\\;\\|', renderAsMath: true },
      { latex: '\\binom{n}{k}', title: 'Binomial', display: '\\binom{n}{k}', renderAsMath: true },
      { latex: '\\lfloor a \\rfloor', title: 'Floor', display: '\\lfloor a \\rfloor', renderAsMath: true },
      { latex: '\\lceil a \\rceil', title: 'Ceiling', display: '\\lceil a \\rceil', renderAsMath: true },
      { latex: '\\begin{cases} a & x>0 \\\\ b & x\\le 0 \\end{cases}', title: 'Cases', display: '\\{', renderAsMath: true },
    ],
  },
  {
    key: 'function',
    label: 'Function',
    tokens: [
      { latex: '\\sin', title: 'sin', display: '\\sin', renderAsMath: true },
      { latex: '\\cos', title: 'cos', display: '\\cos', renderAsMath: true },
      { latex: '\\tan', title: 'tan', display: '\\tan', renderAsMath: true },
      { latex: '\\cot', title: 'cot', display: '\\cot', renderAsMath: true },
      { latex: '\\sec', title: 'sec', display: '\\sec', renderAsMath: true },
      { latex: '\\csc', title: 'csc', display: '\\csc', renderAsMath: true },
      { latex: '\\log', title: 'log', display: '\\log', renderAsMath: true },
      { latex: '\\ln', title: 'ln', display: '\\ln', renderAsMath: true },
      { latex: '\\log_{a}', title: 'log base a', display: '\\log_a', renderAsMath: true },
      { latex: '\\exp', title: 'exp', display: '\\exp', renderAsMath: true },
    ],
  },
  {
    key: 'accent',
    label: 'Accent',
    tokens: [
      { latex: '\\bar{x}', title: 'Bar (mean)', display: '\\bar{x}', renderAsMath: true },
      { latex: '\\vec{v}', title: 'Vector', display: '\\vec{v}', renderAsMath: true },
      { latex: '\\hat{x}', title: 'Hat', display: '\\hat{x}', renderAsMath: true },
      { latex: '\\dot{x}', title: 'Dot', display: '\\dot{x}', renderAsMath: true },
      { latex: '\\ddot{x}', title: 'Double dot', display: '\\ddot{x}', renderAsMath: true },
      { latex: '\\tilde{x}', title: 'Tilde', display: '\\tilde{x}', renderAsMath: true },
      { latex: '\\overline{abc}', title: 'Overline', display: '\\overline{abc}', renderAsMath: true },
      { latex: '\\overrightarrow{AB}', title: 'Over-arrow', display: '\\overrightarrow{AB}', renderAsMath: true },
    ],
  },
  {
    key: 'matrix',
    label: 'Matrix',
    tokens: [
      { latex: '\\begin{matrix} a & b \\\\ c & d \\end{matrix}', title: 'Matrix 2×2', display: '\\begin{smallmatrix}a&b\\\\c&d\\end{smallmatrix}', renderAsMath: true },
      { latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', title: 'Matrix (parentheses)', display: '\\bigl(\\begin{smallmatrix}a&b\\\\c&d\\end{smallmatrix}\\bigr)', renderAsMath: true },
      { latex: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}', title: 'Matrix (brackets)', display: '\\bigl[\\begin{smallmatrix}a&b\\\\c&d\\end{smallmatrix}\\bigr]', renderAsMath: true },
      { latex: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}', title: 'Determinant', display: '\\bigl|\\begin{smallmatrix}a&b\\\\c&d\\end{smallmatrix}\\bigr|', renderAsMath: true },
      { latex: '\\begin{bmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{bmatrix}', title: 'Matrix 3×3', display: '3{\\times}3', renderAsMath: true },
    ],
  },
];

/** Word "Symbols" ribbon + Symbol dialog subsets — the atomic glyphs. */
export const SYMBOL_GROUPS: MathGroup[] = [
  {
    key: 'basic',
    label: 'Basic Math',
    tokens: [
      { latex: '+', title: 'Plus', display: '+' },
      { latex: '-', title: 'Minus', display: '−' },
      { latex: '\\times', title: 'Times', display: '×' },
      { latex: '\\div', title: 'Divide', display: '÷' },
      { latex: '\\pm', title: 'Plus-minus', display: '±' },
      { latex: '\\mp', title: 'Minus-plus', display: '∓' },
      { latex: '\\cdot', title: 'Dot product', display: '⋅' },
      { latex: '\\ast', title: 'Asterisk', display: '∗' },
      { latex: '\\star', title: 'Star', display: '⋆' },
      { latex: '\\bmod', title: 'Modulo', display: 'mod' },
      { latex: '\\%', title: 'Percent', display: '%' },
      { latex: '\\text{‰}', title: 'Per mille', display: '‰' },
      { latex: '\\infty', title: 'Infinity', display: '∞' },
      { latex: '!', title: 'Factorial', display: '!' },
      { latex: '\\propto', title: 'Proportional to', display: '∝' },
      { latex: '\\ldots', title: 'Ellipsis (baseline)', display: '…' },
      { latex: '\\cdots', title: 'Ellipsis (centered)', display: '⋯' },
      { latex: '\\vdots', title: 'Vertical dots', display: '⋮' },
      { latex: '\\ddots', title: 'Diagonal dots', display: '⋱' },
    ],
  },
  {
    key: 'relations',
    label: 'Relations',
    tokens: [
      { latex: '=', title: 'Equals', display: '=' },
      { latex: '\\neq', title: 'Not equal', display: '≠' },
      { latex: '\\approx', title: 'Approximately', display: '≈' },
      { latex: '\\equiv', title: 'Identical', display: '≡' },
      { latex: '\\cong', title: 'Congruent', display: '≅' },
      { latex: '\\sim', title: 'Similar', display: '∼' },
      { latex: '\\simeq', title: 'Asymptotic', display: '≃' },
      { latex: '<', title: 'Less than', display: '<' },
      { latex: '>', title: 'Greater than', display: '>' },
      { latex: '\\leq', title: 'Less or equal', display: '≤' },
      { latex: '\\geq', title: 'Greater or equal', display: '≥' },
      { latex: '\\ll', title: 'Much less', display: '≪' },
      { latex: '\\gg', title: 'Much greater', display: '≫' },
      { latex: '\\prec', title: 'Precedes', display: '≺' },
      { latex: '\\succ', title: 'Succeeds', display: '≻' },
      { latex: '\\doteq', title: 'Approaches limit', display: '≐' },
    ],
  },
  {
    key: 'greek-lower',
    label: 'Greek (lower)',
    tokens: [
      { latex: '\\alpha', title: 'alpha', display: 'α' },
      { latex: '\\beta', title: 'beta', display: 'β' },
      { latex: '\\gamma', title: 'gamma', display: 'γ' },
      { latex: '\\delta', title: 'delta', display: 'δ' },
      { latex: '\\epsilon', title: 'epsilon', display: 'ε' },
      { latex: '\\varepsilon', title: 'var epsilon', display: 'ϵ' },
      { latex: '\\zeta', title: 'zeta', display: 'ζ' },
      { latex: '\\eta', title: 'eta', display: 'η' },
      { latex: '\\theta', title: 'theta', display: 'θ' },
      { latex: '\\vartheta', title: 'var theta', display: 'ϑ' },
      { latex: '\\iota', title: 'iota', display: 'ι' },
      { latex: '\\kappa', title: 'kappa', display: 'κ' },
      { latex: '\\lambda', title: 'lambda', display: 'λ' },
      { latex: '\\mu', title: 'mu', display: 'μ' },
      { latex: '\\nu', title: 'nu', display: 'ν' },
      { latex: '\\xi', title: 'xi', display: 'ξ' },
      { latex: '\\pi', title: 'pi', display: 'π' },
      { latex: '\\rho', title: 'rho', display: 'ρ' },
      { latex: '\\sigma', title: 'sigma', display: 'σ' },
      { latex: '\\tau', title: 'tau', display: 'τ' },
      { latex: '\\upsilon', title: 'upsilon', display: 'υ' },
      { latex: '\\phi', title: 'phi', display: 'φ' },
      { latex: '\\varphi', title: 'var phi', display: 'ϕ' },
      { latex: '\\chi', title: 'chi', display: 'χ' },
      { latex: '\\psi', title: 'psi', display: 'ψ' },
      { latex: '\\omega', title: 'omega', display: 'ω' },
    ],
  },
  {
    key: 'greek-upper',
    label: 'Greek (upper)',
    tokens: [
      { latex: '\\Gamma', title: 'Gamma', display: 'Γ' },
      { latex: '\\Delta', title: 'Delta', display: 'Δ' },
      { latex: '\\Theta', title: 'Theta', display: 'Θ' },
      { latex: '\\Lambda', title: 'Lambda', display: 'Λ' },
      { latex: '\\Xi', title: 'Xi', display: 'Ξ' },
      { latex: '\\Pi', title: 'Pi', display: 'Π' },
      { latex: '\\Sigma', title: 'Sigma', display: 'Σ' },
      { latex: '\\Upsilon', title: 'Upsilon', display: 'Υ' },
      { latex: '\\Phi', title: 'Phi', display: 'Φ' },
      { latex: '\\Psi', title: 'Psi', display: 'Ψ' },
      { latex: '\\Omega', title: 'Omega', display: 'Ω' },
    ],
  },
  {
    key: 'arrows',
    label: 'Arrows',
    tokens: [
      { latex: '\\leftarrow', title: 'Left arrow', display: '←' },
      { latex: '\\rightarrow', title: 'Right arrow', display: '→' },
      { latex: '\\uparrow', title: 'Up arrow', display: '↑' },
      { latex: '\\downarrow', title: 'Down arrow', display: '↓' },
      { latex: '\\leftrightarrow', title: 'Left-right arrow', display: '↔' },
      { latex: '\\updownarrow', title: 'Up-down arrow', display: '↕' },
      { latex: '\\Rightarrow', title: 'Implies', display: '⇒' },
      { latex: '\\Leftarrow', title: 'Implied by', display: '⇐' },
      { latex: '\\Leftrightarrow', title: 'Iff', display: '⇔' },
      { latex: '\\mapsto', title: 'Maps to', display: '↦' },
      { latex: '\\longrightarrow', title: 'Long right arrow', display: '⟶' },
      { latex: '\\rightleftharpoons', title: 'Equilibrium (chem)', display: '⇌' },
      { latex: '\\nearrow', title: 'NE arrow', display: '↗' },
      { latex: '\\searrow', title: 'SE arrow', display: '↘' },
    ],
  },
  {
    key: 'set-logic',
    label: 'Set & Logic',
    tokens: [
      { latex: '\\in', title: 'Element of', display: '∈' },
      { latex: '\\notin', title: 'Not element of', display: '∉' },
      { latex: '\\ni', title: 'Contains', display: '∋' },
      { latex: '\\subset', title: 'Subset', display: '⊂' },
      { latex: '\\subseteq', title: 'Subset or equal', display: '⊆' },
      { latex: '\\supset', title: 'Superset', display: '⊃' },
      { latex: '\\supseteq', title: 'Superset or equal', display: '⊇' },
      { latex: '\\cup', title: 'Union', display: '∪' },
      { latex: '\\cap', title: 'Intersection', display: '∩' },
      { latex: '\\setminus', title: 'Set minus', display: '∖' },
      { latex: '\\emptyset', title: 'Empty set', display: '∅' },
      { latex: '\\varnothing', title: 'Empty set (alt)', display: '⌀' },
      { latex: '\\forall', title: 'For all', display: '∀' },
      { latex: '\\exists', title: 'There exists', display: '∃' },
      { latex: '\\nexists', title: 'Does not exist', display: '∄' },
      { latex: '\\land', title: 'Logical and', display: '∧' },
      { latex: '\\lor', title: 'Logical or', display: '∨' },
      { latex: '\\neg', title: 'Negation', display: '¬' },
      { latex: '\\oplus', title: 'XOR / direct sum', display: '⊕' },
      { latex: '\\otimes', title: 'Tensor product', display: '⊗' },
      { latex: '\\therefore', title: 'Therefore', display: '∴' },
      { latex: '\\because', title: 'Because', display: '∵' },
      { latex: '\\mid', title: 'Divides / such that', display: '∣' },
      { latex: '\\mathbb{N}', title: 'Natural numbers', display: 'ℕ' },
      { latex: '\\mathbb{Z}', title: 'Integers', display: 'ℤ' },
      { latex: '\\mathbb{Q}', title: 'Rational numbers', display: 'ℚ' },
      { latex: '\\mathbb{R}', title: 'Real numbers', display: 'ℝ' },
      { latex: '\\mathbb{C}', title: 'Complex numbers', display: 'ℂ' },
    ],
  },
  {
    key: 'calculus',
    label: 'Calculus',
    tokens: [
      { latex: '\\partial', title: 'Partial derivative', display: '∂' },
      { latex: '\\nabla', title: 'Nabla / del', display: '∇' },
      { latex: '\\int', title: 'Integral', display: '∫' },
      { latex: '\\oint', title: 'Contour integral', display: '∮' },
      { latex: '\\sum', title: 'Sum', display: '∑' },
      { latex: '\\prod', title: 'Product', display: '∏' },
      { latex: '\\lim', title: 'Limit', display: 'lim' },
      { latex: '\\to', title: 'Tends to', display: '→' },
      { latex: '\\infty', title: 'Infinity', display: '∞' },
      { latex: "f'(x)", title: 'Prime (derivative)', display: '′' },
      { latex: "f''(x)", title: 'Double prime', display: '″' },
      { latex: '\\frac{d}{dx}', title: 'd/dx', display: 'd/dx', renderAsMath: true },
      { latex: '\\frac{\\partial}{\\partial x}', title: 'Partial d/dx', display: '∂/∂x', renderAsMath: true },
    ],
  },
  {
    key: 'geometry',
    label: 'Geometry',
    tokens: [
      { latex: '\\angle', title: 'Angle', display: '∠' },
      { latex: '\\measuredangle', title: 'Measured angle', display: '∡' },
      { latex: '^\\circ', title: 'Degree', display: '°', renderAsMath: true },
      { latex: '\\perp', title: 'Perpendicular', display: '⊥' },
      { latex: '\\parallel', title: 'Parallel', display: '∥' },
      { latex: '\\triangle', title: 'Triangle', display: '△' },
      { latex: '\\square', title: 'Square', display: '□' },
      { latex: '\\cong', title: 'Congruent', display: '≅' },
      { latex: '\\sim', title: 'Similar', display: '∼' },
      { latex: '\\pi', title: 'Pi', display: 'π' },
      { latex: '\\overgroup{AB}', title: 'Arc', display: '⌒' },
    ],
  },
  {
    key: 'chemistry',
    label: 'Chemistry',
    tokens: [
      { latex: '\\rightarrow', title: 'Yields', display: '→' },
      { latex: '\\rightleftharpoons', title: 'Equilibrium', display: '⇌' },
      { latex: '\\xrightarrow{\\Delta}', title: 'Heat (Δ) over arrow', display: '→Δ', renderAsMath: true },
      { latex: 'H_{2}O', title: 'Subscript (formula)', display: 'H_2O', renderAsMath: true },
      { latex: 'SO_{4}^{2-}', title: 'Ion charge', display: 'SO_4^{2-}', renderAsMath: true },
      { latex: '\\Delta', title: 'Delta / heat', display: 'Δ' },
      { latex: '\\uparrow', title: 'Gas evolved', display: '↑' },
      { latex: '\\downarrow', title: 'Precipitate', display: '↓' },
      { latex: '\\cdot', title: 'Hydrate dot', display: '·' },
      { latex: '\\equiv', title: 'Triple bond', display: '≡' },
    ],
  },
  {
    key: 'units',
    label: 'Units & Misc',
    tokens: [
      { latex: '^\\circ\\text{C}', title: 'Degree Celsius', display: '°C', renderAsMath: true },
      { latex: '^\\circ\\text{F}', title: 'Degree Fahrenheit', display: '°F', renderAsMath: true },
      { latex: '\\text{Å}', title: 'Angstrom', display: 'Å', renderAsMath: true },
      { latex: '\\mu', title: 'Micro', display: 'µ' },
      { latex: '\\Omega', title: 'Ohm', display: 'Ω' },
      { latex: '\\ell', title: 'Litre / script l', display: 'ℓ' },
      { latex: '\\hbar', title: 'Reduced Planck', display: 'ℏ' },
      { latex: '\\pm', title: 'Tolerance ±', display: '±' },
      { latex: '\\approx', title: 'Approximately', display: '≈' },
      { latex: '\\times 10^{n}', title: 'Scientific ×10ⁿ', display: '×10^n', renderAsMath: true },
    ],
  },
];

/** All groups in ribbon order: Structures first, then Symbols. */
export const ALL_MATH_GROUPS: { section: string; groups: MathGroup[] }[] = [
  { section: 'Structures', groups: STRUCTURE_GROUPS },
  { section: 'Symbols', groups: SYMBOL_GROUPS },
];
