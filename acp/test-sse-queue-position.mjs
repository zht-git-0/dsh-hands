// known 延迟激活 + QUEUED 位置 2→1 的同连接推送。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex=fileURLToPath(new URL('../index.js',import.meta.url))
const root=fs.mkdtempSync(path.join(os.tmpdir(),'hands-sse-queue-'))
const home=path.join(root,'home'),work=path.join(root,'work'),control=path.join(root,'control'),dsh=path.join(home,'.dsh')
const fakeScript=path.join(root,'fake.mjs'),fakeBin=path.join(root,process.platform==='win32'?'fake.cmd':'fake'),childFile=path.join(root,'child.mjs')
fs.mkdirSync(dsh,{recursive:true});fs.mkdirSync(work,{recursive:true});fs.mkdirSync(control,{recursive:true})
fs.writeFileSync(fakeScript,`
import fs from 'node:fs'; import path from 'node:path';
const control=${JSON.stringify(control)}; const prompt=process.argv.at(-1);
fs.writeFileSync(path.join(control,prompt+'.started'),String(process.pid));
while(!fs.existsSync(path.join(control,prompt+'.release'))) await new Promise(r=>setTimeout(r,20));
console.log(JSON.stringify({type:'text',sessionID:'ses_queue',part:{text:'done'}}));
`)
if(process.platform==='win32')fs.writeFileSync(fakeBin,`@echo off\r\nnode "${fakeScript}" %*\r\n`)
else fs.writeFileSync(fakeBin,`#!/bin/sh\nexec node "${fakeScript}" "$@"\n`,{mode:0o755})
fs.writeFileSync(childFile,`
import assert from 'node:assert/strict'; import {EventEmitter} from 'node:events'; import fs from 'node:fs'; import path from 'node:path'; import {pathToFileURL} from 'node:url';
const {apply}=await import(${JSON.stringify(pathToFileURL(repoIndex).href)}); const tools=new Map(),cleanups=[]; let handler=null;
const ctx={tools:{register(d){tools.set(d.name,d);return()=>{}}},webServer:{register(o){if(o.path==='/dsh-hands')handler=o.handler;return()=>{}}},effect(fn){const c=fn();if(typeof c==='function')cleanups.push(c);return c},get:()=>undefined,agent:{session:{id:'caller',cwd:${JSON.stringify(work)}},async followup(){return{ok:true}}}}
apply(ctx,{opencodeBin:${JSON.stringify(fakeBin)}})
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); async function waitFor(fn,label){for(let i=0;i<300;i++){if(fn())return;await sleep(20)}throw new Error('timeout: '+label)}
function turns(output){const rows=[];for(const part of output.split('event: turns\\n')){const at=part.indexOf('data: ');if(at<0)continue;try{rows.push(...JSON.parse(part.slice(at+6).split('\\n\\n')[0]).turns)}catch{}}return rows}
const req=new EventEmitter();req.url='/dsh-hands/stream?hand=opencode&key=opencode%2Fsid%3Ases_queue';req.method='GET';let output='';const res={destroyed:false,writableEnded:false,headersSent:false,writeHead(){this.headersSent=true},write(c){output+=String(c)},end(){this.writableEnded=true},on(){}}
await handler(req,res); assert.match(output,/event: sessions/); assert.ok(!output.includes('event: turns'))
const run=prompt=>tools.get('hands_run').execute({to:'opencode',prompt,session:'queue',cwd:${JSON.stringify(work)},write:true,async:true},ctx)
const a=await run('A'); await waitFor(()=>fs.existsSync(path.join(${JSON.stringify(control)},'A.started')),'A')
fs.writeFileSync(path.join(process.env.USERPROFILE,'.dsh','opencode-sessions.json'),JSON.stringify({queue:{id:'ses_queue',cwd:${JSON.stringify(work)},updated:new Date().toISOString()}}))
await waitFor(()=>output.includes('event: sessions')&&output.includes('event: turns'),'known activation')
const b=await run('B'),c=await run('C'); assert.equal(c.queuePosition,2)
await waitFor(()=>turns(output).some(t=>t.id===c.jobId&&t.queuePosition===2),'queued position 2')
const cancelReq=new EventEmitter();cancelReq.url='/dsh-hands/cancel';cancelReq.method='POST';const cancelRes={status:0,body:'',headersSent:false,writableEnded:false,writeHead(s){this.status=s},end(v){this.body=String(v??'')}};const pending=handler(cancelReq,cancelRes);cancelReq.emit('data',JSON.stringify({id:a.jobId}));cancelReq.emit('end');await pending;assert.equal(cancelRes.status,200)
await waitFor(()=>turns(output).some(t=>t.id===c.jobId&&t.queuePosition===1),'queued position 1')
fs.writeFileSync(path.join(${JSON.stringify(control)},'B.release'),'go');fs.writeFileSync(path.join(${JSON.stringify(control)},'C.release'),'go')
req.emit('close');for(const cleanup of cleanups)cleanup();console.log('sse queue position ok')
`)
const child=spawn(process.execPath,[childFile],{env:{...process.env,USERPROFILE:home,HOME:home},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);const code=await new Promise(r=>child.on('close',r))
let failure=null
try{assert.equal(code,0,`child failed: ${stderr||stdout}`);assert.match(stdout,/sse queue position ok/);console.log('sse known + queue position ok')}catch(error){failure=error}
try{fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100})}catch(error){if(!failure)throw error;console.error('cleanup warning: '+error.message)}
if(failure)throw failure
