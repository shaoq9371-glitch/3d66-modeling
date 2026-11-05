import json
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from .cad import CadOptions, analyze, convert, read_document

app = FastAPI(title="3d66建模 CAD 服务")
MAX_BYTES = 20 * 1024 * 1024


async def read_upload(file):
    if not (file.filename or "").lower().endswith(".dxf"):
        raise HTTPException(400, "请选择 DXF 文件。DWG、PDF 和图片需先转换或描图。")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "文件超过 20 MB，请清理无关图层后重试。")
    return read_document(data)


@app.get("/api/health")
def health():
    return {"status":"ok", "cad":"ezdxf"}


@app.post("/api/cad/analyze")
async def analyze_dxf(file: UploadFile = File(...)):
    try:
        return analyze(await read_upload(file))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/cad/convert")
async def convert_dxf(file: UploadFile = File(...), options: str = Form("{}")):
    try:
        config = CadOptions.model_validate_json(options)
        return convert(await read_upload(file), config, Path(file.filename).stem)
    except ValidationError as exc:
        raise HTTPException(422, "导入参数不正确，请检查单位、墙厚和层高。") from exc
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(422, str(exc)) from exc


dist = Path(__file__).resolve().parents[1] / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="web")
