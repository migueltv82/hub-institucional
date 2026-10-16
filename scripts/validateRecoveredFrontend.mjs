import assert from 'node:assert/strict';
import {createServer as netServer} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,basename} from 'node:path';
import {localEndpoint} from './validateLocalDbAuthRecovery.mjs';
export function frontendHttpFailure(url,status){
  if(status<400)return null;
  const path=new URL(url).pathname;
  const service=path.match(/^\/(auth|rest|storage|functions)\/v1(?:\/|$)/)?.[1]??'frontend';
  const endpoint=['admin-users','source-file-storage'].find(name=>path==='/functions/v1/'+name);
  const asset=['/favicon.svg','/manifest.webmanifest'].find(name=>path===name);
  return {service,status,...(endpoint?{endpoint}:{}),...(asset?{asset}: {})};
}
// Edge Functions no forman parte del backend recuperado: solo un 404 de un endpoint Edge conocido se registra como hallazgo fuera de alcance; cualquier otro error HTTP sigue fallando.
export function edgeOutOfScope(failure){
  return failure?.service==='functions'&&failure.status===404&&typeof failure.endpoint==='string';
}
export function frontendProxyTargets(ports){
  assert.deepEqual(Object.keys(ports).sort(),['auth','rest','storage']);
  return Object.fromEntries([['/auth/v1','auth'],['/rest/v1','rest'],['/storage/v1','storage']].map(([prefix,kind])=>[prefix,{target:localEndpoint(ports[kind],'/'),changeOrigin:true,followRedirects:false,ws:false,rewrite:path=>path.slice(prefix.length)||'/'}]));
}
export async function validateRecoveredFrontend({ports,anonKey,users,tenants,report}){
  const proxy=frontendProxyTargets(ports);
  assert.ok(!Object.keys(process.env).some(key=>key.startsWith('VITE_')),'Ambient frontend environment forbidden');
  assert.equal(users.length,4);assert.equal(tenants.length,2);
  assert.ok(JSON.parse(Buffer.from(anonKey.split('.')[1],'base64url').toString()).role==='anon','Public key role mismatch');
  let server,browser,cache;let phase='startup';
  const errors=[],cases=[],httpFailures=[],edgeFindings=[];let externalRequests=0,serverErrors=0;
  report.browserCases=cases;report.browserHttpFailures=httpFailures;report.browserEdgeOutOfScope=edgeFindings;
  report.browserProgress=phase;
  try{
    const {createServer,createLogger}=await import('vite');
    const {default:react}=await import('@vitejs/plugin-react');
    const {default:tailwindcss}=await import('@tailwindcss/vite');
    const {chromium}=await import('playwright');
    const reservation=netServer();
    const port=await new Promise((done,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',()=>{const value=reservation.address().port;reservation.close(error=>error?reject(error):done(value));});});
    const origin=localEndpoint(port,'/').slice(0,-1);
    cache=await mkdtemp(resolve(tmpdir(),'hub-recovery-browser-'));
    const logger=createLogger('silent');logger.error=()=>{serverErrors++;};
    server=await createServer({configFile:false,envDir:false,root:process.cwd(),cacheDir:cache,plugins:[react(),tailwindcss()],resolve:{dedupe:['react','react-dom']},customLogger:logger,
      define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(origin),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify(anonKey),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify(anonKey),'import.meta.env.VITE_DISABLE_AUTH':JSON.stringify('false')},
      server:{host:'127.0.0.1',port,strictPort:true,hmr:false,proxy}});
    await server.listen();
    browser=await chromium.launch({headless:true,channel:'chrome'});
    for(const [index,user] of users.entries()){
      phase='account '+index+' login form';report.browserProgress=phase;
      const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});
      try{
        await context.route('**/*',async route=>{if(new URL(route.request().url()).origin===origin)await route.continue();else{externalRequests++;await route.abort();}});
        const page=await context.newPage();page.on('pageerror',error=>errors.push(error.name));
        page.on('response',response=>{const failure=frontendHttpFailure(response.url(),response.status());if(!failure)return;if(edgeOutOfScope(failure))edgeFindings.push({...failure,phase});else httpFailures.push({...failure,phase});});
        await page.goto(origin+'/login',{waitUntil:'networkidle'});
        const institutions=page.locator('select[name="institutionId"]');await institutions.waitFor({state:'visible',timeout:20000});
        await institutions.selectOption(tenants[1-user.tenant]);
        await page.locator('input[name="email"]').fill(user.email);await page.locator('input[name="password"]').fill(user.password);
        await page.getByRole('button',{name:'Entrar al workspace institucional',exact:true}).click();
        phase='account '+index+' foreign institution rejection';report.browserProgress=phase;
        await page.getByText('No tienes permisos para acceder a la institucion seleccionada.',{exact:true}).waitFor({state:'visible',timeout:20000});
        await page.waitForURL(origin+'/login',{timeout:15000});
        await page.reload({waitUntil:'networkidle'});
        await page.locator('select[name="institutionId"]').selectOption(tenants[user.tenant]);
        await page.locator('input[name="email"]').fill(user.email);await page.locator('input[name="password"]').fill(user.password);
        await page.getByRole('button',{name:'Entrar al workspace institucional',exact:true}).click();
        phase='account '+index+' own institution portal';report.browserProgress=phase;
        await page.waitForURL(url=>url.pathname.startsWith('/app'),{timeout:20000});
        const logout=page.getByRole('button',{name:'Cerrar sesion',exact:true}).first();await logout.waitFor({state:'visible',timeout:30000});
        assert.equal(await page.evaluate(()=>localStorage.getItem('mesaflow.activeInstitutionId')),tenants[user.tenant]);
        await page.getByText('Synthetic browser tenant '+user.tenant,{exact:false}).first().waitFor({state:'visible'});
        assert.equal(await page.getByText('Synthetic browser tenant '+(1-user.tenant),{exact:false}).count(),0);
        if(user.role==='docente')await page.getByText('Portal docente',{exact:true}).first().waitFor({state:'visible'});
        else await page.locator('.student-portal-signout').waitFor({state:'visible'});
        phase='account '+index+' logout';report.browserProgress=phase;
        await logout.click();await page.waitForURL(origin+'/login',{timeout:15000});
        await page.goto(origin+'/app',{waitUntil:'networkidle'});await page.waitForURL(origin+'/login',{timeout:15000});
        assert.deepEqual(httpFailures,[],'Browser HTTP errors');
        cases.push({role:user.role,tenant:user.tenant,foreignInstitutionRejected:true,ownInstitution:true,logout:true,protectedRouteAfterLogout:true});
      }finally{await context.close();}
    }
    assert.equal(externalRequests,0,'External requests blocked');assert.deepEqual(errors,[],'Browser errors');assert.equal(serverErrors,0,'Local server errors');assert.deepEqual(httpFailures,[],'Browser HTTP errors');
    report.browserFlow={result:'PASS',accounts:cases,externalRequests,pageErrors:errors.length,serverErrors,authDisabled:false,preloadedSessions:false,edgeOutOfScope:[...new Set(edgeFindings.map(finding=>finding.endpoint))].sort(),edgeCertified:false};
  }catch(error){report.browserProgress=phase;report.browserErrorType=error.name;throw new Error('Recovered frontend verification failed');}
  finally{
    const closed=await Promise.allSettled([browser?.close(),server?.close()]);
    const cleanupErrors=closed.flatMap((result,index)=>result.status==='rejected'?[index===0?'Browser close failed':'Server close failed']:[]);
    if(cache){try{assert.equal(dirname(resolve(cache)),resolve(tmpdir()));assert.ok(basename(cache).startsWith('hub-recovery-browser-'));await rm(cache,{recursive:true,force:true});}catch{cleanupErrors.push('Owned cache cleanup failed');}}
    report.browserOwnedResourcesClosed=cleanupErrors.length===0;report.browserCleanupErrors=cleanupErrors;
    assert.equal(cleanupErrors.length,0,'Browser runtime cleanup failed');
  }
}
