import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('dialog',d=>d.dismiss());
try{
 await page.goto('http://127.0.0.1:8000');await page.waitForFunction(()=>window.View3D);
 await page.locator('#openRender').click();await page.locator('#renderDialog').waitFor({state:'visible'});
 await page.locator('#renderWidth').selectOption('480');await page.locator('#renderSamples').selectOption('4');
 await page.locator('#startRender').click();
 await page.waitForFunction(()=>!document.querySelector('#saveRender').disabled||document.querySelector('#renderStatus').textContent.startsWith('渲染失败'),null,{timeout:150000});
 const status=await page.locator('#renderStatus').textContent();if(!status.startsWith('渲染完成'))throw Error(status);
 const downloading=page.waitForEvent('download');await page.locator('#saveRender').click();await(await downloading).saveAs('test-results/default-render.png');
 await page.screenshot({path:'test-results/render-dialog.png'});
 const popupEvent=page.waitForEvent('popup');await page.locator('#renderToPoster').click();const poster=await popupEvent;
 await poster.waitForFunction(()=>window.PosterEditor?.canvas.getObjects().some(o=>o.type==='image'));
 console.log('Default 46-furniture scene: '+status+'; rendered image reached poster');
 await page.locator('#renderDialog [data-close]').click();
 await page.locator('#openRender').click();await page.locator('#renderSamples').selectOption('256');await page.locator('#startRender').click();await page.locator('#cancelRender').click();
 if(await page.evaluate(()=>window.View3D.renderTools.running))throw Error('Cancel did not stop the task');
 await page.locator('#renderDialog [data-close]').click();await page.locator('[data-view="2d"]').click();
 await page.waitForFunction(()=>!document.body.classList.contains('busy'));
 if(errors.length)throw Error(JSON.stringify(errors));
 console.log('Render UI download, poster bridge, cancel and editor recovery passed');
}finally{await browser.close();}
