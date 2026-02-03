from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Optional

from .ast import Bin, Expr, Num, Unary


@dataclass(frozen=True)
class Token:
    kind: str  # 'num' | 'op' | 'lparen' | 'rparen' | 'eof'
    text: str


OPS = {"+", "-", "*", "/", "^"}


def tokenize(src: str) -> List[Token]:
    s = src.strip()
    out: List[Token] = []
    i = 0
    n = len(s)

    def peek() -> str:
        return s[i] if i < n else ""

    while i < n:
        ch = s[i]
        if ch.isspace():
            i += 1
            continue

        if ch.isdigit() or ch == ".":
            j = i
            seen_dot = ch == "."
            i += 1
            while i < n:
                c = s[i]
                if c.isdigit():
                    i += 1
                    continue
                if c == "." and not seen_dot:
                    seen_dot = True
                    i += 1
                    continue
                break
            out.append(Token("num", s[j:i]))
            continue

        if ch in OPS:
            out.append(Token("op", ch))
            i += 1
            continue

        if ch == "(":
            out.append(Token("lparen", ch))
            i += 1
            continue

        if ch == ")":
            out.append(Token("rparen", ch))
            i += 1
            continue

        raise ValueError(f"无法识别的字符: {ch!r} at {i}")

    out.append(Token("eof", ""))
    return out


class Parser:
    def __init__(self, tokens: List[Token]):
        self.tokens = tokens
        self.pos = 0

    def cur(self) -> Token:
        return self.tokens[self.pos]

    def eat(self, kind: str, text: Optional[str] = None) -> Token:
        t = self.cur()
        if t.kind != kind:
            raise ValueError(f"期望 {kind}，但得到 {t.kind}({t.text})")
        if text is not None and t.text != text:
            raise ValueError(f"期望 {text}，但得到 {t.text}")
        self.pos += 1
        return t

    # Grammar (Pratt-ish via precedence climbing):
    # expr  := add
    # add   := mul (('+'|'-') mul)*
    # mul   := pow (('*'|'/') pow)*
    # pow   := unary ('^' pow)?        right-associative
    # unary := ('-') unary | primary
    # primary := num | '(' expr ')'

    def parse(self) -> Expr:
        e = self.parse_add()
        self.eat("eof")
        return e

    def parse_add(self) -> Expr:
        e = self.parse_mul()
        while self.cur().kind == "op" and self.cur().text in {"+", "-"}:
            op = self.eat("op").text
            r = self.parse_mul()
            e = Bin(op, e, r)
        return e

    def parse_mul(self) -> Expr:
        e = self.parse_pow()
        while self.cur().kind == "op" and self.cur().text in {"*", "/"}:
            op = self.eat("op").text
            r = self.parse_pow()
            e = Bin(op, e, r)
        return e

    def parse_pow(self) -> Expr:
        e = self.parse_unary()
        if self.cur().kind == "op" and self.cur().text == "^":
            op = self.eat("op").text
            r = self.parse_pow()  # right assoc
            e = Bin(op, e, r)
        return e

    def parse_unary(self) -> Expr:
        if self.cur().kind == "op" and self.cur().text == "-":
            self.eat("op", "-")
            return Unary("-", self.parse_unary())
        return self.parse_primary()

    def parse_primary(self) -> Expr:
        t = self.cur()
        if t.kind == "num":
            self.eat("num")
            return Num(float(t.text))
        if t.kind == "lparen":
            self.eat("lparen")
            e = self.parse_add()
            self.eat("rparen")
            return e
        raise ValueError(f"无法解析 token: {t.kind}({t.text})")


def parse_expr(text: str) -> Expr:
    tokens = tokenize(text)
    return Parser(tokens).parse()

