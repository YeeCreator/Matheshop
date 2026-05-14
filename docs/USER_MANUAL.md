# 产品用户手册（User Manual）- Matheshop

Matheshop 是一个数学白板原型，用于在二维画布上创建单元框、渲染公式、连接推导关系，并调用计算引擎求值。

## 1. 启动

开发运行：

```powershell
pnpm install
pnpm dev
```

构建预览：

```powershell
pnpm build
pnpm preview --host 127.0.0.1 --port 4173
```

## 2. Python 计算后台

如果使用默认的“内置 Python 高性能计算后台”，先启动服务：

```powershell
cd engine\SymbolicComputationEngineServer
uv venv --python 3.13
uv pip install --python .\.venv\Scripts\python.exe --index-url https://pypi.org/simple -r requirements.txt
$env:MATHSYMCALC_ENGINE_ROOT = 'C:/Users/Ethan/CoreFiles/ProjectsFile/MathSymbolicComputationEngine'
$env:PORT = 8000
.\.venv\Scripts\python.exe -m matheshop_engine_server
```

## 3. 画布操作

- 双击空白处：创建单元框。
- 单击单元框：选中。
- 双击单元框：进入编辑。
- 拖动单元框标题区域：移动。
- 拖动右下角手柄：调整大小。
- 点击“连线”：进入或退出连线模式。
- 连线模式下依次点击两个单元框：创建连线。
- Delete 或 Backspace：删除选中的单元框。

## 4. 编辑与公式

- Enter：提交编辑。
- Shift + Enter：换行。
- Esc：取消编辑。
- Ctrl/Command + Enter：提交并求值。
- 使用 `$$...$$` 输入 LaTeX 公式块，例如 `$$a+b$$`。

求值成功时，单元框会追加 `= ...` 输出行；失败时会追加错误提示。

## 5. 设置

点击活动栏或状态栏的齿轮按钮可打开设置弹窗。

当前引擎选项：

- 内置 Python 高性能计算后台：默认选项，通过 FastAPI 服务调用外部 `MathSymbolicComputationEngine`。
- 浏览器 TypeScript 轻量后备：用于没有 Python 服务时的前端后备。
- 外接计算引擎占位：保留给后续外部服务接入。
