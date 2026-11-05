import * as THREE from 'three';

/** Render the actual editor scene; keep controls and labels out of the image. */
export function createRenderController(api) {
  let tracer, running=false, ready=false, frame=0, generation=0, previous;
  let restoreUI=()=>{}, status=()=>{}, lastImage=null,environmentTexture=null;

  function cleanup() {
    cancelAnimationFrame(frame);
    running=false;
    ready=false;
    if(tracer){
      // 0.0.23's dispose() references _renderQuad, but its constructor names it _quad.
      // Keep the compatibility adjustment local to this pinned integration.
      tracer._renderQuad ||= tracer._quad;
      try{tracer.dispose();tracer._lowResPathTracer?.dispose();}
      catch(error){console.warn('Path tracer cleanup:',error);}
      tracer=null;
    }
    environmentTexture?.dispose();environmentTexture=null;
    if(previous){
      api.renderer.setPixelRatio(previous.ratio);
      api.renderer.setSize(previous.width,previous.height);
      api.camera.aspect=previous.aspect;api.camera.updateProjectionMatrix();
      previous=null;
    }
    restoreUI();
  }
  function cancel() { generation++; cleanup(); status('渲染已取消，可调整视角后重试。'); }
  function image() { return lastImage; }
  async function start({width,samples,onStatus,onComplete}) {
    if(running)throw Error('已有渲染任务，请先取消。');
    if(!api.canRender())throw Error('请先进入 3D 鸟瞰模式并等待切换完成。');
    status=onStatus;lastImage=null;
    const token=++generation;running=true;ready=false;
    try {
      status('正在载入路径追踪引擎…');
      const {WebGLPathTracer,GradientEquirectTexture}=await import('three-gpu-pathtracer');
      if(token!==generation)return;
      if(!api.renderer.capabilities.isWebGL2)throw Error('此设备不支持 WebGL2，仍可使用普通 3D 视图和图片导出。');
      previous={width:api.width(),height:api.height(),ratio:api.renderer.getPixelRatio(),aspect:api.camera.aspect};
      const height=Math.round(width*previous.height/previous.width);
      api.renderer.setPixelRatio(1);api.renderer.setSize(width,height,false);
      api.camera.aspect=width/height;api.camera.updateProjectionMatrix();
      restoreUI=api.lock();
      status('正在准备场景与灯光…');
      await new Promise(resolve=>requestAnimationFrame(resolve));
      if(token!==generation)return;
      const renderScene=new THREE.Scene();
      renderScene.background=api.scene.background.clone();
      const environment=new GradientEquirectTexture(128);
      environmentTexture=environment;
      environment.topColor.set(api.night()?'#30394d':'#dfe9f1');
      environment.bottomColor.set(api.night()?'#131318':'#e9e2d6');environment.update();
      renderScene.environment=environment;
      api.scene.updateMatrixWorld(true);
      api.scene.traverse(object=>{
        let visible=object.visible;for(let parent=object.parent;parent;parent=parent.parent)visible&&=parent.visible;
        if(!visible)return;
        if(object.isMesh){
          const mesh=new THREE.Mesh(object.geometry,object.material);object.matrixWorld.decompose(mesh.position,mesh.quaternion,mesh.scale);renderScene.add(mesh);
        } else if(object.isLight && !object.isHemisphereLight){
          const light=object.clone();object.matrixWorld.decompose(light.position,light.quaternion,light.scale);
          if(object.target){light.target=object.target.clone();renderScene.add(light.target);}
          renderScene.add(light);
        }
      });
      tracer=new WebGLPathTracer(api.renderer);
      tracer.bounces=5;tracer.renderDelay=0;tracer.fadeDuration=0;tracer.minSamples=1;
      tracer.tiles.set(2,2);tracer.textureSize.set(512,512);
      tracer.setScene(renderScene,api.camera);
      ready=true;
      const render=()=>{
        if(token!==generation||!running)return;
        try{
          tracer.renderSample();
          status(tracer.isCompiling?'正在编译渲染着色器，首次使用可能较慢…':`路径追踪采样 ${Math.min(samples,Math.floor(tracer.samples))} / ${samples}`);
          if(tracer.samples>=samples){
            lastImage=api.renderer.domElement.toDataURL('image/png');
            const result={data:lastImage,width,height,samples};
            generation++;cleanup();
            status(`渲染完成：${width} × ${height}，${samples} 次采样`);onComplete(result);
          }else frame=requestAnimationFrame(render);
        }catch(error){generation++;cleanup();status('渲染失败：'+error.message);}
      };
      frame=requestAnimationFrame(render);
    } catch(error) { console.error('Path tracing failed',error); if(token===generation){generation++;cleanup();status('渲染失败：'+error.message);}throw error; }
  }
  return {start,cancel,image,get running(){return running;},get ready(){return ready;}};
}
