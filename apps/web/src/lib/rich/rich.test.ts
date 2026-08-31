import { describe, expect, it } from 'vitest'
import {
  FIGURE_KINDS,
  figureAlt,
  figureSource,
  findFigure,
  validateFigure,
  type FigureSpec,
} from './figures'
import {
  angleAt,
  barPathH,
  barPathV,
  defaultTriangle,
  fitPoints,
  formatNumber,
  niceScale,
  sectorPath,
  ticksBetween,
  type Pt,
} from './layout'
import { decodeEntities, mathToText, parseMathML, type MathNode } from './mathml'
import {
  hasRich,
  parseRich,
  richProblems,
  richSpans,
  richToPlain,
  splitOutsideRich,
  withoutRich,
} from './parse'
import { FIGURE_TEMPLATES, MATH_SNIPPETS, caretOffset } from './templates'
import { texToMath } from './tex'

/** Every tag in the tree, for asserting on structure without matching serialised XML. */
function tags(node: MathNode): string[] {
  return [node.tag, ...(node.children ?? []).flatMap(tags)]
}

describe('TeX-lite', () => {
  it('reads a fraction back as the thing a learner would type', () => {
    const { node } = texToMath('\\frac{3}{4}')
    expect(tags(node)).toContain('mfrac')
    expect(mathToText(node)).toBe('3/4')
  })

  it('keeps a compound numerator readable by parenthesising it', () => {
    expect(mathToText(texToMath('\\frac{x+1}{2}').node)).toBe('(x+1)/2')
  })

  it('writes ^\\circ as a degree sign, because that is what it means', () => {
    expect(mathToText(texToMath('45^\\circ').node)).toBe('45°')
  })

  it('handles powers, subscripts and both at once', () => {
    expect(mathToText(texToMath('x^2').node)).toBe('x^2')
    expect(mathToText(texToMath('a_1').node)).toBe('a_1')
    expect(tags(texToMath('x_i^2').node)).toContain('msubsup')
  })

  it('takes an index on a root', () => {
    const { node } = texToMath('\\sqrt[3]{8}')
    expect(tags(node)).toContain('mroot')
    expect(mathToText(node)).toBe('root3(8)')
  })

  it('draws the segment and triangle notation geometry is written in', () => {
    expect(tags(texToMath('\\overline{AB}').node)).toContain('mover')
    expect(mathToText(texToMath('\\triangle ABC \\sim \\triangle DEF').node)).toBe('△ABC∼△DEF')
    expect(mathToText(texToMath('\\overline{AB} \\parallel \\overline{CD}').node)).toContain('∥')
  })

  it('keeps a number with a decimal point or a comma in one piece', () => {
    expect(mathToText(texToMath('1,250.5').node)).toBe('1,250.5')
  })

  it('sets a minus sign rather than a hyphen', () => {
    expect(mathToText(texToMath('5-3').node)).toBe('5−3')
  })

  it('keeps the words in \\text together, spaces and all', () => {
    expect(mathToText(texToMath('\\text{miles per hour}').node)).toBe('miles per hour')
  })

  it('says so when it meets a command it does not know, instead of failing quietly', () => {
    const { warnings, node } = texToMath('\\parallell')
    expect(warnings[0]).toContain('\\parallell')
    // The author still sees where it went wrong on the card itself.
    expect(mathToText(node)).toBe('\\parallell')
  })

  it('survives an unbalanced brace rather than losing the rest of the card', () => {
    expect(mathToText(texToMath('\\frac{1}{2').node)).toBe('1/2')
  })
})

describe('pasted MathML', () => {
  it('reads an equation exported with a namespace prefix', () => {
    const node = parseMathML('<m:math><m:mfrac><m:mn>1</m:mn><m:mn>2</m:mn></m:mfrac></m:math>')
    expect(node).not.toBeNull()
    expect(mathToText(node!)).toBe('1/2')
  })

  it('throws away the TeX annotation an exporter leaves beside the maths', () => {
    const node = parseMathML(
      '<math><semantics><mn>7</mn><annotation encoding="application/x-tex">7</annotation></semantics></math>',
    )
    expect(mathToText(node!)).toBe('7')
  })

  it('drops attributes that are not presentation, and scripts entirely', () => {
    const node = parseMathML(
      '<math><mstyle mathvariant="bold" onclick="steal()" style="position:fixed"><mi>x</mi></mstyle><script>alert(1)</script></math>',
    )
    const style = node!.children![0]
    expect(style.attrs).toEqual({ mathvariant: 'bold' })
    expect(mathToText(node!)).toBe('x')
  })

  it('unwraps elements it does not know rather than losing what is inside them', () => {
    const node = parseMathML('<math><mfenced><mi>y</mi></mfenced></math>')
    expect(mathToText(node!)).toBe('y')
  })

  it('decodes the entities an office suite exports', () => {
    expect(decodeEntities('5 &times; 3 &ne; 14 &#x2212; 2')).toBe('5 × 3 ≠ 14 − 2')
  })
})

describe('limits on pasted MathML', () => {
  it('caps a huge paste rather than putting all of it on the page', () => {
    const huge = `<math>${'<mn>1</mn>'.repeat(900)}</math>`
    const node = parseMathML(huge)
    expect(node).not.toBeNull()
    expect(mathToText(node!).length).toBeLessThan(900)
  })

  it('survives deeply nested markup', () => {
    const deep = `<math>${'<mrow>'.repeat(80)}<mn>7</mn>${'</mrow>'.repeat(80)}</math>`
    expect(mathToText(parseMathML(deep)!)).toContain('7')
  })
})

describe('card text', () => {
  it('leaves text with no maths in it completely alone', () => {
    expect(hasRich('the powerhouse of the cell')).toBe(false)
    expect(parseRich('plain')).toEqual([{ type: 'text', value: 'plain' }])
  })

  it('splits text from the maths inside it', () => {
    const nodes = parseRich('Simplify $\\frac{6}{8}$ please')
    expect(nodes.map((n) => n.type)).toEqual(['text', 'math', 'text'])
    expect(richToPlain('Simplify $\\frac{6}{8}$ please')).toBe('Simplify 6/8 please')
  })

  it('treats a lone dollar sign as money, not as broken maths', () => {
    expect(parseRich('It costs $5 to get in').every((n) => n.type === 'text')).toBe(true)
    expect(richToPlain('\\$5 each')).toBe('$5 each')
  })

  it('leaves two prices in one sentence alone', () => {
    // The likeliest card with two dollar signs on it is a word problem about
    // money, not an equation — and pairing them would set the words between
    // them as maths and strip the spaces out of the sentence.
    const money = 'A shirt costs $12 and pants cost $20. How much altogether?'
    expect(parseRich(money).every((n) => n.type === 'text')).toBe(true)
    expect(richToPlain(money)).toBe(money)
  })

  it('will not open maths on a space, or close on one', () => {
    expect(parseRich('$ x + 1$').every((n) => n.type === 'text')).toBe(true)
    expect(parseRich('$x + 1 $').every((n) => n.type === 'text')).toBe(true)
    // The rule that rejects those still accepts everything real.
    expect(parseRich('$x + 1$').some((n) => n.type === 'math')).toBe(true)
    expect(parseRich('$$\\frac{1}{2}$$').some((n) => n.type === 'math')).toBe(true)
  })

  it('recognises the display form', () => {
    const [node] = parseRich('$$x^2$$')
    expect(node.type === 'math' && node.display).toBe(true)
  })

  it('reads a figure as a figure and describes it in plain text', () => {
    const source = 'Which day? [[figure {"kind":"bar","data":[{"label":"Mon","value":4}]}]]'
    const nodes = parseRich(source)
    expect(nodes[1].type).toBe('figure')
    expect(richToPlain(source)).toContain('Mon: 4')
  })

  it('reports a broken figure to whoever wrote it instead of dropping the card', () => {
    const nodes = parseRich('[[figure {"kind":"bar"}]]')
    expect(nodes[0].type).toBe('invalid')
    expect(richProblems('[[figure {"kind":"bar"}]]')[0]).toContain('data')
    expect(richProblems('$\\nope$')[0]).toContain('\\nope')
  })
})

describe('splitting text that has maths in it', () => {
  it('knows which stretches are maths and which are prose', () => {
    const source = 'a $x$ b'
    expect(richSpans(source)).toEqual([[2, 5]])
    expect(richSpans('nothing here')).toEqual([])
  })

  it('splits on separators outside the maths and leaves the ones inside it', () => {
    expect(splitOutsideRich('a, $f(x, y)$, b', /\s*,\s*/)).toEqual(['a', '$f(x, y)$', 'b'])
  })

  it('steps over a figure, whose JSON is made of separators', () => {
    const row = 'Area [[figure {"kind":"rect","width":"8 m","height":"5 m"}]]: 40'
    const parts = splitOutsideRich(row, /\s*:\s*/)
    expect(parts).toHaveLength(2)
    expect(parts[0]).toContain('"height":"5 m"')
    expect(parts[1]).toBe('40')
  })

  it('cannot be made to spin by a pattern that can match nothing', () => {
    // The scanning path steps past a zero-width match rather than looping on it.
    expect(splitOutsideRich('a$x$b', /y*/).join('')).toContain('a')
  })

  it('hands back the prose alone, for working out how a paste is separated', () => {
    expect(withoutRich('Area [[figure {"kind":"circle"}]] of it').replace(/\s+/g, ' ')).toBe(
      'Area of it',
    )
  })
})

describe('finding a figure in card text', () => {
  it('ends the figure at its own closing braces, not at a bracket inside a label', () => {
    const source = 'a [[figure {"kind":"pie","data":[{"label":"a]] b","value":1}]}]] z'
    const found = findFigure(source)
    expect(found).not.toBeNull()
    expect(source.slice(found!.end)).toBe(' z')
    expect(JSON.parse(found!.json).data[0].label).toBe('a]] b')
  })

  it('round-trips a spec through its source form', () => {
    const spec = FIGURE_TEMPLATES[0].spec
    const [node] = parseRich(figureSource(spec))
    expect(node.type === 'figure' && node.spec.kind).toBe(spec.kind)
  })
})

describe('figure validation', () => {
  it('accepts every template the editor offers', () => {
    for (const template of FIGURE_TEMPLATES) {
      const result = validateFigure(template.spec)
      expect(result.ok, `${template.kind}: ${result.ok ? '' : result.error}`).toBe(true)
    }
    expect(FIGURE_TEMPLATES.map((t) => t.kind).sort()).toEqual([...FIGURE_KINDS].sort())
  })

  it('names what is missing rather than drawing nothing', () => {
    expect(validateFigure({ kind: 'wobble' })).toMatchObject({ ok: false })
    expect(validateFigure({ kind: 'line' })).toMatchObject({ ok: false })
    expect(validateFigure({ kind: 'numberline', min: 5, max: 1 })).toMatchObject({ ok: false })
    expect(validateFigure('nope')).toMatchObject({ ok: false })
  })

  it('drops the entries it cannot use and keeps the rest', () => {
    const result = validateFigure({
      kind: 'bar',
      data: [{ label: 'a', value: 3 }, { label: 'b' }, { label: 'c', value: 'lots' }],
    })
    expect(result.ok && result.spec.kind === 'bar' && result.spec.data).toHaveLength(1)
  })

  it('refuses an infinite or missing number', () => {
    expect(validateFigure({ kind: 'angle', degrees: Number.POSITIVE_INFINITY })).toMatchObject({
      ok: false,
    })
    const clamped = validateFigure({ kind: 'angle', degrees: 4000 })
    expect(clamped.ok && clamped.spec.kind === 'angle' && clamped.spec.degrees).toBe(359)
  })

  it('describes every kind for a screen reader', () => {
    for (const template of FIGURE_TEMPLATES) {
      expect(figureAlt(template.spec).length).toBeGreaterThan(8)
    }
    const withAlt = { kind: 'circle', alt: 'a wheel' } as FigureSpec
    expect(figureAlt(withAlt)).toBe('a wheel')
  })
})

describe('drawing arithmetic', () => {
  it('picks axis steps a person counts in', () => {
    expect(niceScale(0, 47).step).toBe(10)
    expect(niceScale(0, 4).step).toBe(1)
    expect(niceScale(0, 1).ticks).toContain(0.2)
  })

  it('keeps floating-point dust off the axis', () => {
    expect(niceScale(0, 1).ticks.every((t) => String(t).length <= 4)).toBe(true)
    expect(formatNumber(0.30000000000000004)).toBe('0.3')
    expect(formatNumber(12)).toBe('12')
  })

  it('anchors a bar to the baseline and rounds only the value end', () => {
    const path = barPathV(10, 20, 100, 40)
    // Starts and ends on the baseline; the curves are all at the top.
    expect(path.startsWith('M 10 100')).toBe(true)
    expect(path.trim().endsWith('30 100 Z')).toBe(true)
    expect(path).toContain('Q')
  })

  it('anchors a lying-down bar to the baseline in both directions', () => {
    expect(barPathH(10, 20, 50, 100).startsWith('M 50 10')).toBe(true)
    expect(barPathH(10, 20, 50, 20).startsWith('M 50 10')).toBe(true)
    expect(barPathH(10, 20, 50, 100)).toContain('Q')
  })

  it('closes a whole-circle sector without a seam through the middle', () => {
    const whole = sectorPath(0, 0, 10, 0, 360)
    expect((whole.match(/A /g) ?? []).length).toBe(2)
    expect(whole).not.toContain('L 0 0')
  })

  it('widens a step too fine for its range instead of stopping partway', () => {
    // A number line 0-1000 marked in ones is 1001 ticks. Drawing the first
    // eighty would not look broken, it would look like a different number line.
    const long = ticksBetween(0, 1000, 1)
    expect(long.length).toBeLessThanOrEqual(41)
    expect(long[long.length - 1]).toBe(1000)

    const wide = ticksBetween(-50, 50, 1)
    expect(wide[0]).toBe(-50)
    expect(wide[wide.length - 1]).toBe(50)
  })

  it('honours a step that does fit', () => {
    expect(ticksBetween(-5, 5, 1)).toEqual([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5])
    expect(ticksBetween(0, 3, 0.5)).toHaveLength(7)
    expect(ticksBetween(4, 4, 1)).toEqual([4])
  })

  it('keeps a shape in proportion when fitting it to the box', () => {
    const square: Pt[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]
    const drawn = fitPoints(square, 300, 200, 20)
    const width = Math.abs(drawn[1][0] - drawn[0][0])
    const height = Math.abs(drawn[2][1] - drawn[1][1])
    expect(Math.abs(width - height)).toBeLessThan(0.001)
  })

  it('puts the right angle on the vertex the author named', () => {
    for (const at of [0, 1, 2]) {
      const [a, b, c] = defaultTriangle(at)
      const v = [a, b, c][at]
      const others = [a, b, c].filter((_, i) => i !== at)
      const { start, end } = angleAt(v, others[0], others[1])
      expect(Math.abs(Math.abs(end - start) - 90)).toBeLessThan(0.001)
    }
  })

  it('measures the angle inside the corner, not the reflex one around it', () => {
    const { start, end } = angleAt([0, 0], [10, 0], [0, -10])
    expect(end - start).toBeCloseTo(90)
  })
})

describe('editor snippets', () => {
  it('puts the cursor inside the first empty braces', () => {
    const fraction = MATH_SNIPPETS[0].text
    expect(fraction.slice(caretOffset(fraction) - 1, caretOffset(fraction) + 1)).toBe('{}')
  })

  it('compiles every snippet it offers', () => {
    for (const snippet of MATH_SNIPPETS) {
      expect(richProblems(snippet.text)).toEqual([])
    }
  })
})
