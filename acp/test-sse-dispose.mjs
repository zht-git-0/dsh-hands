// SSE 空闲 1 秒零读盘 + dispose 关闭响应和所有 interval。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex=fileURLToPath(new URL('../index.js',import.meta.url))
const root=fs.mkdtempSync(path.join(os.tmpdir(),'hands-sse-dispose-'))
const home=path.join(root,'home'),dsh=path.join(home,'.dsh'),childFile=path.join(root,'child.mjs')
fs.mkdirSync(dsh,{recursive:true});fs.writeFileSync(path.join(dsh,'opencode-sessions.json'),JSON.stringify({same:{id:'sid_same',cwd:'D:/work',updated:new Date().toISOString()}}))
fs.writeFileSync(childFile,`
import assert from 'node:assert/strict'; import {EventEmitter} from 'node:events'; import {pathToFileURL} from 'node:url';
const {apply,fileReadStats}=await import(${JSON.stringify(pathToFileURL(repoIndex).href)})
const originalSet=globalThis.setInterval,originalClear=globalThis.clearInterval;const intervals=new Set(),cleared=new Set();
globalThis.setInterval=(...args)=>{const handle=originalSet(...args);intervals.add(handle);return handle};globalThis.clearInterval=(handle)=>{cleared.add(handle);return originalClear(handle)};
const cleanups=[];let handler=null;const ctx={tools:{register(){return()=>{}}},webServer:{register(o){if(o.path==='/dsh-hands')handler=o.handler;return()=>{}}},effect(fn){const c=fn();if(typeof c==='function')cleanups.push(c);return c},get:()=>undefined}
apply(ctx,{})
const req=new EventEmitter();req.url='/dsh-hands/stream?hand=opencode&key=opencode%2Fsid%3Asid_same';req.method='GET';let output='';const res={destroyed:false,writableEnded:false,headersSent:false,writeHead(){this.headersSent=true},write(c){output+=String(c)},end(){this.writableEnded=true},on(){}}
await handler(req,res);fileReadStats.reads=0;fileReadStats.hits=0;fileReadStats.stats=0;const initial=output.length;await new Promise(r=>setTimeout(r,1200));assert.equal(fileReadStats.reads,0,'空闲 SSE 心跳零文件读取');assert.equal(output.length,initial,'空闲不重复推帧')
for(const cleanup of cleanups)cleanup();assert.equal(res.writableEnded,true,'dispose 关闭 SSE 响应');assert.equal(cleared.size,intervals.size,'dispose 清掉所有 interval');const afterDispose=output.length;await new Promise(r=>setTimeout(r,350));assert.equal(output.length,afterDispose,'dispose 后不再空转')
globalThis.setInterval=originalSet;globalThis.clearInterval=originalClear;console.log('sse idle dispose ok')
`)
const child=spawn(process.execPath,[childFile],{env:{...process.env,USERPROFILE:home,HOME:home},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);const code=await new Promise(r=>child.on('close',r))
try{assert.equal(code,0,`child failed: ${stderr||stdout}`);assert.match(stdout,/sse idle dispose ok/);console.log('sse idle + dispose ok')}finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
