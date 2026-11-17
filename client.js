window.__ModuleLoader__.load({
  id: 'dsh-hands',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // ── 文案 ────────────────────────────────────────────────────────────────
    const NS = 'sidebar.hands';
    const TAB_ID = 'dsh-hands';
    const TAB_KIND = 'hands';
    // 灰度开关：默认仍走旧扁平列表；改成 true 才挂 v2 三列。
    // 旧 createHandsFeed / HandsSidebar 一行不删，切回 false 就是完整回滚路径。
    const USE_V2 = true;
    // 会话右侧栏那个窄版 tab：2026-11-18 爸爸说「还是去掉吧」，主入口只留顶层面板。
    // 代码一行没删，把这里改回 true 就整套回来（tab + 窄版 + 派活自动掀开）。
    const SHOW_SIDEBAR_TAB = false;

    const en = {
      title: 'Hands',
      navLabel: 'Xike',
      pageSub: 'Dispatched hands and the replies they stream back.',
      subtitle: 'Your briefs and the hand’s live output.',
      guide: 'Watch dispatched hands and what they are saying right now.',
      refresh: 'Refresh',
      loading: 'Loading…',
      live: 'Live',
      reconnecting: 'Reconnecting…',
      updated: 'Updated {time}',
      runningCount: '{n} running',
      recent: '{n} recent',
      youToHand: 'You → hand',
      waiting: 'Waiting for output…',
      noOutput: 'No output',
      noJobs: 'No hands dispatched yet',
      noJobsHint: 'Call hands_run or one of the per-hand tools; the brief and the live output show up here.',
      noPrompt: '(no brief)',
      session: 'Session',
      noSession: 'No session',
      writable: 'Can write',
      readOnly: 'Read-only',
      statusOk: 'Succeeded',
      statusError: 'Failed',
      statusTimeout: 'Timed out',
      statusUnparsed: 'Unparsed',
      statusRunning: 'Running',
      statusCancelled: 'Cancelled',
      statusUnknown: 'Unknown',
      exitCode: 'Exit code',
      loadFailed: 'Could not read the dispatch feed.',
      showMore: 'Show older',
      justNow: 'just now',
      minutesAgo: '{n} min ago',
      durationMinSec: '{m}m {s}s',
      durationMin: '{m}m',
      v2PickSession: 'Select a conversation',
      v2PickHand: 'Select a hand',
      v2NoSessions: 'No conversations yet',
      v2NoTurns: 'No turns yet',
      v2Back: 'Back',
      v2Turns: '{n} turns',
      v2Today: '{n} today',
      v2Hands: 'Hands',
      v2TodayTimes: '{n} today',
      v2Idle: 'Idle',
      v2RunningN: '{n} running',
      v2Cancel: 'Cancel',
      v2Rerun: 'Rerun',
      v2Cancelling: 'Cancelling…',
      v2Rerunning: 'Rerunning…',
      v2CancelFailed: 'Could not cancel',
      v2RerunFailed: 'Could not rerun',
      v2Expand: 'Show more',
      v2Collapse: 'Show less',
      v2LoadFull: 'Load full text',
      v2LoadOlder: 'Load older turns',
      v2Tokens: 'tokens',
      handAgy: 'agy · copy',
      handCodex: 'codex · planning',
      handClaude: 'claude · architecture',
      handOpencode: 'opencode · coding',
    };

    const zh = {
      title: '手下任务',
      navLabel: '希可',
      pageSub: '派出去的活，和它们正在回的。',
      subtitle: '你派出去的活，和对面实时返回的输出。',
      guide: '看派出去的手下正在说什么。',
      refresh: '刷新',
      loading: '读取中…',
      live: '实时',
      reconnecting: '重连中…',
      updated: '更新于 {time}',
      runningCount: '{n} 个在跑',
      recent: '最近 {n} 条',
      youToHand: '你 → 手下',
      waiting: '等它开口…',
      noOutput: '没有输出',
      noJobs: '还没派过活',
      noJobsHint: '调用 hands_run 或某个手下的工具之后，这里会显示派活内容和实时输出。',
      noPrompt: '（没有内容）',
      session: '会话',
      noSession: '未命名',
      writable: '可写',
      readOnly: '只读',
      statusOk: '成功',
      statusError: '失败',
      statusTimeout: '超时',
      statusUnparsed: '输出未解析',
      statusRunning: '进行中',
      statusCancelled: '已取消',
      statusUnknown: '未知',
      exitCode: '退出码',
      loadFailed: '读取调度输出失败。',
      showMore: '显示更早',
      justNow: '刚刚',
      minutesAgo: '{n} 分钟前',
      durationMinSec: '{m} 分 {s} 秒',
      durationMin: '{m} 分',
      v2PickSession: '选择一条会话',
      v2PickHand: '选择一个手下',
      v2NoSessions: '还没有会话',
      v2NoTurns: '还没有轮次',
      v2Back: '返回',
      v2Turns: '{n} 轮',
      v2Today: '今日 {n} 轮',
      v2Hands: '手下',
      v2TodayTimes: '今日 {n} 次',
      v2Idle: '空闲',
      v2RunningN: '在跑 {n}',
      v2Cancel: '取消',
      v2Rerun: '重跑',
      v2Cancelling: '取消中…',
      v2Rerunning: '重跑中…',
      v2CancelFailed: '取消失败',
      v2RerunFailed: '重跑失败',
      v2Expand: '展开',
      v2Collapse: '收起',
      v2LoadFull: '加载全文',
      v2LoadOlder: '加载更早',
      v2Tokens: 'tokens',
      handAgy: 'agy · 文案',
      handCodex: 'codex · 规划',
      handClaude: 'claude · 架构',
      handOpencode: 'opencode · 写码',
    };

    // ── 小工具 ──────────────────────────────────────────────────────────────
    const HAND_COLOR = {
      agy: 'var(--dsw-alias-brand-primary)',
      codex: 'var(--dsw-alias-state-business-primary)',
      claude: 'var(--dsw-alias-state-warn-primary)',
      opencode: 'var(--dsw-alias-state-success-primary)',
    };
    const TONE_COLOR = {
      ok: 'var(--dsw-alias-state-success-primary)',
      failed: 'var(--dsw-alias-state-error-primary)',
      timeout: 'var(--dsw-alias-state-warn-primary)',
      running: 'var(--dsw-alias-state-business-primary)',
      unknown: 'var(--dsw-alias-label-tertiary)',
    };

    function handLabel(hand, t) {
      if (hand === 'agy') return t('handAgy');
      if (hand === 'codex') return t('handCodex');
      if (hand === 'claude') return t('handClaude');
      if (hand === 'opencode') return t('handOpencode');
      return hand || '—';
    }

    function isOk(entry) {
      const status = String(entry.status || '').toUpperCase();
      if (status === 'RUNNING') return false;
      if (entry.ok === true) return true;
      if (entry.ok === false) return false;
      return status === 'OK' || status === 'SUCCESS';
    }

    function toneOf(entry) {
      const status = String(entry.status || '').toUpperCase();
      if (status === 'RUNNING' || entry.running) return 'running';
      if (isOk(entry)) return 'ok';
      if (status === 'TIMEOUT') return 'timeout';
      if (status === 'ERROR' || status === 'FAILED' || status === 'UNPARSED') return 'failed';
      return 'unknown';
    }

    function statusLabel(entry, t) {
      const status = String(entry.status || '').toUpperCase();
      if (status === 'RUNNING') return t('statusRunning');
      if (status === 'OK' || status === 'SUCCESS') return t('statusOk');
      if (status === 'TIMEOUT') return t('statusTimeout');
      if (status === 'UNPARSED') return t('statusUnparsed');
      if (status === 'CANCELLED') return t('statusCancelled');
      if (status === 'ERROR' || status === 'FAILED') return t('statusError');
      return status || t('statusUnknown');
    }

    function formatDuration(ms, t) {
      const value = Math.max(0, Number(ms) || 0);
      if (value < 1000) return `${Math.round(value)} ms`;
      if (value < 60000) return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} s`;
      const minutes = Math.floor(value / 60000);
      const seconds = Math.round((value % 60000) / 1000);
      return seconds
        ? t('durationMinSec', { m: minutes, s: seconds })
        : t('durationMin', { m: minutes });
    }

    function formatTime(iso, t) {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '';
      const diff = Date.now() - date.getTime();
      if (diff >= 0 && diff < 45000) return t('justNow');
      if (diff >= 0 && diff < 3600000) {
        return t('minutesAgo', { n: Math.max(1, Math.round(diff / 60000)) });
      }
      return date.toLocaleString(undefined, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    // ── 轮次元信息（纯函数，acp/test-bubbles.mjs 直接断言）────────────────────
    //
    // tokens 的形状每家不一样：codex 给数字（input+output），claude 给
    // {input_tokens, output_tokens, cache_read_input_tokens}，opencode 给
    // {input, output, reasoning, cache:{read,write}}，agy 直接透传上游 usage。
    // 这里只判断「有没有」，有 in/out 就分开显示，否则显示总数。
    function tokenCounts(tokens) {
      if (tokens === null || tokens === undefined || tokens === '') return null;
      if (typeof tokens === 'number') {
        return Number.isFinite(tokens) ? { input: 0, output: 0, total: tokens } : null;
      }
      if (typeof tokens !== 'object') {
        const value = Number(tokens);
        return Number.isFinite(value) ? { input: 0, output: 0, total: value } : null;
      }
      const pick = (...keys) => {
        for (const key of keys) {
          const value = Number(tokens[key]);
          if (Number.isFinite(value) && value !== 0) return value;
        }
        return 0;
      };
      const input = pick('input', 'input_tokens', 'prompt_tokens');
      const output = pick('output', 'output_tokens', 'completion_tokens');
      const total = pick('total', 'total_tokens') || input + output;
      if (!input && !output && !total) return null;
      return { input, output, total };
    }

    function formatTokens(tokens) {
      const counts = tokenCounts(tokens);
      if (!counts) return '';
      const round = (value) => String(Math.round(value));
      if (counts.input && counts.output) return `${round(counts.input)}/${round(counts.output)}`;
      return counts.total ? round(counts.total) : '';
    }

    function formatCost(cost) {
      if (cost === null || cost === undefined || cost === '') return '';
      const value = Number(cost);
      if (!Number.isFinite(value) || value <= 0) return '';
      return `$${value.toFixed(2)}`;
    }

    // 元信息行只给「有值」的片段，顺序固定：耗时 → tokens → cost → 退出码 → 模型。
    // status 单独渲染（要带颜色点），这里不重复。
    function formatTurnMeta(turn, t = (key) => key) {
      const row = turn || {};
      const parts = [];
      const ms = Number(row.ms);
      if (Number.isFinite(ms) && ms > 0) parts.push({ key: 'ms', text: formatDuration(ms, t) });
      const tokens = formatTokens(row.tokens);
      if (tokens) parts.push({ key: 'tokens', text: `${t('v2Tokens')} ${tokens}` });
      const cost = formatCost(row.cost);
      if (cost) parts.push({ key: 'cost', text: cost });
      if (row.exitCode !== undefined && row.exitCode !== null && row.exitCode !== '') {
        parts.push({ key: 'exit', text: `${t('exitCode')} ${row.exitCode}` });
      }
      if (row.model) parts.push({ key: 'model', text: String(row.model) });
      return parts;
    }

    function turnIsRunning(turn) {
      if (!turn) return false;
      if (turn.running === true) return true;
      return String(turn.status || '').toUpperCase() === 'RUNNING';
    }

    // 气泡正文回落：liveByTurn（服务端 live 增量 + /turn 增量都按绝对偏移拼在这里）
    // → 单独缓存的拉取正文 → turn.excerpt（可能被截，最后的兜底）。
    // cursor 只表示「还在跑」，光标由 BubbleAgent / Stream 画。
    function resolveTurnBody(turn, live, fetched) {
      const row = turn || {};
      const liveText = typeof live === 'string' ? live : '';
      if (liveText) return { text: liveText, source: 'live', cursor: turnIsRunning(row) };
      const fetchedText = typeof fetched === 'string' ? fetched : '';
      if (fetchedText) return { text: fetchedText, source: 'fetched', cursor: turnIsRunning(row) };
      const excerpt = typeof row.excerpt === 'string' ? row.excerpt : '';
      if (excerpt) return { text: excerpt, source: 'excerpt', cursor: turnIsRunning(row) };
      return { text: '', source: 'none', cursor: turnIsRunning(row) };
    }

    function endpointOf(name) {
      const base =
        typeof document !== 'undefined' && document.baseURI
          ? document.baseURI
          : typeof location !== 'undefined'
            ? location.href
            : 'http://127.0.0.1/';
      return new URL(name, base).href;
    }

    // ── v2 数据层：一个 store，三列各取一片 ─────────────────────────────────
    //
    // 三列各自 useSyncExternalStore(store.subscribe, () => store.snapshotSlice(name))。
    // 切片只在对应 revision 变了才换引用 —— 每次都新建对象会让 React 一帧一帧重渲整棵树。
    const SEL_STORAGE_KEY = 'dsh.hands.sel';
    const EMPTY_LIST = [];
    // 一页轮次数；loadOlderTurns 用最早的 startedAt 作 before 游标。
    const TURN_PAGE = 50;
    // 一次 ensureTurnBody 最多翻多少页，防止服务端 eof 一直算错时死循环。
    const BODY_PAGE_MAX = 40;
    const SLICE_BY_FIELD = {
      agents: 'agents',
      sessionsByHand: 'sessions',
      turnsByKey: 'turns',
      liveByTurn: 'live',
      selection: 'selection',
      phase: 'meta',
      connected: 'meta',
      error: 'meta',
      checkedAt: 'meta',
    };

    function findSession(sessions, key) {
      const wanted = String(key || '');
      if (!wanted) return null;
      const rows = Array.isArray(sessions) ? sessions : [];
      return (
        rows.find(
          (row) => String(row?.key || '') === wanted || String(row?.sessionKey || '') === wanted,
        ) || null
      );
    }

    // 会话按服务端给的 lastAt 取最新；空会话返回 null。
    function latestSession(sessions) {
      let best = null;
      for (const row of Array.isArray(sessions) ? sessions : []) {
        if (!best || String(row?.lastAt || '') > String(best?.lastAt || '')) best = row;
      }
      return best;
    }

    // 服务端 turnsFor 按 startedAt 倒序，turns[0] 就是「最后一轮」。
    function resolveTurnId(turns, wanted) {
      const rows = Array.isArray(turns) ? turns : [];
      const id = String(wanted || '');
      if (id && rows.some((row) => String(row?.id || '') === id)) return id;
      return rows.length ? String(rows[0]?.id || '') : '';
    }

    // v2 的唯一状态源。SSE 优先，4s 无首包退轮询；轮询期间继续每隔一会儿试 SSE。
    // options 只给测试注入（fetch / storage / EventSource / now），生产不传。
    function createHandsStore(options = {}) {
      const fetchImpl =
        options.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
      const storage =
        options.storage !== undefined
          ? options.storage
          : typeof localStorage !== 'undefined'
            ? localStorage
            : null;
      const EventSourceImpl =
        options.EventSourceImpl !== undefined
          ? options.EventSourceImpl
          : typeof EventSource !== 'undefined'
            ? EventSource
            : null;
      const now = typeof options.now === 'function' ? options.now : Date.now;

      let state = {
        phase: 'idle',
        agents: EMPTY_LIST,
        sessionsByHand: {},
        turnsByKey: {},
        liveByTurn: {},
        selection: { hand: '', key: '', turnId: '' },
        connected: false,
        error: null,
        checkedAt: '',
      };

      const listeners = new Set();
      const rev = { agents: 0, sessions: 0, turns: 0, live: 0, selection: 0, meta: 0 };
      const sliceCache = new Map();
      // id → 已经拼进 liveByTurn 的绝对字符数，用来丢掉重复的 live 帧
      const liveApplied = new Map();
      const sessionSeq = new Map();
      const turnSeq = new Map();
      // key → 还有没有更早的一页；bodyDone 保证同一轮正文只拉一次。
      const turnsMore = new Map();
      const olderSeq = new Map();
      const bodyPending = new Map();
      const bodyDone = new Set();
      // 一次只拉两轮正文：选中会话时可能一次挂上几十个 Turn，别把本地 HTTP 打满。
      const bodyQueue = [];
      const bodyWaiters = new Map();
      let bodyDraining = false;

      let started = false;
      // 同一个 store 可能被两处同时挂载（顶层面板 + 右侧栏 tab）：
      // 引用计数保证只有最后一个卸载才真正断流，先卸载的那份不会把别人的流掐了。
      let startDepth = 0;
      let mode = 'idle'; // idle | sse | poll
      let streamKey = '';
      let source = null;
      let watchdog = null;
      let pollAgentsTimer = null;
      let pollTurnsTimer = null;
      let retryTimer = null;
      let sseErrors = 0;
      // stop() 递增；在途请求回来时对不上号就直接丢弃，别把已停止的 store 又写活
      let lifeToken = 0;

      function emit(patch) {
        const prev = state;
        let changed = false;
        for (const key of Object.keys(patch)) {
          if (Object.is(prev[key], patch[key])) continue;
          changed = true;
          const slice = SLICE_BY_FIELD[key];
          if (slice) rev[slice] += 1;
        }
        if (!changed) return;
        state = { ...prev, ...patch };
        for (const listener of [...listeners]) {
          try {
            listener();
          } catch {
            /* 一个订阅者坏了不能拖垮其它订阅者 */
          }
        }
      }

      function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }

      function getSnapshot() {
        return state;
      }

      function stampOf(name) {
        if (name === 'agents') return `${rev.agents}:${rev.selection}:${rev.meta}`;
        if (name === 'sessions') return `${rev.sessions}:${rev.selection}:${rev.meta}`;
        if (name === 'turns') return `${rev.turns}:${rev.selection}`;
        if (name === 'live') return `${rev.live}:${rev.selection}`;
        if (name === 'selection') return String(rev.selection);
        if (name === 'meta') return String(rev.meta);
        return `${rev.agents}:${rev.sessions}:${rev.turns}:${rev.live}:${rev.selection}:${rev.meta}`;
      }

      function buildSlice(name) {
        const sel = state.selection;
        if (name === 'agents') {
          return {
            agents: state.agents,
            hand: sel.hand,
            connected: state.connected,
            phase: state.phase,
            error: state.error,
            checkedAt: state.checkedAt,
          };
        }
        if (name === 'sessions') {
          return {
            hand: sel.hand,
            sessions: state.sessionsByHand[sel.hand] || EMPTY_LIST,
            selectedKey: sel.key,
            phase: state.phase,
          };
        }
        if (name === 'turns') {
          return { key: sel.key, turns: state.turnsByKey[sel.key] || EMPTY_LIST, turnId: sel.turnId };
        }
        if (name === 'live') return { key: sel.key, liveByTurn: state.liveByTurn };
        if (name === 'selection') return sel;
        return {
          phase: state.phase,
          connected: state.connected,
          error: state.error,
          checkedAt: state.checkedAt,
        };
      }

      function snapshotSlice(name) {
        const stamp = stampOf(name);
        const cached = sliceCache.get(name);
        if (cached && cached.stamp === stamp) return cached.value;
        const value = buildSlice(name);
        sliceCache.set(name, { stamp, value });
        return value;
      }

      function readSavedSelection() {
        if (!storage) return null;
        try {
          const raw = storage.getItem(SEL_STORAGE_KEY);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object') return null;
          return {
            hand: String(parsed.hand || ''),
            key: String(parsed.key || ''),
            turnId: String(parsed.turnId || ''),
            at: String(parsed.at || ''),
          };
        } catch {
          return null;
        }
      }

      function writeSavedSelection() {
        if (!storage) return;
        try {
          storage.setItem(
            SEL_STORAGE_KEY,
            JSON.stringify({
              hand: state.selection.hand,
              key: state.selection.key,
              turnId: state.selection.turnId,
              at: new Date(now()).toISOString(),
            }),
          );
        } catch {
          /* 隐私模式 / 配额满：记不住就算了，不影响面板 */
        }
      }

      async function getJson(path) {
        if (!fetchImpl) throw new Error('fetch unavailable');
        const response = await fetchImpl(endpointOf(path), {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
        });
        if (!response || !response.ok) throw new Error(`HTTP ${response ? response.status : 0}`);
        return response.json();
      }

      function failureOf(error) {
        return String(error?.message ?? error);
      }

      // 只有 cancel / rerun 走 POST；服务端约定 {ok:false,error} 也算失败。
      async function postJson(path, payload) {
        if (!fetchImpl) throw new Error('fetch unavailable');
        const response = await fetchImpl(endpointOf(path), {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify(payload || {}),
        });
        let data = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }
        if (!response || !response.ok || data?.ok === false) {
          throw new Error(String(data?.error || `HTTP ${response ? response.status : 0}`));
        }
        return data || {};
      }

      async function loadAgents() {
        const life = lifeToken;
        try {
          const data = await getJson('dsh-hands/agents');
          if (life !== lifeToken) return null;
          const agents = Array.isArray(data?.agents) ? data.agents : [];
          emit({
            agents,
            checkedAt: String(data?.checkedAt || ''),
            phase: 'ready',
            connected: true,
            error: null,
          });
          return agents;
        } catch (error) {
          if (life !== lifeToken) return null;
          emit({
            connected: false,
            error: failureOf(error),
            phase: state.agents.length ? 'ready' : 'error',
          });
          return null;
        }
      }

      async function loadSessions(hand) {
        const wanted = String(hand || '');
        if (!wanted) return [];
        const seq = (sessionSeq.get(wanted) || 0) + 1;
        sessionSeq.set(wanted, seq);
        const life = lifeToken;
        try {
          const data = await getJson(`dsh-hands/sessions?hand=${encodeURIComponent(wanted)}`);
          if (life !== lifeToken) return [];
          if (sessionSeq.get(wanted) !== seq) return []; // 更晚的请求已经出发，旧包不要
          const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
          emit({
            sessionsByHand: { ...state.sessionsByHand, [wanted]: sessions },
            connected: true,
            error: null,
          });
          return sessions;
        } catch (error) {
          if (life !== lifeToken) return [];
          emit({
            connected: false,
            error: failureOf(error),
            phase: state.agents.length ? 'ready' : 'error',
          });
          return [];
        }
      }

      async function loadTurns(key) {
        const wanted = String(key || '');
        if (!wanted) return [];
        const seq = (turnSeq.get(wanted) || 0) + 1;
        turnSeq.set(wanted, seq);
        const life = lifeToken;
        try {
          const data = await getJson(
            `dsh-hands/turns?key=${encodeURIComponent(wanted)}&limit=${TURN_PAGE}`,
          );
          if (life !== lifeToken) return [];
          if (turnSeq.get(wanted) !== seq) return [];
          const turns = Array.isArray(data?.turns) ? data.turns : [];
          turnsMore.set(wanted, turns.length >= TURN_PAGE);
          emit({
            turnsByKey: { ...state.turnsByKey, [wanted]: turns },
            connected: true,
            error: null,
          });
          if (state.selection.key === wanted) {
            const nextTurn = resolveTurnId(turns, state.selection.turnId);
            if (nextTurn !== state.selection.turnId) {
              emit({ selection: { ...state.selection, turnId: nextTurn } });
              writeSavedSelection();
            }
          }
          return turns;
        } catch (error) {
          if (life !== lifeToken) return [];
          emit({
            connected: false,
            error: failureOf(error),
            phase: state.agents.length ? 'ready' : 'error',
          });
          return [];
        }
      }

      // 增量拼正文。next 是服务端算好的绝对偏移：next <= 已拼长度就是重复帧；
      // 有重叠时只取超出部分，保证同一段 delta 拼两次也不会翻倍。
      function applyDelta(id, delta, next, from) {
        const turnId = String(id || '');
        if (!turnId) return false;
        const piece = String(delta ?? '');
        const applied = liveApplied.get(turnId) || 0;
        const hasNext = next !== null && next !== undefined && next !== '' && Number.isFinite(Number(next));
        if (hasNext) {
          const nextAt = Math.max(0, Math.trunc(Number(next)));
          if (nextAt <= applied) return false;
          const hasFrom = from !== null && from !== undefined && from !== '' && Number.isFinite(Number(from));
          const startAt = hasFrom ? Math.max(0, Math.trunc(Number(from))) : nextAt - piece.length;
          const tail = piece.slice(Math.min(Math.max(0, applied - startAt), piece.length));
          liveApplied.set(turnId, nextAt);
          if (!tail) return false;
          emit({ liveByTurn: { ...state.liveByTurn, [turnId]: (state.liveByTurn[turnId] || '') + tail } });
          return true;
        }
        if (!piece) return false;
        liveApplied.set(turnId, applied + piece.length);
        emit({ liveByTurn: { ...state.liveByTurn, [turnId]: (state.liveByTurn[turnId] || '') + piece } });
        return true;
      }

      function appendLive(key, id, delta, next) {
        const wantedKey = String(key || '');
        // 服务端只推选中 key；万一切 key 时收到旧连接残留的帧，丢掉
        if (wantedKey && state.selection.key && wantedKey !== state.selection.key) return false;
        return applyDelta(id, delta, next);
      }

      async function loadTurnBody(id, from = 0) {
        const wanted = String(id || '');
        if (!wanted) return null;
        const life = lifeToken;
        try {
          const offset = Math.max(0, Math.trunc(Number(from) || 0));
          const data = await getJson(
            `dsh-hands/turn?id=${encodeURIComponent(wanted)}&from=${offset}`,
          );
          if (life !== lifeToken) return null;
          applyDelta(data?.id || wanted, data?.delta, data?.next, data?.from);
          return data;
        } catch (error) {
          if (life !== lifeToken) return null;
          emit({ connected: false, error: failureOf(error) });
          return null;
        }
      }

      // 更早的一页：before 用当前最早一轮的 startedAt；回来的行按 id 去重后
      // 和现有列表合并，仍然保持 startedAt 倒序（TurnList 渲染时再 reverse）。
      async function loadOlderTurns(key) {
        const wanted = String(key || '');
        if (!wanted || turnsMore.get(wanted) === false) return [];
        const rows = state.turnsByKey[wanted] || [];
        const earliest = String(rows[rows.length - 1]?.startedAt || '');
        if (!earliest) return [];
        const seq = (olderSeq.get(wanted) || 0) + 1;
        olderSeq.set(wanted, seq);
        const life = lifeToken;
        try {
          const data = await getJson(
            `dsh-hands/turns?key=${encodeURIComponent(wanted)}&before=${encodeURIComponent(earliest)}&limit=${TURN_PAGE}`,
          );
          if (life !== lifeToken) return [];
          if (olderSeq.get(wanted) !== seq) return [];
          const incoming = Array.isArray(data?.turns) ? data.turns : [];
          const existing = state.turnsByKey[wanted] || [];
          const seen = new Set(existing.map((row) => String(row?.id || '')).filter(Boolean));
          const extra = incoming.filter((row) => {
            const id = String(row?.id || '');
            return !id || !seen.has(id);
          });
          const merged = existing.concat(extra).sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
          turnsMore.set(wanted, incoming.length >= TURN_PAGE);
          emit({ turnsByKey: { ...state.turnsByKey, [wanted]: merged }, error: null });
          return merged;
        } catch (error) {
          if (life !== lifeToken) return [];
          emit({ connected: false, error: failureOf(error) });
          return [];
        }
      }

      function turnsMoreFor(key) {
        const wanted = String(key || '');
        if (!wanted) return false;
        return turnsMore.get(wanted) !== false;
      }

      // 正文增量补齐：从 store 已经拼到的绝对偏移继续要，直到 eof。
      // 同一轮并发调用共享一个 promise，成功一次就记住了（bodyDone），
      // 失败不记，下次滚动/展开还能重试。
      // 真正发请求走队列（一次 2 条）：选中会话时几十个气泡同时挂载，串行化更稳。
      async function fetchTurnBody(id) {
        let from = Number(liveApplied.get(id));
        if (!Number.isFinite(from)) from = String(state.liveByTurn[id] || '').length;
        for (let page = 0; page < BODY_PAGE_MAX; page += 1) {
          const data = await loadTurnBody(id, from);
          if (!data) return null;
          const delta = String(data?.delta ?? '');
          const next = Number(data?.next);
          if (Number.isFinite(next)) from = Math.max(from, next);
          else from += delta.length;
          if (data.eof || !delta) break;
        }
        bodyDone.add(id);
        return true;
      }

      async function drainBodyQueue() {
        if (bodyDraining) return;
        bodyDraining = true;
        try {
          while (bodyQueue.length) {
            const batch = bodyQueue.splice(0, 2);
            await Promise.all(
              batch.map(async (id) => {
                let ok = null;
                try {
                  ok = await fetchTurnBody(id);
                } catch {
                  ok = null;
                }
                bodyPending.delete(id);
                const waiter = bodyWaiters.get(id);
                bodyWaiters.delete(id);
                waiter?.(ok);
              }),
            );
          }
        } finally {
          bodyDraining = false;
        }
      }

      function ensureTurnBody(id, priority) {
        const wanted = String(id || '');
        if (!wanted) return Promise.resolve(null);
        if (bodyDone.has(wanted)) return Promise.resolve(null);
        const inflight = bodyPending.get(wanted);
        if (inflight) return inflight;
        const job = new Promise((resolve) => {
          bodyWaiters.set(wanted, resolve);
        });
        bodyPending.set(wanted, job);
        if (priority) bodyQueue.unshift(wanted);
        else bodyQueue.push(wanted);
        void drainBodyQueue();
        return job;
      }

      // 取消 / 重跑：成功后刷新该会话轮次和 agent 计数（今日数、运行数都会变）。
      async function afterTurnAction() {
        const key = state.selection.key;
        const hand = state.selection.hand;
        if (key) loadTurns(key);
        if (hand) loadSessions(hand);
        loadAgents();
      }

      async function cancelTurn(id) {
        const wanted = String(id || '');
        if (!wanted) return { ok: false, error: 'id is required' };
        try {
          const data = await postJson('dsh-hands/cancel', { id: wanted });
          await afterTurnAction();
          bodyDone.delete(wanted);
          return { ok: true, data };
        } catch (error) {
          return { ok: false, error: failureOf(error) };
        }
      }

      async function rerunTurn(id, prompt) {
        const wanted = String(id || '');
        if (!wanted) return { ok: false, error: 'id is required' };
        try {
          const payload = prompt === undefined || prompt === null ? { id: wanted } : { id: wanted, prompt: String(prompt) };
          const data = await postJson('dsh-hands/rerun', payload);
          await afterTurnAction();
          return { ok: true, data };
        } catch (error) {
          return { ok: false, error: failureOf(error) };
        }
      }

      function applySelection(next) {
        const hand = String(next?.hand || '');
        const key = String(next?.key || '');
        const turnId = key ? String(next?.turnId || '') : '';
        const prev = state.selection;
        if (prev.hand === hand && prev.key === key && prev.turnId === turnId) return;
        const keyChanged = prev.key !== key;
        emit({ selection: { hand, key, turnId } });
        writeSavedSelection();
        if (hand && state.sessionsByHand[hand] === undefined) loadSessions(hand);
        const pending =
          key && (keyChanged || state.turnsByKey[key] === undefined) ? loadTurns(key) : null;
        if (keyChanged) restartStream();
        return pending;
      }

      function select(hand, key, turnId) {
        const nextHand = String(hand || '');
        const givenKey = String(key || '');
        // 只点 agent 名字时保留同 hand 下已选会话，别把右侧清空
        const keep = !givenKey && nextHand === state.selection.hand;
        const nextKey = keep ? state.selection.key : givenKey;
        const nextTurn = keep ? state.selection.turnId : String(turnId || '');
        applySelection({ hand: nextHand, key: nextKey, turnId: nextTurn });
        if (!nextKey && nextHand) {
          // 还没选会话：等列表回来落到 lastAt 最新的一条
          loadSessions(nextHand).then((sessions) => {
            if (state.selection.hand !== nextHand || state.selection.key) return;
            const latest = latestSession(sessions);
            if (latest) {
              applySelection({ hand: nextHand, key: String(latest.key || ''), turnId: '' });
            }
          });
        }
      }

      function selectTurn(turnId) {
        const key = state.selection.key;
        if (!key) return;
        applySelection({ hand: state.selection.hand, key, turnId: String(turnId || '') });
        const id = String(turnId || '');
        if (id && state.liveByTurn[id] === undefined) ensureTurnBody(id, true);
      }

      // 读存档 → key 还在就恢复 → 否则该 hand 下 lastAt 最新 → 否则第一个 hand 的第一个会话。
      async function resolveSelection(saved) {
        const hands = state.agents.map((row) => String(row?.hand || '')).filter(Boolean);
        if (!hands.length) return null;
        const prefer = String(saved?.hand || '');
        const order = prefer && hands.includes(prefer) ? [prefer, ...hands.filter((h) => h !== prefer)] : hands;
        const savedKey = String(saved?.key || '');

        let hand = order[0];
        let sessions = await loadSessions(hand);

        if (savedKey) {
          let hit = findSession(sessions, savedKey);
          if (!hit) {
            const cut = savedKey.indexOf('/');
            const keyHand = cut > 0 ? savedKey.slice(0, cut) : '';
            if (keyHand && keyHand !== hand && hands.includes(keyHand)) {
              const other = await loadSessions(keyHand);
              const otherHit = findSession(other, savedKey);
              if (otherHit) {
                hit = otherHit;
                hand = keyHand;
                sessions = other;
              }
            }
          }
          if (hit) return { hand, key: String(hit.key || savedKey), turnId: String(saved?.turnId || '') };
        }

        if (!sessions.length) {
          for (const other of order.slice(1)) {
            const rows = await loadSessions(other);
            if (rows.length) {
              hand = other;
              sessions = rows;
              break;
            }
          }
        }
        const latest = latestSession(sessions);
        return { hand, key: latest ? String(latest.key || '') : '', turnId: '' };
      }

      async function refreshAll() {
        const life = lifeToken;
        emit({ phase: state.agents.length ? state.phase : 'loading', error: null });
        const agents = await loadAgents();
        if (agents === null || life !== lifeToken) return;
        const selectionRev = rev.selection;
        const resolved = await resolveSelection(readSavedSelection());
        if (life !== lifeToken) return;
        // 这期间用户自己点了别的会话：别拿存档把人家拨回去
        if (rev.selection !== selectionRev) return;
        if (!resolved) {
          emit({ phase: 'ready' });
          return;
        }
        const pending = applySelection(resolved);
        emit({ phase: 'ready' });
        if (pending) await pending;
      }

      // ── SSE / 轮询 ────────────────────────────────────────────────────────
      function closeSource() {
        if (watchdog) {
          clearTimeout(watchdog);
          watchdog = null;
        }
        if (source) {
          try {
            source.close();
          } catch {
            /* 已关 */
          }
          source = null;
        }
      }

      function clearPolling() {
        if (pollAgentsTimer) {
          clearInterval(pollAgentsTimer);
          pollAgentsTimer = null;
        }
        if (pollTurnsTimer) {
          clearInterval(pollTurnsTimer);
          pollTurnsTimer = null;
        }
        if (retryTimer) {
          clearInterval(retryTimer);
          retryTimer = null;
        }
      }

      function pollAgentsOnce() {
        if (!started) return;
        loadAgents().then((agents) => {
          if (!agents || !started) return;
          if (state.selection.hand) loadSessions(state.selection.hand);
        });
      }

      function pollTurnsOnce() {
        if (!started || !state.selection.key) return;
        const key = state.selection.key;
        loadTurns(key).then((turns) => {
          // 轮询回退时没有 live 事件：对还在跑的轮次按已拼偏移再要一段，
          // 这样退到轮询也能看到正文在长（SSE 在线时不会走这里）。
          for (const turn of Array.isArray(turns) ? turns : []) {
            if (!turnIsRunning(turn)) continue;
            const id = String(turn.id || '');
            const from = Number(liveApplied.get(id));
            if (id && Number.isFinite(from)) loadTurnBody(id, from);
          }
        });
      }

      function startPolling() {
        if (!started) return;
        mode = 'poll';
        clearPolling();
        pollAgentsOnce();
        pollTurnsOnce();
        pollAgentsTimer = setInterval(pollAgentsOnce, 5000);
        pollTurnsTimer = setInterval(pollTurnsOnce, 3000);
        // 轮询期间照样试着连 SSE，连上就切回去
        retryTimer = setInterval(() => {
          if (mode === 'poll' && started) connectStream();
        }, 15000);
      }

      function parseEvent(event) {
        try {
          return JSON.parse(event?.data ?? '{}');
        } catch {
          return null;
        }
      }

      function handleAgentsEvent(event) {
        const data = parseEvent(event);
        if (!data || !Array.isArray(data.agents)) return;
        emit({
          agents: data.agents,
          checkedAt: String(data.checkedAt || state.checkedAt),
          phase: 'ready',
          error: null,
        });
      }

      function handleSessionsEvent(event) {
        const data = parseEvent(event);
        if (!data || !Array.isArray(data.sessions)) return;
        const hand = String(data.hand || state.selection.hand);
        if (!hand) return;
        emit({
          sessionsByHand: { ...state.sessionsByHand, [hand]: data.sessions },
          phase: 'ready',
          error: null,
        });
      }

      function handleTurnsEvent(event) {
        const data = parseEvent(event);
        if (!data || !Array.isArray(data.turns)) return;
        const key = String(data.key || state.selection.key);
        if (!key) return;
        emit({ turnsByKey: { ...state.turnsByKey, [key]: data.turns } });
        if (state.selection.key === key) {
          const nextTurn = resolveTurnId(data.turns, state.selection.turnId);
          if (nextTurn !== state.selection.turnId) {
            emit({ selection: { ...state.selection, turnId: nextTurn } });
            writeSavedSelection();
          }
        }
      }

      function handleLiveEvent(event) {
        const data = parseEvent(event);
        if (!data) return;
        appendLive(data.key, data.id, data.delta, data.next);
      }

      function connectStream() {
        if (!started) return;
        closeSource();
        const key = state.selection.key;
        streamKey = key;
        if (!EventSourceImpl) {
          startPolling();
          return;
        }
        let nextSource;
        try {
          nextSource = new EventSourceImpl(
            endpointOf(`dsh-hands/stream?key=${encodeURIComponent(key)}`),
          );
        } catch {
          startPolling();
          return;
        }
        source = nextSource;
        mode = 'sse';
        sseErrors = 0;
        // 桌面端走自定义协议时 EventSource 可能连上却收不到 body：4 秒没首包就退轮询
        watchdog = setTimeout(() => {
          watchdog = null;
          if (source !== nextSource) return;
          closeSource();
          startPolling();
        }, 4000);

        const firstPacket = () => {
          if (watchdog) {
            clearTimeout(watchdog);
            watchdog = null;
          }
          if (mode === 'poll') clearPolling();
          mode = 'sse';
          emit({ connected: true, error: null });
        };

        const on = (name, handler) => {
          try {
            nextSource.addEventListener(name, handler);
          } catch {
            /* 有的实现不认某个事件名 */
          }
        };

        on('open', firstPacket);
        on('agents', (event) => {
          firstPacket();
          handleAgentsEvent(event);
        });
        on('sessions', (event) => {
          firstPacket();
          handleSessionsEvent(event);
        });
        on('turns', (event) => {
          firstPacket();
          handleTurnsEvent(event);
        });
        on('live', (event) => {
          firstPacket();
          handleLiveEvent(event);
        });
        on('error', () => {
          if (source !== nextSource) return;
          emit({ connected: false });
          sseErrors += 1;
          if (sseErrors >= 2) {
            closeSource();
            startPolling();
          }
        });
      }

      function restartStream() {
        if (!started) return;
        if (mode === 'sse' && source && streamKey === state.selection.key) return;
        connectStream();
      }

      function start() {
        startDepth += 1;
        if (started) return;
        started = true;
        emit({ phase: state.agents.length ? state.phase : 'loading', error: null });
        refreshAll();
        connectStream();
      }

      function stop() {
        if (startDepth > 0) startDepth -= 1;
        if (startDepth > 0) return;
        started = false;
        lifeToken += 1;
        closeSource();
        clearPolling();
        mode = 'idle';
        emit({ connected: false });
      }

      return {
        subscribe,
        getSnapshot,
        snapshotSlice,
        start,
        stop,
        select,
        selectTurn,
        refreshAll,
        loadAgents,
        loadSessions,
        loadTurns,
        loadOlderTurns,
        turnsMore: turnsMoreFor,
        loadTurnBody,
        ensureTurnBody,
        cancelTurn,
        rerunTurn,
        appendLive,
        // 测试用：断言 timer / EventSource / live 记账都清干净
        debug() {
          return {
            started,
            mode,
            streamKey,
            hasSource: !!source,
            watchdog: !!watchdog,
            pollAgentsTimer: !!pollAgentsTimer,
            pollTurnsTimer: !!pollTurnsTimer,
            retryTimer: !!retryTimer,
            listeners: listeners.size,
            liveApplied: new Map(liveApplied),
          };
        },
      };
    }

    // ── 实时订阅：SSE 优先，失败后退回轮询 ─────────────────────────────────
    //
    // 服务端只在「正在跑的输出变了」时推 running 事件，收尾或新日志才推完整
    // snapshot。这样 250ms 一次也不会把几百条历史来回搬。
    function createHandsFeed() {
      let state = {
        phase: 'loading',
        running: [],
        entries: [],
        checkedAt: '',
        revision: 0,
        connected: false,
        error: '',
      };
      const listeners = new Set();
      let source = null;
      let pollTimer = null;
      let watchdog = null;
      let errors = 0;

      function emit(patch) {
        state = { ...state, ...patch };
        for (const listener of [...listeners]) {
          try {
            listener();
          } catch {
            /* 一个订阅者坏了不能拖垮其它订阅者 */
          }
        }
      }

      function applyAll(data) {
        emit({
          phase: 'ready',
          running: Array.isArray(data.running) ? data.running : [],
          entries: Array.isArray(data.entries) ? data.entries : [],
          checkedAt: String(data.checkedAt || ''),
          revision: Number(data.revision || 0),
          error: '',
        });
      }

      async function pollOnce() {
        try {
          const response = await fetch(endpointOf('dsh-hands/log?n=80'), {
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { accept: 'application/json' },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          applyAll(await response.json());
          emit({ connected: true });
        } catch (error) {
          emit({
            connected: false,
            error: String(error?.message ?? error),
            phase: state.entries.length || state.running.length ? 'ready' : 'error',
          });
        }
      }

      function clearWatchdog() {
        if (watchdog) {
          clearTimeout(watchdog);
          watchdog = null;
        }
      }

      function startPoll() {
        if (pollTimer) return;
        clearWatchdog();
        pollOnce();
        pollTimer = setInterval(pollOnce, 800);
      }

      function stopPoll() {
        if (!pollTimer) return;
        clearInterval(pollTimer);
        pollTimer = null;
      }

      function connect() {
        if (source || pollTimer) return;
        if (typeof EventSource === 'undefined') {
          startPoll();
          return;
        }
        try {
          source = new EventSource(endpointOf('dsh-hands/stream'));
        } catch {
          source = null;
          startPoll();
          return;
        }
        // 桌面端如果走自定义协议，EventSource 可能连上却一直收不到 body；
        // 4 秒内没有第一份快照就退回轮询。
        watchdog = setTimeout(() => {
          if (!source) return;
          try {
            source.close();
          } catch {
            /* 已关 */
          }
          source = null;
          startPoll();
        }, 4000);
        source.addEventListener('open', () => {
          errors = 0;
          emit({ connected: true, error: '' });
        });
        source.addEventListener('snapshot', (event) => {
          try {
            applyAll(JSON.parse(event.data));
            clearWatchdog();
            emit({ connected: true });
          } catch {
            /* 坏包忽略，下一包会补上 */
          }
        });
        source.addEventListener('running', (event) => {
          try {
            const data = JSON.parse(event.data);
            clearWatchdog();
            emit({
              phase: 'ready',
              running: Array.isArray(data.running) ? data.running : [],
              checkedAt: String(data.checkedAt || state.checkedAt),
              revision: Number(data.revision || state.revision),
              connected: true,
            });
          } catch {
            /* 同上 */
          }
        });
        source.addEventListener('error', () => {
          emit({
            connected: false,
            phase: state.entries.length || state.running.length ? 'ready' : 'error',
          });
          errors += 1;
          // 连不上几次就退到轮询；EventSource 自己会重试，但别让它一直干等。
          if (errors >= 4 && source) {
            try {
              source.close();
            } catch {
              /* 已关 */
            }
            source = null;
            startPoll();
          }
        });
      }

      function stop() {
        clearWatchdog();
        if (source) {
          try {
            source.close();
          } catch {
            /* 已关 */
          }
          source = null;
        }
        stopPoll();
      }

      return {
        subscribe(listener) {
          listeners.add(listener);
          if (listeners.size === 1) connect();
          return () => {
            listeners.delete(listener);
            if (!listeners.size) stop();
          };
        },
        getSnapshot() {
          return state;
        },
        refresh() {
          stop();
          connect();
          if (!source && !pollTimer) startPoll();
        },
      };
    }

    function useFeed(feed) {
      return React.useSyncExternalStore(
        React.useCallback((listener) => feed.subscribe(listener), [feed]),
        feed.getSnapshot,
        feed.getSnapshot,
      );
    }

    function useTicker(active) {
      const [, setTick] = React.useState(0);
      React.useEffect(() => {
        if (!active) return undefined;
        const timer = setInterval(() => setTick((value) => value + 1), 1000);
        return () => clearInterval(timer);
      }, [active]);
    }

    // ── 图标（右侧栏引导页也用它）───────────────────────────────────────────
    function HandsIcon({ size = 16 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('path', {
          d: 'M4.2 4.2 8 8l3.8-3.8M8 8v4.5',
          stroke: 'currentColor',
          strokeWidth: 1.15,
          strokeLinecap: 'round',
        }),
        h('circle', { cx: 4.2, cy: 4.2, r: 1.45, fill: 'currentColor' }),
        h('circle', { cx: 11.8, cy: 4.2, r: 1.45, fill: 'currentColor' }),
        h('circle', { cx: 8, cy: 8, r: 1.3, fill: 'currentColor', opacity: 0.65 }),
        h('circle', { cx: 8, cy: 12.6, r: 1.45, fill: 'currentColor' }),
      );
    }

    // ── 样式 ────────────────────────────────────────────────────────────────
    const CSS = `
      .dsh-hands-panel{display:flex;flex-direction:column;flex:auto;height:100%;min-width:0;min-height:0;width:100%;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
      .dsh-hands-head{display:flex;align-items:flex-start;gap:8px;padding:10px 12px 8px;border-bottom:.5px solid var(--dsw-alias-border-l2);flex:none}
      .dsh-hands-headMain{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
      .dsh-hands-titleRow{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden}
      .dsh-hands-liveDot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}
      .dsh-hands-liveDot[data-live=true]{background:var(--dsw-alias-state-success-primary);animation:dsh-hands-pulse 1.8s ease-out infinite;--tone-color:var(--dsw-alias-state-success-primary)}
      .dsh-hands-title{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:13px;font-weight:600;line-height:19px;white-space:nowrap}
      .dsh-hands-liveTag{flex:none;font-size:10px;line-height:15px;color:var(--dsw-alias-label-tertiary);border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;padding:0 6px;white-space:nowrap}
      .dsh-hands-liveTag[data-connected=true]{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 35%,var(--dsw-alias-border-l2))}
      .dsh-hands-subtitle{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-hands-refresh{flex:none;width:26px;height:26px;padding:0;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:14px;line-height:1;cursor:pointer}
      .dsh-hands-refresh:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      .dsh-hands-list{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}
      .dsh-hands-job{border-bottom:.5px solid var(--dsw-alias-border-l2)}
      .dsh-hands-jobHead{box-sizing:border-box;display:flex;align-items:center;gap:6px;width:100%;padding:8px 12px 2px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
      .dsh-hands-jobHead:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .dsh-hands-jobHead:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
      .dsh-hands-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--tone-color,var(--dsw-alias-label-tertiary))}
      .dsh-hands-dot[data-tone=running]{animation:dsh-hands-pulse 1.6s ease-out infinite}
      .dsh-hands-hand{flex:none;font-size:11px;font-weight:600;line-height:16px;color:var(--hand-color,var(--dsw-alias-label-secondary));white-space:nowrap}
      .dsh-hands-status{flex:none;font-size:10px;line-height:15px;color:var(--tone-color,var(--dsw-alias-label-tertiary));white-space:nowrap}
      .dsh-hands-prompt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-secondary)}
      .dsh-hands-duration{flex:none;font-size:10px;line-height:15px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
      .dsh-hands-chevron{flex:none;width:10px;text-align:center;font-size:10px;color:var(--dsw-alias-label-tertiary)}
      .dsh-hands-jobMeta{display:flex;align-items:center;gap:5px;padding:1px 12px 8px 25px;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:15px;overflow:hidden;white-space:nowrap}
      .dsh-hands-jobMeta>span{min-width:0;overflow:hidden;text-overflow:ellipsis}
      .dsh-hands-grow{flex:1}
      .dsh-hands-chat{display:flex;flex-direction:column;gap:8px;padding:0 12px 12px}
      .dsh-hands-bubble{min-width:0;padding:7px 9px;border:.5px solid var(--dsw-alias-border-l2);border-radius:10px}
      .dsh-hands-bubbleUser{background:var(--dsw-alias-interactive-bg-hover);border-color:transparent}
      .dsh-hands-bubbleAgent{background:var(--dsw-alias-bg-layer-1)}
      .dsh-hands-bubbleLabel{margin-bottom:3px;font-size:10px;line-height:15px;font-weight:600;color:var(--dsw-alias-label-tertiary)}
      .dsh-hands-bubbleAgent .dsh-hands-bubbleLabel{color:var(--hand-color,var(--dsw-alias-label-tertiary))}
      .dsh-hands-bubbleText{margin:0;max-height:150px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:12px;line-height:19px;color:var(--dsw-alias-label-primary)}
      .dsh-hands-stream{max-height:46vh;min-height:34px;overflow:auto;overscroll-behavior:contain}
      .dsh-hands-streamText{display:block;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:12px;line-height:19px;color:var(--dsw-alias-label-primary)}
      .dsh-hands-waiting{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:19px}
      .dsh-hands-cursor{display:inline-block;width:6px;height:13px;margin-left:2px;vertical-align:-2px;background:var(--dsw-alias-brand-primary);border-radius:1px;animation:dsh-hands-blink 1s steps(1) infinite}
      .dsh-hands-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere}
      .dsh-hands-detailMeta{display:flex;flex-wrap:wrap;gap:4px 10px;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:15px;overflow-wrap:anywhere}
      .dsh-hands-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:120px;padding:24px 16px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
      .dsh-hands-emptyTitle{color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500}
      .dsh-hands-emptyHint{max-width:260px}
      .dsh-hands-errorBox{margin:8px 12px 0;padding:7px 9px;border:.5px solid var(--dsw-alias-state-error-primary);border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:17px;overflow-wrap:anywhere}
      .dsh-hands-more{align-self:center;margin:10px auto;padding:4px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer}
      .dsh-hands-more:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .dsh-hands-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;padding:6px 12px;border-top:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:15px}
      @keyframes dsh-hands-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--tone-color,var(--dsw-alias-label-tertiary)) 45%,transparent)}70%{box-shadow:0 0 0 5px transparent}100%{box-shadow:0 0 0 0 transparent}}
      @keyframes dsh-hands-blink{0%,49%{opacity:1}50%,100%{opacity:0}}
      @media (prefers-reduced-motion:reduce){.dsh-hands-dot[data-tone=running],.dsh-hands-liveDot[data-live=true]{animation:none}.dsh-hands-cursor{animation:none}}
    `;

    // v2 三列骨架的样式：类名统一 dsh-hands-v2- 前缀，变量沿用 --dsw-alias-*。
    // 宽度断点由组件量出来的 data-mode 决定，这里只负责三档布局。
    const V2_CSS = `
      .dsh-hands-v2{display:flex;flex-direction:column;flex:auto;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
      .dsh-hands-v2-body{display:flex;flex:1;min-width:0;min-height:0;overflow:hidden}
      .dsh-hands-v2-error{flex:none;margin:6px 8px 0;padding:5px 8px;border:.5px solid var(--dsw-alias-state-error-primary);border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px;overflow-wrap:anywhere}
      .dsh-hands-v2,.dsh-hands-v2 *{box-sizing:border-box}
      .dsh-hands-v2-rail{flex:none;display:flex;flex-direction:column;width:clamp(168px,24%,220px);min-width:0;padding:8px 6px;border-right:.5px solid var(--dsw-alias-border-l2);overflow:hidden}
      .dsh-hands-v2-railHead{flex:none;padding:0 6px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}
      .dsh-hands-v2-agentList{flex:1;min-height:0;display:flex;flex-direction:column;gap:6px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}
      .dsh-hands-v2-agent{position:relative;flex:none;display:flex;align-items:center;gap:10px;width:100%;min-height:56px;padding:8px 10px;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
      .dsh-hands-v2-agent:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .dsh-hands-v2-agent[data-active=true]{background:var(--dsw-alias-interactive-bg-hover);box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary)}
      .dsh-hands-v2-agentIcon{flex:none;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;color:#fff;font-size:11.5px;font-weight:600;letter-spacing:.02em}
      .dsh-hands-v2-agentText{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
      .dsh-hands-v2-agentName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:14px;color:var(--dsw-alias-label-primary);font-size:12.5px;line-height:17px;font-weight:500}
      .dsh-hands-v2-agentMeta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px}
      .dsh-hands-v2-agentDot{position:absolute;top:8px;right:8px;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary);opacity:.4}
      .dsh-hands-v2-agentDot[data-tone=running]{background:var(--dsw-alias-state-success-primary);opacity:1;--tone-color:var(--dsw-alias-state-success-primary);animation:dsh-hands-pulse 1.6s ease-out infinite}
      .dsh-hands-v2-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--tone-color,var(--dsw-alias-label-tertiary))}
      .dsh-hands-v2-dot[data-tone=running]{animation:dsh-hands-pulse 1.6s ease-out infinite}
      .dsh-hands-v2-sessions{flex:none;display:flex;flex-direction:column;width:clamp(150px,22%,200px);min-width:0;border-right:.5px solid var(--dsw-alias-border-l2);overflow:hidden}
      .dsh-hands-v2[data-mode=narrow] .dsh-hands-v2-rail{width:130px}
      .dsh-hands-v2[data-mode=narrow] .dsh-hands-v2-sessions{width:120px}
      .dsh-hands-v2[data-mode=narrow] .dsh-hands-v2-railHead{padding:0 4px 6px}
      .dsh-hands-v2[data-mode=drill] .dsh-hands-v2-rail,.dsh-hands-v2[data-mode=drill] .dsh-hands-v2-sessions,.dsh-hands-v2[data-mode=drill] .dsh-hands-v2-thread{width:100%;border-right:0}
      .dsh-hands-v2-colHead{display:flex;align-items:center;gap:6px;flex:none;min-width:0;padding:8px 8px 6px}
      .dsh-hands-v2-colTitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;font-weight:600}
      .dsh-hands-v2-liveTag{flex:none;font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary);border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;padding:0 5px;white-space:nowrap}
      .dsh-hands-v2-liveTag[data-connected=true]{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 35%,var(--dsw-alias-border-l2))}
      .dsh-hands-v2-iconBtn{flex:none;width:22px;height:22px;padding:0;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;cursor:pointer}
      .dsh-hands-v2-iconBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      .dsh-hands-v2-list{flex:1;min-height:0;display:flex;flex-direction:column;gap:4px;padding:0 6px 8px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}
      .dsh-hands-v2-row{position:relative;flex:none;display:flex;flex-direction:column;gap:2px;width:100%;padding:6px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;text-align:left;cursor:pointer;overflow:hidden}
      .dsh-hands-v2-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .dsh-hands-v2-row[data-active=true]{background:var(--dsw-alias-interactive-bg-hover)}
      .dsh-hands-v2-row[data-active=true]::before{content:'';position:absolute;top:7px;bottom:7px;left:0;width:2px;border-radius:1px;background:var(--dsw-alias-brand-primary)}
      .dsh-hands-v2-rowTop{display:flex;align-items:center;gap:5px;min-width:0}
      .dsh-hands-v2-rowName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:16px}
      .dsh-hands-v2-rowTurns{flex:none;color:var(--dsw-alias-label-tertiary);font-size:10.5px;line-height:14px;font-variant-numeric:tabular-nums}
      .dsh-hands-v2-rowTime{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px}
      .dsh-hands-v2-thread{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
      .dsh-hands-v2-threadHead{display:flex;flex-direction:column;gap:4px;flex:none;min-width:0;padding:8px 10px 6px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
      .dsh-hands-v2-threadTop{display:flex;align-items:center;gap:6px;min-width:0}
      .dsh-hands-v2-threadMain{flex:1;min-width:0;display:flex;align-items:center;gap:6px}
      .dsh-hands-v2-threadName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;font-weight:600}
      .dsh-hands-v2-threadChips{display:flex;align-items:center;flex-wrap:wrap;gap:4px;min-width:0}
      .dsh-hands-v2-chip{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 6px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary);font-size:10.5px;line-height:16px}
      .dsh-hands-v2-threadActions{display:flex;align-items:center;gap:4px;flex:none}
      .dsh-hands-v2-btn{flex:none;height:20px;padding:0 7px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10px;line-height:18px;white-space:nowrap;cursor:pointer}
      .dsh-hands-v2-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      .dsh-hands-v2-btn:disabled{opacity:.45;cursor:default}
      .dsh-hands-v2-headError{flex:none;padding:4px 10px;border-bottom:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-state-error-primary);font-size:10px;line-height:15px;overflow-wrap:anywhere}
      .dsh-hands-v2-threadBody{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}
      .dsh-hands-v2-turns{display:flex;flex-direction:column;gap:14px;padding:12px 10px 16px;min-width:0}
      .dsh-hands-v2-turn{display:flex;flex-direction:column;gap:4px;min-width:0;border-radius:10px}
      .dsh-hands-v2-turn[data-active=true]{outline:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary) 35%,transparent);outline-offset:2px}
      .dsh-hands-v2-msg{display:flex;flex-direction:column;gap:4px;min-width:0;max-width:88%}
      .dsh-hands-v2-msgUser{align-self:flex-end;align-items:flex-end}
      .dsh-hands-v2-msgAgent{align-self:flex-start;align-items:flex-start}
      .dsh-hands-v2-bubble{box-sizing:border-box;min-width:0;max-width:100%;padding:9px 12px;color:var(--dsw-alias-label-primary);font-size:12px;line-height:19px;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}
      .dsh-hands-v2-bubbleUser{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);border-radius:14px 14px 4px 14px}
      .dsh-hands-v2-bubbleAgent{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:14px 14px 14px 4px}
      .dsh-hands-v2-bubbleLabel{display:inline-flex;align-items:center;gap:4px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:10.5px;line-height:14px}
      .dsh-hands-v2-bubbleText{margin:0;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;font-size:12px;line-height:19px;color:var(--dsw-alias-label-primary)}
      .dsh-hands-v2-bubbleAgent .dsh-hands-stream{max-height:46vh;min-height:20px;overflow:auto;overscroll-behavior:contain}
      .dsh-hands-v2-bubbleAgent .dsh-hands-streamText{display:block;margin:0;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;font:inherit;font-size:12px;line-height:19px;color:var(--dsw-alias-label-primary)}
      .dsh-hands-v2-waiting{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:19px}
      .dsh-hands-v2 .dsh-hands-cursor{display:inline-block;width:6px;height:13px;margin-left:2px;vertical-align:-2px;background:var(--dsw-alias-brand-primary);border-radius:1px;animation:dsh-hands-blink 1s steps(1) infinite}
      .dsh-hands-v2-expand{align-self:flex-start;margin-top:4px;padding:0;border:0;background:transparent;color:var(--dsw-alias-state-business-primary);font:inherit;font-size:11px;line-height:16px;cursor:pointer}
      .dsh-hands-v2-msgUser .dsh-hands-v2-expand{align-self:flex-end}
      .dsh-hands-v2-expand:hover{text-decoration:underline}
      .dsh-hands-v2-metaRow{align-self:flex-start;display:flex;align-items:center;flex-wrap:wrap;gap:2px 8px;min-width:0;max-width:100%;padding:0 2px;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:14px}
      .dsh-hands-v2-metaStatus{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;color:var(--tone-color,var(--dsw-alias-label-tertiary))}
      .dsh-hands-v2-metaBit{white-space:nowrap;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;max-width:100%}
      .dsh-hands-v2-older{align-self:center;padding:3px 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10px;line-height:16px;cursor:pointer}
      .dsh-hands-v2-older:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
      .dsh-hands-v2-older:disabled{opacity:.5;cursor:default}
      .dsh-hands-v2-hint{flex:1;display:flex;align-items:center;justify-content:center;min-height:80px;padding:20px 12px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
      @keyframes dsh-hands-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--tone-color,var(--dsw-alias-label-tertiary)) 45%,transparent)}70%{box-shadow:0 0 0 5px transparent}100%{box-shadow:0 0 0 0 transparent}}
      @keyframes dsh-hands-blink{0%,49%{opacity:1}50%,100%{opacity:0}}
      @media (prefers-reduced-motion:reduce){.dsh-hands-v2-dot[data-tone=running],.dsh-hands-v2-agentDot[data-tone=running]{animation:none}.dsh-hands-v2 .dsh-hands-cursor{animation:none}}
    `;

    // ── 单条输出：自己管滚动，贴底时自动跟随 ──────────────────────────────
    function Stream({ text, running, t }) {
      const ref = React.useRef(null);
      const [follow, setFollow] = React.useState(true);
      React.useLayoutEffect(() => {
        const element = ref.current;
        if (!element || !follow) return;
        element.scrollTop = element.scrollHeight;
      }, [text, follow]);
      const onScroll = () => {
        const element = ref.current;
        if (!element) return;
        const near = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
        if (near !== follow) setFollow(near);
      };
      return h(
        'div',
        { className: 'dsh-hands-stream', ref, onScroll },
        text
          ? h(
              'pre',
              { className: 'dsh-hands-streamText' },
              text,
              running ? h('span', { className: 'dsh-hands-cursor', 'aria-hidden': true }) : null,
            )
          : h('div', { className: 'dsh-hands-waiting' }, running ? t('waiting') : t('noOutput')),
      );
    }

    // ── 右侧栏面板 ──────────────────────────────────────────────────────────
    function HandsSidebar(props) {
      const t = props.t || ((key) => key);
      const feed = props.feed;
      const state = useFeed(feed);
      // null = 还没手动选过，默认展开最新一条；'' = 用户主动收起了。
      const [openId, setOpenId] = React.useState(null);
      const [visible, setVisible] = React.useState(60);
      const [details, setDetails] = React.useState({});
      const detailsRef = React.useRef(details);
      detailsRef.current = details;
      const requested = React.useRef(new Set());
      const outputCache = React.useRef(new Map());
      const lastActive = React.useRef('');

      const rows = React.useMemo(() => {
        const running = (state.running || []).map((entry) => ({
          ...entry,
          running: true,
          status: 'RUNNING',
        }));
        return running.concat(state.entries || []);
      }, [state.running, state.entries]);

      const runningCount = rows.filter((entry) => entry.running).length;
      useTicker(runningCount > 0);

      // 运行中输出随时更新；收尾后 running 会消失，先把最后一份留在缓存里。
      for (const row of rows) {
        if (row.output) outputCache.current.set(row.id, row.output);
      }

      const activeId = rows[0]?.id || '';
      const effectiveOpenId = openId === null ? activeId : openId;
      React.useEffect(() => {
        if (activeId && activeId !== lastActive.current) {
          lastActive.current = activeId;
          setOpenId(activeId);
        }
      }, [activeId]);

      const requestDetail = React.useCallback(
        async (id) => {
          if (!id || detailsRef.current[id] !== undefined || requested.current.has(id)) return;
          requested.current.add(id);
          try {
            const response = await fetch(endpointOf(`dsh-hands/job?id=${encodeURIComponent(id)}`), {
              cache: 'no-store',
              credentials: 'same-origin',
              headers: { accept: 'application/json' },
            });
            // 不在日志里（比如已经被裁掉）就不再重试，直接用快照里的摘录。
            if (response.status === 404) return;
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const entry = data?.entry || {};
            setDetails((previous) => ({
              ...previous,
              [id]: String(entry.output || entry.excerpt || ''),
            }));
          } catch {
            // 取不到就继续用快照里的摘录，不打断实时面板。
            requested.current.delete(id);
          }
        },
        [],
      );

      React.useEffect(() => {
        if (!activeId) return;
        const row = rows.find((entry) => entry.id === activeId);
        if (row && !row.running) requestDetail(row.id);
      }, [activeId, rows, requestDetail]);

      const toggle = (row) => {
        const next = effectiveOpenId === row.id ? '' : row.id;
        setOpenId(next);
        if (next && !row.running) requestDetail(row.id);
      };

      function outputOf(row) {
        return row.running
          ? row.output || ''
          : outputCache.current.get(row.id) || details[row.id] || row.output || row.excerpt || '';
      }

      function renderRow(row, index) {
        const tone = toneOf(row);
        const hand = String(row.hand || '').toLowerCase();
        const open = effectiveOpenId === row.id;
        const elapsed = row.running
          ? Math.max(0, Date.now() - Date.parse(row.startedAt))
          : row.ms;
        const prompt = row.prompt || t('noPrompt');
        const firstLine = prompt.split(/\r?\n/)[0].slice(0, 140);
        const output = outputOf(row);
        const detailBits = [];
        if (row.cwd) detailBits.push(row.cwd);
        if (row.model) detailBits.push(row.model);
        if (!row.running && row.exitCode !== undefined && row.exitCode !== null) {
          detailBits.push(`${t('exitCode')} ${row.exitCode}`);
        }
        return h(
          'article',
          {
            className: 'dsh-hands-job',
            key: row.id || `run-${index}`,
            'data-tone': tone,
            'data-open': open ? 'true' : 'false',
          },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-hands-jobHead',
              'aria-expanded': open ? 'true' : 'false',
              onClick: () => toggle(row),
            },
            h('span', {
              className: 'dsh-hands-dot',
              'data-tone': tone,
              style: { '--tone-color': TONE_COLOR[tone] || TONE_COLOR.unknown },
            }),
            h(
              'span',
              {
                className: 'dsh-hands-hand',
                style: { '--hand-color': HAND_COLOR[hand] || 'var(--dsw-alias-label-secondary)' },
              },
              handLabel(hand, t),
            ),
            h(
              'span',
              {
                className: 'dsh-hands-status',
                style: { '--tone-color': TONE_COLOR[tone] || TONE_COLOR.unknown },
              },
              statusLabel(row, t),
            ),
            h('span', { className: 'dsh-hands-prompt' }, firstLine || t('noPrompt')),
            h(
              'span',
              { className: 'dsh-hands-duration' },
              Number.isFinite(elapsed) && elapsed > 0 ? formatDuration(elapsed, t) : '—',
            ),
            h('span', { className: 'dsh-hands-chevron', 'aria-hidden': true }, open ? '▾' : '▸'),
          ),
          h(
            'div',
            { className: 'dsh-hands-jobMeta' },
            h('span', null, `${t('session')} · ${row.session || t('noSession')}`),
            h('span', null, '·'),
            h('span', null, row.tool || hand || '—'),
            h('span', { className: 'dsh-hands-grow' }),
            h('span', null, row.write ? t('writable') : t('readOnly')),
            h('span', null, '·'),
            h('span', null, formatTime(row.startedAt || row.at, t)),
          ),
          open
            ? h(
                'div',
                { className: 'dsh-hands-chat' },
                h(
                  'div',
                  { className: 'dsh-hands-bubble dsh-hands-bubbleUser' },
                  h('div', { className: 'dsh-hands-bubbleLabel' }, t('youToHand')),
                  h('div', { className: 'dsh-hands-bubbleText' }, prompt),
                ),
                h(
                  'div',
                  {
                    className: 'dsh-hands-bubble dsh-hands-bubbleAgent',
                    style: { '--hand-color': HAND_COLOR[hand] || 'var(--dsw-alias-label-secondary)' },
                  },
                  h('div', { className: 'dsh-hands-bubbleLabel' }, handLabel(hand, t)),
                  output || row.running || !row.error
                    ? h(Stream, { key: row.id || `stream-${index}`, text: output, running: !!row.running, t })
                    : null,
                  !row.running && row.error && !output
                    ? h('div', { className: 'dsh-hands-error' }, row.error)
                    : null,
                  detailBits.length
                    ? h(
                        'div',
                        { className: 'dsh-hands-detailMeta' },
                        detailBits.map((value, bitIndex) => h('span', { key: bitIndex }, value)),
                      )
                    : null,
                ),
              )
            : null,
        );
      }

      const shown = rows.slice(0, visible);
      let list;
      if (state.phase === 'loading') {
        list = h(
          'div',
          { className: 'dsh-hands-empty' },
          h('div', { className: 'dsh-hands-emptyTitle' }, t('loading')),
        );
      } else if (state.phase === 'error' && !rows.length) {
        list = h(
          'div',
          { className: 'dsh-hands-empty' },
          h('div', { className: 'dsh-hands-emptyTitle' }, t('loadFailed')),
        );
      } else if (!rows.length) {
        list = h(
          'div',
          { className: 'dsh-hands-empty' },
          h('div', { className: 'dsh-hands-emptyTitle' }, t('noJobs')),
          h('div', { className: 'dsh-hands-emptyHint' }, t('noJobsHint')),
        );
      } else {
        list = h(
          'div',
          { className: 'dsh-hands-list' },
          shown.map(renderRow),
          rows.length > shown.length
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-hands-more',
                  onClick: () => setVisible((value) => value + 100),
                },
                `${t('showMore')} (${rows.length - shown.length})`,
              )
            : null,
        );
      }

      return h(
        'div',
        { className: 'dsh-hands-panel' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'dsh-hands-head' },
          h(
            'div',
            { className: 'dsh-hands-headMain' },
            h(
              'div',
              { className: 'dsh-hands-titleRow' },
              h('span', {
                className: 'dsh-hands-liveDot',
                'data-live': runningCount > 0 ? 'true' : 'false',
              }),
              h('span', { className: 'dsh-hands-title' }, t('title')),
              h(
                'span',
                {
                  className: 'dsh-hands-liveTag',
                  'data-connected': state.connected ? 'true' : 'false',
                },
                state.connected ? t('live') : t('reconnecting'),
              ),
            ),
            h(
              'div',
              { className: 'dsh-hands-subtitle' },
              runningCount ? t('runningCount', { n: runningCount }) : t('subtitle'),
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-hands-refresh',
              title: t('refresh'),
              'aria-label': t('refresh'),
              onClick: () => feed.refresh(),
            },
            '↻',
          ),
        ),
        state.error
          ? h('div', { className: 'dsh-hands-errorBox' }, `${t('loadFailed')} ${state.error}`)
          : null,
        list,
        h(
          'div',
          { className: 'dsh-hands-foot' },
          h('span', null, t('recent', { n: rows.length })),
          h('span', null, state.checkedAt ? t('updated', { time: formatTime(state.checkedAt, t) }) : ''),
        ),
      );
    }

    // ── v2 三列骨架（占位版：先把数据打通，气泡下一轮再做）────────────────────
    function useStoreSlice(store, name) {
      const read = React.useCallback(() => store.snapshotSlice(name), [store, name]);
      return React.useSyncExternalStore(store.subscribe, read, read);
    }

    // 图标里只放两个字母，四家一人一种底色（和 HAND_COLOR 同一套 token）。
    function handShort(hand) {
      const key = String(hand || '').toLowerCase();
      if (key === 'agy') return 'AG';
      if (key === 'codex') return 'CD';
      if (key === 'claude') return 'CL';
      if (key === 'opencode') return 'OC';
      return key.slice(0, 2).toUpperCase() || '—';
    }

    // agent 卡片主标题：服务端 label 形如「agy（文案）」，去掉括号里的注解只留名字。
    function handTitle(agent) {
      const label = String(agent?.label || '').trim();
      const hand = String(agent?.hand || '');
      const stripped = label
        .replace(/[（(][^（()）]*[）)]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return stripped || hand || '—';
    }

    // 第三列的 cwd chip 只显示最后一段，整条路径放 title。
    function lastPathPart(value) {
      const text = String(value || '').replace(/[\\/]+$/, '');
      if (!text) return '';
      const parts = text.split(/[\\/]/);
      return parts[parts.length - 1] || text;
    }

    function HandsRail(props) {
      const { store, t, onPick } = props;
      const slice = useStoreSlice(store, 'agents');
      return h(
        'div',
        { className: 'dsh-hands-v2-rail' },
        h('div', { className: 'dsh-hands-v2-railHead' }, t('v2Hands')),
        h(
          'div',
          { className: 'dsh-hands-v2-agentList' },
          slice.agents.map((agent) => {
            const hand = String(agent.hand || '');
            const running = Number(agent.running) || 0;
            const tone = running > 0 ? 'running' : toneOf(agent);
            const sub = [
              t('v2TodayTimes', { n: Number(agent.today) || 0 }),
              running > 0 ? t('v2RunningN', { n: running }) : t('v2Idle'),
            ].join(' · ');
            return h(
              'button',
              {
                key: hand || 'hand',
                type: 'button',
                className: 'dsh-hands-v2-agent',
                'data-active': slice.hand === hand ? 'true' : 'false',
                title: agent.label || hand,
                onClick: () => onPick(hand),
              },
              h(
                'span',
                {
                  className: 'dsh-hands-v2-agentIcon',
                  style: { background: HAND_COLOR[hand] || 'var(--dsw-alias-label-tertiary)' },
                  'aria-hidden': true,
                },
                handShort(hand),
              ),
              h(
                'span',
                { className: 'dsh-hands-v2-agentText' },
                h('span', { className: 'dsh-hands-v2-agentName' }, handTitle(agent)),
                h('span', { className: 'dsh-hands-v2-agentMeta' }, sub),
              ),
              h('span', { className: 'dsh-hands-v2-agentDot', 'data-tone': tone }),
            );
          }),
          !slice.agents.length
            ? h(
                'div',
                { className: 'dsh-hands-v2-hint' },
                slice.phase === 'error' ? t('loadFailed') : t('loading'),
              )
            : null,
        ),
      );
    }

    function HandsSessions(props) {
      const { store, t, mode, meta, onPick, onBack } = props;
      const slice = useStoreSlice(store, 'sessions');
      const agents = useStoreSlice(store, 'agents');
      const current =
        agents.agents.find((agent) => String(agent?.hand || '') === String(slice.hand || '')) ||
        null;
      const title = current
        ? handTitle(current)
        : slice.hand
          ? handLabel(slice.hand, t)
          : t('v2PickHand');
      return h(
        'div',
        { className: 'dsh-hands-v2-sessions' },
        h(
          'div',
          { className: 'dsh-hands-v2-colHead' },
          mode === 'drill'
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-hands-v2-iconBtn',
                  title: t('v2Back'),
                  'aria-label': t('v2Back'),
                  onClick: onBack,
                },
                '‹',
              )
            : null,
          h('span', { className: 'dsh-hands-v2-colTitle', title }, title),
          meta.connected
            ? null
            : h(
                'span',
                { className: 'dsh-hands-v2-liveTag', 'data-connected': 'false' },
                t('reconnecting'),
              ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-hands-v2-iconBtn',
              title: t('refresh'),
              'aria-label': t('refresh'),
              onClick: () => store.refreshAll(),
            },
            '↻',
          ),
        ),
        slice.sessions.length
          ? h(
              'div',
              { className: 'dsh-hands-v2-list' },
              slice.sessions.map((row) => {
                const key = String(row.key || row.sessionKey || '');
                const tone = toneOf(row);
                return h(
                  'button',
                  {
                    key: key || String(row.name || ''),
                    type: 'button',
                    className: 'dsh-hands-v2-row',
                    'data-active': slice.selectedKey && key === slice.selectedKey ? 'true' : 'false',
                    onClick: () => onPick(String(row.hand || slice.hand || ''), key),
                  },
                  h(
                    'span',
                    { className: 'dsh-hands-v2-rowTop' },
                    h('span', { className: 'dsh-hands-v2-rowName' }, row.name || t('noSession')),
                    h(
                      'span',
                      { className: 'dsh-hands-v2-rowTurns' },
                      t('v2Turns', { n: Number(row.turns) || 0 }),
                    ),
                    h('span', {
                      className: 'dsh-hands-v2-dot',
                      'data-tone': tone,
                      style: { '--tone-color': TONE_COLOR[tone] || TONE_COLOR.unknown },
                    }),
                  ),
                  h(
                    'span',
                    { className: 'dsh-hands-v2-rowTime' },
                    formatTime(row.lastAt || row.startedAt, t) || '—',
                  ),
                );
              }),
            )
          : h(
              'div',
              { className: 'dsh-hands-v2-hint' },
              slice.phase === 'loading' ? t('loading') : t('v2NoSessions'),
            ),
      );
    }

    // ── v2 对话气泡 ─────────────────────────────────────────────────────────
    //
    // 正文按 id 单独订阅：一条流式增量只换那一个 Turn 的字符串，父组件（TurnList）
    // 不跟着每 250ms 重渲整棵树。'live' 切片仍保留，给需要整表的场景。
    const PROMPT_LIMIT = 2000;
    const BODY_LIMIT = 4000;

    function useTurnText(store, id) {
      const read = React.useCallback(() => {
        const live = store.getSnapshot().liveByTurn || {};
        return String(live[id] || '');
      }, [store, id]);
      return React.useSyncExternalStore(store.subscribe, read, read);
    }

    function BubbleUser(props) {
      const { t, prompt } = props;
      const [expanded, setExpanded] = React.useState(false);
      const full = String(prompt || '') || t('noPrompt');
      const canExpand = full.length > PROMPT_LIMIT;
      return h(
        'div',
        { className: 'dsh-hands-v2-msg dsh-hands-v2-msgUser' },
        h('div', { className: 'dsh-hands-v2-bubbleLabel' }, t('youToHand')),
        h(
          'div',
          { className: 'dsh-hands-v2-bubble dsh-hands-v2-bubbleUser' },
          h(
            'div',
            { className: 'dsh-hands-v2-bubbleText' },
            canExpand && !expanded ? `${full.slice(0, PROMPT_LIMIT)}…` : full,
          ),
          canExpand
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-hands-v2-expand',
                  onClick: () => setExpanded((value) => !value),
                },
                expanded ? t('v2Collapse') : t('v2Expand'),
              )
            : null,
        ),
      );
    }

    function BubbleAgent(props) {
      const { t, turn, view } = props;
      const [expanded, setExpanded] = React.useState(false);
      const full = String(view?.text || '');
      const source = String(view?.source || 'none');
      const running = !!view?.cursor;
      const canExpand = full.length > BODY_LIMIT;
      const hand = String(turn?.hand || '').toLowerCase();
      const loadFull = source === 'excerpt' && typeof props.onNeedBody === 'function';
      const showToggle = canExpand || loadFull;
      const handColor = HAND_COLOR[hand] || 'var(--dsw-alias-label-secondary)';
      const toggle = () => {
        if (loadFull) props.onNeedBody();
        if (canExpand) setExpanded((value) => !value);
      };
      return h(
        'div',
        { className: 'dsh-hands-v2-msg dsh-hands-v2-msgAgent' },
        h(
          'div',
          { className: 'dsh-hands-v2-bubbleLabel' },
          h('span', {
            className: 'dsh-hands-v2-dot',
            'data-tone': running ? 'running' : 'idle',
            style: { '--tone-color': handColor },
          }),
          handLabel(hand, t),
        ),
        h(
          'div',
          {
            className: 'dsh-hands-v2-bubble dsh-hands-v2-bubbleAgent',
            'data-source': source,
          },
          full || running
            ? h(Stream, {
                text: canExpand && !expanded ? full.slice(0, BODY_LIMIT) : full,
                running,
                t,
              })
            : h('div', { className: 'dsh-hands-v2-waiting' }, t('noOutput')),
          showToggle
            ? h(
                'button',
                { type: 'button', className: 'dsh-hands-v2-expand', onClick: toggle },
                expanded ? t('v2Collapse') : loadFull ? t('v2LoadFull') : t('v2Expand'),
              )
            : null,
        ),
      );
    }

    function Turn(props) {
      const { store, t, turn, active, autoBody } = props;
      const id = String(turn?.id || '');
      const liveText = useTurnText(store, id);
      // store 把 /turn 的增量按绝对偏移拼进了 liveByTurn，所以第三档留空；
      // resolveTurnBody 仍保留 fetched 档，给单独缓存的调用方和测试用。
      const view = resolveTurnBody(turn, liveText, '');
      const needBody = React.useCallback(() => {
        if (id) store.ensureTurnBody(id, true);
      }, [store, id]);
      React.useEffect(() => {
        if (!id || liveText) return;
        if (!autoBody && !active) return;
        store.ensureTurnBody(id);
      }, [store, id, liveText, autoBody, active]);
      const tone = toneOf(turn);
      const parts = formatTurnMeta(turn, t);
      return h(
        'div',
        {
          className: 'dsh-hands-v2-turn',
          'data-active': active ? 'true' : 'false',
          'data-source': view.source,
          onClick: () => {
            if (id) store.selectTurn(id);
          },
        },
        h(BubbleUser, { t, prompt: turn?.prompt }),
        h(BubbleAgent, { t, turn, view, onNeedBody: needBody }),
        h(
          'div',
          { className: 'dsh-hands-v2-metaRow' },
          h(
            'span',
            {
              className: 'dsh-hands-v2-metaStatus',
              style: { '--tone-color': TONE_COLOR[tone] || TONE_COLOR.unknown },
            },
            h('span', {
              className: 'dsh-hands-v2-dot',
              'data-tone': tone,
              style: { '--tone-color': TONE_COLOR[tone] || TONE_COLOR.unknown },
            }),
            h('span', null, statusLabel(turn, t)),
          ),
          parts.map((part) =>
            h('span', { key: part.key, className: 'dsh-hands-v2-metaBit' }, part.text),
          ),
        ),
      );
    }

    // 轮次按 startedAt 正序渲染（服务端给的是倒序）。贴底才跟随；用户上滚后
    // 不再抢滚动位置。滚到顶部（或点按钮）用 before 游标拉更早的一页。
    function TurnList(props) {
      const { store, t, sessionKey, turns, more, selectedTurnId } = props;
      const listRef = React.useRef(null);
      const innerRef = React.useRef(null);
      const followRef = React.useRef(true);
      const keyRef = React.useRef(sessionKey);
      const anchorRef = React.useRef(null);
      const loadingRef = React.useRef(false);
      const [loadingOlder, setLoadingOlder] = React.useState(false);
      const ordered = React.useMemo(
        () => (Array.isArray(turns) ? [...turns].reverse() : []),
        [turns],
      );

      React.useLayoutEffect(() => {
        const element = listRef.current;
        if (!element) return;
        const anchor = anchorRef.current;
        if (anchor) {
          // 更早的一页插到顶部：保持用户原来看到的位置
          anchorRef.current = null;
          element.scrollTop = anchor.top + (element.scrollHeight - anchor.height);
          return;
        }
        if (keyRef.current !== sessionKey) {
          keyRef.current = sessionKey;
          followRef.current = true;
          element.scrollTop = element.scrollHeight;
          return;
        }
        if (followRef.current) element.scrollTop = element.scrollHeight;
      }, [ordered, sessionKey]);

      // 气泡正文是异步补进来的（拉取 / live），内容变高时贴底才继续跟随。
      React.useEffect(() => {
        const element = listRef.current;
        const inner = innerRef.current;
        if (!element || !inner || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(() => {
          if (followRef.current) element.scrollTop = element.scrollHeight;
        });
        observer.observe(inner);
        return () => observer.disconnect();
      }, [sessionKey, ordered.length > 0]);

      const loadOlder = React.useCallback(async () => {
        if (loadingRef.current || !more || !sessionKey) return;
        const element = listRef.current;
        anchorRef.current = element
          ? { height: element.scrollHeight, top: element.scrollTop }
          : null;
        loadingRef.current = true;
        setLoadingOlder(true);
        try {
          await store.loadOlderTurns(sessionKey);
        } finally {
          loadingRef.current = false;
          setLoadingOlder(false);
        }
      }, [more, sessionKey, store]);

      const onScroll = () => {
        const element = listRef.current;
        if (!element) return;
        followRef.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 48;
        if (element.scrollTop < 40) void loadOlder();
      };

      if (!sessionKey) {
        return h(
          'div',
          { className: 'dsh-hands-v2-threadBody' },
          h('div', { className: 'dsh-hands-v2-hint' }, t('v2PickSession')),
        );
      }
      if (!ordered.length) {
        return h(
          'div',
          { className: 'dsh-hands-v2-threadBody' },
          h('div', { className: 'dsh-hands-v2-hint' }, t('v2NoTurns')),
        );
      }

      return h(
        'div',
        { className: 'dsh-hands-v2-threadBody', ref: listRef, onScroll },
        h(
          'div',
          { className: 'dsh-hands-v2-turns', ref: innerRef },
          more
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-hands-v2-older',
                  disabled: loadingOlder,
                  onClick: loadOlder,
                },
                loadingOlder ? t('loading') : t('v2LoadOlder'),
              )
            : null,
          ordered.map((turn, index) =>
            h(Turn, {
              key: String(turn?.id || `turn-${index}`),
              store,
              t,
              turn,
              active: String(turn?.id || '') === selectedTurnId,
              autoBody: true,
            }),
          ),
        ),
      );
    }

    function ThreadHead(props) {
      const { t, mode, onBack, row, fallbackName, turns, activeTurn, action, onCancel, onRerun } =
        props;
      const tone = toneOf(activeTurn || row || {});
      const running = turnIsRunning(activeTurn);
      const finished = !!activeTurn && !running;
      const busy = !!action?.pending;
      const chips = [];
      if (row?.cwd) {
        chips.push({ key: 'cwd', text: lastPathPart(row.cwd), title: String(row.cwd) });
      }
      if (row?.model) chips.push({ key: 'model', text: String(row.model), title: String(row.model) });
      chips.push({
        key: 'today',
        text: t('v2Today', { n: Number(row?.today ?? turns.length) || 0 }),
      });
      return h(
        'div',
        { className: 'dsh-hands-v2-threadHead' },
        h(
          'div',
          { className: 'dsh-hands-v2-threadTop' },
          mode === 'drill'
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-hands-v2-iconBtn',
                  title: t('v2Back'),
                  'aria-label': t('v2Back'),
                  onClick: onBack,
                },
                '‹',
              )
            : null,
          h(
            'div',
            { className: 'dsh-hands-v2-threadMain' },
            h('span', {
              className: 'dsh-hands-v2-dot',
              'data-tone': tone,
              style: { '--tone-color': TONE_COLOR[tone] || TONE_COLOR.unknown },
            }),
            h(
              'div',
              { className: 'dsh-hands-v2-threadName' },
              row?.name || fallbackName || t('v2PickSession'),
            ),
          ),
          h(
            'div',
            { className: 'dsh-hands-v2-threadActions' },
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-hands-v2-btn',
                disabled: !running || busy,
                title: t('v2Cancel'),
                onClick: onCancel,
              },
              action?.pending === 'cancel' ? t('v2Cancelling') : t('v2Cancel'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-hands-v2-btn',
                disabled: !finished || busy,
                title: t('v2Rerun'),
                onClick: onRerun,
              },
              action?.pending === 'rerun' ? t('v2Rerunning') : t('v2Rerun'),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dsh-hands-v2-threadChips' },
          chips.map((chip) =>
            h('span', { key: chip.key, className: 'dsh-hands-v2-chip', title: chip.title }, chip.text),
          ),
        ),
      );
    }

    function HandsThread(props) {
      const { store, t, mode, onBack } = props;
      const sel = useStoreSlice(store, 'selection');
      const turnsSlice = useStoreSlice(store, 'turns');
      const sessions = useStoreSlice(store, 'sessions');
      const [action, setAction] = React.useState({ pending: '', error: '' });

      const row = findSession(sessions.sessions, sel.key);
      const turns = turnsSlice.turns;
      const activeTurn =
        turns.find((turn) => String(turn.id || '') === sel.turnId) || turns[0] || null;
      const more = sel.key ? store.turnsMore(sel.key) : false;

      // 切会话时把上一轮的按钮状态和错误清掉，别让红字跟着跑。
      React.useEffect(() => {
        setAction({ pending: '', error: '' });
      }, [sel.key]);

      const runAction = async (kind) => {
        const id = String(activeTurn?.id || '');
        if (!id || action.pending) return;
        const label = kind === 'cancel' ? t('v2CancelFailed') : t('v2RerunFailed');
        setAction({ pending: kind, error: '' });
        const result =
          kind === 'cancel' ? await store.cancelTurn(id) : await store.rerunTurn(id);
        setAction({
          pending: '',
          error: result?.ok
            ? ''
            : `${label}${result?.error ? ` · ${result.error}` : ''}`,
        });
      };

      return h(
        'div',
        { className: 'dsh-hands-v2-thread' },
        h(ThreadHead, {
          t,
          mode,
          onBack,
          row,
          fallbackName: sel.key,
          turns,
          activeTurn,
          action,
          onCancel: () => runAction('cancel'),
          onRerun: () => runAction('rerun'),
        }),
        action.error ? h('div', { className: 'dsh-hands-v2-headError' }, action.error) : null,
        h(TurnList, {
          store,
          t,
          sessionKey: sel.key,
          turns,
          more,
          selectedTurnId: sel.turnId,
        }),
      );
    }

    function HandsPaneV2(props) {
      const t = props.t || ((key) => key);
      const store = props.store;
      const hostRef = React.useRef(null);
      const [width, setWidth] = React.useState(0);
      const [view, setView] = React.useState('agents');

      React.useEffect(() => {
        store.start();
        return () => store.stop();
      }, [store]);

      // 判宽只留在组件里，不进持久化：同一个会话换窄栏不该改选中。
      React.useEffect(() => {
        const element = hostRef.current;
        if (!element) return undefined;
        const measure = () => {
          const next =
            element.clientWidth ||
            (element.getBoundingClientRect ? element.getBoundingClientRect().width : 0);
          setWidth((prev) => (Math.abs(prev - next) < 1 ? prev : next));
        };
        measure();
        if (typeof ResizeObserver === 'undefined') {
          window.addEventListener('resize', measure);
          return () => window.removeEventListener('resize', measure);
        }
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
      }, []);

      // 三档宽度：>=560 双列 + 对话，420–560 收窄两列，<420 钻取一次只看一列。
      const mode = width === 0 ? 'wide' : width >= 560 ? 'wide' : width >= 420 ? 'narrow' : 'drill';
      const meta = useStoreSlice(store, 'meta');
      const selection = useStoreSlice(store, 'selection');
      const leaf = mode === 'drill' ? view : 'all';
      const showRail = leaf === 'all' || leaf === 'agents';
      const showSessions = leaf === 'all' || leaf === 'sessions';
      const showThread = leaf === 'all' || leaf === 'thread';

      const pickHand = (hand) => {
        const keep = selection.hand === hand;
        store.select(hand, keep ? selection.key : '');
        if (mode === 'drill') setView('sessions');
      };
      const pickSession = (hand, key) => {
        store.select(hand, key);
        if (mode === 'drill') setView('thread');
      };

      return h(
        'div',
        { className: 'dsh-hands-v2', 'data-mode': mode, ref: hostRef },
        h('style', null, V2_CSS),
        meta.error
          ? h('div', { className: 'dsh-hands-v2-error' }, `${t('loadFailed')} ${meta.error}`)
          : null,
        h(
          'div',
          { className: 'dsh-hands-v2-body' },
          showRail ? h(HandsRail, { key: 'rail', store, t, onPick: pickHand }) : null,
          showSessions
            ? h(HandsSessions, {
                key: 'sessions',
                store,
                t,
                mode,
                meta,
                onPick: pickSession,
                onBack: () => setView('agents'),
              })
            : null,
          showThread
            ? h(HandsThread, {
                key: 'thread',
                store,
                t,
                mode,
                onBack: () => setView('sessions'),
              })
            : null,
        ),
      );
    }

    // ── 顶层面板：和「插件」「自动化任务」「IM机器人」同级的整页窗口 ──────────
    // 右侧栏 tab 是随手瞄一眼的窄版，这里是整页的大窗口，两处共用同一个 store
    // （store 内部用引用计数，谁先卸载都不会把另一份的流掐掉）。
    const PAGE_ID = 'dsh-hands';

    const PAGE_CSS = `
      .dsh-hands-page{display:flex;flex-direction:column;flex:auto;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;color:var(--dsw-alias-label-primary)}
      .dsh-hands-pageHead{flex:none;display:flex;align-items:center;gap:8px;min-width:0;padding:16px 18px 12px}
      .dsh-hands-pageMain{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
      .dsh-hands-pageTitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;line-height:21px;font-weight:600}
      .dsh-hands-pageSub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:17px}
      .dsh-hands-pageBody{flex:1;display:flex;min-width:0;min-height:0;padding:0 6px 6px;overflow:hidden}
    `;

    // 侧边栏图标：一颗四角星，跟「插件/自动化任务」那排 1px 线条同重量。
    function HandsNavIcon(props) {
      const size = Number(props?.size) || 16;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1,
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: false,
        },
        h('path', { d: 'M8 1.6 9.55 6.45 14.4 8 9.55 9.55 8 14.4 6.45 9.55 1.6 8 6.45 6.45Z' }),
      );
    }

    function HandsPage(props) {
      const t = props.t || ((key) => key);
      const store = props.store;
      const meta = useStoreSlice(store, 'meta');
      return h(
        'div',
        { className: 'dsh-hands-page' },
        h('style', null, PAGE_CSS),
        h(
          'div',
          { className: 'dsh-hands-pageHead' },
          h(
            'div',
            { className: 'dsh-hands-pageMain' },
            h('div', { className: 'dsh-hands-pageTitle' }, t('navLabel')),
            h('div', { className: 'dsh-hands-pageSub' }, t('pageSub')),
          ),
          h('span', {
            className: 'dsh-hands-v2-dot',
            'data-tone': meta.connected ? 'running' : 'idle',
            style: {
              '--tone-color': meta.connected
                ? 'var(--dsw-alias-state-success-primary)'
                : 'var(--dsw-alias-label-tertiary)',
            },
          }),
          h(
            'span',
            {
              className: 'dsh-hands-v2-liveTag',
              'data-connected': meta.connected ? 'true' : 'false',
            },
            meta.connected ? t('live') : t('reconnecting'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-hands-v2-iconBtn',
              title: t('refresh'),
              onClick: () => store.refreshAll(),
            },
            '↻',
          ),
        ),
        h('div', { className: 'dsh-hands-pageBody' }, h(HandsPaneV2, { t, store })),
      );
    }

    // ── 接线 ────────────────────────────────────────────────────────────────
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-hands: locale');
      const t = ctx.locale.bind(NS);
      const feed = createHandsFeed();
      // v2 的 store 只在 USE_V2=true 时被组件 start()；开关关掉时它什么都不做。
      const store = createHandsStore();

      // 顶层面板：注册进 layout 的 main 槽 + 侧边栏导航行，
      // 和「插件」「自动化任务」「IM机器人」并排，点一下整页打开。
      ctx.inject(['layout'], (pageCtx) => {
        pageCtx.slots.inject('main', () =>
          pageCtx.slots.register(
            {
              name: 'main',
              key: PAGE_ID,
              locale: NS,
              inject: () => ({ store, t }),
            },
            HandsPage,
          ),
        );
        pageCtx.slots.inject('sidebar.panellist', () =>
          pageCtx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PAGE_ID,
              order: 12,
              label: () => t('navLabel'),
              locale: NS,
            },
            HandsNavIcon,
          ),
        );
      });

      if (SHOW_SIDEBAR_TAB) {
        ctx.inject(['sidebarRightTabs', 'sidebarRight'], (sidebarCtx) => {
          sidebarCtx.effect(
            () =>
              sidebarCtx.sidebarRightTabs.register({
                id: TAB_ID,
                kind: TAB_KIND,
                priority: 'extension',
                title: () => t('title'),
                guide: [
                  {
                    id: 'hands',
                    order: 30,
                    title: () => t('title'),
                    description: () => t('guide'),
                    icon: HandsIcon,
                  },
                ],
              }),
            'dsh-hands: right sidebar tab',
          );

          sidebarCtx.effect(
            () =>
              sidebarCtx.slots.inject('sidebar.right.pane.tab', () =>
                sidebarCtx.slots.register(
                  {
                    name: 'sidebar.right.pane.tab',
                    key: TAB_ID,
                    locale: NS,
                    // 灰度开关的唯一分叉点：true 挂 v2 三列 + store，false 完全走旧 feed/扁平列表。
                    inject: () => (USE_V2 ? { store } : { feed }),
                  },
                  USE_V2 ? HandsPaneV2 : HandsSidebar,
                ),
              ),
            'dsh-hands: right sidebar body',
          );

          // 一有新派发就把右侧栏掀开并切到本面板，别让输出藏起来。
          // 面板已经开着时 openTab 只会聚焦，不会重置布局。
          // 按会话记「已经替哪票活开过」，切会话后也能把正在跑的活接上。
          sidebarCtx.effect(() => {
            const opened = new Map();
            let lastTry = 0;
            const check = () => {
              const sessionId = sidebarCtx.sidebarRight.mounted?.getSnapshot?.();
              if (!sessionId) return;
              const running = feed.getSnapshot().running || [];
              const seen = opened.get(sessionId);
              const pending = running.find((job) => job?.id && !seen?.has(job.id));
              if (!pending) return;
              const now = Date.now();
              if (now - lastTry < 1500) return;
              lastTry = now;
              try {
                sidebarCtx.sidebarRight.openTab(TAB_KIND);
                const next = seen || new Set();
                next.add(pending.id);
                opened.set(sessionId, next);
              } catch {
                // 还没打开会话（或会话的 store 还没挂上）：下一轮再试。
              }
              if (opened.size > 50) {
                const keep = new Set(running.map((job) => job.id));
                for (const [id, jobs] of opened) {
                  for (const jobId of [...jobs]) if (!keep.has(jobId)) jobs.delete(jobId);
                  if (!jobs.size) opened.delete(id);
                }
              }
            };
            const unsubscribe = feed.subscribe(check);
            const timer = setInterval(check, 2000);
            check();
            return () => {
              clearInterval(timer);
              unsubscribe();
            };
          }, 'dsh-hands: auto open live panel');
        });
      }
    }

    // createHandsStore 一并导出：acp/test-store.mjs 在 node 里直接实例化数据层，
    // 不渲染组件（factory 里的 hooks 只有真正挂载时才跑）。
    // 气泡的纯函数/纯展示组件导出给 acp/test-bubbles.mjs：用最小 React stub 就能渲染。
    return {
      inject: ['slots', 'locale'],
      apply,
      createHandsStore,
      resolveTurnBody,
      formatTurnMeta,
      formatTokens,
      formatCost,
      BubbleUser,
      BubbleAgent,
      Turn,
      HandsPage,
      HandsNavIcon,
    };
  },
});
