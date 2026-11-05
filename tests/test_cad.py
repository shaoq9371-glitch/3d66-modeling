from io import StringIO
import json
from pathlib import Path

import ezdxf
from fastapi.testclient import TestClient
import pytest

from server.app import app
from server.cad import CadOptions, analyze, convert, read_document


def drawing(scale=1, unit=4, room=True):
    doc=ezdxf.new("R2010");doc.units=unit
    for name in ("WALL","DOOR","WINDOW","ROOM","FURN"):
        doc.layers.new(name)
    m=doc.modelspace()
    def rect(x,y,w,h,layer):
        m.add_lwpolyline([(x*scale,y*scale),((x+w)*scale,y*scale),((x+w)*scale,(y+h)*scale),(x*scale,(y+h)*scale)],close=True,dxfattribs={"layer":layer})
    for args in ((0,0,6000,200),(0,3800,6000,200),(0,200,200,3600),(5800,200,200,3600)):
        rect(*args,"WALL")
    rect(2000,0,1000,200,"DOOR")
    rect(3500,3800,1200,200,"WINDOW")
    rect(800,800,1200,600,"FURN")
    if room:rect(200,200,5600,3600,"ROOM")
    return doc


def payload(doc):
    stream=StringIO();doc.write(stream);return stream.getvalue().encode('utf-8')


def test_layer_analysis_and_real_geometry():
    doc=read_document(payload(drawing()));info=analyze(doc)
    assert next(x for x in info["layers"] if x["name"]=="WALL")["role"]=="wall"
    result=convert(doc,CadOptions())
    assert result["summary"]=={"walls":6,"windows":1,"doors":1,"rooms":1,"furniture":1}
    assert result["plan"]["areaBasis"]=="closed-contours"
    assert result["furniture"][0]["w"]==1200


@pytest.mark.parametrize("scale,unit",[(.001,6),(.1,5),(1/25.4,1)])
def test_units_convert_to_millimetres(scale,unit):
    result=convert(drawing(scale,unit),CadOptions())
    assert result["furniture"][0]["w"]==pytest.approx(1200)
    assert result["plan"]["rooms"][0]["poly"][1][0]==pytest.approx(5800)


def test_unitless_requires_decision():
    with pytest.raises(ValueError,match="单位"):
        convert(drawing(unit=0),CadOptions())
    assert convert(drawing(unit=0),CadOptions(units="mm"))["summary"]["rooms"]==1


def test_missing_room_is_marked_as_reference():
    doc=drawing(room=False)
    doc.modelspace().delete_entity(next(e for e in doc.modelspace() if e.dxf.layer=="WALL"))
    result=convert(doc,CadOptions())
    assert result["plan"]["areaBasis"]=="bounding-box"
    assert any("非净使用面积" in w or "净使用面积" in w for w in result["warnings"])


def test_nested_furniture_outlines_are_not_duplicated():
    doc=drawing();m=doc.modelspace()
    for points in [[(810,810),(1990,810),(1990,1390),(810,1390)],[(820,820),(1980,820),(1980,1380),(820,1380)]]:
        for a,b in zip(points,points[1:]+points[:1]):m.add_line(a,b,dxfattribs={"layer":"FURN"})
    assert convert(doc,CadOptions())["summary"]["furniture"]==1


def test_api_upload_validation_and_conversion():
    with TestClient(app) as client:
        assert client.post('/api/cad/analyze',files={"file":('plan.pdf',b'bad')}).status_code==400
        assert client.post('/api/cad/analyze',files={"file":('broken.dxf',b'bad')}).status_code==422
        response=client.post('/api/cad/convert',files={"file":('sample.dxf',payload(drawing()))},data={"options":json.dumps({"units":"mm"})})
        assert response.status_code==200
        assert response.json()["summary"]["windows"]==1
        assert client.post('/api/cad/convert',files={"file":('sample.dxf',payload(drawing()))},data={"options":'{"height":0}'}).status_code==422


if __name__=='__main__':
    target=Path(__file__).parents[1]/'examples'/'CAD导入示例.dxf'
    target.parent.mkdir(exist_ok=True)
    drawing().saveas(target)
    print(target)
