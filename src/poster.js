import { createApp, ref, onMounted, nextTick } from 'vue';
import { fabric } from 'fabric';
import Editor from '../vendor/vue-fabric-editor/core/Editor';
import WorkspacePlugin from '../vendor/vue-fabric-editor/core/plugin/WorkspacePlugin';
import HistoryPlugin from '../vendor/vue-fabric-editor/core/plugin/HistoryPlugin';
import CopyPlugin from '../vendor/vue-fabric-editor/core/plugin/CopyPlugin';
import LayerPlugin from '../vendor/vue-fabric-editor/core/plugin/LayerPlugin';
import GroupPlugin from '../vendor/vue-fabric-editor/core/plugin/GroupPlugin';
import CenterAlignPlugin from '../vendor/vue-fabric-editor/core/plugin/CenterAlignPlugin';
import AlignGuidLinePlugin from '../vendor/vue-fabric-editor/core/plugin/AlignGuidLinePlugin';
import RulerPlugin from '../vendor/vue-fabric-editor/core/plugin/RulerPlugin';
import DeleteHotKeyPlugin from '../vendor/vue-fabric-editor/core/plugin/DeleteHotKeyPlugin';
import { takeAsset } from './media-store.js';
import './poster.css';

function download(name,data){const a=document.createElement('a');a.href=data;a.download=name;a.click();}
const presets={poster:[1080,1920],board:[1680,1188],square:[1080,1080]};

createApp({
  setup(){
    const ready=ref(false),message=ref('正在准备画布…'),layers=ref([]),selected=ref(null),undoCount=ref(0),redoCount=ref(0),preset=ref('board');
    const text=ref(''),fontSize=ref(48),fill=ref('#2b2824'),angle=ref(0),background=ref('#ffffff');
    let canvas,editor,saveTimer;
    function refresh(){layers.value=canvas.getObjects().filter(o=>o.id!=='workspace').slice().reverse().map(o=>({id:o.id,name:o.name||o.text?.slice(0,18)||({image:'方案图片',rect:'矩形',circle:'圆形',group:'组合'}[o.type]||'图形')}));}
    function selection(){const o=canvas.getActiveObject();selected.value=o?.id||null;text.value=o?.text||'';fontSize.value=o?.fontSize||48;fill.value=/^#[0-9a-f]{6}$/i.test(o?.fill)?o.fill:'#2b2824';angle.value=Math.round(o?.angle||0);}
    function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem('3d66-poster-v1',JSON.stringify(editor.getJson()));message.value='已自动保存到此浏览器';}catch{message.value='自动保存空间不足，请保存设计 JSON。';}},600);}
    function changed(){canvas.requestRenderAll();canvas.fire('object:modified');refresh();selection();persist();}
    function addObject(object){object.id=crypto.randomUUID();canvas.add(object);canvas.setActiveObject(object);editor.position('center');editor.saveState();refresh();selection();persist();}
    function addText(){addObject(new fabric.Textbox('双击编辑文字',{width:650,fontSize:64,fill:'#2b2824',fontFamily:'Microsoft YaHei, sans-serif',padding:5}));}
    function addRect(){addObject(new fabric.Rect({width:420,height:220,fill:'#d5dfe0',strokeWidth:0}));}
    function addCircle(){addObject(new fabric.Circle({radius:100,fill:'#d5dfe0',strokeWidth:0}));}
    async function addImage(data){
      return new Promise((resolve,reject)=>{fabric.Image.fromURL(data,image=>{if(!image?.width)return reject(Error('图片读取失败'));image.scaleToWidth(editor.getWorkspase().width*.72);image.name='方案图片';addObject(image);resolve();},{crossOrigin:'anonymous'});});
    }
    async function upload(event){const file=event.target.files[0];event.target.value='';if(!file)return;if(file.size>20*1024*1024){message.value='图片超过 20 MB，请先缩小。';return;}const reader=new FileReader();reader.onload=()=>addImage(reader.result).catch(e=>message.value=e.message);reader.onerror=()=>message.value='图片读取失败';reader.readAsDataURL(file);}
    function update(){const o=canvas.getActiveObject();if(!o)return;const attrs={fill:fill.value,angle:Number(angle.value)||0};if('text' in o){attrs.text=text.value;attrs.fontSize=Math.max(8,Math.min(500,Number(fontSize.value)||48));}o.set(attrs);o.setCoords();changed();}
    function remove(){canvas.getActiveObjects().forEach(o=>{if(o.id!=='workspace')canvas.remove(o);});canvas.discardActiveObject();refresh();selection();persist();}
    function selectLayer(id){const o=canvas.getObjects().find(o=>o.id===id);if(o){canvas.setActiveObject(o);canvas.requestRenderAll();selection();}}
    function resize(){const [w,h]=presets[preset.value];editor.setSize(w,h);editor.saveState();persist();message.value=`画布 ${w} × ${h} px`;}
    function colorBackground(){editor.setWorkspaseBg(background.value);editor.saveState();canvas.requestRenderAll();persist();}
    async function exportImage(){try{const data=await editor.preview();download('3d66-海报.png',data);message.value='PNG 已导出';}catch(e){message.value='导出失败：'+e.message;}}
    function exportSvg(){try{const workspace=editor.getWorkspase(),svg=canvas.toSVG({width:workspace.width,height:workspace.height,viewBox:{x:0,y:0,width:workspace.width,height:workspace.height}});download('3d66-海报.svg','data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg));message.value='SVG 已导出，字体需在接收设备上可用。';}catch(e){message.value=e.message;}}
    function save(){download('3d66-海报设计.json','data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify({format:'3d66-poster-v1',...editor.getJson()},null,2)));}
    async function restore(json){
      if(!json||!Array.isArray(json.objects)||json.objects.length>2000||!json.objects.some(o=>o.id==='workspace'))throw Error('请选择此编辑器导出的设计 JSON。');
      const workspace=json.objects.find(o=>o.id==='workspace');if(!Number.isFinite(workspace.width)||!Number.isFinite(workspace.height)||workspace.width<100||workspace.height<100||workspace.width>8000||workspace.height>8000)throw Error('画布尺寸无效。');
      const allowed=new Set(['rect','circle','textbox','i-text','text','image','group','line','polygon','polyline','path','ellipse']);
      function check(objects){for(const o of objects){if(!allowed.has(o.type))throw Error('设计包含未支持的图形。');if(o.type==='image'&&!/^data:image\/(png|jpeg|webp);base64,/.test(o.src||''))throw Error('仅允许导入包含本地嵌入图片的设计。');if(o.objects)check(o.objects);}}
      check(json.objects);
      await new Promise(resolve=>editor.loadJSON(json,resolve));background.value=editor.getWorkspase().fill;refresh();selection();persist();
    }
    async function load(event){const file=event.target.files[0];event.target.value='';if(!file)return;try{if(file.size>30*1024*1024)throw Error('设计文件超过 30 MB。');await restore(JSON.parse(await file.text()));message.value='设计已打开';}catch(e){message.value=e.message;}}
    function history(action){editor[action]();}
    function layer(action){editor[action]();changed();}
    function group(){const active=canvas.getActiveObject();if(active?.type==='activeSelection'){editor.group();editor.saveState();refresh();persist();}else message.value='按住 Shift 选择多个元素后再组合。';}
    function ungroup(){if(canvas.getActiveObject()?.type==='group'){editor.unGroup();editor.saveState();refresh();persist();}}
    onMounted(async()=>{
      await nextTick();canvas=new fabric.Canvas('posterCanvas',{fireRightClick:true,stopContextMenu:true,preserveObjectStacking:true});editor=new Editor();editor.init(canvas);
      editor.use(WorkspacePlugin).use(RulerPlugin).use(CenterAlignPlugin).use(AlignGuidLinePlugin).use(LayerPlugin).use(CopyPlugin).use(GroupPlugin).use(DeleteHotKeyPlugin).use(HistoryPlugin);
      editor.setSize(...presets.board);editor.on('historyUpdate',(u,r)=>{undoCount.value=u;redoCount.value=r;});
      canvas.on('selection:created',selection);canvas.on('selection:updated',selection);canvas.on('selection:cleared',selection);
      canvas.on('object:modified',()=>{refresh();selection();persist();});canvas.on('object:added',()=>{refresh();persist();});canvas.on('object:removed',()=>{refresh();persist();});
      canvas.on('history:undo',()=>{refresh();selection();persist();});canvas.on('history:redo',()=>{refresh();selection();persist();});
      ready.value=true;
      try{const saved=localStorage.getItem('3d66-poster-v1');if(saved)await restore(JSON.parse(saved));}catch{message.value='上次设计无法恢复，可打开已导出的 JSON。';}
      const assetId=new URLSearchParams(location.search).get('asset');
      if(assetId){try{const data=await takeAsset(assetId);if(data){await addImage(data);message.value='方案图片已加入，可添加文字、调整图层并导出。';}else message.value='方案图片已接收过，可从空间编辑器再次发送。';}catch(e){message.value=e.message;}window.history.replaceState({},'',location.pathname);}
      else message.value='添加文字或图片开始排版，设计会自动保存。';
      // Expose the actual upstream editor for integration tests and further customization.
      window.PosterEditor={editor,canvas,restore};
    });
    return {ready,message,layers,selected,undoCount,redoCount,preset,text,fontSize,fill,angle,background,addText,addRect,addCircle,upload,update,remove,selectLayer,resize,colorBackground,exportImage,exportSvg,save,load,history,layer,group,ungroup};
  },
  template:`<div class="poster-shell">
    <header class="poster-header"><a href="/" class="product-name">3d66建模</a><h1>海报／展板</h1><div class="poster-actions"><button @click="history('undo')" :disabled="!undoCount">撤销</button><button @click="history('redo')" :disabled="!redoCount">重做</button><button @click="$refs.design.click()">打开设计</button><button @click="save" :disabled="!ready">保存设计</button><button @click="exportSvg" :disabled="!ready">导出 SVG</button><button class="primary" @click="exportImage" :disabled="!ready">导出 PNG</button></div></header>
    <aside class="poster-tools"><h2>添加内容</h2><button @click="addText" :disabled="!ready">添加文字</button><button @click="$refs.image.click()" :disabled="!ready">上传图片</button><div class="tool-pair"><button @click="addRect" :disabled="!ready">矩形</button><button @click="addCircle" :disabled="!ready">圆形</button></div><h2>画布</h2><label>尺寸<select v-model="preset" @change="resize"><option value="board">A3 横向比例 · 1680 × 1188</option><option value="poster">竖版海报 · 1080 × 1920</option><option value="square">方形 · 1080 × 1080</option></select></label><label>背景颜色<input type="color" v-model="background" @input="colorBackground"></label><p class="muted">画布单位为像素。PNG 用于屏幕展示，印刷前请核对输出尺寸与字体。</p><h2>图层</h2><p v-if="!layers.length" class="muted">还没有内容，添加文字或图片开始。</p><button v-for="item in layers" :key="item.id" class="layer-row" :class="{selected:selected===item.id}" @click="selectLayer(item.id)">{{item.name}}</button><p class="source-note">编辑核心：vue-fabric-editor</p></aside>
    <main id="workspace" aria-label="海报设计画布"><canvas id="posterCanvas"></canvas></main>
    <aside class="poster-properties"><h2>元素属性</h2><template v-if="selected"><label v-if="text">文字内容<textarea v-model="text" @change="update" rows="4"></textarea></label><label v-if="text">字号<input type="number" min="8" max="500" v-model="fontSize" @change="update"></label><label>颜色<input type="color" v-model="fill" @input="update"></label><label>旋转角度<input type="number" v-model="angle" @change="update"></label><div class="tool-pair"><button @click="layer('up')">上移一层</button><button @click="layer('down')">下移一层</button><button @click="layer('toFront')">置顶</button><button @click="layer('toBack')">置底</button><button @click="layer('clone')">复制</button><button @click="remove">删除</button><button @click="group">组合</button><button @click="ungroup">拆分组合</button></div></template><p v-else class="muted">选择画布中的元素，调整文字、颜色、角度和图层。双击文字可直接编辑。</p></aside>
    <footer aria-live="polite">{{message}}</footer><input ref="image" type="file" accept="image/png,image/jpeg,image/webp" @change="upload" hidden><input ref="design" type="file" accept=".json" @change="load" hidden>
  </div>`
}).mount('#posterApp');
