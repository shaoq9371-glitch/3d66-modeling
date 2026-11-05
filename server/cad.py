"""DXF conversion with explicit layer roles. All editor coordinates are millimetres."""
from __future__ import annotations

from collections import Counter
import math
from pathlib import Path
import tempfile

import ezdxf
from ezdxf import units
from ezdxf.path import make_path
from pydantic import BaseModel, ConfigDict, Field
from shapely.geometry import LineString, Polygon, box
from shapely.ops import polygonize, unary_union

MAX_ENTITIES = 50000
SCALES = {"mm": 1.0, "cm": 10.0, "m": 1000.0, "in": 25.4}


class CadOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    units: str = "auto"
    wall_thickness: float = Field(default=200, ge=20, le=1500)
    height: float = Field(default=2800, ge=1800, le=12000)
    layers: dict[str, str] = Field(default_factory=dict)


def read_document(payload: bytes):
    with tempfile.TemporaryDirectory(prefix="3d66-cad-") as tmp:
        source = Path(tmp) / "input.dxf"
        source.write_bytes(payload)
        try:
            return ezdxf.readfile(source)
        except (ezdxf.DXFError, UnicodeError, OSError, ValueError) as exc:
            raise ValueError("DXF 文件无法读取，请在 CAD 中另存为标准 DXF 后重试。") from exc


def entities(doc):
    result = []

    def expand(items, inherited=None, depth=0):
        for entity in items:
            layer = entity.dxf.get("layer", "0")
            if layer == "0" and inherited:
                layer = inherited
            if entity.dxftype() == "INSERT" and depth < 5:
                expand(entity.virtual_entities(), layer, depth + 1)
            else:
                result.append((entity, layer))
            if len(result) > MAX_ENTITIES:
                raise ValueError("图元过多，请仅保留需要导入的平面图层（最多 50000 个图元）。")

    expand(doc.modelspace())
    return result


def guess_role(name):
    name = name.lower()
    for role, keys in {
        "window": ("window", "窗", "glaz"),
        "door": ("door", "门"),
        "furniture": ("furn", "家具", "设备", "柜"),
        "room": ("room", "房间", "区域", "分区"),
        "wall": ("wall", "墙"),
    }.items():
        if any(k in name for k in keys):
            return role
    return "ignore"


def analyze(doc):
    items = entities(doc)
    grouped = {}
    for entity, layer in items:
        grouped.setdefault(layer, Counter())[entity.dxftype()] += 1
    return {
        "units": int(doc.units),
        "unitsName": {0: "未声明", 1: "英寸", 4: "毫米", 5: "厘米", 6: "米"}.get(doc.units, f"单位代码 {doc.units}"),
        "entityCount": len(items),
        "layers": [{"name": name, "count": sum(count.values()), "types": dict(count), "role": guess_role(name)} for name, count in sorted(grouped.items())],
    }


def convert(doc, options: CadOptions, name="CAD 方案"):
    if options.units == "auto":
        if doc.units == 0:
            raise ValueError("该图纸未声明单位，请先选择毫米、厘米、米或英寸。")
        try:
            scale = units.conversion_factor(doc.units, units.MM)
        except Exception as exc:
            raise ValueError("无法识别图纸单位，请手动选择。") from exc
    elif options.units in SCALES:
        scale = SCALES[options.units]
    else:
        raise ValueError("不支持的图纸单位。")
    roles = {"wall", "door", "window", "furniture", "room", "ignore"}
    if any(value not in roles for value in options.layers.values()):
        raise ValueError("图层转换类型不正确。")
    items = entities(doc)
    mapped = [(e, options.layers.get(layer, guess_role(layer))) for e, layer in items]
    if not any(role == "wall" for _, role in mapped):
        raise ValueError("请至少指定一个墙体图层。")
    thickness = options.wall_thickness
    warnings = ["CAD 墙体仅按几何轮廓转换，未识别承重属性；请按原图核对。"]
    skipped = Counter()
    groups = {key: {"lines": [], "polys": [], "arcs": [], "circles": []} for key in roles if key != "ignore"}

    def point(p):
        return (float(p[0]) * scale, -float(p[1]) * scale)

    for entity, role in mapped:
        if role == "ignore":
            continue
        kind = entity.dxftype()
        try:
            if kind == "LINE":
                pts = [point(entity.dxf.start), point(entity.dxf.end)]
                if math.dist(*pts) > 1:
                    groups[role]["lines"].append(LineString(pts))
            elif kind in ("LWPOLYLINE", "POLYLINE"):
                pts = [point(p) for p in make_path(entity).flattening(max(.5 / scale, 1e-8))]
                if len(pts) > 2000:
                    raise ValueError("单个轮廓过于复杂，请简化后导入。")
                closed = bool(getattr(entity, "closed", getattr(entity, "is_closed", False)))
                if closed and len(pts) >= 3:
                    poly = Polygon(pts)
                    if poly.is_valid and poly.area > 1:
                        groups[role]["polys"].append(poly)
                else:
                    for a, b in zip(pts, pts[1:]):
                        if math.dist(a, b) > 1:
                            groups[role]["lines"].append(LineString([a, b]))
            elif kind == "ARC" and role == "door":
                groups[role]["arcs"].append((point(entity.dxf.center), entity.dxf.radius * scale, entity.dxf.start_angle, entity.dxf.end_angle))
            elif kind == "CIRCLE" and role == "furniture":
                groups[role]["circles"].append((point(entity.dxf.center), entity.dxf.radius * scale))
            else:
                skipped[kind] += 1
        except (ezdxf.DXFError, AttributeError, TypeError):
            skipped[kind] += 1

    def axis(line):
        a, b = line.coords[0], line.coords[-1]
        return abs(a[0] - b[0]) < 1 or abs(a[1] - b[1]) < 1

    def rectangle(poly):
        bounds = poly.bounds
        return abs(box(*bounds).area - poly.area) < max(1, poly.area * .001)

    wall_data = groups["wall"]
    closed_walls = list(wall_data["polys"])
    loop_polys = list(polygonize(unary_union(wall_data["lines"]))) if wall_data["lines"] else []
    closed_walls += [p for p in loop_polys if rectangle(p) and min(p.bounds[2] - p.bounds[0], p.bounds[3] - p.bounds[1]) <= thickness * 1.6]
    wall_shapes = [p for p in closed_walls if rectangle(p)]
    rejected_polys = len(closed_walls) - len(wall_shapes)
    if rejected_polys:
        warnings.append(f"{rejected_polys} 个非矩形墙体轮廓未转换；请拆成直墙或矩形。")
    covered = unary_union(wall_shapes) if wall_shapes else None
    for line in wall_data["lines"]:
        if not axis(line):
            skipped["斜墙线段"] += 1
            continue
        if covered is not None and covered.buffer(1).covers(line):
            continue
        wall_shapes.append(line.buffer(thickness / 2, cap_style=2))
    if not wall_shapes:
        raise ValueError("没有可转换的墙体。当前支持水平／竖直墙线和矩形墙体轮廓。")

    def rectangles_for(role):
        data = groups[role]
        polys = data["polys"] + list(polygonize(unary_union(data["lines"]))) if data["lines"] else list(data["polys"])
        polys = [Polygon(p.exterior) for p in polys]
        if role == "window":
            covered_openings = unary_union(polys) if polys else None
            polys += [line.buffer(thickness / 2, cap_style=2) for line in data["lines"] if axis(line) and (covered_openings is None or not covered_openings.buffer(1).covers(line))]
        # Remove inner outlines rather than creating duplicate nested furniture.
        return [p for p in polys if not any(other.area > p.area + 1 and other.covers(p) for other in polys)]

    windows = [list(p.bounds) for p in rectangles_for("window") if rectangle(p)]
    doors = []
    for center, radius, start, end in groups["door"]["arcs"]:
        if not 300 <= radius <= 5000 or abs(((end - start) % 360) - 90) > 2:
            skipped["非标准门弧"] += 1
            continue
        vectors = [[round(math.cos(math.radians(a))), -round(math.sin(math.radians(a)))] for a in (start, end)]
        if any(abs(v[0]) + abs(v[1]) != 1 for v in vectors):
            skipped["斜向门弧"] += 1
            continue
        wall_union = unary_union(wall_shapes)
        def alignment(vector):
            ray=LineString([center,(center[0]+radius*vector[0],center[1]+radius*vector[1])])
            return wall_union.intersection(ray).length
        if abs(alignment(vectors[0])-alignment(vectors[1]))>10:
            c,o=sorted(vectors,key=alignment,reverse=True)
        else:
            c, o = vectors if vectors[0][0] else vectors[::-1]
        hx, hy = center
        rect = [min(hx, hx + c[0] * radius) - (thickness / 2 if not c[0] else 0), min(hy, hy + c[1] * radius) - (thickness / 2 if c[0] else 0), max(hx, hx + c[0] * radius) + (thickness / 2 if not c[0] else 0), max(hy, hy + c[1] * radius) + (thickness / 2 if c[0] else 0)]
        doors.append({"name": f"CAD 门 {len(doors)+1}", "h": list(center), "c": c, "o": o, "rect": rect, "len": radius})
    slides = [{"rect": list(p.bounds), "v": p.bounds[3] - p.bounds[1] > p.bounds[2] - p.bounds[0]} for p in rectangles_for("door") if rectangle(p)]
    cutouts = [box(*r) for r in windows] + [box(*d["rect"]) for d in doors + slides]
    holes = unary_union(cutouts) if cutouts else None
    walls = []
    for shape in wall_shapes:
        pieces = shape.difference(holes) if holes is not None else shape
        for piece in getattr(pieces, "geoms", [pieces]):
            if not piece.is_empty and piece.area > 1 and rectangle(piece):
                bounds = list(piece.bounds)
                if bounds not in [w[:4] for w in walls]:
                    walls.append(bounds + ["n"])
    if not walls:
        raise ValueError("墙体转换为空，请检查图层映射和门窗位置。")

    room_polys = groups["room"]["polys"] + (list(polygonize(unary_union(groups["room"]["lines"]))) if groups["room"]["lines"] else [])
    room_polys = [p for p in room_polys if p.area >= 500000 and not p.interiors]
    inferred = False
    if not room_polys:
        room_polys = [p for p in loop_polys if p.area >= 1000000 and min(p.bounds[2] - p.bounds[0], p.bounds[3] - p.bounds[1]) > thickness * 2 and not p.interiors]
    if not room_polys:
        extents = unary_union(wall_shapes).bounds
        room_polys = [box(*extents)]
        inferred = True
        warnings.append("没有闭合房间轮廓：仅生成整体参考地面，面积按外包矩形计算；请勿视为净使用面积。可在 CAD 中新增 ROOM 图层的闭合区域后重新导入。")
    bounds = unary_union(wall_shapes + room_polys).bounds
    if any(not math.isfinite(v) for v in bounds) or max(bounds[2] - bounds[0], bounds[3] - bounds[1]) > 200000:
        raise ValueError("平面范围超过 200 米，请检查图纸单位或清理远处杂线。")
    ox, oy = bounds[:2]

    def offset_rect(r):
        return [round(r[0]-ox, 3), round(r[1]-oy, 3), round(r[2]-ox, 3), round(r[3]-oy, 3)]

    rooms = []
    for i, poly in enumerate(room_polys):
        center = poly.representative_point()
        rooms.append({"id": f"cad-room-{i+1}", "name": "CAD 整体参考地面" if inferred else f"CAD 分区 {i+1}", "poly": [[round(x-ox, 3), round(y-oy, 3)] for x, y in list(poly.exterior.coords)[:-1]], "at": [center.x-ox, center.y-oy], "mat": "tile800"})
    for d in doors:
        d["h"] = [d["h"][0]-ox, d["h"][1]-oy]
        d["rect"] = offset_rect(d["rect"])
    for s in slides:
        s["rect"] = offset_rect(s["rect"])
    furniture = []
    for p in rectangles_for("furniture"):
        x0, y0, x1, y1 = p.bounds
        if x1-x0 < 30 or y1-y0 < 30:
            continue
        furniture.append({"id": f"cad-f-{len(furniture)+1}", "name": "CAD 家具（轮廓示意）", "type": "table", "cx": (x0+x1)/2-ox, "cy": (y0+y1)/2-oy, "w": x1-x0, "d": y1-y0, "rot": 0, "color": "#d8c2a2"})
    for (x,y), radius in groups["furniture"]["circles"]:
        furniture.append({"id": f"cad-f-{len(furniture)+1}", "name": "CAD 圆形家具", "type": "roundtable", "cx": x-ox, "cy": y-oy, "w": radius*2, "d": radius*2, "rot": 0, "color": "#d8c2a2"})
    if furniture:
        warnings.append("家具按闭合外轮廓转为可编辑示意家具，未识别真实品类、结构或高度。")
    if skipped:
        warnings.append("未转换图元：" + "、".join(f"{k} {v} 个" for k,v in skipped.items()))
    width, depth = bounds[2]-ox, bounds[3]-oy
    margin = max(1200, max(width,depth)*.1)
    plan = {"name": name, "units": "mm", "height": options.height, "walls": [offset_rect(w[:4])+[w[4]] for w in walls], "windows": [offset_rect(w) for w in windows], "doors": doors, "slides": slides, "rooms": rooms, "bounds": {"x": -margin, "y": -margin, "w": width+margin*2, "h": depth+margin*2}, "cad": True, "warnings": warnings, "areaBasis": "bounding-box" if inferred else "closed-contours"}
    return {"format": "3d66-plan-v1", "plan": plan, "rooms": {r["id"]:{"name":r["name"],"mat":r["mat"]} for r in rooms}, "furniture": furniture, "demolished": [], "measures": [], "warnings": warnings, "summary": {"walls": len(walls), "windows":len(windows), "doors":len(doors)+len(slides), "rooms":len(rooms), "furniture":len(furniture)}}
