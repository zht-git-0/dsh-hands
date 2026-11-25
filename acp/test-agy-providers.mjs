// agy 第三方供应商测试：node acp/test-agy-providers.mjs
// 1) readAgyProviders：缺文件/坏文件 → 只有 official；示例文件 → 解析出 znbcode 条目
// 2) ensureAgyProvidersFile：缺文件写示例（official + znbcode），已存在不覆盖
// 3) resolveAgyProviderCredentials：official 不抛；provider env 优先、cc-switch 兜底；
//    缺 key 抛清晰错误；未知 provider 抛错
// 4) writeAgyProviderSettings：写 <root>/znbcode/settings.json（{modelProvider:'gemini', model}）
// 5) readCcSwitchAgyEnv：读真实 ~/.cc-switch/cc-switch.db 的 agy 行（znbcode），不打印密钥
// 6) agyProviderContext：official → env null + settingsFile null 且不写 profiles；
//    provider → env 含 GOOGLE_GEMINI_BASE_URL + GEMINI_API_KEY，settingsFile 含 modelProvider='gemini' + model

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  AGY_PROVIDERS_FILE,
  CC_SWITCH_DB,
  agyProviderContext,
  agyProviderSettingsFile,
  isSafeAgyConversationId,
  ensureAgyProvidersFile,
  readAgyProviders,
  readCcSwitchAgyEnv,
  resolveAgyProviderCredentials,
  writeAgyProviderSettings,
} from '../index.js'

const EXAMPLE = {
  official: {},
  znbcode: { baseUrl: 'https://znbcode.com', apiKeyEnv: 'GEMINI_API_KEY', model: 'Gemini 4 Neon (XHigh)' },
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function withEnv(name, value, fn) {
  const saved = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  try {
    return fn()
  } finally {
    if (saved === undefined) delete process.env[name]
    else process.env[name] = saved
  }
}

// ── 1) readAgyProviders ─────────────────────────────────────────────
{
  const dir = tmpDir('agy-providers-1-')
  const missing = readAgyProviders(path.join(dir, 'missing.json'))
  assert.deepEqual(Object.keys(missing), ['official'], '没有文件 → 只有 official')

  const file = path.join(dir, 'hands-providers.json')
  fs.writeFileSync(file, JSON.stringify(EXAMPLE))
  const providers = readAgyProviders(file)
  assert.equal(providers.znbcode.baseUrl, 'https://znbcode.com')
  assert.equal(providers.znbcode.model, 'Gemini 4 Neon (XHigh)')
  assert.equal(providers.znbcode.apiKeyEnv, 'GEMINI_API_KEY')

  fs.writeFileSync(path.join(dir, 'bad.json'), '{ not json')
  assert.deepEqual(Object.keys(readAgyProviders(path.join(dir, 'bad.json'))), ['official'], '坏文件 → official')

  fs.rmSync(dir, { recursive: true, force: true })
  console.log('1) readAgyProviders ok')
}

// ── 2) ensureAgyProvidersFile ───────────────────────────────────────
{
  const dir = tmpDir('agy-providers-2-')
  const file = path.join(dir, 'hands-providers.json')
  ensureAgyProvidersFile(file)
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.deepEqual(Object.keys(parsed), ['official', 'znbcode'], '示例结构：official + znbcode')
  assert.equal(parsed.znbcode.baseUrl, 'https://znbcode.com')
  assert.equal(parsed.znbcode.apiKeyEnv, 'GEMINI_API_KEY')
  assert.equal(parsed.znbcode.model, 'Gemini 4 Neon (XHigh)')
  const before = fs.readFileSync(file, 'utf8')
  ensureAgyProvidersFile(file)
  assert.equal(fs.readFileSync(file, 'utf8'), before, '已存在不覆盖')
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('2) ensureAgyProvidersFile ok')
}

// ── 3) resolveAgyProviderCredentials ────────────────────────────────
{
  const dir = tmpDir('agy-providers-3-')
  const file = path.join(dir, 'hands-providers.json')
  fs.writeFileSync(file, JSON.stringify(EXAMPLE))
  const providers = readAgyProviders(file)

  // official：不抛、不注入
  assert.deepEqual(resolveAgyProviderCredentials('official', providers), {
    name: 'official',
    baseUrl: '',
    apiKey: '',
    model: '',
  })
  assert.deepEqual(
    resolveAgyProviderCredentials('', providers),
    { name: 'official', baseUrl: '', apiKey: '', model: '' },
    '空 provider → official',
  )

  // provider：env 优先；providers.json 的 baseUrl/model 优先于 cc-switch
  const cred = withEnv('GEMINI_API_KEY', 'env-key-123', () => resolveAgyProviderCredentials('znbcode', providers))
  assert.equal(cred.apiKey, 'env-key-123')
  assert.equal(cred.baseUrl, 'https://znbcode.com')
  assert.equal(cred.model, 'Gemini 4 Neon (XHigh)')

  // 没有 providers.json 兜底：baseUrl/model 从 cc-switch 设置里找
  const file2 = path.join(dir, 'providers2.json')
  fs.writeFileSync(file2, JSON.stringify({ official: {}, cconly: { apiKeyEnv: 'GEMINI_API_KEY' } }))
  const providers2 = readAgyProviders(file2)
  const cred2 = withEnv('GEMINI_API_KEY', 'cc-key', () =>
    resolveAgyProviderCredentials('cconly', providers2, {
      GOOGLE_GEMINI_BASE_URL: 'https://cc.example.com',
      GEMINI_API_KEY: 'cc-key',
      GEMINI_MODEL: 'CC Model',
    }),
  )
  assert.equal(cred2.apiKey, 'cc-key')
  assert.equal(cred2.baseUrl, 'https://cc.example.com')
  assert.equal(cred2.model, 'CC Model')

  // 缺 key → 清晰错误（含 provider 名 + 环境变量名）
  withEnv('GEMINI_API_KEY', undefined, () => {
    assert.throws(
      () => resolveAgyProviderCredentials('znbcode', providers, {}),
      (err) => err.message.includes('znbcode') && err.message.includes('GEMINI_API_KEY'),
    )
    assert.throws(
      () => resolveAgyProviderCredentials('nope', providers),
      (err) => /未知 agy 供应商「nope」/.test(err.message),
      '未知 provider 抛错',
    )
  })

  fs.rmSync(dir, { recursive: true, force: true })
  console.log('3) resolveAgyProviderCredentials ok')
}

// ── 4) writeAgyProviderSettings ──────────────────────────────────────
{
  const root = tmpDir('agy-profiles-')
  const file = writeAgyProviderSettings('znbcode', 'Gemini 4 Neon (XHigh)', root)
  assert.equal(file, path.join(root, 'znbcode', 'settings.json'))
  assert.equal(agyProviderSettingsFile('znbcode', root), file)
  assert.throws(() => agyProviderSettingsFile('..', root), /path segment/)
  assert.throws(() => agyProviderSettingsFile('.', root), /path segment/)
  assert.equal(isSafeAgyConversationId('ses_abc-123'), true)
  for (const id of ['', '.', '..', '../x', 'a/b', 'a\\b']) assert.equal(isSafeAgyConversationId(id), false)
  const settings = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(settings.modelProvider, 'gemini')
  assert.equal(settings.model, 'Gemini 4 Neon (XHigh)')
  const file2 = writeAgyProviderSettings('znbcode', '', root)
  assert.equal(file2, file)
  assert.equal(JSON.parse(fs.readFileSync(file2, 'utf8')).model, undefined, '没 model 不写 model 键')
  fs.rmSync(root, { recursive: true, force: true })
  console.log('4) writeAgyProviderSettings ok')
}

// ── 5) readCcSwitchAgyEnv：真实 db ──────────────────────────────────
{
  const cc = readCcSwitchAgyEnv() // 默认 ~/.cc-switch/cc-switch.db
  if (fs.existsSync(CC_SWITCH_DB)) {
    assert.ok(cc.GOOGLE_GEMINI_BASE_URL, '真实 db 的 agy 行应有 GOOGLE_GEMINI_BASE_URL')
    assert.ok(cc.GEMINI_MODEL, '真实 db 的 agy 行应有 GEMINI_MODEL')
    assert.ok(cc.GEMINI_API_KEY, '真实 db 的 agy 行应有 GEMINI_API_KEY（不打印密钥）')
  } else {
    assert.equal(cc.GEMINI_API_KEY, '', 'db 不存在就是空')
  }
  const empty = readCcSwitchAgyEnv(path.join(os.homedir(), '.dsh', 'no-such-db.db'), 'znbcode')
  assert.equal(empty.GEMINI_API_KEY, '')
  console.log('5) readCcSwitchAgyEnv ok')
}

// ── 6) agyProviderContext ───────────────────────────────────────────
{
  const dir = tmpDir('agy-ctx-')
  const file = path.join(dir, 'hands-providers.json')
  fs.writeFileSync(file, JSON.stringify(EXAMPLE))
  const root = path.join(dir, 'profiles')
  const missingDb = path.join(dir, 'no-db.db')

  // official：不注入 env、不写 settings.json（settingsFile 为 null，目录也不建）
  const official = agyProviderContext('official', {
    providersFile: file,
    ccSwitchFile: missingDb,
    profilesRoot: root,
  })
  assert.equal(official.provider, 'official')
  assert.equal(official.env, null)
  assert.equal(official.settingsFile, null)
  assert.equal(fs.existsSync(root), false, 'official 不写 profiles 目录')

  // provider：注入 env（GOOGLE_GEMINI_BASE_URL / GEMINI_API_KEY），写独立 settings.json
  const ctx = withEnv('GEMINI_API_KEY', 'ctx-key-456', () =>
    agyProviderContext('znbcode', { providersFile: file, ccSwitchFile: missingDb, profilesRoot: root }),
  )
  assert.equal(ctx.provider, 'znbcode')
  assert.equal(ctx.env.GEMINI_API_KEY, 'ctx-key-456')
  assert.equal(ctx.env.GOOGLE_GEMINI_BASE_URL, 'https://znbcode.com')
  assert.ok(ctx.settingsFile.startsWith(root), 'settings 在独立目录里')
  const settings = JSON.parse(fs.readFileSync(ctx.settingsFile, 'utf8'))
  assert.equal(settings.modelProvider, 'gemini')
  assert.equal(settings.model, 'Gemini 4 Neon (XHigh)')

  // 缺 key → 清晰错误
  withEnv('GEMINI_API_KEY', undefined, () => {
    assert.throws(
      () => agyProviderContext('znbcode', { providersFile: file, ccSwitchFile: missingDb, profilesRoot: root }),
      /缺 API key.*GEMINI_API_KEY/,
    )
  })

  // 未知 provider → 清晰错误
  assert.throws(() => agyProviderContext('nope', { providersFile: file, ccSwitchFile: missingDb, profilesRoot: root }), /未知 agy 供应商/)

  fs.rmSync(dir, { recursive: true, force: true })
  console.log('6) agyProviderContext ok')
}

console.log('agy providers ok')
