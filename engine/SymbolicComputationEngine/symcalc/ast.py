from __future__ import annotations

from dataclasses import dataclass
from typing import Union

import numpy as np


Number = Union[int, float, np.number]


class Expr:
    """表达式基类。"""


@dataclass(frozen=True)
class Num(Expr):
    value: float


@dataclass(frozen=True)
class Unary(Expr):
    op: str  # '-'
    expr: Expr


@dataclass(frozen=True)
class Bin(Expr):
    op: str  # '+', '-', '*', '/', '^'
    left: Expr
    right: Expr

