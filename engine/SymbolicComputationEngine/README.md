# SymbolicComputationEngine (symcalc)

> 这是 Matheshop 的 **Python 纯符号/算术计算核心库**。
> 
> 该工程不包含 HTTP/FastAPI 服务器。

## 目录

- `symcalc/`：核心库（AST + 解析 + 求值）

## 安装（开发）

在本目录创建虚拟环境并安装依赖：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

如果你需要把它作为依赖安装（例如被服务器工程引用），推荐可编辑安装：

```powershell
.\.venv\Scripts\python.exe -m pip install -e .
```

## 快速使用

```powershell
.\.venv\Scripts\python.exe -c "from symcalc import eval_text; print(eval_text('1+2*(3^2)'))"
```
