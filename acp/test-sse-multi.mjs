// 两个 SSE 客户端独立游标：同一次派发/归档两边都收到更新。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-sse-multi-'))
const home = path.join(root, 'home')
const work = path.join(root, 'work')
const control = path.join(root, 'control')
const dsh = path.join(home, '.dsh')
const fakeScript = path.join(root, 'fake-opencode.mjs')
const fakeBin = path.join(root, process.platform === 'win32' ? 'fake-opencode.cmd' : 'fake-opencode')
const childFile = path.join(root, 'child.mjs')
fs.mkdirSync(dsh, { recursive: true })
fs.mkdirSync(work, { recursive: true })
fs.mkdirSync(control, { recursive: true })
fs.writeFileSync(path.join(dsh, 'opencode-sessions.json'), JSON.stringify({ same: { id: 'ses_same', cwd: work, updated: new Date().toISOString() } }))
fs.writeFileSync(fakeScript, `
import fs from 'node:fs'
import path from 'node:path'
const control = ${JSON.stringify(control)}
const prompt = process.argv.at(-1)
fs.writeFileSync(path.join(control, prompt + '.started'), String(process.pid))
while (!fs.existsSync(path.join(control, prompt + '.release'))) await new Promise((resolve) => setTimeout(resolve, 20))
console.log(JSON.stringify({ type: 'text', sessionID: 'ses_same', part: { text: 'done' } }))
`)
if (process.platform === 'win32') fs.writeFileSync(fakeBin, `@echo off\r\nnode "${fakeScript}" %*\r\n`)
else fs.writeFileSync(fakeBin, `#!/bin/sh\nexec node "${fakeScript}" "$@"\n`, { mode: 0o755 })
fs.writeFileSync(childFile, `
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const { apply } = await import(${JSON.stringify(pathToFileURL(repoIndex).href)})
const tools = new Map()
const cleanups = []
let handler = null
const ctx = {
  tools: { register(def) { tools.set(def.name, def); return () => tools.delete(def.name) } },
  webServer: { register(options) { if (options?.path === '/dsh-hands') handler = options.handler; return () => {} } },
  effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); return cleanup },
  get: () => undefined,
  agent: { session: { id: 'caller', cwd: ${JSON.stringify(work)} }, async followup() { return { ok: true } } },
}
apply(ctx, { opencodeBin: ${JSON.stringify(fakeBin)} })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(fn, label) { for (let i=0;i<250;i++){ if(fn())return; await sleep(20) } throw new Error('timeout: '+label) }
function openStream() {
  const req = new EventEmitter(); req.url='/dsh-hands/stream?hand=opencode&key=opencode%2Fsid%3Ases_same'; req.method='GET'
  let output=''; const res={destroyed:false,writableEnded:false,headersSent:false,writeHead(){this.headersSent=true},write(c){output+=String(c)},end(){this.writableEnded=true},on(){}}
  return {req,res,output:()=>output}
}
async function call(url, body) {
  const req=new EventEmitter(); req.url=url; req.method=body===undefined?'GET':'POST'
  const res={status:0,body:'',headersSent:false,writableEnded:false,writeHead(s){this.status=s},end(v){this.body=String(v??'')}}
  const pending=handler(req,res); if(body!==undefined){req.emit('data',JSON.stringify(body));req.emit('end')} await pending
  return {status:res.status,json:JSON.parse(res.body)}
}
const a=openStream(), b=openStream(); await handler(a.req,a.res); await handler(b.req,b.res)
const job=await tools.get('hands_run').execute({to:'opencode',prompt:'A',session:'same',cwd:${JSON.stringify(work)},write:true,async:true},ctx)
await waitFor(()=>fs.existsSync(path.join(${JSON.stringify(control)},'A.started')),'process')
await waitFor(()=>a.output().includes(job.jobId)&&b.output().includes(job.jobId),'both clients receive dispatch')
fs.writeFileSync(path.join(${JSON.stringify(control)},'A.release'),'go')
await waitFor(()=>a.output().includes('"status":"OK"')&&b.output().includes('"status":"OK"'),'both clients receive finish')
const archived=await call('/dsh-hands/archive-session',{key:'opencode/sid:ses_same',hand:'opencode',archived:true})
assert.equal(archived.status,200)
await waitFor(()=>[a,b].every((s)=>(s.output().match(/event: agents/g)||[]).length>=2&&/"sessions":0/.test(s.output().split('event: agents').at(-1))),'both clients receive archive')
a.req.emit('close'); b.req.emit('close'); for(const cleanup of cleanups)cleanup()
console.log('sse multi ok')
`)
const child=spawn(process.execPath,[childFile],{env:{...process.env,USERPROFILE:home,HOME:home},stdio:['ignore','pipe','pipe']})
let stdout='',stderr=''; child.stdout.on('data',c=>stdout+=c); child.stderr.on('data',c=>stderr+=c)
const code=await new Promise(r=>child.on('close',r))
try { assert.equal(code,0,`child failed: ${stderr||stdout}`); assert.match(stdout,/sse multi ok/); console.log('sse multi-client ok') }
finally { fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}) }
