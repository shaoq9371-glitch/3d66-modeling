# 3d66建模

基于 [wy51ai/floorplan-3d](https://github.com/wy51ai/floorplan-3d) 的空间方案编辑工具。保留原版 2D 布置、3D 漫游和家具操作，并增加 CAD 导入。

## 启动

完整版本包含 Python CAD 服务，**请通过本地服务打开，不再直接双击 index.html**。

需要 Node.js 22 和 Python 3.11 或更新版本。首次安装依赖需要联网，安装后常规使用不需要外部模型服务。

Windows：双击 `启动3d66.cmd`。也可在 PowerShell 运行：

```powershell
.\start.ps1
```

然后访问 <http://127.0.0.1:8000>。启动窗口需保持运行，Ctrl+C 停止。

其他系统：

```sh
npm ci
npm run build
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn server.app:app --host 127.0.0.1 --port 8000
```

开发模式：后端仍运行在 8000，另执行 `npm run dev`，访问 5173。Vite 将 `/api` 请求转发给后端。

## 导入 CAD

顶部点击 **导入 CAD**：选择 DXF → 确认单位与图层 → 转换并预览 → 应用到当前方案。

- 墙体：水平／竖直 LINE、直线多段线、矩形闭合墙体轮廓；墙线厚度可设置。
- 门：轴向 90° 门弧，或矩形门轮廓（按推拉门示意）；窗：轴向线或矩形轮廓。
- 房间：优先使用映射为“闭合分区”的轮廓；无闭合分区时尝试墙体闭合区域。无法识别时仅生成整体参考地面，并明确提示其面积依据。
- 家具：闭合外轮廓或圆转为可编辑示意家具，不自动识别真实品类、结构和高度。
- 支持图纸声明单位，或手选毫米、厘米、米、英寸。未声明单位时必须核对原图尺寸。
- 当前不直接读取 DWG、PDF、图片；斜墙、曲墙及不支持的图元会提示，不保证完整还原。
- 导入可撤销，导出方案 JSON 包含基础平面与布置，重新打开 JSON 能恢复 CAD 平面。

可先使用仓库里的 `examples/CAD导入示例.dxf` 测试。示例为 6m × 4m 外边界、闭合房间、门、窗和一件家具。

## 代码位置

- `index.html`：原有 2D 编辑器、默认户型、完整方案存取。
- `src/scene.js`：三维场景、家具、动态 CAD 几何与相机。
- `src/features.js`：CAD 导入与预览操作界面。
- `server/cad.py`：ezdxf 解析、单位转换、图层映射与几何转换。
- `server/app.py`：CAD API 与构建后静态页面服务。

## 验证

```sh
pip install -r requirements-dev.txt
python -m pytest tests/test_cad.py -q
npm run build
# 先启动 8000 端口的服务，再执行浏览器流程检查：
npm run test:e2e
```

浏览器检查默认使用 Windows Edge，也可通过 `EDGE_PATH` 指向 Chromium 可执行文件。覆盖 CAD 预览／应用／撤销重做／重开、实时 3D、普通 PNG 导出及方案 JSON 导出／导入。

## 来源与许可证

原项目的 MIT 许可证及 `Copyright (c) 2026 wuyi` 保留在 [LICENSE](LICENSE)。原始说明另存为 [README.upstream.md](README.upstream.md)。依赖版本与来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

项目地址：<https://github.com/shaoq9371-glitch/3d66-modeling>。
