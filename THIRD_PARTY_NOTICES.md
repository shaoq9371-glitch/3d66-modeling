# 第三方组件

本项目继续保留 floorplan-3d 的 MIT 版权声明，见根目录 LICENSE。

| 组件 | 来源与版本 | 使用范围 | 许可证 |
| --- | --- | --- | --- |
| ezdxf | https://github.com/mozman/ezdxf ，1.4.5 | Python DXF 解析与转换 | MIT |
| three-gpu-pathtracer | https://github.com/gkjohnson/three-gpu-pathtracer ，0.0.23 | WebGL2 路径追踪渲染 | MIT |
| Three.js | https://github.com/mrdoob/three.js ，0.163.0 | 三维场景与实时渲染 | MIT |
| three-mesh-bvh | https://github.com/gkjohnson/three-mesh-bvh ，0.7.8 | 路径追踪加速结构 | MIT |
| vue-fabric-editor | https://github.com/ikuaitu/vue-fabric-editor ，提交 b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889 | vendor 中保留开源核心与插件，海报页面为本项目提供的 Vue 界面 | 仓库 MIT；core/package.json 同时声明 ISC，均原样保留 |
| Fabric.js | https://github.com/fabricjs/fabric.js ，5.3.0 | 海报画布 | MIT |
| Vue | https://github.com/vuejs/core ，3.5.13 | 海报页面 | MIT |

vendor/vue-fabric-editor 为上述固定提交的 packages/core 代码及其上游 LICENSE。
使用 Editor、Workspace、History、Layer、Copy、Group、CenterAlign、AlignGuidLine、Ruler、DeleteHotKey 等开源插件。未接入快图商业后台、商业模板或付费服务。

渲染固定使用 WebGL2 版本，不使用该渲染库主分支的新 WebGPU 实现。为支持场景环境光旋转接口，Three.js 从 r160 升级到 r163，并固定版本。

其他直接或间接依赖的许可随各依赖发布包提供，具体版本以 package-lock.json 和 requirements.lock.txt 为准。前端生产包的许可证文件一并保存在 public/licenses。
