const $=selector=>document.querySelector(selector);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function dialog(id,title,body){
  const node=document.createElement('dialog');node.id=id;node.className='integration-dialog';
  node.setAttribute('aria-labelledby',id+'-title');
  node.innerHTML=`<header><h2 id="${id}-title">${title}</h2><button class="btn" data-close aria-label="关闭${title}">关闭</button></header><div class="dialog-body">${body}</div>`;
  document.body.append(node);node.querySelector('[data-close]').onclick=()=>node.close();return node;
}
async function callCad(endpoint,file,options){
  const data=new FormData();data.append('file',file);if(options)data.append('options',JSON.stringify(options));
  let response;try{response=await fetch('/api/cad/'+endpoint,{method:'POST',body:data});}catch{throw Error('CAD 服务连接失败，请使用项目启动脚本启动本地服务后重试。');}
  let result;try{result=await response.json();}catch{throw Error('CAD 服务尚未启动，请先运行本地启动脚本。');}
  if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'图纸处理失败，请检查单位与图层。');return result;
}
export function installFeatures(editor){
  let cadFile=null,converted=null;
  const cad=dialog('cadDialog','导入 CAD 平面',`
    <p>支持 DXF（最大 20 MB）。先检查单位与图层，再预览导入结果。DWG、PDF 或图片需先转为 DXF；当前转换水平／竖直墙线、矩形墙体、门弧、窗与闭合区域。</p>
    <label>选择图纸<input id="cadFile" type="file" accept=".dxf"></label>
    <div class="fields"><label>图纸单位<select id="cadUnits"><option value="auto">按图纸声明</option value="mm">毫米</option><option value="cm">厘米</option><option value="m">米</option><option value="in">英寸</option></select></label><label>墙线默认厚度（mm）<input id="cadThickness" type="number" value="200" min="20" max="1500"></label><label>示意层高（mm）<input id="cadHeight" type="number" value="2800" min="1800" max="12000"></label></div>
    <output id="cadStatus" aria-live="polite">选择 DXF 后显示图层。</output>
    <div id="cadLayers"></div><div id="cadWarnings"></div><canvas class="cad-preview" id="cadPreview" width="700" height="260" hidden></canvas>
    <div class="dialog-actions"><button class="btn" id="cadConvert" disabled>转换并预览</button><button class="btn primary" id="cadApply" disabled>应用到当前方案</button></div>`);
  $('#openCad').onclick=()=>cad.showModal();
  function invalidate(){converted=null;$('#cadApply').disabled=true;$('#cadPreview').hidden=true;$('#cadWarnings').innerHTML='';}
  ['cadUnits','cadThickness','cadHeight'].forEach(id=>$('#'+id).addEventListener('input',invalidate));
  $('#cadLayers').addEventListener('change',invalidate);
  $('#cadFile').onchange=async event=>{
    invalidate();cadFile=event.target.files[0]||null;$('#cadConvert').disabled=true;$('#cadLayers').innerHTML='';
    if(!cadFile)return;
    if(cadFile.size>20*1024*1024){$('#cadStatus').textContent='文件超过 20 MB。';cadFile=null;return;}
    $('#cadStatus').textContent='正在读取图层…';
    try{
      const result=await callCad('analyze',cadFile);
      $('#cadStatus').textContent=`${result.entityCount} 个图元，图纸单位：${result.unitsName}。请确认每个图层的用途。`;
      if(!result.units)$('#cadUnits').value='mm';
      $('#cadLayers').innerHTML='<table><thead><tr><th>图层</th><th>图元数</th><th>转换为</th></tr></thead><tbody>'+result.layers.map(layer=>`<tr><td>${escape(layer.name)}</td><td>${layer.count}</td><td><select aria-label="${escape(layer.name)}图层用途" data-layer="${escape(layer.name)}">${Object.entries({ignore:'忽略',wall:'墙体',door:'门',window:'窗',room:'闭合分区',furniture:'家具轮廓'}).map(([key,name])=>`<option value="${key}" ${layer.role===key?'selected':''}>${name}</option>`).join('')}</select></td></tr>`).join('')+'</tbody></table>';
      if(!result.units)$('#cadWarnings').innerHTML='<div class="warnings">图纸未声明单位。当前暂选毫米，请根据原图标注确认后再转换。</div>';
      $('#cadConvert').disabled=false;
    }catch(error){$('#cadStatus').textContent=error.message;}
  };
  $('#cadConvert').onclick=async()=>{
    invalidate();$('#cadConvert').disabled=true;$('#cadStatus').textContent='正在转换…';
    try{
      const options={units:$('#cadUnits').value,wall_thickness:Number($('#cadThickness').value),height:Number($('#cadHeight').value),layers:Object.fromEntries([...$('#cadLayers select')].map(el=>[el.dataset.layer,el.value]))};
      converted=await callCad('convert',cadFile,options);
      const s=converted.summary;$('#cadStatus').textContent=`墙段 ${s.walls} · 门 ${s.doors} · 窗 ${s.windows} · 分区 ${s.rooms} · 家具 ${s.furniture}`;
      $('#cadWarnings').innerHTML=converted.warnings.length?'<div class="warnings">'+converted.warnings.map(w=>`<p>${escape(w)}</p>`).join('')+'</div>':'';
      const cv=$('#cadPreview'),ctx=cv.getContext('2d'),b=converted.plan.bounds,scale=Math.min(cv.width/b.w,cv.height/b.h);
      cv.hidden=false;ctx.fillStyle='#f2eee7';ctx.fillRect(0,0,cv.width,cv.height);ctx.save();ctx.translate((cv.width-b.w*scale)/2-b.x*scale,(cv.height-b.h*scale)/2-b.y*scale);ctx.scale(scale,scale);
      ctx.fillStyle='#ddd9cd';for(const r of converted.plan.rooms){ctx.beginPath();r.poly.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
      ctx.fillStyle='#585247';for(const [a,b,c,d] of converted.plan.walls)ctx.fillRect(a,b,c-a,d-b);
      ctx.fillStyle='#9bb9c7';for(const [a,b,c,d] of converted.plan.windows)ctx.fillRect(a,b,c-a,d-b);ctx.restore();$('#cadApply').disabled=false;
    }catch(error){$('#cadStatus').textContent=error.message;}finally{$('#cadConvert').disabled=!cadFile;}
  };
  $('#cadApply').onclick=()=>{try{editor.apply(converted);cad.close();editor.toast('CAD 已导入，可用撤销恢复上一方案。');}catch(error){$('#cadStatus').textContent=error.message;}};

}
