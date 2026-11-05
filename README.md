# 3d66建模

基于 [wy51ai/floorplan-3d](https://github.com/wy51ai/floorplan-3d) 的空间方案编辑工具。保留原版 2D 布置、3D 漫游和家具操作，并增加 CAD 导入、路径追踪效果图、海报／展板排版。

## 启动

完整版本包含 Python CAD 服务，**请通过本地服务打开，不再直接双击 index.html**。

需要 Node.js 22 和 Python 3.11 或更新版本。首次安装依赖需要联网，安装后常规使用与渲染不需要外部模型服务。

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

## 三个新增功能

### 导入 CAD

顶部点击 **导入 CAD**：选择 DXF → 确认单位与图层 → 转换并预览 → 应用到当前方案。

- 墙体：水平／竖直 LINE、直线多段线、矩形闭合墙体轮廓；墙线厚度可设置。
- 门：轴向 90° 门弧，或矩形门轮廓（按推拉门示意）；窗：轴向线或矩形轮廓。
- 房间：优先使用映射为“闭合分区”的轮廓；无闭合分区时尝试墙体闭合区域。无法识别时仅生成整体参考地面，并明确提示其面积依据。
- 家具：闭合外轮廓或圆转为可编辑示意家具，不自动识别真实品类、结构和高度。
- 支持图纸声明单位，或手选毫米、厘米、米、英寸。未声明单位时必须核对原图尺寸。
- 当前不直接读取 DWG、PDF、图片；斜墙、曲墙及不支持的图元会提示，不保证完整还原。
- 导入可撤销，导出方案 JSON 包含基础平面与布置，重新打开 JSON 能恢复 CAD 平面。

可先使用仓库里的 `examples/CAD导入示例.dxf` 测试。示例为 6m × 4m 外边界、闭合房间、门、窗和一件家具。

### 效果图渲染

顶部点击 **效果图渲染**，进入 3D 鸟瞰模式后调整视角与光照，再选择图片宽度、采样次数并开始。

- 使用 three-gpu-pathtracer 0.0.23，搭配 Three.js r163，运行于 WebGL2。
- 对当前实际场景进行路径追踪，不调用 AI 出图接口。
- 支持采样进度、取消、PNG 下载，以及将结果送到海报／展板。
- 渲染锁定当前相机，完成或取消后恢复实时 3D 操作。
- 时间取决于显卡、分辨率、场景复杂度和采样数。普通 3D 导出图片仍保留。

### 海报／展板

顶部点击 **海报／展板**，自动将当前 2D 或 3D 画面加入新页面。也可从效果图面板发送已渲染的图片。

- 复用 vue-fabric-editor 的开源 Editor 与 Workspace、History、Copy、Layer、Group、Ruler 等插件；提供本项目的 Vue 界面。
- 添加／编辑文字、上传图片、插入矩形和圆；移动、缩放、旋转、对齐、复制、组合、调整图层。
- 提供横向展板比例、竖版海报、方形画布与背景颜色。
- 支持 PNG、SVG、设计 JSON 导出，JSON 可重新打开继续编辑，布局会自动保存到当前浏览器。
- 画布单位为像素，A3 选项表示长宽比例；印刷前请核对输出像素、尺寸与字体。SVG 使用设备可用字体。

## 代码位置

- `index.html`：原有 2D 编辑器、默认户型、完整方案存取。
- `src/scene.js`：三维场景、家具、动态 CAD 几何与相机。
- `src/render.js`：路径追踪渲染任务。
- `src/features.js`：CAD 预览与渲染操作界面。
- `src/poster.js`：海报页面与上游核心插件集成。
- `src/media-store.js`：同源页面间传递方案图片。
- `server/cad.py`：ezdxf 解析、单位转换、图层映射与几何转换。
- `server/app.py`：CAD API 与构建后静态页面服务。
- `vendor/vue-fabric-editor`：固定提交的开源核心源代码及其 LICENSE。

## 验证

```sh
pip install -r requirements-dev.txt
python -m pytest tests/test_cad.py -q
npm run build
# 先启动 8000 端口的服务，再执行浏览器流程检查：
npm run test:e2e
```

浏览器检查默认使用 Windows Edge，也可通过 `EDGE_PATH` 指向 Chromium 可执行文件。覆盖图片送入海报、文字修改、PNG 与 JSON 导出／导入、CAD 预览／应用／撤销重做／重开，以及实际路径追踪出图。

## 来源与许可证

原项目的 MIT 许可证及 `Copyright (c) 2026 wuyi` 保留在 [LICENSE](LICENSE)。原始说明另存为 [README.upstream.md](README.upstream.md)。依赖版本与来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

项目地址：<https://github.com/shaoq9371-glitch/3d66-modeling>。
