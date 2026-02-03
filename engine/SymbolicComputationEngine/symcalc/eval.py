from __future__ import annotations

import numpy as np

from .ast import Bin, Expr, Num, Unary
from .parser import parse_expr


def eval_expr(expr: Expr) -> np.ndarray:
    """返回 np.ndarray 标量（shape=()）用于统一类型与速度路径。"""

    if isinstance(expr, Num):
        return np.asarray(expr.value)

    if isinstance(expr, Unary):
        v = eval_expr(expr.expr)
        if expr.op == "-":
            return -v
        raise ValueError(f"不支持的一元运算符: {expr.op}")

    if isinstance(expr, Bin):
        a = eval_expr(expr.left)
        b = eval_expr(expr.right)
        if expr.op == "+":
            return a + b
        if expr.op == "-":
            return a - b
        if expr.op == "*":
            return a * b
        if expr.op == "/":
            return a / b
        if expr.op == "^":
            return np.power(a, b)
        raise ValueError(f"不支持的二元运算符: {expr.op}")

    raise TypeError(f"未知表达式类型: {type(expr)}")


def eval_text(text: str) -> float:
    expr = parse_expr(text)
    v = eval_expr(expr)
    # numpy scalar -> python
    return float(np.asarray(v).item())

