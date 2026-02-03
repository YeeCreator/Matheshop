"""symcalc: SymbolicComputationEngine（核心库）。

第一阶段目标：提供一个可靠的算术表达式解析与求值。

设计约束：
- 纯 Python + NumPy
- 可独立抽取成单独项目
"""

from .eval import eval_text

__all__ = ["eval_text"]

