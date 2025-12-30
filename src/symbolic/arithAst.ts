export type ExprNodeId = string

export type ArithExpr =
  | { type: 'num'; id: ExprNodeId; value: number }
  | { type: 'unary'; id: ExprNodeId; op: '-'; expr: ArithExpr }
  | { type: 'bin'; id: ExprNodeId; op: '+' | '-' | '*' | '/' | '^'; left: ArithExpr; right: ArithExpr }

export type Token =
  | { kind: 'num'; text: string; nodeId: ExprNodeId }
  | { kind: 'op'; text: string; nodeId: ExprNodeId }
  | { kind: 'lparen'; text: '('; nodeId: ExprNodeId }
  | { kind: 'rparen'; text: ')'; nodeId: ExprNodeId }
  | { kind: 'ws'; text: string; nodeId: ExprNodeId }
  | { kind: 'unknown'; text: string; nodeId: ExprNodeId }

export function serializeTokens(tokens: Token[]): string {
  return tokens.map((t) => t.text).join('')
}
