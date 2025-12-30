export type TokenKind = 'num' | 'op' | 'lparen' | 'rparen' | 'ws' | 'unknown'

export type Token = {
  kind: TokenKind
  text: string
  nodeId: string
}

