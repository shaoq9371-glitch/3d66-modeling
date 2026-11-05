import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const directory='test-results';await fs.mkdir(directory,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true});
const errors=[];context.on('page',page=>{page.on('pageerror',error=>{errors.push(error.message);console.error('PAGE ERROR',error.stack);});page.on('console',m=>{if(m.type()==='error')console.error('BROWSER',m.text());if(m.text().startsWith('TRACE'))console.log(m.text());});page.on('dialog',dialog=>dialog.dismiss());});
try{
 const page=await context.newPage();await page.goto('http://127.0.0.1:8000');
 await page.waitForFunction(()=>window.ModelEditor&&window.View3D);
 console.log('Editor loaded');await page.screenshot({path:directory+'/editor.png'});
 console.log(await page.evaluate(()=>({rooms:window.ModelEditor.snapshot.plan.rooms.length,engine:!!window.View3D})));
 const original=await page.evaluate(()=>window.ModelEditor.snapshot);
 if(await page.locator('#openRender,#openPoster,#renderDialog').count())throw Error('Removed feature controls are still present');
 if(await page.evaluate(()=>!!window.View3D.renderTools))throw Error('Path tracing controller is still present');
 if((await context.request.get('http://127.0.0.1:8000/poster.html')).status()!==404)throw Error('Poster page is still served');
 await page.locator('#openCad').click();await page.locator('#cadFile').setInputFiles('examples/CAD导入示例.dxf');await page.locator('#cadConvert').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#cadConvert').disabled);
 await page.locator('#cadConvert').click();await page.waitForFunction(()=>!document.querySelector('#cadApply').disabled);
 await page.screenshot({path:directory+'/cad-preview.png'});
 await page.locator('#cadApply').click();
 const imported=await page.evaluate(()=>window.ModelEditor.snapshot);
 if(!imported.plan.cad||imported.plan.windows.length!==1||imported.furniture.length!==1)throw Error('CAD geometry did not apply');
 await page.locator('#undo').click();if(await page.evaluate(()=>!!window.ModelEditor.snapshot.plan.cad))throw Error('CAD undo failed');
 await page.locator('#redo').click();if(!await page.evaluate(()=>window.ModelEditor.snapshot.plan.cad))throw Error('CAD redo failed');
 await page.reload();await page.waitForFunction(()=>window.ModelEditor?.snapshot.plan.cad&&window.View3D);
 console.log('CAD preview, apply, undo/redo and reload persistence passed');
 await page.locator('[data-view="3d"]').click();await page.waitForTimeout(3000);await page.screenshot({path:directory+'/cad-3d.png'});
 async function saveDownload(selector,path){
   if(!await page.locator('#exportPng').isVisible())await page.locator('details.menu summary').click();
   const pending=page.waitForEvent('download');await page.locator(selector).click();
   await (await pending).saveAs(path);
 }
 await saveDownload('#exportPng',directory+'/cad-3d-export.png');
 await page.locator('[data-view="2d"]').click();
 await saveDownload('#exportPng',directory+'/cad-2d-export.png');
 for(const file of ['cad-3d-export.png','cad-2d-export.png']){
   const bytes=await fs.readFile(directory+'/'+file);
   if(bytes.length<1000||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid PNG export: '+file);
 }
 await saveDownload('#exportJson',directory+'/cad-plan.json');
 const saved=JSON.parse(await fs.readFile(directory+'/cad-plan.json','utf8'));
 if(!saved.plan.cad||saved.plan.windows.length!==1)throw Error('CAD plan JSON omitted geometry');
 await page.evaluate(s=>window.ModelEditor.apply(s),original);
 if(await page.evaluate(()=>!!window.ModelEditor.snapshot.plan.cad))throw Error('Default plan restore failed');
 await page.locator('#fileIn').setInputFiles(directory+'/cad-plan.json');
 await page.waitForFunction(()=>window.ModelEditor.snapshot.plan.cad);
 if(JSON.stringify(await page.evaluate(()=>window.ModelEditor.snapshot.plan))!==JSON.stringify(saved.plan))throw Error('CAD JSON roundtrip changed geometry');
 console.log('Real-time 3D, 2D/3D PNG export and CAD JSON roundtrip passed');
 await page.setViewportSize({width:390,height:844});await page.locator('#openCad').click();await page.screenshot({path:directory+'/mobile-cad.png'});
 if(errors.length)throw Error(JSON.stringify(errors));
 console.log('Browser checks passed without page errors');
}finally{await browser.close();}
