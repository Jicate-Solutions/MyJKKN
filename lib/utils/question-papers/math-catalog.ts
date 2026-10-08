// Copied from COE b34e527 (+ uncommitted working tree), 2026-10-05 — source: lib/ia/math-catalog.ts
// Sync list: docs spec "QP entry methods parity" §10. Diff against COE before changing.
// Catalog behind the Word-style equation editor (components/ia/equation-editor-dialog).
//
// Laid out the way Microsoft Word's Equation Tools ribbon is, because that is
// what every examiner already knows:
//
//   SYMBOLS      one scrolling grid, switched between the same eight sets Word
//                offers — Basic Math, Greek Letters, Letter-Like Symbols,
//                Operators, Arrows, Negated Relations, Scripts, Geometry.
//   STRUCTURES   one gallery per button — Fraction, Script, Radical, Integral,
//                Large Operator, Bracket, Function, Accent, Limit and Log,
//                Operator, Matrix — each split into its template shapes and a
//                "Common …" row of ready-made expressions.
//
// Every entry is KaTeX-valid LaTeX. `\square` is the PLACEHOLDER: the empty box
// the author fills in (the dialog selects the first one after an insert and
// Tab jumps to the next). It is the same glyph Word draws as a dotted box.

export const PLACEHOLDER = '\\square'

export interface MathToken {
	/** LaTeX inserted at the caret. */
	latex: string
	/** LaTeX drawn on the button when it should differ from `latex` (defaults to `latex`). */
	label?: string
	title?: string
}

export interface SymbolSet {
	name: string
	tokens: MathToken[]
}

export interface StructureSection {
	name: string
	items: MathToken[]
}

export interface StructureGroup {
	key: string
	name: string
	/** LaTeX drawn on the ribbon button. */
	icon: string
	sections: StructureSection[]
}

/** Kept for older imports: the flat category shape the first dialog used. */
export interface MathCategory {
	name: string
	tokens: MathToken[]
}

const t = (latex: string, title?: string, label?: string): MathToken => ({ latex, title, label })
const cmds = (names: string[]): MathToken[] => names.map(n => t(`\\${n}`))
const P = PLACEHOLDER

/**
 * Word offers every integral in three forms: bare, with limits beside it, and
 * with limits stacked above and below.
 */
const integralForms = (cmd: string, name: string): MathToken[] => [
	t(`${cmd} ${P}`, name),
	t(`${cmd}_{${P}}^{${P}} ${P}`, `${name} with limits`),
	t(`${cmd}\\limits_{${P}}^{${P}} ${P}`, `${name} with stacked limits`),
]

/**
 * …and every large operator in five: bare, limits stacked, limits beside,
 * lower limit stacked, lower limit beside.
 */
const bigOpForms = (cmd: string, name: string): MathToken[] => [
	t(`${cmd} ${P}`, name),
	t(`${cmd}_{${P}}^{${P}} ${P}`, `${name} with stacked limits`),
	t(`${cmd}\\nolimits_{${P}}^{${P}} ${P}`, `${name} with side limits`),
	t(`${cmd}_{${P}} ${P}`, `${name} with stacked lower limit`),
	t(`${cmd}\\nolimits_{${P}} ${P}`, `${name} with side lower limit`),
]

// ── Symbols ──────────────────────────────────────────────────────────────────

export const SYMBOL_SETS: SymbolSet[] = [
	{
		name: 'Basic Math',
		tokens: [
			t('\\pm'), t('\\infty'), t('='), t('\\neq'), t('\\sim'), t('\\times'), t('\\div'), t('!'), t('\\propto'),
			t('<'), t('\\ll'), t('>'), t('\\gg'), t('\\leq'), t('\\geq'), t('\\mp'), t('\\cong'), t('\\approx'), t('\\equiv'),
			t('\\forall'), t('\\complement'), t('\\partial'), t(`\\sqrt{${P}}`, 'Square root', '\\sqrt{\\phantom{x}}'),
			t(`\\sqrt[3]{${P}}`, 'Cube root', '\\sqrt[3]{\\phantom{x}}'), t(`\\sqrt[4]{${P}}`, 'Fourth root', '\\sqrt[4]{\\phantom{x}}'),
			t('\\cup'), t('\\cap'), t('\\emptyset'), t('\\%'), t('^{\\circ}', 'Degree'), t('^{\\circ}\\text{F}', 'Fahrenheit'), t('^{\\circ}\\text{C}', 'Celsius'),
			t('\\Delta'), t('\\nabla'), t('\\exists'), t('\\nexists'), t('\\in'), t('\\ni'),
			t('\\leftarrow'), t('\\uparrow'), t('\\rightarrow'), t('\\downarrow'), t('\\leftrightarrow'), t('\\therefore'),
			t('+'), t('-'), t('\\neg'), t('\\alpha'), t('\\beta'), t('\\gamma'), t('\\delta'), t('\\varepsilon'), t('\\epsilon'),
			t('\\theta'), t('\\vartheta'), t('\\mu'), t('\\pi'), t('\\rho'), t('\\sigma'), t('\\tau'), t('\\varphi'), t('\\omega'),
			t('\\ast'), t('\\bullet'), t('\\vdots'), t('\\cdots'), t('\\ddots'), t('\\aleph'), t('\\beth'), t('\\blacksquare', 'End of proof'),
		],
	},
	{
		name: 'Greek Letters',
		tokens: [
			...cmds(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'varpi', 'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega']),
			...cmds(['Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega']),
		],
	},
	{
		name: 'Letter-Like Symbols',
		tokens: [
			t('\\hbar'), t('\\imath'), t('\\jmath'), t('\\ell'), t('\\wp'), t('\\Re'), t('\\Im'),
			t('\\aleph'), t('\\beth'), t('\\gimel'), t('\\daleth'),
			t('\\mathbb{N}', 'Natural numbers'), t('\\mathbb{Z}', 'Integers'), t('\\mathbb{Q}', 'Rationals'), t('\\mathbb{R}', 'Reals'), t('\\mathbb{C}', 'Complex numbers'),
			t('\\partial'), t('\\nabla'), t('\\infty'), t('\\degree'), t('\\mho'), t('\\text{Å}', 'Ångström'),
			t('\\mathrm{e}', 'Euler number'), t('\\mathrm{i}', 'Imaginary unit'), t('\\mathrm{d}', 'Differential'),
		],
	},
	{
		name: 'Operators',
		tokens: [
			t('+'), t('-'), t('\\pm'), t('\\mp'), t('\\times'), t('\\div'), t('\\cdot'), t('\\ast'), t('\\star'), t('\\circ'), t('\\bullet'),
			t('\\oplus'), t('\\ominus'), t('\\otimes'), t('\\oslash'), t('\\odot'),
			t('\\wedge'), t('\\vee'), t('\\cap'), t('\\cup'), t('\\setminus'), t('\\sqcap'), t('\\sqcup'), t('\\uplus'), t('\\amalg'),
			t('\\dagger'), t('\\ddagger'), t('\\diamond'), t('\\triangleleft'), t('\\triangleright'), t('\\bigtriangleup'), t('\\bigtriangledown'),
			t('='), t('\\neq'), t('\\equiv'), t('\\approx'), t('\\cong'), t('\\simeq'), t('\\sim'), t('\\propto'), t('\\doteq'), t('\\asymp'),
			t('<'), t('>'), t('\\leq'), t('\\geq'), t('\\ll'), t('\\gg'), t('\\prec'), t('\\succ'), t('\\preceq'), t('\\succeq'),
			t('\\subset'), t('\\supset'), t('\\subseteq'), t('\\supseteq'), t('\\in'), t('\\ni'), t('\\notin'),
			t('\\parallel'), t('\\perp'), t('\\mid'), t('\\bowtie'), t('\\models'), t('\\vdash'), t('\\dashv'),
			t('\\bmod', 'mod'), t('\\%'), t('!'),
		],
	},
	{
		name: 'Arrows',
		tokens: [
			t('\\leftarrow'), t('\\rightarrow'), t('\\uparrow'), t('\\downarrow'), t('\\leftrightarrow'), t('\\updownarrow'),
			t('\\Leftarrow'), t('\\Rightarrow'), t('\\Uparrow'), t('\\Downarrow'), t('\\Leftrightarrow'), t('\\Updownarrow'),
			t('\\longleftarrow'), t('\\longrightarrow'), t('\\longleftrightarrow'), t('\\Longleftarrow'), t('\\Longrightarrow'), t('\\Longleftrightarrow'),
			t('\\mapsto'), t('\\longmapsto'), t('\\hookleftarrow'), t('\\hookrightarrow'),
			t('\\nearrow'), t('\\searrow'), t('\\swarrow'), t('\\nwarrow'),
			t('\\rightharpoonup'), t('\\rightharpoondown'), t('\\leftharpoonup'), t('\\leftharpoondown'), t('\\rightleftharpoons'), t('\\leftrightarrows'), t('\\rightrightarrows'),
			t('\\curvearrowleft'), t('\\curvearrowright'), t('\\circlearrowleft'), t('\\circlearrowright'),
			t('\\implies'), t('\\impliedby'), t('\\iff'),
		],
	},
	{
		name: 'Negated Relations',
		tokens: [
			t('\\neq'), t('\\nless'), t('\\ngtr'), t('\\nleq'), t('\\ngeq'), t('\\nsim'), t('\\ncong'), t('\\not\\approx'), t('\\not\\equiv'),
			t('\\notin'), t('\\not\\ni'), t('\\nsubseteq'), t('\\nsupseteq'), t('\\subsetneq'), t('\\supsetneq'),
			t('\\nparallel'), t('\\nmid'), t('\\nvdash'), t('\\nexists'), t('\\not\\propto'), t('\\not\\perp'),
			t('\\nrightarrow'), t('\\nleftarrow'), t('\\nRightarrow'), t('\\nLeftarrow'), t('\\nleftrightarrow'),
		],
	},
	{
		name: 'Scripts',
		tokens: [
			...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => t(`\\mathcal{${c}}`, `Script ${c}`)),
			...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => t(`\\mathfrak{${c}}`, `Fraktur ${c}`)),
			...'NZQRCHP'.split('').map(c => t(`\\mathbb{${c}}`, `Double-struck ${c}`)),
		],
	},
	{
		name: 'Geometry',
		tokens: [
			t('\\angle'), t('\\measuredangle'), t('\\sphericalangle'), t('^{\\circ}', 'Degree'), t('\\perp'), t('\\parallel'), t('\\nparallel'),
			t('\\triangle'), t('\\square'), t('\\blacksquare'), t('\\lozenge'), t('\\blacklozenge'), t('\\diamond'), t('\\circ'), t('\\bullet'),
			t('\\cong'), t('\\sim'), t('\\simeq'), t('\\equiv'), t('\\therefore'), t('\\because'),
			t(`\\overline{${P}}`, 'Segment', '\\overline{AB}'), t(`\\overrightarrow{${P}}`, 'Ray', '\\overrightarrow{AB}'),
			t(`\\overleftrightarrow{${P}}`, 'Line', '\\overleftrightarrow{AB}'), t(`\\overset{\\frown}{${P}}`, 'Arc', '\\overset{\\frown}{AB}'),
			t('\\pi'), t('\\ell'), t('\\mid'), t('\\nmid'),
		],
	},
]

// ── Structures ───────────────────────────────────────────────────────────────

export const STRUCTURES: StructureGroup[] = [
	{
		key: 'fraction',
		name: 'Fraction',
		icon: '\\frac{x}{y}',
		sections: [
			{
				name: 'Fraction',
				items: [
					t(`\\frac{${P}}{${P}}`, 'Stacked fraction'),
					t(`{}^{${P}}\\!/\\!{}_{${P}}`, 'Skewed fraction'),
					t(`${P}/${P}`, 'Linear fraction'),
					t(`\\tfrac{${P}}{${P}}`, 'Small fraction'),
				],
			},
			{
				name: 'Common Fraction',
				items: [
					t('\\frac{dy}{dx}'), t('\\frac{\\Delta y}{\\Delta x}'), t('\\frac{\\partial y}{\\partial x}'), t('\\frac{\\delta y}{\\delta x}'), t('\\frac{\\pi}{2}'),
					t('\\frac{1}{2}'), t('\\frac{a}{b}'), t('\\frac{d^2y}{dx^2}'),
				],
			},
		],
	},
	{
		key: 'script',
		name: 'Script',
		icon: 'e^{x}',
		sections: [
			{
				name: 'Subscripts and Superscripts',
				items: [
					t(`${P}^{${P}}`, 'Superscript'),
					t(`${P}_{${P}}`, 'Subscript'),
					t(`${P}_{${P}}^{${P}}`, 'Subscript-superscript'),
					t(`{}_{${P}}^{${P}}${P}`, 'Left subscript-superscript'),
				],
			},
			{
				name: 'Common Subscripts and Superscripts',
				items: [t('x_{y^2}'), t('e^{-i\\omega t}'), t('x^2'), t('{}_{1}^{n}Y'), t('x_i'), t('a_{ij}'), t('x^{-1}'), t('10^{n}')],
			},
		],
	},
	{
		key: 'radical',
		name: 'Radical',
		icon: '\\sqrt[n]{x}',
		sections: [
			{
				name: 'Radicals',
				items: [
					t(`\\sqrt{${P}}`, 'Square root'),
					t(`\\sqrt[${P}]{${P}}`, 'Radical with degree'),
					t(`\\sqrt[2]{${P}}`, 'Square root with degree'),
					t(`\\sqrt[3]{${P}}`, 'Cube root'),
				],
			},
			{
				name: 'Common Radicals',
				items: [t('\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', 'Quadratic formula'), t('\\sqrt{a^2 + b^2}'), t('\\sqrt{2}'), t('\\sqrt[3]{x}')],
			},
		],
	},
	{
		key: 'integral',
		name: 'Integral',
		icon: '\\int_{-x}^{x}',
		sections: [
			{
				name: 'Integrals',
				items: [
					...integralForms('\\int', 'Integral'),
					...integralForms('\\iint', 'Double integral'),
					...integralForms('\\iiint', 'Triple integral'),
				],
			},
			{
				name: 'Contour Integrals',
				items: [
					...integralForms('\\oint', 'Contour integral'),
					...integralForms('\\oiint', 'Surface integral'),
					...integralForms('\\oiiint', 'Volume integral'),
				],
			},
			{
				name: 'Differentials',
				items: [t('\\,dx', 'Differential dx'), t('\\,dy', 'Differential dy'), t('\\,d\\theta', 'Differential dθ'), t('\\,dt', 'Differential dt')],
			},
			{
				name: 'Common Integrals',
				items: [t('\\int_{a}^{b} f(x)\\,dx'), t('\\int_{0}^{\\infty} e^{-x}\\,dx'), t('\\int_{0}^{2\\pi} \\sin\\theta\\,d\\theta'), t('\\iint_{R} f(x,y)\\,dA')],
			},
		],
	},
	{
		key: 'large-operator',
		name: 'Large Operator',
		icon: '\\sum_{i=0}^{n}',
		sections: [
			{
				name: 'Summations',
				items: bigOpForms('\\sum', 'Summation'),
			},
			{
				name: 'Products and Co-Products',
				items: [...bigOpForms('\\prod', 'Product'), ...bigOpForms('\\coprod', 'Co-product')],
			},
			{
				name: 'Unions and Intersections',
				items: [...bigOpForms('\\bigcup', 'Union'), ...bigOpForms('\\bigcap', 'Intersection')],
			},
			{
				name: 'Other Large Operators',
				items: [
					...bigOpForms('\\bigvee', 'Logical or'),
					...bigOpForms('\\bigwedge', 'Logical and'),
					...bigOpForms('\\bigsqcup', 'Disjoint union'),
					...bigOpForms('\\biguplus', 'Multiset union'),
					...bigOpForms('\\bigoplus', 'Direct sum'),
					...bigOpForms('\\bigotimes', 'Tensor product'),
					...bigOpForms('\\bigodot', 'Circled dot product'),
				],
			},
			{
				name: 'Common Large Operators',
				items: [
					t('\\sum_{k} \\binom{n}{k}', 'Sum of binomial coefficients'),
					t('\\sum_{i=0}^{n} x_i', 'Sum over an index'),
					t('\\prod_{k=1}^{n} A_k', 'Product over an index'),
					t('\\bigcup_{m=1}^{n} \\left( X_m \\cap Y_m \\right)', 'Union of intersections'),
					t('\\sum_{n=1}^{\\infty} \\frac{1}{n^2}', 'Infinite series'),
				],
			},
		],
	},
	{
		key: 'bracket',
		name: 'Bracket',
		icon: '\\{(\\,)\\}',
		sections: [
			{
				name: 'Brackets',
				items: [
					t(`\\left( ${P} \\right)`, 'Parentheses'), t(`\\left[ ${P} \\right]`, 'Square brackets'), t(`\\left\\{ ${P} \\right\\}`, 'Curly brackets'), t(`\\left\\langle ${P} \\right\\rangle`, 'Angle brackets'),
					t(`\\left\\lfloor ${P} \\right\\rfloor`, 'Floor'), t(`\\left\\lceil ${P} \\right\\rceil`, 'Ceiling'), t(`\\left| ${P} \\right|`, 'Vertical bars'), t(`\\left\\| ${P} \\right\\|`, 'Double vertical bars'),
					t(`\\left[ ${P} \\right[`, 'Left-open interval'), t(`\\left] ${P} \\right[`, 'Open interval'), t(`\\left] ${P} \\right]`, 'Right-open interval'), t(`\\llbracket ${P} \\rrbracket`, 'Double square brackets'),
				],
			},
			{
				name: 'Brackets with Separators',
				items: [
					t(`\\left( ${P} \\middle| ${P} \\right)`, 'Parentheses with separator'), t(`\\left\\{ ${P} \\middle| ${P} \\right\\}`, 'Curly brackets with separator'),
					t(`\\left\\langle ${P} \\middle| ${P} \\right\\rangle`, 'Angle brackets with separator'), t(`\\left\\langle ${P} \\middle| ${P} \\middle| ${P} \\right\\rangle`, 'Angle brackets with two separators'),
				],
			},
			{
				name: 'Single Brackets',
				items: [
					t(`\\left( ${P} \\right.`, 'Left parenthesis'), t(`\\left. ${P} \\right)`, 'Right parenthesis'), t(`\\left[ ${P} \\right.`, 'Left square bracket'), t(`\\left. ${P} \\right]`, 'Right square bracket'),
					t(`\\left\\{ ${P} \\right.`, 'Left curly bracket'), t(`\\left. ${P} \\right\\}`, 'Right curly bracket'), t(`\\left\\langle ${P} \\right.`, 'Left angle bracket'), t(`\\left. ${P} \\right\\rangle`, 'Right angle bracket'),
					t(`\\left\\lfloor ${P} \\right.`, 'Left floor'), t(`\\left. ${P} \\right\\rfloor`, 'Right floor'), t(`\\left\\lceil ${P} \\right.`, 'Left ceiling'), t(`\\left. ${P} \\right\\rceil`, 'Right ceiling'),
					t(`\\left| ${P} \\right.`, 'Left vertical bar'), t(`\\left. ${P} \\right|`, 'Right vertical bar'), t(`\\left\\| ${P} \\right.`, 'Left double bar'), t(`\\left. ${P} \\right\\|`, 'Right double bar'),
					t(`\\llbracket ${P}`, 'Left double square bracket'), t(`${P} \\rrbracket`, 'Right double square bracket'),
				],
			},
			{
				name: 'Cases and Stacks',
				items: [
					t(`\\begin{cases} ${P} \\\\ ${P} \\end{cases}`, 'Cases (two conditions)'),
					t(`\\begin{cases} ${P} \\\\ ${P} \\\\ ${P} \\end{cases}`, 'Cases (three conditions)'),
					t(`\\begin{matrix} ${P} \\\\ ${P} \\end{matrix}`, 'Stack object'),
					t(`\\binom{${P}}{${P}}`, 'Binomial coefficient'),
				],
			},
			{
				name: 'Common Brackets',
				items: [
					t('f(x) = \\begin{cases} -x, & x < 0 \\\\ x, & x \\geq 0 \\end{cases}', 'Piecewise function'),
					t('\\binom{n}{k}', 'Binomial coefficient'),
					t('\\genfrac{\\langle}{\\rangle}{0pt}{}{n}{k}', 'Angle-bracket stack'),
				],
			},
		],
	},
	{
		key: 'function',
		name: 'Function',
		icon: '\\sin\\theta',
		sections: [
			{
				name: 'Trigonometric Functions',
				items: [t(`\\sin ${P}`, 'Sine'), t(`\\cos ${P}`, 'Cosine'), t(`\\tan ${P}`, 'Tangent'), t(`\\csc ${P}`, 'Cosecant'), t(`\\sec ${P}`, 'Secant'), t(`\\cot ${P}`, 'Cotangent')],
			},
			{
				name: 'Inverse Functions',
				items: [t(`\\sin^{-1} ${P}`, 'Inverse sine'), t(`\\cos^{-1} ${P}`, 'Inverse cosine'), t(`\\tan^{-1} ${P}`, 'Inverse tangent'), t(`\\csc^{-1} ${P}`, 'Inverse cosecant'), t(`\\sec^{-1} ${P}`, 'Inverse secant'), t(`\\cot^{-1} ${P}`, 'Inverse cotangent')],
			},
			{
				name: 'Hyperbolic Functions',
				items: [
					t(`\\sinh ${P}`, 'Hyperbolic sine'), t(`\\cosh ${P}`, 'Hyperbolic cosine'), t(`\\tanh ${P}`, 'Hyperbolic tangent'),
					t(`\\operatorname{csch} ${P}`, 'Hyperbolic cosecant'), t(`\\operatorname{sech} ${P}`, 'Hyperbolic secant'), t(`\\coth ${P}`, 'Hyperbolic cotangent'),
				],
			},
			{
				name: 'Inverse Hyperbolic Functions',
				items: [
					t(`\\sinh^{-1} ${P}`, 'Inverse hyperbolic sine'), t(`\\cosh^{-1} ${P}`, 'Inverse hyperbolic cosine'), t(`\\tanh^{-1} ${P}`, 'Inverse hyperbolic tangent'),
					t(`\\operatorname{csch}^{-1} ${P}`, 'Inverse hyperbolic cosecant'), t(`\\operatorname{sech}^{-1} ${P}`, 'Inverse hyperbolic secant'), t(`\\coth^{-1} ${P}`, 'Inverse hyperbolic cotangent'),
				],
			},
			{
				name: 'Common Functions',
				items: [t('\\sin\\theta'), t('\\cos 2x'), t('\\tan\\theta = \\frac{\\sin\\theta}{\\cos\\theta}')],
			},
		],
	},
	{
		key: 'accent',
		name: 'Accent',
		icon: '\\ddot{a}',
		sections: [
			{
				name: 'Accents',
				items: [
					t(`\\dot{${P}}`, 'Dot'), t(`\\ddot{${P}}`, 'Double dot'), t(`\\dddot{${P}}`, 'Triple dot'), t(`\\hat{${P}}`, 'Hat'),
					t(`\\check{${P}}`, 'Check'), t(`\\acute{${P}}`, 'Acute'), t(`\\grave{${P}}`, 'Grave'), t(`\\breve{${P}}`, 'Breve'),
					t(`\\tilde{${P}}`, 'Tilde'), t(`\\bar{${P}}`, 'Bar'), t(`\\bar{\\bar{${P}}}`, 'Double overbar'), t(`\\widehat{${P}}`, 'Wide hat'),
					t(`\\widetilde{${P}}`, 'Wide tilde'), t(`\\vec{${P}}`, 'Vector'), t(`\\overbrace{${P}}^{${P}}`, 'Overbrace'), t(`\\underbrace{${P}}_{${P}}`, 'Underbrace'),
					t(`\\overleftarrow{${P}}`, 'Left arrow above'), t(`\\overrightarrow{${P}}`, 'Right arrow above'), t(`\\overleftrightarrow{${P}}`, 'Left-right arrow above'), t(`\\overrightharpoon{${P}}`, 'Right harpoon above'),
					t(`\\overleftharpoon{${P}}`, 'Left harpoon above'), t(`\\underleftarrow{${P}}`, 'Left arrow below'), t(`\\underrightarrow{${P}}`, 'Right arrow below'), t(`\\underleftrightarrow{${P}}`, 'Left-right arrow below'),
				],
			},
			{
				name: 'Boxed Formulas',
				items: [t(`\\boxed{${P}}`, 'Boxed formula'), t('\\boxed{a^2 = b^2 + c^2}', 'Boxed formula (example)')],
			},
			{
				name: 'Overbars and Underbars',
				items: [t(`\\overline{${P}}`, 'Overbar'), t(`\\underline{${P}}`, 'Underbar')],
			},
			{
				name: 'Common Accent Objects',
				items: [t('\\bar{A}'), t('\\overline{ABC}'), t('\\overline{x \\oplus y}')],
			},
		],
	},
	{
		key: 'limit-log',
		name: 'Limit and Log',
		icon: '\\lim_{n \\to \\infty}',
		sections: [
			{
				name: 'Functions',
				items: [
					t(`\\log_{${P}} ${P}`, 'Logarithm with base'), t(`\\log ${P}`, 'Logarithm'), t(`\\lim_{${P}} ${P}`, 'Limit'),
					t(`\\min_{${P}} ${P}`, 'Minimum'), t(`\\max_{${P}} ${P}`, 'Maximum'), t(`\\ln ${P}`, 'Natural logarithm'),
				],
			},
			{
				name: 'Common Functions',
				items: [
					t('\\lim_{n \\to \\infty} \\left( 1 + \\frac{1}{n} \\right)^{n}', 'Limit definition of e'),
					t('\\max_{0 \\leq x \\leq 1} x e^{-x^2}', 'Maximum over an interval'),
					t('\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1'), t('\\log_{10} x'), t('\\ln x'),
				],
			},
		],
	},
	{
		key: 'operator',
		name: 'Operator',
		icon: '\\Delta',
		sections: [
			{
				name: 'Basic Operators',
				items: [
					t('\\coloneqq', 'Colon equals'), t('==', 'Equals equals'), t('+=', 'Plus equals'), t('-=', 'Minus equals'),
					t('\\stackrel{\\text{def}}{=}', 'Defined as'), t('\\stackrel{m}{=}', 'Measured by'), t('\\triangleq', 'Delta equals'),
				],
			},
			{
				name: 'Operator Structures',
				items: [
					t(`\\xleftarrow{${P}}`, 'Left arrow with text above'), t(`\\xrightarrow{${P}}`, 'Right arrow with text above'),
					t(`\\xleftarrow[${P}]{}`, 'Left arrow with text below'), t(`\\xrightarrow[${P}]{}`, 'Right arrow with text below'),
					t(`\\xLeftarrow{${P}}`, 'Left double arrow with text above'), t(`\\xRightarrow{${P}}`, 'Right double arrow with text above'),
					t(`\\xLeftarrow[${P}]{}`, 'Left double arrow with text below'), t(`\\xRightarrow[${P}]{}`, 'Right double arrow with text below'),
					t(`\\xleftrightarrow{${P}}`, 'Left-right arrow with text above'), t(`\\xleftrightarrow[${P}]{}`, 'Left-right arrow with text below'),
					t(`\\xLeftrightarrow{${P}}`, 'Left-right double arrow with text above'), t(`\\xLeftrightarrow[${P}]{}`, 'Left-right double arrow with text below'),
				],
			},
			{
				name: 'Common Operator Structures',
				items: [t('\\xrightarrow{\\text{yields}}'), t('\\xrightarrow{\\Delta}'), t('\\xrightarrow{\\text{heat}}'), t('\\xrightleftharpoons{\\text{catalyst}}'), t('\\rightleftharpoons')],
			},
		],
	},
	{
		key: 'matrix',
		name: 'Matrix',
		icon: '\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}',
		sections: [
			{
				name: 'Empty Matrices',
				items: [
					t(`\\begin{matrix} ${P} & ${P} \\end{matrix}`, '1 × 2 empty matrix'),
					t(`\\begin{matrix} ${P} \\\\ ${P} \\end{matrix}`, '2 × 1 empty matrix'),
					t(`\\begin{matrix} ${P} & ${P} & ${P} \\end{matrix}`, '1 × 3 empty matrix'),
					t(`\\begin{matrix} ${P} \\\\ ${P} \\\\ ${P} \\end{matrix}`, '3 × 1 empty matrix'),
					t(`\\begin{matrix} ${P} & ${P} \\\\ ${P} & ${P} \\end{matrix}`, '2 × 2 empty matrix'),
					t(`\\begin{matrix} ${P} & ${P} & ${P} \\\\ ${P} & ${P} & ${P} \\end{matrix}`, '2 × 3 empty matrix'),
					t(`\\begin{matrix} ${P} & ${P} \\\\ ${P} & ${P} \\\\ ${P} & ${P} \\end{matrix}`, '3 × 2 empty matrix'),
					t(`\\begin{matrix} ${P} & ${P} & ${P} \\\\ ${P} & ${P} & ${P} \\\\ ${P} & ${P} & ${P} \\end{matrix}`, '3 × 3 empty matrix'),
				],
			},
			{
				name: 'Dots',
				items: [t('\\cdots', 'Baseline dots'), t('\\ldots', 'Midline dots'), t('\\vdots', 'Vertical dots'), t('\\ddots', 'Diagonal dots')],
			},
			{
				name: 'Identity Matrices',
				items: [
					t('\\begin{matrix} 1 & 0 \\\\ 0 & 1 \\end{matrix}', '2 × 2 identity matrix with zeros'),
					t('\\begin{matrix} 1 & \\\\ & 1 \\end{matrix}', '2 × 2 identity matrix with blank off-diagonal cells'),
					t('\\begin{matrix} 1 & 0 & 0 \\\\ 0 & 1 & 0 \\\\ 0 & 0 & 1 \\end{matrix}', '3 × 3 identity matrix with zeros'),
					t('\\begin{matrix} 1 & & \\\\ & 1 & \\\\ & & 1 \\end{matrix}', '3 × 3 identity matrix with blank off-diagonal cells'),
				],
			},
			{
				name: 'Matrices with Brackets',
				items: [
					t(`\\begin{pmatrix} ${P} & ${P} \\\\ ${P} & ${P} \\end{pmatrix}`, '2 × 2 empty matrix with parentheses'),
					t(`\\begin{bmatrix} ${P} & ${P} \\\\ ${P} & ${P} \\end{bmatrix}`, '2 × 2 empty matrix with square brackets'),
					t(`\\begin{vmatrix} ${P} & ${P} \\\\ ${P} & ${P} \\end{vmatrix}`, '2 × 2 empty determinant'),
					t(`\\begin{Vmatrix} ${P} & ${P} \\\\ ${P} & ${P} \\end{Vmatrix}`, '2 × 2 empty matrix with double vertical bars'),
				],
			},
			{
				name: 'Sparse Matrices',
				items: [
					t(`\\begin{pmatrix} ${P} & \\cdots & ${P} \\\\ \\vdots & \\ddots & \\vdots \\\\ ${P} & \\cdots & ${P} \\end{pmatrix}`, 'Sparse matrix with parentheses'),
					t(`\\begin{bmatrix} ${P} & \\cdots & ${P} \\\\ \\vdots & \\ddots & \\vdots \\\\ ${P} & \\cdots & ${P} \\end{bmatrix}`, 'Sparse matrix with square brackets'),
				],
			},
		],
	},
]
