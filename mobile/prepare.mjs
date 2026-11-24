import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../node_modules/esbuild/lib/main.js';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..'),android=join(here,'android');
function run(command,args,cwd){const result=spawnSync(command,args,{cwd,stdio:'inherit',shell:process.platform==='win32'});if(result.error)throw result.error;if(result.status!==0)throw Error(command+' exited '+result.status);}
if(process.argv.includes('--apk-only')){
  if(!existsSync(android))throw Error('Run npm run android:prepare first.');
  run(process.platform==='win32'?'gradlew.bat':'./gradlew',['assembleDebug','--no-daemon'],android);
  console.log('APK: '+join(android,'app/build/outputs/apk/debug/app-debug.apk'));
}else{
  const www=join(here,'www');rmSync(www,{recursive:true,force:true});mkdirSync(www,{recursive:true});
  cpSync(join(root,'dist/public'),www,{recursive:true});
  await build({entryPoints:[join(here,'native-bridge.ts')],bundle:true,outfile:join(www,'native-bridge.js'),target:'es2020',minify:true});
  const html=join(www,'index.html');writeFileSync(html,readFileSync(html,'utf8').replace('<script src="/client.js"></script>','<script src="/native-bridge.js"></script><script src="/client.js"></script>'));
  if(!existsSync(android))run('npx',['--no-install','cap','add','android'],here);
  run('npx',['--no-install','cap','sync','android'],here);
  // Reproducible overlay; the generated Gradle project is never maintained by hand.
  cpSync(join(here,'native'),join(android,'app/src/main'),{recursive:true});
  const manifest=join(android,'app/src/main/AndroidManifest.xml');
  let xml=readFileSync(manifest,'utf8');
  const setAttr=(tag,key,value)=>{const rx=new RegExp('android:'+key+'="[^"]*"');return rx.test(tag)?tag.replace(rx,'android:'+key+'="'+value+'"'):tag.replace(/>$/,' android:'+key+'="'+value+'">');};
  xml=xml.replace(/<application\b[^>]*>/s,tag=>setAttr(setAttr(setAttr(tag,'usesCleartextTraffic','true'),'icon','@drawable/tank_icon'),'roundIcon','@drawable/tank_icon'));
  xml=xml.replace(/<activity\b[^>]*>/s,tag=>setAttr(setAttr(tag,'screenOrientation','sensorLandscape'),'windowSoftInputMode','adjustResize'));
  if(!xml.includes('android.permission.VIBRATE'))xml=xml.replace('</manifest>','  <uses-permission android:name="android.permission.VIBRATE" />\n</manifest>');
  writeFileSync(manifest,xml);
  console.log('Android project prepared at '+android);
}
