import type { ArithExpr, ExprNodeId, Token } from './arithAst'

function makeIdFactory(prefix = 'n') {
  let i = 0
  return () => `${prefix}${++i}` satisfies ExprNodeId
}

const OPS = new Set(['+', '-', '*', '/', '^'])

type LexToken = { kind: 'num' | 'op' | 'lparen' | 'rparen' | 'ws' | 'unknown' | 'eof'; text: string; id: ExprNodeId }

function lex(input: string): LexToken[] {
  const nextId = makeIdFactory('t')
  const out: LexToken[] = []

  let i = 0
  while (i < input.length) {
    const ch = input[i]!

    if (ch === ' ' || ch === '\t') {
      const start = i
      i++
      while (i < input.length && (input[i] === ' ' || input[i] === '\t')) i++
      out.push({ kind: 'ws', text: input.slice(start, i), id: nextId() })
      continue
    }

    if (ch >= '0' && ch <= '9' || ch === '.') {
      const start = i
      let seenDot = ch === '.'
      i++
      while (i < input.length) {
        const c = input[i]!
        if (c >= '0' && c <= '9') {
          i++
          continue
        }
        if (c === '.' && !seenDot) {
          seenDot = true
          i++
          continue
        }
        break
      }
      out.push({ kind: 'num', text: input.slice(start, i), id: nextId() })
      continue
    }

    if (OPS.has(ch)) {
      out.push({ kind: 'op', text: ch, id: nextId() })
      i++
      continue
    }

    if (ch === '(') {
      out.push({ kind: 'lparen', text: ch, id: nextId() })
      i++
      continue
    }

    if (ch === ')') {
      out.push({ kind: 'rparen', text: ch, id: nextId() })
      i++
      continue
    }

    // 先按未知字符保留，避免“无法输入/显示”
    out.push({ kind: 'unknown', text: ch, id: nextId() })
    i++
  }

  out.push({ kind: 'eof', text: '', id: nextId() })
  return out
}

class Parser {
  private pos = 0
  private readonly nextNodeId = makeIdFactory('e')

  constructor(private readonly tokens: LexToken[]) {}

  private cur(): LexToken {
    return this.tokens[this.pos]!
  }

  private eat(): LexToken {
    const t = this.cur()
    this.pos++
    return t
  }

  private eatWs(): void {
    while (this.cur().kind === 'ws') this.pos++
  }

  // expr := add
  // add  := mul (('+'|'-') mul)*
  // mul  := pow (('*'|'/') pow)*
  // pow  := unary ('^' pow)?
  // unary := ('-') unary | primary
  // primary := num | '(' expr ')'

  parse(): ArithExpr {
    this.eatWs()
    const e = this.parseAdd()
    this.eatWs()
    if (this.cur().kind !== 'eof') {
      throw new Error(`无法解析到结尾：${this.cur().text}`)
    }
    return e
  }

  private parseAdd(): ArithExpr {
    let e = this.parseMul()
    while (true) {
      this.eatWs()
      const t = this.cur()
      if (t.kind === 'op' && (t.text === '+' || t.text === '-')) {
        this.eat()
        const r = this.parseMul()
        e = { type: 'bin', id: this.nextNodeId(), op: t.text, left: e, right: r }
        continue
      }
      break
    }
    return e
  }

  private parseMul(): ArithExpr {
    let e = this.parsePow()
    while (true) {
      this.eatWs()
      const t = this.cur()
      if (t.kind === 'op' && (t.text === '*' || t.text === '/')) {
        this.eat()
        const r = this.parsePow()
        e = { type: 'bin', id: this.nextNodeId(), op: t.text, left: e, right: r }
        continue
      }
      break
    }
    return e
  }

  private parsePow(): ArithExpr {
    let e = this.parseUnary()
    this.eatWs()
    const t = this.cur()
    if (t.kind === 'op' && t.text === '^') {
      this.eat()
      const r = this.parsePow()
      e = { type: 'bin', id: this.nextNodeId(), op: '^', left: e, right: r }
    }
    return e
  }

  private parseUnary(): ArithExpr {
    this.eatWs()
    const t = this.cur()
    if (t.kind === 'op' && t.text === '-') {
      this.eat()
      const expr = this.parseUnary()
      return { type: 'unary', id: this.nextNodeId(), op: '-', expr }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): ArithExpr {
    this.eatWs()
    const t = this.cur()
    if (t.kind === 'num') {
      this.eat()
      const v = Number(t.text)
      if (Number.isNaN(v)) throw new Error(`非法数字：${t.text}`)
      return { type: 'num', id: this.nextNodeId(), value: v }
    }
    if (t.kind === 'lparen') {
      this.eat()
      const e = this.parseAdd()
      this.eatWs()
      const r = this.cur()
      if (r.kind !== 'rparen') throw new Error('缺少右括号 )')
      this.eat()
      return e
    }
    throw new Error(`无法解析：${t.text}`)
  }
}

export function parseArithExpr(text: string): { expr: ArithExpr; tokens: Token[] } {
  const lexed = lex(text)

  const tokens: Token[] = lexed
    .filter((t) => t.kind !== 'eof')
    .map((t) => {
      switch (t.kind) {
        case 'num':
          return { kind: 'num', text: t.text, nodeId: t.id }
        case 'op':
          return { kind: 'op', text: t.text, nodeId: t.id }
        case 'lparen':
          return { kind: 'lparen', text: '(', nodeId: t.id }
        case 'rparen':
          return { kind: 'rparen', text: ')', nodeId: t.id }
        case 'ws':
          return { kind: 'ws', text: t.text, nodeId: t.id }
        case 'unknown':
          return { kind: 'unknown', text: t.text, nodeId: t.id }
        default:
          // should be unreachable
          return { kind: 'unknown', text: t.text, nodeId: t.id }
      }
    })

  // AST：失败不影响 tokens 渲染（用于展示错误）
  const parser = new Parser(lexed)
  const expr = parser.parse()

  return { expr, tokens }
}
