window.__ModuleLoader__.load({
  id: 'dsh-hands',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // DSH 自带的 markdown 渲染器（和原生聊天用的是同一个组件）。
    // 拿不到就退回纯文本，不让插件因为一个 require 挂掉。
    let MarkdownText = null;
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
      if (primitives && typeof primitives.MarkdownText === 'function') {
        MarkdownText = primitives.MarkdownText;
      }
    } catch {
      MarkdownText = null;
    }

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
      navLabel: 'Agent Hands',
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
      reasoning: 'Thinking',
      toolRunning: 'running',
      toolDone: 'done',
      toolFailed: 'failed',
      openFolder: 'Open folder',
      copy: 'Copy',
      copied: 'Copied',
      codeBlockTitle: 'Code',
      codeBlockWrap: 'Wrap lines',
      codeBlockUnwrap: 'Do not wrap lines',
      markdownFootnotes: 'Footnotes',
      usageHint: 'Session total',
      searchSessions: 'Search sessions or folders',
      searchArchivedSessions: 'Search archived sessions',
      searchTurns: 'Search turns',
      searchEmpty: 'No matches',
      asyncTasks: 'Async',
      asyncRunning: 'Running',
      asyncQueued: 'QUEUED',
      asyncRetrying: 'delivery retry',
      asyncFailed: 'Failed',
      asyncIdle: 'idle',
      asyncEmpty: 'no async jobs',
      asyncDelivery: 'delivery',
      asyncHint: 'Async dispatch queue: running/queued/retrying/failed; click for details',
      asyncCancel: 'cancel',
      queueAhead: '{n} ahead',
      permAllow: 'Allow',
      permReject: 'Reject',
      loadFailed: 'Could not read the dispatch feed.',
      showMore: 'Show older',
      justNow: 'just now',
      minutesAgo: '{n} min ago',
      durationMinSec: '{m}m {s}s',
      durationMin: '{m}m',
      v2PickSession: 'Select a conversation',
      v2PickHand: 'Select a hand',
      v2NoSessions: 'No conversations yet',
      v2NoFolder: 'Ungrouped',
      v2NoTurns: 'No turns yet',
      v2Back: 'Back',
      v2Turns: '{n} turns',
      v2Today: '{n} today',
      v2Hands: 'Hands',
      v2TodayTimes: '{n} today',
      v2Stop: 'Stop',
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
      blocksFallback: 'Fallback view',
      blocksFallbackHint: 'Structured blocks are unavailable; showing a text-parsed compatibility view.',
      handAgy: 'agy · copy',
      handCodex: 'codex · planning',
      handClaude: 'claude · architecture',
      handOpencode: 'opencode · coding',
    };

    const zh = {
      title: '手下任务',
      navLabel: 'Agent Hands',
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
      reasoning: '思维链',
      toolRunning: '运行中',
      toolDone: '完成',
      toolFailed: '失败',
      openFolder: '打开文件夹',
      copy: '复制',
      copied: '已复制',
      codeBlockTitle: '代码',
      codeBlockWrap: '换行',
      codeBlockUnwrap: '不换行',
      markdownFootnotes: '脚注',
      usageHint: '整条会话累计',
      searchSessions: '搜索会话或目录',
      searchArchivedSessions: '搜索归档会话',
      searchTurns: '搜索轮次',
      searchEmpty: '没有匹配',
      asyncTasks: '异步',
      asyncRunning: '在跑',
      asyncQueued: '排队中',
      asyncRetrying: '回传重试',
      asyncFailed: '失败',
      asyncIdle: '空闲',
      asyncEmpty: '没有异步任务',
      asyncDelivery: '投递',
      asyncHint: '异步派活队列：跑着/排队/回传重试/回传失败，点开看详情',
      asyncCancel: '取消',
      queueAhead: '前面还有 {n} 个',
      permAllow: '允许',
      permReject: '拒绝',
      loadFailed: '读取调度输出失败。',
      showMore: '显示更早',
      justNow: '刚刚',
      minutesAgo: '{n} 分钟前',
      durationMinSec: '{m} 分 {s} 秒',
      durationMin: '{m} 分',
      v2PickSession: '选择一条会话',
      v2PickHand: '选择一个手下',
      v2NoSessions: '还没有会话',
      v2NoFolder: '未分组',
      v2NoTurns: '还没有轮次',
      v2Back: '返回',
      v2Turns: '{n} 轮',
      v2Today: '今日 {n} 轮',
      v2Hands: '手下',
      v2TodayTimes: '今日 {n} 次',
      v2Stop: '停止',
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
      blocksFallback: '兼容视图',
      blocksFallbackHint: '结构化 blocks 缺失，当前显示按文本解析的兼容视图。',
      handAgy: 'agy · 文案',
      handCodex: 'codex · 规划',
      handClaude: 'claude · 架构',
      handOpencode: 'opencode · 写码',
    };

    // MarkdownText 在流式时会缓存 labels 的引用；按语言返回固定对象，避免每个字重建解析器。
    const MARKDOWN_LABELS = {
      en: {
        code: {
          copyLabel: en.copy,
          copiedLabel: en.copied,
          toolbarLabels: { codeLabel: en.codeBlockTitle, wrapLabel: en.codeBlockWrap, unwrapLabel: en.codeBlockUnwrap },
        },
        footnotes: en.markdownFootnotes,
      },
      zh: {
        code: {
          copyLabel: zh.copy,
          copiedLabel: zh.copied,
          toolbarLabels: { codeLabel: zh.codeBlockTitle, wrapLabel: zh.codeBlockWrap, unwrapLabel: zh.codeBlockUnwrap },
        },
        footnotes: zh.markdownFootnotes,
      },
    };

    function markdownLabelsFor(t) {
      return typeof t === 'function' && t('copy') === zh.copy ? MARKDOWN_LABELS.zh : MARKDOWN_LABELS.en;
    }

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
      queued: 'var(--dsw-alias-state-warn-primary)',
      unknown: 'var(--dsw-alias-label-tertiary)',
    };

    function handLabel(hand, t) {
      if (hand === 'agy') return t('handAgy');
      if (hand === 'codex') return t('handCodex');
      if (hand === 'claude') return t('handClaude');
      if (hand === 'opencode') return t('handOpencode');
      return hand || '—';
    }

    function isQueued(entry) {
      return String(entry?.status || '').toUpperCase() === 'QUEUED' || entry?.queued === true;
    }

    function queuePositionOf(entry) {
      const value = Number(entry?.queuePosition);
      return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
    }

    function isOk(entry) {
      const status = String(entry?.status || '').toUpperCase();
      if (status === 'RUNNING' || isQueued(entry)) return false;
      if (entry?.ok === true) return true;
      if (entry?.ok === false) return false;
      return status === 'OK' || status === 'SUCCESS';
    }

    function toneOf(entry) {
      if (isQueued(entry)) return 'queued';
      const status = String(entry?.status || '').toUpperCase();
      if (status === 'RUNNING' || entry?.running) return 'running';
      if (isOk(entry)) return 'ok';
      if (status === 'TIMEOUT') return 'timeout';
      if (status === 'ERROR' || status === 'FAILED' || status === 'UNPARSED') return 'failed';
      return 'unknown';
    }

    function statusLabel(entry, t) {
      const status = String(entry?.status || '').toUpperCase();
      if (isQueued(entry)) return t('asyncQueued');
      if (status === 'RUNNING') return t('statusRunning');
      if (status === 'OK' || status === 'SUCCESS') return t('statusOk');
      if (status === 'TIMEOUT') return t('statusTimeout');
      if (status === 'UNPARSED') return t('statusUnparsed');
      if (status === 'CANCELLED') return t('statusCancelled');
      if (status === 'ERROR' || status === 'FAILED') return t('statusError');
      return status || t('statusUnknown');
    }

    function statusLabelWithQueue(entry, t) {
      const label = statusLabel(entry, t);
      return isQueued(entry)
        ? `${label} · ${t('queueAhead', { n: queuePositionOf(entry) })}`
        : label;
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
      if (isQueued(row)) {
        parts.push({ key: 'queue', text: t('queueAhead', { n: queuePositionOf(row) }) });
      }
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

    // 会话级用量汇总：把该会话所有轮次的 tokens / cost 加起来（只统计有值的轮次）。
    function sumTurnUsage(turns) {
      const rows = Array.isArray(turns) ? turns : [];
      let input = 0;
      let output = 0;
      let cost = 0;
      let hasTokens = false;
      let hasCost = false;
      for (const row of rows) {
        const counts = tokenCounts(row?.tokens);
        if (counts) {
          hasTokens = true;
          input += Number(counts.input) || 0;
          output += Number(counts.output) || 0;
        }
        const value = Number(row?.cost);
        if (Number.isFinite(value) && value > 0) {
          hasCost = true;
          cost += value;
        }
      }
      return { input, output, cost, hasTokens, hasCost };
    }

    function turnIsRunning(turn) {
      if (!turn || isQueued(turn)) return false;
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

    // 打开本机文件夹：服务端只接受「已知会话的 cwd」，这里只负责发请求。
    function openFolder(folder) {
      const wanted = String(folder || '');
      if (!wanted) return;
      fetch(endpointOf('dsh-hands/open-folder'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ path: wanted }),
      }).catch(() => {
        // 打不开就算了，别让面板报错
      });
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

    // 没名字时只展示 sid 短码，不把内部 key（例如 hand/临时-日期）当标题。
    function sessionDisplayName(row) {
      const name = String(row?.name || '').trim();
      if (name) return name;
      let sid = String(row?.conversationId || '').trim();
      if (!sid) {
        const matched = String(row?.key || row?.sessionKey || '').match(/\/sid:([^/]+)/);
        sid = matched ? matched[1] : '';
      }
      return sid ? `未命名会话（${sid.slice(0, 8)}）` : '未命名会话';
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

    // 与服务端 index.js:deriveBlocksFromText 保持同一套工具行规则。
    // 仅用于结构化 blocks 缺失时的最后兜底，避免把尾部截断的原文当普通段落从头渲染。
    function deriveBlocksFromText(text) {
      const blocks = [];
      let buf = '';
      const flushText = () => {
        const value = String(buf || '').trim();
        if (value) blocks.push({ kind: 'text', text: value });
        buf = '';
      };
      const pushTool = (name, detail = '', status = '') => {
        flushText();
        blocks.push({
          kind: 'tool',
          name: String(name || 'tool').trim().slice(0, 80) || 'tool',
          detail: String(detail || '').trim().slice(0, 200),
          status,
        });
      };
      for (const rawLine of String(text || '').split(/\r?\n/)) {
        const line = String(rawLine || '');
        if (line.startsWith('→ ')) {
          const value = line.slice(2);
          const cut = value.indexOf(': ');
          pushTool(cut > 0 ? value.slice(0, cut) : value, cut > 0 ? value.slice(cut + 2) : '');
          continue;
        }
        if (line.startsWith('[tool] ')) {
          pushTool(line.slice('[tool] '.length).trim());
          continue;
        }
        if (line.startsWith('$ ') || line.startsWith('✎ ')) {
          pushTool(line.slice(2).trim());
          continue;
        }
        if (line.startsWith('! ')) {
          pushTool(line.slice(2).trim(), '', 'error');
          continue;
        }
        if (line.trim()) buf += (buf ? '\n' : '') + line;
      }
      flushText();
      return blocks.slice(-80);
    }

    // 列表刷新只更新列表字段；blocks / 已取正文 / localApplied 等本地富数据按 id 保留。
    // blockCache 让「这一页暂时没返回某轮」或切会话后再回来也不会丢结构数据。
    function mergeTurnsById(existing, incoming, blockCache) {
      const before = new Map();
      for (const row of Array.isArray(existing) ? existing : []) {
        const id = String(row?.id || '');
        if (id) before.set(id, row);
      }
      return (Array.isArray(incoming) ? incoming : []).map((row) => {
        const id = String(row?.id || '');
        const previous = id ? before.get(id) : null;
        const merged = { ...(previous || {}), ...(row || {}) };
        for (const [field, value] of Object.entries(previous || {})) {
          if (merged[field] === undefined) merged[field] = value;
        }
        const cached = id && blockCache ? blockCache.get(id) : null;
        if (!Array.isArray(merged.blocks) && Array.isArray(previous?.blocks)) merged.blocks = previous.blocks;
        if (!Array.isArray(merged.blocks) && Array.isArray(cached?.blocks)) merged.blocks = cached.blocks;
        if (merged.blocksDerived == null && previous?.blocksDerived !== undefined) merged.blocksDerived = previous.blocksDerived;
        if (merged.blocksDerived === undefined && cached) merged.blocksDerived = cached.blocksDerived;
        if (id && blockCache && Array.isArray(merged.blocks)) {
          blockCache.set(id, { blocks: merged.blocks, blocksDerived: !!merged.blocksDerived });
        }
        return merged;
      });
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
      // id → 结构化 blocks；独立于轮次列表，SSE/refresh/切会话都不会抹掉。
      const turnBlocksById = new Map();
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

      async function loadSessions(hand, opts = {}) {
        const wanted = String(hand || '');
        if (!wanted) return [];
        const archived = !!opts.archived;
        const seq = (sessionSeq.get(wanted) || 0) + 1;
        sessionSeq.set(wanted, seq);
        const life = lifeToken;
        try {
          const data = await getJson(
            `dsh-hands/sessions?hand=${encodeURIComponent(wanted)}${archived ? '&archived=1' : ''}`,
          );
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
          const turns = mergeTurnsById(state.turnsByKey[wanted] || [], Array.isArray(data?.turns) ? data.turns : [], turnBlocksById);
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

      function queuedTurnId(id) {
        const wanted = String(id || '');
        if (!wanted) return false;
        return Object.values(state.turnsByKey).some(
          (rows) => Array.isArray(rows) && rows.some((row) => String(row?.id || '') === wanted && isQueued(row)),
        );
      }

      async function loadTurnBody(id, from = 0) {
        const wanted = String(id || '');
        if (!wanted || queuedTurnId(wanted)) return null;
        const life = lifeToken;
        try {
          const offset = Math.max(0, Math.trunc(Number(from) || 0));
          const data = await getJson(
            `dsh-hands/turn?id=${encodeURIComponent(wanted)}&from=${offset}`,
          );
          if (life !== lifeToken) return null;
          applyDelta(data?.id || wanted, data?.delta, data?.next, data?.from);
          if (Array.isArray(data?.blocks)) {
            applyBlocksToTurn(data.id || wanted, data.blocks, !!data.blocksDerived);
          } else if (offset === 0) {
            // 老服务端没带 blocks 时，前端用同一套规则再兜一次；仍不直接渲染截断原文。
            const derived = deriveBlocksFromText(state.liveByTurn[data?.id || wanted] || '');
            if (derived.length) applyBlocksToTurn(data.id || wanted, derived, true);
          }
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
          const incomingIds = new Set(incoming.map((row) => String(row?.id || '')).filter(Boolean));
          const older = existing.filter((row) => !incomingIds.has(String(row?.id || '')));
          const merged = mergeTurnsById(older, incoming, turnBlocksById)
            .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
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
        if (!wanted || queuedTurnId(wanted)) return Promise.resolve(null);
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

      async function archiveSession(key, archived, hand = '') {
        const wanted = String(key || '');
        if (!wanted) return { ok: false, error: 'key is required' };
        // key 形如 opencode/sid:xxx 或 opencode/名字；不能引用组件作用域里的 slice。
        const wantedHand = String(hand || wanted.split('/')[0] || state.selection.hand || '').trim();
        try {
          const data = await postJson('dsh-hands/archive-session', {
            key: wanted,
            hand: wantedHand,
            archived: archived !== false,
          });
          if (data?.ok !== true) throw new Error(String(data?.error || 'archive failed'));
          if (wantedHand) await loadSessions(wantedHand);
          loadAgents();
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
        if (id && !queuedTurnId(id) && state.liveByTurn[id] === undefined) ensureTurnBody(id, true);
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
        const turns = mergeTurnsById(state.turnsByKey[key] || [], data.turns, turnBlocksById);
        emit({ turnsByKey: { ...state.turnsByKey, [key]: turns } });
        if (state.selection.key === key) {
          const nextTurn = resolveTurnId(turns, state.selection.turnId);
          if (nextTurn !== state.selection.turnId) {
            emit({ selection: { ...state.selection, turnId: nextTurn } });
            writeSavedSelection();
          }
        }
      }

      // 把语义分块按 id 缓存，并挂到所有已加载列表里的同一轮；切走后再回来也能恢复。
      function applyBlocksToTurn(id, blocks, blocksDerived = false) {
        const turnId = String(id || '');
        if (!turnId || !Array.isArray(blocks)) return;
        turnBlocksById.set(turnId, { blocks, blocksDerived: !!blocksDerived });
        let changed = false;
        const turnsByKey = { ...state.turnsByKey };
        for (const [key, rows] of Object.entries(state.turnsByKey)) {
          let next = null;
          for (let index = 0; index < rows.length; index += 1) {
            if (String(rows[index]?.id || '') !== turnId) continue;
            if (!next) next = rows.slice();
            next[index] = { ...next[index], blocks, blocksDerived: !!blocksDerived };
          }
          if (next) {
            turnsByKey[key] = next;
            changed = true;
          }
        }
        if (changed) emit({ turnsByKey });
      }

      function handleLiveEvent(event) {
        const data = parseEvent(event);
        if (!data) return;
        appendLive(data.key, data.id, data.delta, data.next);
        if (Array.isArray(data.blocks)) applyBlocksToTurn(data.id, data.blocks);
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
        archiveSession,
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
      .dsh-hands-v2{position:relative;display:flex;flex-direction:column;flex:auto;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
      .dsh-hands-v2-body{display:flex;flex:1;min-width:0;min-height:0;overflow:hidden}
      .dsh-hands-async{flex:none;display:flex;flex-direction:column;gap:2px;margin:6px 8px 0;min-width:0}
      .dsh-hands-perms{flex:none;display:flex;flex-direction:column;gap:4px;margin:6px 8px 0}
      .dsh-hands-perm{display:flex;align-items:center;gap:6px;min-width:0;padding:5px 8px;border:.5px solid var(--dsw-alias-state-warn-primary);border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent)}
      .dsh-hands-permText{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
      .dsh-hands-permAllow,.dsh-hands-permReject{flex:none;padding:1px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;line-height:16px;cursor:pointer}
      .dsh-hands-permAllow{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
      .dsh-hands-permReject:hover{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
      .dsh-hands-async{position:absolute;left:8px;bottom:6px;z-index:6;max-width:calc(100% - 16px);display:flex;flex-direction:column;align-items:flex-start}
      .dsh-hands-asyncbar{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:2px 8px;border:0;border-radius:999px;background:var(--dsw-alias-bg-secondary);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
      .dsh-hands-asyncbar:hover{color:var(--dsw-alias-label-primary)}
      .dsh-hands-asynclist{display:flex;flex-direction:column;gap:2px;margin-top:2px;padding:4px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);max-height:180px;overflow:auto}
      .dsh-hands-asyncrow{display:flex;align-items:center;gap:6px;min-width:0;padding:2px 4px;border-radius:5px;font-size:10.5px;line-height:15px;color:var(--dsw-alias-label-secondary)}
      .dsh-hands-asyncrowHand{flex:none;font-weight:600;color:var(--dsw-alias-label-primary)}
      .dsh-hands-asyncrowStatus{flex:none;font-variant-numeric:tabular-nums}
      .dsh-hands-asyncrowDelivery{flex:none;opacity:.85}
      .dsh-hands-asyncrowId{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.6}
      .dsh-hands-asyncrowError{flex:none;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-state-error-primary)}
      .dsh-hands-asyncrowCancel{flex:none;padding:0 6px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:10px;line-height:15px;cursor:pointer}
      .dsh-hands-asyncrowCancel:hover{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
      .dsh-hands-asyncrow[data-status=failed] .dsh-hands-asyncrowStatus{color:var(--dsw-alias-state-error-primary)}
      .dsh-hands-asyncrow[data-status=queued] .dsh-hands-asyncrowStatus{color:var(--dsw-alias-state-warn-primary)}
      .dsh-hands-v2-error{flex:none;margin:6px 8px 0;padding:5px 8px;border:.5px solid var(--dsw-alias-state-error-primary);border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px;overflow-wrap:anywhere}
      .dsh-hands-v2,.dsh-hands-v2 *{box-sizing:border-box}
      .dsh-hands-v2-rail{flex:none;display:flex;flex-direction:row;align-items:center;gap:4px;width:auto;min-width:0;padding:6px 8px;border-right:0;border-bottom:.5px solid var(--dsw-alias-border-l2);overflow-x:auto;overflow-y:hidden}
      .dsh-hands-v2-body{flex:1;display:flex;min-width:0;min-height:0}
      .dsh-hands-v2-topwrap{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
      .dsh-hands-v2-railHead{flex:none;padding:0 6px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}
      .dsh-hands-v2-agentList{flex:1;min-height:0;display:flex;flex-direction:row;align-items:center;gap:2px;overflow-x:auto;overscroll-behavior-x:contain}
      .dsh-hands-v2-agent{position:relative;flex:none;display:flex;align-items:center;gap:6px;width:auto;min-height:0;padding:4px 10px;border:0;border-radius:8px 8px 0 0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;white-space:nowrap}
      .dsh-hands-v2-agent:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .dsh-hands-v2-agent[data-active=true]{background:var(--dsw-alias-bg-layer-1);border-bottom:2px solid var(--dsw-alias-brand-primary)}
      .dsh-hands-v2-agentIcon{flex:none;display:flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:5px;background:color-mix(in srgb,var(--hand-color,var(--dsw-alias-label-tertiary)) 14%,transparent);color:var(--hand-color,var(--dsw-alias-label-secondary))}
      .dsh-hands-v2-agentIconText{font-size:11.5px;font-weight:600;letter-spacing:.02em}
      .dsh-hands-v2-agentText{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
      .dsh-hands-v2-agentName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:14px;color:var(--dsw-alias-label-primary);font-size:12.5px;line-height:17px;font-weight:500}
      .dsh-hands-v2-agentMeta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px}
      .dsh-hands-v2-agentDot{position:absolute;top:8px;right:8px;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary);opacity:.4}
      .dsh-hands-v2-agentDot[data-tone=running]{background:var(--dsw-alias-state-success-primary);opacity:1;--tone-color:var(--dsw-alias-state-success-primary);animation:dsh-hands-pulse 1.6s ease-out infinite}
      .dsh-hands-v2-agentDot[data-tone=queued]{background:var(--dsw-alias-state-warn-primary);opacity:1;--tone-color:var(--dsw-alias-state-warn-primary)}
      .dsh-hands-v2-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--tone-color,var(--dsw-alias-label-tertiary))}
      .dsh-hands-v2-dot[data-tone=running]{animation:dsh-hands-pulse 1.6s ease-out infinite}
      .dsh-hands-v2-sessions{flex:none;display:flex;flex-direction:column;width:clamp(150px,22%,200px);min-width:0;border-right:.5px solid var(--dsw-alias-border-l2);overflow:hidden}
      .dsh-hands-v2[data-mode=narrow] .dsh-hands-v2-rail{width:auto}
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
      .dsh-hands-v2-group{display:flex;flex-direction:column;gap:2px;min-width:0}
      .dsh-hands-v2-search{flex:none;padding:0 8px 6px}
      .dsh-hands-v2-check{display:inline-flex;align-items:center;gap:4px;color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:15px;cursor:pointer}
      .dsh-hands-v2-grow{flex:1}
      .dsh-hands-v2-stopBtn{flex:none;padding:2px 10px;border-radius:999px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 60%,transparent);background:transparent;color:var(--dsw-alias-state-error-primary);font:inherit;font-size:11px;line-height:18px;cursor:pointer}
      .dsh-hands-v2-search{display:flex;align-items:center;gap:6px;min-width:0}
      .dsh-hands-v2-searchInput{flex:1;min-width:0;box-sizing:border-box;padding:3px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;line-height:16px}
      .dsh-hands-v2-searchInput::placeholder{color:var(--dsw-alias-label-tertiary)}
      .dsh-hands-v2-searchInput:focus{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
      .dsh-hands-v2-folder{display:flex;align-items:center;gap:2px;min-width:0;border-radius:6px}
      .dsh-hands-v2-folderToggle{display:flex;align-items:center;gap:5px;flex:1;min-width:0;padding:3px 4px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-weight:600;font-size:11.5px;line-height:18px;text-align:left;cursor:pointer;overflow:hidden}
      .dsh-hands-v2-folderToggle:hover{background:var(--dsw-alias-bg-secondary)}
      .dsh-hands-v2-folderOpen{flex:none;width:20px;height:20px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;line-height:20px;cursor:pointer}
      .dsh-hands-v2-folderOpen:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      .dsh-hands-v2-folderCaret{flex:none;width:10px;font-size:10px;opacity:.75}
      .dsh-hands-v2-folderName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
      .dsh-hands-v2-folderCount{flex:none;opacity:.7;font-variant-numeric:tabular-nums}
      .dsh-hands-v2-archRow{display:flex;align-items:center;gap:5px;margin:2px 0 1px 12px;padding:3px 4px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-weight:400;font-size:10.5px;line-height:16px;text-align:left;cursor:pointer}
      .dsh-hands-v2-archRow:hover{background:var(--dsw-alias-bg-secondary)}
      .dsh-hands-v2-archLabel{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-hands-v2-archNum{opacity:.6}
      .dsh-hands-v2-row[data-archived=true]{margin-left:24px;opacity:.65}
      .dsh-hands-v2-rowArch{flex:none;width:16px;height:16px;line-height:16px;text-align:center;border-radius:50%;color:var(--dsw-alias-label-tertiary);font-size:11px;opacity:0;transition:opacity .12s}
      .dsh-hands-v2-row:hover .dsh-hands-v2-rowArch{opacity:1}
      .dsh-hands-v2-rowArch:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      .dsh-hands-v2-row{position:relative;flex:none;display:flex;flex-direction:column;gap:2px;width:100%;margin-left:12px;padding:6px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;text-align:left;cursor:pointer;overflow:hidden}
      .dsh-hands-v2-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .dsh-hands-v2-row[data-active=true]{border-left-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-hover)}
      .dsh-hands-v2-row::before{content:'';position:absolute;top:7px;bottom:7px;left:0;width:2px;border-radius:1px;background:transparent}
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
      .dsh-hands-v2-fallback{flex:none;padding:0 5px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;color:var(--dsw-alias-label-tertiary);font-size:9px;line-height:13px}
      .dsh-hands-v2-bubbleIcon{display:inline-flex;align-items:center;flex:none}
      .dsh-hands-v2-bubbleName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-hands-v2-bubbleText{margin:0;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;font-size:12px;line-height:19px;color:var(--dsw-alias-label-primary)}
      .dsh-hands-blocks{display:flex;flex-direction:column;gap:6px;min-width:0}
      .dsh-hands-blockReasoning{border-left:2px solid var(--dsw-alias-border-l2);padding-left:8px;color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:17px}
      .dsh-hands-blockReasoningHead{cursor:pointer;color:var(--dsw-alias-label-tertiary);font-size:10.5px;line-height:15px;user-select:none}
      .dsh-hands-blockReasoningBody{margin-top:4px;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}
      .dsh-hands-blockTool{min-width:0;padding:2px 6px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-secondary);color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:10.5px;line-height:16px}
      .dsh-hands-blockToolHead{display:flex;align-items:center;gap:6px;min-width:0;cursor:pointer;list-style:none}
      .dsh-hands-blockToolHead::-webkit-details-marker{display:none}
      .dsh-hands-blockToolBody{margin:4px 0 2px;padding:6px 8px;border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);max-height:30vh;overflow:auto;white-space:pre-wrap;word-break:break-word;font:inherit;font-size:10.5px;line-height:16px}
      .dsh-hands-blockToolName{flex:none;font-weight:600}
      .dsh-hands-blockToolDetail{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85}
      .dsh-hands-blockToolState{flex:none;opacity:.85}
      .dsh-hands-blockTool[data-status=completed] .dsh-hands-blockToolState,.dsh-hands-blockTool[data-status=ok] .dsh-hands-blockToolState{color:var(--dsw-alias-state-success-primary)}
      .dsh-hands-blockTool[data-status=failed] .dsh-hands-blockToolState,.dsh-hands-blockTool[data-status=error] .dsh-hands-blockToolState{color:var(--dsw-alias-state-error-primary)}
      .dsh-hands-blockText{white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}
      .dsh-hands-md{display:flex;flex-direction:column;gap:4px;min-width:0;max-width:100%}
      .dsh-hands-mdGap{height:8px}
      .dsh-hands-mdLine{white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}
      .dsh-hands-mdHeading{font-weight:600;font-size:12.5px;line-height:18px;margin:0}
      .dsh-hands-mdHeading[data-level="1"]{font-size:18px;line-height:24px}
      .dsh-hands-mdHeading[data-level="2"]{font-size:16px;line-height:22px}
      .dsh-hands-mdHeading[data-level="3"]{font-size:14px;line-height:20px}
      .dsh-hands-mdList{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:2px}
      .dsh-hands-mdQuote{margin:0;padding-left:8px;border-left:2px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
      .dsh-hands-mdCode{display:flex;flex-direction:column;min-width:0;max-width:100%;margin:4px 0;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);overflow:hidden}
      .dsh-hands-mdCodeHead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 10px;border-bottom:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:10.5px;line-height:16px}
      .dsh-hands-mdCopy{flex:none;padding:0;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}
      .dsh-hands-mdCopy:hover{color:var(--dsw-alias-label-primary)}
      .dsh-hands-mdCodeBody{min-width:0;max-width:100%;max-height:40vh;margin:0;padding:8px 10px;overflow:auto;overscroll-behavior:contain}
      .dsh-hands-mdCodeBody code{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;line-height:17px;white-space:pre;word-break:normal;overflow-wrap:normal}
      .dsh-hands-mdTableScroll{min-width:0;max-width:100%;margin:4px 0;overflow-x:auto;overscroll-behavior-x:contain}
      .dsh-hands-mdTableScroll table{width:max-content;max-width:none;border-collapse:collapse;font-size:11.5px;line-height:17px}
      .dsh-hands-mdTableScroll th,.dsh-hands-mdTableScroll td{padding:5px 9px;border-bottom:.5px solid var(--dsw-alias-border-l2);text-align:left;white-space:nowrap}
      .dsh-hands-mdTableScroll th{font-weight:600;color:var(--dsw-alias-label-primary)}
      .dsh-hands-md code,.dsh-hands-v2-bubbleText code{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);padding:1px 4px;border-radius:4px}
      .dsh-hands-mdCodeBody code{background:none;padding:0;border-radius:0}
      .dsh-hands-v2-bubble .md-code-block{min-width:0;max-width:100%}
      .dsh-hands-v2-bubble .md-code-block:not([data-code-wrap="true"]) pre{white-space:pre;overflow-x:auto;word-break:normal;overflow-wrap:normal}
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

    // ── markdown：优先用 DSH 原生组件，拿不到就用自带的极简渲染 ─────────────
    // 原生那个（MarkdownText）在 staticModules 里，和聊天面板是同一个组件；
    // 万一某个版本没导出它，也不能让手下的话退化成纯文本。
    function renderInline(text, keyPrefix) {
      const nodes = [];
      const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\))/g;
      let last = 0;
      let match;
      let seq = 0;
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) nodes.push(text.slice(last, match.index));
        const token = match[0];
        const key = `${keyPrefix}i${seq++}`;
        if (token.startsWith('`')) {
          nodes.push(h('code', { key }, token.slice(1, -1)));
        } else if (token.startsWith('**')) {
          nodes.push(h('strong', { key }, token.slice(2, -2)));
        } else if (token.startsWith('*')) {
          nodes.push(h('em', { key }, token.slice(1, -1)));
        } else {
          const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
          nodes.push(
            link
              ? h('a', { key, href: link[2], target: '_blank', rel: 'noreferrer' }, link[1])
              : token,
          );
        }
        last = match.index + token.length;
      }
      if (last < text.length) nodes.push(text.slice(last));
      return nodes;
    }

    function tableCells(line) {
      let value = line.trim();
      if (value.startsWith('|')) value = value.slice(1);
      if (value.endsWith('|')) value = value.slice(0, -1);
      return value.split('|').map((cell) => cell.trim());
    }

    function tableDelimiter(line) {
      const cells = tableCells(line);
      return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
    }

    function tableAlignment(line) {
      return tableCells(line).map((cell) => {
        if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
        if (cell.endsWith(':')) return 'right';
        return 'left';
      });
    }

    // 围栏按行识别，流式输出遇到未闭合围栏时也把余下内容当代码渲染。
    function markdownSegments(source) {
      const lines = source.split('\n');
      const segments = [];
      let prose = [];
      let fence = null;
      const flushProse = () => {
        if (!prose.length) return;
        segments.push({ kind: 'prose', lines: prose });
        prose = [];
      };
      for (const line of lines) {
        if (!fence) {
          const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
          if (open) {
            flushProse();
            fence = { marker: open[1][0], size: open[1].length, lang: open[2].trim(), code: [] };
          } else {
            prose.push(line);
          }
          continue;
        }
        const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
        if (close && close[1][0] === fence.marker && close[1].length >= fence.size) {
          segments.push({ kind: 'code', lang: fence.lang, code: fence.code.join('\n').replace(/\n$/, '') });
          fence = null;
        } else {
          fence.code.push(line);
        }
      }
      flushProse();
      if (fence) segments.push({ kind: 'code', lang: fence.lang, code: fence.code.join('\n'), streaming: true });
      return segments;
    }

    function MarkdownCode({ lang, code, streaming, labels }) {
      const [copied, setCopied] = React.useState(false);
      const timer = React.useRef(null);
      React.useEffect(() => () => globalThis.clearTimeout(timer.current), []);
      const copy = async () => {
        try {
          if (!globalThis.navigator?.clipboard?.writeText) return;
          await globalThis.navigator.clipboard.writeText(code);
          setCopied(true);
          globalThis.clearTimeout(timer.current);
          timer.current = globalThis.setTimeout(() => setCopied(false), 1000);
        } catch {
          // 浏览器拒绝剪贴板时保持原文案，下一次还能再试。
        }
      };
      const copyLabel = copied ? labels.code.copiedLabel : labels.code.copyLabel;
      return h(
        'div',
        { className: 'dsh-hands-mdCode', 'data-lang': lang || undefined, 'data-streaming': streaming ? 'true' : undefined },
        h(
          'div',
          { className: 'dsh-hands-mdCodeHead' },
          h('span', null, lang || labels.code.toolbarLabels.codeLabel),
          h('button', { type: 'button', className: 'dsh-hands-mdCopy', onClick: copy, 'aria-label': copyLabel }, copyLabel),
        ),
        h('pre', { className: 'dsh-hands-mdCodeBody' }, h('code', null, code)),
      );
    }

    // 只覆盖聊天里真会出现的语法；原生组件缺席时才走这里。
    function MarkdownLite({ text, streaming, labels = MARKDOWN_LABELS.en }) {
      const source = String(text || '');
      const out = [];
      markdownSegments(source).forEach((segment, segmentIndex) => {
        if (segment.kind === 'code') {
          out.push(h(MarkdownCode, {
            key: `fence${segmentIndex}`,
            lang: segment.lang,
            code: segment.code,
            streaming: segment.streaming,
            labels,
          }));
          return;
        }
        const lines = segment.lines;
        let list = null;
        const flushList = () => {
          if (!list) return;
          out.push(h(list.type, {
            key: `${list.type}${out.length}`,
            className: 'dsh-hands-mdList',
            start: list.type === 'ol' && list.start !== 1 ? list.start : undefined,
          }, list.items));
          list = null;
        };
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
          const line = lines[lineIndex];
          const key = `l${segmentIndex}-${lineIndex}`;
          const trimmed = line.trim();
          if (!trimmed) {
            flushList();
            out.push(h('div', { key, className: 'dsh-hands-mdGap', 'aria-hidden': true }));
            continue;
          }
          const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
          if (heading) {
            flushList();
            out.push(h(`h${heading[1].length}`, { key, className: 'dsh-hands-mdHeading', 'data-level': heading[1].length }, renderInline(heading[2], key)));
            continue;
          }
          const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
          const ordered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed);
          if (bullet || ordered) {
            const type = bullet ? 'ul' : 'ol';
            const start = ordered ? Number(ordered[1]) : 1;
            if (!list || list.type !== type) {
              flushList();
              list = { type, start, items: [] };
            }
            list.items.push(h('li', { key }, renderInline(bullet ? bullet[1] : ordered[2], key)));
            continue;
          }
          const quote = /^>\s?(.*)$/.exec(trimmed);
          if (quote) {
            flushList();
            const quoteLines = [];
            while (lineIndex < lines.length) {
              const next = /^>\s?(.*)$/.exec(lines[lineIndex].trim());
              if (!next) break;
              quoteLines.push(next[1]);
              lineIndex += 1;
            }
            lineIndex -= 1;
            out.push(h(
              'blockquote',
              { key, className: 'dsh-hands-mdQuote' },
              quoteLines.map((value, index) => h('div', { key: `${key}q${index}` }, renderInline(value, `${key}q${index}`))),
            ));
            continue;
          }
          if (lineIndex + 1 < lines.length && line.includes('|') && tableDelimiter(lines[lineIndex + 1])) {
            flushList();
            const header = tableCells(line);
            const align = tableAlignment(lines[lineIndex + 1]);
            const rows = [];
            lineIndex += 2;
            while (lineIndex < lines.length && lines[lineIndex].trim() && lines[lineIndex].includes('|')) {
              rows.push(tableCells(lines[lineIndex]));
              lineIndex += 1;
            }
            lineIndex -= 1;
            out.push(h(
              'div',
              { key, className: 'dsh-hands-mdTableScroll', tabIndex: 0 },
              h(
                'table',
                null,
                h('thead', null, h('tr', null, header.map((cell, index) => h(
                  'th',
                  { key: `${key}h${index}`, style: { textAlign: align[index] || 'left' } },
                  renderInline(cell, `${key}h${index}`),
                )))),
                rows.length
                  ? h('tbody', null, rows.map((row, rowIndex) => h('tr', { key: `${key}r${rowIndex}` }, row.map((cell, cellIndex) => h(
                    'td',
                    { key: `${key}r${rowIndex}c${cellIndex}`, style: { textAlign: align[cellIndex] || 'left' } },
                    renderInline(cell, `${key}r${rowIndex}c${cellIndex}`),
                  )))))
                  : null,
              ),
            ));
            continue;
          }
          flushList();
          out.push(h('div', { key, className: 'dsh-hands-mdLine' }, renderInline(line, key)));
        }
        flushList();
      });
      return h(
        'div',
        { className: 'dsh-hands-md', 'data-streaming': streaming ? 'true' : 'false' },
        out.length ? out : source,
      );
    }

    function MarkdownBlock({ text, streaming, t, labels }) {
      const content = String(text || '');
      const resolvedLabels = labels || markdownLabelsFor(t);
      if (MarkdownText) {
        return h(MarkdownText, { text: content, streaming: !!streaming, labels: resolvedLabels, variant: 'body' });
      }
      return h(MarkdownLite, { text: content, streaming: !!streaming, labels: resolvedLabels });
    }

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
              React.Fragment,
              null,
              MarkdownBlock ? h(MarkdownBlock, { text, streaming: !!running, t }) : h('pre', { className: 'dsh-hands-streamText' }, text),
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
        const running = (state.running || []).map((entry) =>
          isQueued(entry)
            ? { ...entry, running: false }
            : {
                ...entry,
                running: true,
                status: 'RUNNING',
              },
        );
        return running.concat(state.entries || []);
      }, [state.running, state.entries]);

      const runningCount = rows.filter((entry) => turnIsRunning(entry)).length;
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
        if (row && !turnIsRunning(row) && !isQueued(row)) requestDetail(row.id);
      }, [activeId, rows, requestDetail]);

      const toggle = (row) => {
        const next = effectiveOpenId === row.id ? '' : row.id;
        setOpenId(next);
        if (next && !turnIsRunning(row) && !isQueued(row)) requestDetail(row.id);
      };

      function outputOf(row) {
        return turnIsRunning(row)
          ? row.output || ''
          : outputCache.current.get(row.id) || details[row.id] || row.output || row.excerpt || '';
      }

      function renderRow(row, index) {
        const tone = toneOf(row);
        const running = turnIsRunning(row);
        const queued = isQueued(row);
        const hand = String(row.hand || '').toLowerCase();
        const open = effectiveOpenId === row.id;
        const elapsed = running
          ? Math.max(0, Date.now() - Date.parse(row.startedAt))
          : queued
            ? 0
            : row.ms;
        const prompt = row.prompt || t('noPrompt');
        const firstLine = prompt.split(/\r?\n/)[0].slice(0, 140);
        const output = outputOf(row);
        const detailBits = [];
        if (row.cwd) detailBits.push(row.cwd);
        if (row.model) detailBits.push(row.model);
        if (!running && row.exitCode !== undefined && row.exitCode !== null) {
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
              statusLabelWithQueue(row, t),
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
            h('span', null, `${t('session')} · ${row.session || row.name || sessionDisplayName(row) || t('noSession')}`),
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
                  output || running || !row.error
                    ? h(Stream, { key: row.id || `stream-${index}`, text: output, running, t })
                    : null,
                  !running && row.error && !output
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

    // 各家的图形标：统一 24 视框、1.6 描边、圆头圆角，颜色走 currentColor，
    // 外层给什么色就是什么色（主题换了也跟着换）。
    const HAND_ICON_PATHS = {
      // Anthropic 的星芒：六条线穿心，十二个尖
      claude: [
        'M12 2.4V21.6',
        'M2 12h20',
        'M3.5 6.2l17 11.6',
        'M20.5 6.2l-17 11.6',
        'M7.1 3.6l9.8 16.8',
        'M16.9 3.6L7.1 20.4',
      ],
      // OpenAI 的花结：两层六边形错开
      codex: [
        'M12 2.8l7.8 4.6v9.2L12 21.2 4.2 16.6V7.4z',
        'M12 6.6l4.6 2.7v5.4L12 17.4 7.4 14.7V9.3z',
      ],
      // Antigravity：一枚起飞的箭头 + 尾焰
      agy: ['M12 2.6c2.6 3 3.9 6.6 3.9 9.6H8.1c0-3 1.3-6.6 3.9-9.6z', 'M8.1 12.2L5.2 16l2.9-.6', 'M15.9 12.2L18.8 16l-2.9-.6', 'M12 14.6v6.8'],
      // opencode：终端提示符
      opencode: ['M3.2 5.2h17.6v13.6H3.2z', 'M7.2 10l2.8 2.4-2.8 2.4', 'M12.4 14.8h4.4'],
    };

    // 真图标：Google / OpenAI / Anthropic / OpenCode 的官方 mark（单色）。
    const HAND_BRAND_PATHS = {
      agy: 'M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z',
      codex: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z',
      claude: 'M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z',
      opencode: 'M22 24H2V0h20zM17 4.8H7v14.4h10z',
    };

    // 官方 favicon（爸爸 2026-11-21 21:02 给的地址）：SVG 直接内联，Claude 的 .ico 转 PNG。
    const HAND_ICON_SRC = {
      agy: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEzNiAxMzYiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHN0eWxlPgogICAgLmZhdi1iZyB7IGZpbGw6ICNGRkZGRkY7IH0KICAgIEBtZWRpYSAocHJlZmVycy1jb2xvci1zY2hlbWU6IGRhcmspIHsKICAgICAgLmZhdi1iZyB7IGZpbGw6ICMwMDAwMDA7IH0KICAgIH0KICA8L3N0eWxlPgogIDxjaXJjbGUgY2xhc3M9ImZhdi1iZyIgY3g9IjY4IiBjeT0iNjgiIHI9IjY1IiBmaWxsPSIjRkZGRkZGIi8+CiAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTIgMTApIj4KICAgIDxwYXRoIGQ9Ik04OS42OTkyIDkzLjY5NUM5NC4zNjU5IDk3LjE5NSAxMDEuMzY2IDk0Ljg2MTcgOTQuOTQ5MiA4OC40NDVDNzUuNjk5MiA2OS43NzgzIDc5Ljc4MjUgMTguNDQ1IDU1Ljg2NTkgMTguNDQ1QzMxLjk0OTIgMTguNDQ1IDM2LjAzMjUgNjkuNzc4MyAxNi43ODI1IDg4LjQ0NUM5Ljc4MjUxIDk1LjQ0NSAxNy4zNjU4IDk3LjE5NSAyMi4wMzI1IDkzLjY5NUM0MC4xMTU5IDgxLjQ0NSAzOC45NDkyIDU5Ljg2MTcgNTUuODY1OSA1OS44NjE3QzcyLjc4MjUgNTkuODYxNyA3MS42MTU5IDgxLjQ0NSA4OS42OTkyIDkzLjY5NVoiIGZpbGw9IiMzMTg2RkYiLz4KICAgIDxtYXNrIGlkPSJhZ19mYXZfbSIgc3R5bGU9Im1hc2stdHlwZTphbHBoYSIgbWFza1VuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeD0iMTMiIHk9IjE4IiB3aWR0aD0iODUiIGhlaWdodD0iNzgiPgogICAgICA8cGF0aCBkPSJNODkuNjk5MiA5My42OTVDOTQuMzY1OSA5Ny4xOTUgMTAxLjM2NiA5NC44NjE3IDk0Ljk0OTIgODguNDQ1Qzc1LjY5OTIgNjkuNzc4MyA3OS43ODI1IDE4LjQ0NSA1NS44NjU5IDE4LjQ0NUMzMS45NDkyIDE4LjQ0NSAzNi4wMzI1IDY5Ljc3ODMgMTYuNzgyNSA4OC40NDVDOS43ODI1MSA5NS40NDUgMTcuMzY1OCA5Ny4xOTUgMjIuMDMyNSA5My42OTVDNDAuMTE1OSA4MS40NDUgMzguOTQ5MiA1OS44NjE3IDU1Ljg2NTkgNTkuODYxN0M3Mi43ODI1IDU5Ljg2MTcgNzEuNjE1OSA4MS40NDUgODkuNjk5MiA5My42OTVaIiBmaWxsPSJibGFjayIvPgogICAgPC9tYXNrPgogICAgPGcgbWFzaz0idXJsKCNhZ19mYXZfbSkiPgogICAgICA8ZyBmaWx0ZXI9InVybCgjYWdfZmF2X2YwKSI+PGVsbGlwc2UgY3g9IjIyLjc4NzMiIGN5PSIyNi44MDk4IiByeD0iMjIuNzg3MyIgcnk9IjI2LjgwOTgiIHRyYW5zZm9ybT0ibWF0cml4KC0wLjExMjc4NCAwLjk5MzYyIC0wLjk5MzYyIC0wLjExMjc4MSA2Ni4yNDczIC0xNS41MzQ0KSIgZmlsbD0iI0ZGRTQzMiIvPjwvZz4KICAgICAgPGcgZmlsdGVyPSJ1cmwoI2FnX2Zhdl9mMSkiPjxlbGxpcHNlIGN4PSI5Ni40OTEiIGN5PSIzNS4xMjMxIiByeD0iMjkuNTAwNyIgcnk9IjMwLjE0OTIiIHRyYW5zZm9ybT0icm90YXRlKDc2LjkyNDMgOTYuNDkxIDM1LjEyMzEpIiBmaWxsPSIjRkM0MTNEIi8+PC9nPgogICAgICA8ZyBmaWx0ZXI9InVybCgjYWdfZmF2X2YyKSI+PGVsbGlwc2UgY3g9IjkuMDI5ODgiIGN5PSI0MS42NjQ3IiByeD0iMzAuODMyIiByeT0iMzkuOTQxNyIgdHJhbnNmb3JtPSJyb3RhdGUoNzQuMTI1NyA5LjAyOTg4IDQxLjY2NDcpIiBmaWxsPSIjMDBCOTVDIi8+PC9nPgogICAgICA8ZyBmaWx0ZXI9InVybCgjYWdfZmF2X2YzKSI+PGVsbGlwc2UgY3g9IjExLjIyMTIiIGN5PSI0Mi44OTE1IiByeD0iMzAuMjIiIHJ5PSIzMy4yNjk1IiB0cmFuc2Zvcm09InJvdGF0ZSg0NS42MDY1IDExLjIyMTIgNDIuODkxNSkiIGZpbGw9IiMwMEI5NUMiLz48L2c+CiAgICAgIDxnIGZpbHRlcj0idXJsKCNhZ19mYXZfZjQpIj48ZWxsaXBzZSBjeD0iNzUuNzU0NiIgY3k9IjEwNC44MjIiIHJ4PSIyOS4wMTc3IiByeT0iMjcuOTQzIiB0cmFuc2Zvcm09InJvdGF0ZSg3Ni45MjQzIDc1Ljc1NDYgMTA0LjgyMikiIGZpbGw9IiMzMTg2RkYiLz48L2c+CiAgICAgIDxnIGZpbHRlcj0idXJsKCNhZ19mYXZfZjUpIj48ZWxsaXBzZSBjeD0iMzMuNTY2MSIgY3k9IjM1LjQwNDMiIHJ4PSIzMy41NjYxIiByeT0iMzUuNDA0MyIgdHJhbnNmb3JtPSJtYXRyaXgoLTAuNDA5NTM5IDAuOTEyMjkzIC0wLjkxMjI5NCAtMC40MDk1MzcgMTAxLjI1IC0xNS4xNjc0KSIgZmlsbD0iI0ZCQkMwNCIvPjwvZz4KICAgICAgPGcgZmlsdGVyPSJ1cmwoI2FnX2Zhdl9mNikiPjxwYXRoIGQ9Ik0yLjU2ODAyIDE0OS42OTVDLTE1LjgxMTYgMTQyLjQ4IDE1LjU5ODcgODMuMTE2MyAyMy40MDkzIDYzLjIyMDNDMzEuMjIgNDMuMzI0NCA1Mi40NTE0IDMzLjA0NDcgNzAuODMxIDQwLjI2Qzg5LjIxMDcgNDcuNDc1MyAxMTAuOTk2IDg3LjIxNjIgMTAzLjE4NSAxMDcuMTEyQzk1LjM3NDIgMTI3LjAwOCAyMC45NDc3IDE1Ni45MSAyLjU2ODAyIDE0OS42OTVaIiBmaWxsPSIjMzE4NkZGIi8+PC9nPgogICAgICA8ZyBmaWx0ZXI9InVybCgjYWdfZmF2X2Y3KSI+PHBhdGggZD0iTTExMy45MzQgNzUuODA3OUMxMDkuMDEzIDgxLjU1MDkgOTYuMTcyNCA3OC42MjI0IDg1LjI1MyA2OS4yNjY3Qzc0LjMzMzUgNTkuOTExIDY5LjQ3MDQgNDcuNjcxMSA3NC4zOTEgNDEuOTI4Qzc5LjMxMTYgMzYuMTg1IDkyLjE1MjUgMzkuMTEzNiAxMDMuMDcyIDQ4LjQ2OTJDMTEzLjk5MSA1Ny44MjQ5IDExOC44NTUgNzAuMDY0OCAxMTMuOTM0IDc1LjgwNzlaIiBmaWxsPSIjNzQ5QkZGIi8+PC9nPgogICAgICA8ZyBmaWx0ZXI9InVybCgjYWdfZmF2X2Y4KSI+PGVsbGlwc2UgY3g9IjkyLjYxMSIgY3k9IjIzLjc5NjIiIHJ4PSI0NC4yNDExIiByeT0iMjcuNTAxNiIgdHJhbnNmb3JtPSJyb3RhdGUoMzQuMDc2MyA5Mi42MTEgMjMuNzk2MikiIGZpbGw9IiNGQzQxM0QiLz48L2c+CiAgICAgIDxnIGZpbHRlcj0idXJsKCNhZ19mYXZfZjkpIj48ZWxsaXBzZSBjeD0iMjMuNDk0OSIgY3k9IjI5LjU4ODciIHJ4PSIyMy43MDcxIiByeT0iMTMuNzg2OSIgdHJhbnNmb3JtPSJyb3RhdGUoMTEyLjUxNiAyMy40OTQ5IDI5LjU4ODcpIiBmaWxsPSIjRkZFRTQ4Ii8+PC9nPgogICAgPC9nPgogIDwvZz4KICA8ZGVmcz4KICAgIDxmaWx0ZXIgaWQ9ImFnX2Zhdl9mMCIgeD0iMi40OTM0OCIgeT0iLTI2LjU0MjMiIHdpZHRoPSI2OS4wODk5IiBoZWlnaHQ9IjYxLjI1MjUiIGZpbHRlclVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgY29sb3ItaW50ZXJwb2xhdGlvbi1maWx0ZXJzPSJzUkdCIj48ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSIzLjg5MDM0Ii8+PC9maWx0ZXI+CiAgICA8ZmlsdGVyIGlkPSJhZ19mYXZfZjEiIHg9IjI4Ljc1MjQiIHk9Ii0zMi4wMzMzIiB3aWR0aD0iMTM1LjQ3NyIgaGVpZ2h0PSIxMzQuMzEzIiBmaWx0ZXJVbml0cz0idXNlclNwYWNlT25Vc2UiIGNvbG9yLWludGVycG9sYXRpb24tZmlsdGVycz0ic1JHQiI+PGZlR2F1c3NpYW5CbHVyIHN0ZERldmlhdGlvbj0iMTguODA3OCIvPjwvZmlsdGVyPgogICAgPGZpbHRlciBpZD0iYWdfZmF2X2YyIiB4PSItNjIuMjg4NCIgeT0iLTIxLjkyNTMiIHdpZHRoPSIxNDIuNjM3IiBoZWlnaHQ9IjEyNy4xOCIgZmlsdGVyVW5pdHM9InVzZXJTcGFjZU9uVXNlIiBjb2xvci1pbnRlcnBvbGF0aW9uLWZpbHRlcnM9InNSR0IiPjxmZUdhdXNzaWFuQmx1ciBzdGREZXZpYXRpb249IjE1Ljk4ODQiLz48L2ZpbHRlcj4KICAgIDxmaWx0ZXIgaWQ9ImFnX2Zhdl9mMyIgeD0iLTUyLjU2OTciIHk9Ii0yMC44MzQ2IiB3aWR0aD0iMTI3LjU4MiIgaGVpZ2h0PSIxMjcuNDUyIiBmaWx0ZXJVbml0cz0idXNlclNwYWNlT25Vc2UiIGNvbG9yLWludGVycG9sYXRpb24tZmlsdGVycz0ic1JHQiI+PGZlR2F1c3NpYW5CbHVyIHN0ZERldmlhdGlvbj0iMTUuOTg4NCIvPjwvZmlsdGVyPgogICAgPGZpbHRlciBpZD0iYWdfZmF2X2Y0IiB4PSIxNy4zNjE5IiB5PSI0NS40NjQ2IiB3aWR0aD0iMTE2Ljc4NiIgaGVpZ2h0PSIxMTguNzE1IiBmaWx0ZXJVbml0cz0idXNlclNwYWNlT25Vc2UiIGNvbG9yLWludGVycG9sYXRpb24tZmlsdGVycz0ic1JHQiI+PGZlR2F1c3NpYW5CbHVyIHN0ZERldmlhdGlvbj0iMTUuMTkzNyIvPjwvZmlsdGVyPgogICAgPGZpbHRlciBpZD0iYWdfZmF2X2Y1IiB4PSItNy40NDc2NSIgeT0iLTYwLjQ3MzciIHdpZHRoPSIxMjUuMzAzIiBoZWlnaHQ9IjEyMi44NTgiIGZpbHRlclVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgY29sb3ItaW50ZXJwb2xhdGlvbi1maWx0ZXJzPSJzUkdCIj48ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSIxMy43Njk4Ii8+PC9maWx0ZXI+CiAgICA8ZmlsdGVyIGlkPSJhZ19mYXZfZjYiIHg9Ii0yNy43MDg2IiB5PSIxMy4zNTk3IiB3aWR0aD0iMTU3LjExOSIgaGVpZ2h0PSIxNjIuMDI5IiBmaWx0ZXJVbml0cz0idXNlclNwYWNlT25Vc2UiIGNvbG9yLWludGVycG9sYXRpb24tZmlsdGVycz0ic1JHQiI+PGZlR2F1c3NpYW5CbHVyIHN0ZERldmlhdGlvbj0iMTIuMjk3Ii8+PC9maWx0ZXI+CiAgICA8ZmlsdGVyIGlkPSJhZ19mYXZfZjciIHg9IjUwLjQ2MzgiIHk9IjE2Ljk4MSIgd2lkdGg9Ijg3LjM5NzMiIGhlaWdodD0iODMuNzczOCIgZmlsdGVyVW5pdHM9InVzZXJTcGFjZU9uVXNlIiBjb2xvci1pbnRlcnBvbGF0aW9uLWZpbHRlcnM9InNSR0IiPjxmZUdhdXNzaWFuQmx1ciBzdGREZXZpYXRpb249IjExLjAwMzYiLz48L2ZpbHRlcj4KICAgIDxmaWx0ZXIgaWQ9ImFnX2Zhdl9mOCIgeD0iMzQuMjYwNCIgeT0iLTI4LjQ1NyIgd2lkdGg9IjExNi43MDEiIGhlaWdodD0iMTA0LjUwNiIgZmlsdGVyVW5pdHM9InVzZXJTcGFjZU9uVXNlIiBjb2xvci1pbnRlcnBvbGF0aW9uLWZpbHRlcnM9InNSR0IiPjxmZUdhdXNzaWFuQmx1ciBzdGREZXZpYXRpb249IjkuMjkzODUiLz48L2ZpbHRlcj4KICAgIDxmaWx0ZXIgaWQ9ImFnX2Zhdl9mOSIgeD0iLTE1LjE1MjIiIHk9Ii0xNS45NDkzIiB3aWR0aD0iNzcuMjk0MSIgaGVpZ2h0PSI5MS4wNzYiIGZpbHRlclVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgY29sb3ItaW50ZXJwb2xhdGlvbi1maWx0ZXJzPSJzUkdCIj48ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSIxMS41MDI3Ii8+PC9maWx0ZXI+CiAgPC9kZWZzPgo8L3N2Zz4K',
      codex: 'data:image/svg+xml;base64,PCEtLSBodHRwczovL2dpdGh1Yi5jb20vb3BlbmFpL29wZW5haS9ibG9iL2JkOGFhZmRjMjQwMzM0MzE3YTNkNjk0N2UxMzRhZTA0ZmMwY2E4ODUvY2hhdGdwdC93ZWIvc3JjL2Fzc2V0cy9mYXZpY29uLnN2ZyAtLT4KPHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMTgwIgogIGhlaWdodD0iMTgwIgogIHZpZXdCb3g9IjAgMCAxODAgMTgwIgogIGZpbGw9Im5vbmUiCj4KICA8c3R5bGU+CiAgICA6cm9vdCB7CiAgICAgIGZpbGw6ICMwMDA7CiAgICB9CiAgICBAbWVkaWEgKHByZWZlcnMtY29sb3Itc2NoZW1lOiBkYXJrKSB7CiAgICAgIDpyb290IHsKICAgICAgICBmaWxsOiAjZmZmOwogICAgICB9CiAgICB9CiAgPC9zdHlsZT4KICA8cGF0aAogICAgZD0iTTEwMS4yMjggMTY0LjI0N0M5Ni4yNzc2IDE2NC4yNDcgOTEuNTc1MSAxNjMuMzA3IDg3LjEyMDEgMTYxLjQyNkM4Mi42NjUxIDE1OS41NDUgNzguNzA1MSAxNTYuOTIxIDc1LjI0MDEgMTUzLjU1NUM3MS40NzgxIDE1NC44NDIgNjcuNTY3NiAxNTUuNDg2IDYzLjUwODYgMTU1LjQ4NkM1Ni44NzU2IDE1NS40ODYgNTAuNzM3NiAxNTMuODUyIDQ1LjA5NDYgMTUwLjU4NUMzOS40NTE2IDE0Ny4zMTggMzQuODk3NiAxNDIuODYzIDMxLjQzMjYgMTM3LjIyQzI4LjA2NjYgMTMxLjU3NyAyNi4zODM2IDEyNS4yOTEgMjYuMzgzNiAxMTguMzYxQzI2LjM4MzYgMTE1LjQ5IDI2Ljc3OTYgMTEyLjM3MSAyNy41NzE2IDEwOS4wMDVDMjMuNjExNiAxMDUuMzQyIDIwLjU0MjYgMTAxLjEzNSAxOC4zNjQ2IDk2LjM4MjhDMTYuMTg2NiA5MS41MzE4IDE1LjA5NzYgODYuNDgyOCAxNS4wOTc2IDgxLjIzNThDMTUuMDk3NiA3NS44ODk4IDE2LjIzNjEgNzAuNzQxOCAxOC41MTMxIDY1Ljc5MThDMjAuNzkwMSA2MC44NDE4IDIzLjk1ODEgNTYuNTg0OCAyOC4wMTcxIDUzLjAyMDhDMzIuMTc1MSA0OS4zNTc4IDM2Ljk3NjYgNDYuODMzMyA0Mi40MjE2IDQ1LjQ0NzNDNDMuNTEwNiAzOS44MDQzIDQ1Ljc4NzYgMzQuNzU1MyA0OS4yNTI2IDMwLjMwMDNDNTIuODE2NiAyNS43NDYzIDU3LjE3MjYgMjIuMTgyMyA2Mi4zMjA2IDE5LjYwODNDNjcuNDY4NiAxNy4wMzQzIDcyLjk2MzEgMTUuNzQ3MyA3OC44MDQxIDE1Ljc0NzNDODMuNzU0MSAxNS43NDczIDg4LjQ1NjYgMTYuNjg3OCA5Mi45MTE2IDE4LjU2ODhDOTcuMzY2NiAyMC40NDk4IDEwMS4zMjcgMjMuMDczMyAxMDQuNzkyIDI2LjQzOTNDMTA4LjU1NCAyNS4xNTIzIDExMi40NjQgMjQuNTA4OCAxMTYuNTIzIDI0LjUwODhDMTIzLjE1NiAyNC41MDg4IDEyOS4yOTQgMjYuMTQyMyAxMzQuOTM3IDI5LjQwOTNDMTQwLjU4IDMyLjY3NjMgMTQ1LjA4NSAzNy4xMzEzIDE0OC40NTEgNDIuNzc0M0MxNTEuOTE2IDQ4LjQxNzMgMTUzLjY0OCA1NC43MDM4IDE1My42NDggNjEuNjMzOEMxNTMuNjQ4IDY0LjUwNDggMTUzLjI1MiA2Ny42MjMzIDE1Mi40NiA3MC45ODkzQzE1Ni40MiA3NC42NTIzIDE1OS40ODkgNzguOTA5MyAxNjEuNjY3IDgzLjc2MDNDMTYzLjg0NSA4OC41MTIzIDE2NC45MzQgOTMuNTExOCAxNjQuOTM0IDk4Ljc1ODhDMTY0LjkzNCAxMDQuMTA1IDE2My43OTYgMTA5LjI1MyAxNjEuNTE5IDExNC4yMDNDMTU5LjI0MiAxMTkuMTUzIDE1Ni4wMjQgMTIzLjQ1OSAxNTEuODY2IDEyNy4xMjJDMTQ3LjgwNyAxMzAuNjg2IDE0My4wNTUgMTMzLjE2MSAxMzcuNjEgMTM0LjU0N0MxMzYuNTIxIDE0MC4xOSAxMzQuMTk1IDE0NS4yMzkgMTMwLjYzMSAxNDkuNjk0QzEyNy4xNjYgMTU0LjI0OCAxMjIuODU5IDE1Ny44MTIgMTE3LjcxMSAxNjAuMzg2QzExMi41NjMgMTYyLjk2IDEwNy4wNjkgMTY0LjI0NyAxMDEuMjI4IDE2NC4yNDdaTTY0LjU0ODEgMTQ1LjY4NUM2OS40OTgxIDE0NS42ODUgNzMuODA0NiAxNDQuNjQ1IDc3LjQ2NzYgMTQyLjU2NkwxMDUuMzg2IDEyNi41MjhDMTA2LjM3NiAxMjUuODM1IDEwNi44NzEgMTI0Ljg5NSAxMDYuODcxIDEyMy43MDdWMTEwLjkzNkw3MC45MzM2IDEzMS41NzdDNjguNzU1NiAxMzIuODY0IDY2LjU3NzYgMTMyLjg2NCA2NC4zOTk2IDEzMS41NzdMMzYuMzMzMSAxMTUuMzkxQzM2LjMzMzEgMTE1LjY4OCAzNi4yODM2IDExNi4wMzQgMzYuMTg0NiAxMTYuNDNDMzYuMTg0NiAxMTYuODI2IDM2LjE4NDYgMTE3LjQyIDM2LjE4NDYgMTE4LjIxMkMzNi4xODQ2IDEyMy4yNjEgMzcuMzcyNiAxMjcuOTE0IDM5Ljc0ODYgMTMyLjE3MUM0Mi4yMjM2IDEzNi4zMjkgNDUuNjM5MSAxMzkuNTk2IDQ5Ljk5NTEgMTQxLjk3MkM1NC4zNTExIDE0NC40NDcgNTkuMjAyMSAxNDUuNjg1IDY0LjU0ODEgMTQ1LjY4NVpNNjYuMDMzMSAxMjEuNDc5QzY2LjYyNzEgMTIxLjc3NiA2Ny4xNzE2IDEyMS45MjUgNjcuNjY2NiAxMjEuOTI1QzY4LjE2MTYgMTIxLjkyNSA2OC42NTY2IDEyMS43NzYgNjkuMTUxNiAxMjEuNDc5TDgwLjI4OTEgMTE1LjA5NEw0NC41MDA2IDk0LjMwMzhDNDIuMzIyNiA5My4wMTY4IDQxLjIzMzYgOTEuMDg2MyA0MS4yMzM2IDg4LjUxMjNWNTYuMjg3OEMzNi4yODM2IDU4LjQ2NTggMzIuMzIzNiA2MS44MzE4IDI5LjM1MzYgNjYuMzg1OEMyNi4zODM2IDcwLjg0MDggMjQuODk4NiA3NS43OTA4IDI0Ljg5ODYgODEuMjM1OEMyNC44OTg2IDg2LjA4NjggMjYuMTM2MSA5MC43Mzk4IDI4LjYxMTEgOTUuMTk0OEMzMS4wODYxIDk5LjY0OTggMzQuMzAzNiAxMDMuMDE2IDM4LjI2MzYgMTA1LjI5M0w2Ni4wMzMxIDEyMS40NzlaTTEwMS4yMjggMTU0LjQ0NkMxMDYuNDc1IDE1NC40NDYgMTExLjIyNyAxNTMuMjU4IDExNS40ODQgMTUwLjg4MkMxMTkuNzQxIDE0OC41MDYgMTIzLjEwNyAxNDUuMjM5IDEyNS41ODIgMTQxLjA4MUMxMjguMDU3IDEzNi45MjMgMTI5LjI5NCAxMzIuMjcgMTI5LjI5NCAxMjcuMTIyVjk1LjA0NjNDMTI5LjI5NCA5My44NTgzIDEyOC43OTkgOTIuOTY3MyAxMjcuODA5IDkyLjM3MzNMMTE2LjUyMyA4NS44MzkzVjEyNy4yNzFDMTE2LjUyMyAxMjkuODQ1IDExNS40MzQgMTMxLjc3NSAxMTMuMjU2IDEzMy4wNjJMODUuMTg5NiAxNDkuMjQ5QzkwLjA0MDYgMTUyLjcxNCA5NS4zODY2IDE1NC40NDYgMTAxLjIyOCAxNTQuNDQ2Wk0xMDYuODcxIDEwMC4wOTVWNzkuODk5M0w5MC4wOSA3MC4zOTUzTDczLjE2MTEgNzkuODk5M1YxMDAuMDk1TDkwLjA5IDEwOS41OTlMMTA2Ljg3MSAxMDAuMDk1Wk02My41MDg2IDUyLjcyMzhDNjMuNTA4NiA1MC4xNDk4IDY0LjU5NzYgNDguMjE5MyA2Ni43NzU2IDQ2LjkzMjNMOTQuODQyMSAzMC43NDU4Qzg5Ljk5MTEgMjcuMjgwOCA4NC42NDUxIDI1LjU0ODMgNzguODA0MSAyNS41NDgzQzczLjU1NzEgMjUuNTQ4MyA2OC44MDUxIDI2LjczNjMgNjQuNTQ4MSAyOS4xMTIzQzYwLjI5MTEgMzEuNDg4MyA1Ni45MjUxIDM0Ljc1NTMgNTQuNDUwMSAzOC45MTMzQzUyLjA3NDEgNDMuMDcxMyA1MC44ODYxIDQ3LjcyNDMgNTAuODg2MSA1Mi44NzIzVjg0Ljc5OThDNTAuODg2MSA4NS45ODc4IDUxLjM4MTEgODYuOTI4MyA1Mi4zNzExIDg3LjYyMTNMNjMuNTA4NiA5NC4xNTUzVjUyLjcyMzhaTTEzOC45NDcgMTIzLjcwN0MxNDMuODk3IDEyMS41MjkgMTQ3LjgwNyAxMTguMTYzIDE1MC42NzggMTEzLjYwOUMxNTMuNjQ4IDEwOS4wNTUgMTU1LjEzMyAxMDQuMTA1IDE1NS4xMzMgOTguNzU4OEMxNTUuMTMzIDkzLjkwNzggMTUzLjg5NiA4OS4yNTQ4IDE1MS40MjEgODQuNzk5OEMxNDguOTQ2IDgwLjM0NDggMTQ1LjcyOCA3Ni45Nzg4IDE0MS43NjggNzQuNzAxOEwxMTMuOTk5IDU4LjY2MzhDMTEzLjQwNSA1OC4yNjc4IDExMi44NiA1OC4xMTkzIDExMi4zNjUgNTguMjE4M0MxMTEuODcgNTguMjE4MyAxMTEuMzc1IDU4LjM2NjggMTEwLjg4IDU4LjY2MzhMOTkuNzQyNiA2NC45MDA4TDEzNS42OCA4NS44MzkzQzEzNi43NjkgODYuNDMzMyAxMzcuNTYxIDg3LjIyNTMgMTM4LjA1NiA4OC4yMTUzQzEzOC42NSA4OS4xMDYzIDEzOC45NDcgOTAuMTk1MyAxMzguOTQ3IDkxLjQ4MjNWMTIzLjcwN1pNMTA5LjA5OCA0OC4yNjg4QzExMS4yNzYgNDYuODgyOCAxMTMuNDU0IDQ2Ljg4MjggMTE1LjYzMiA0OC4yNjg4TDE0My44NDcgNjQuNzUyM0MxNDMuODQ3IDY0LjA1OTMgMTQzLjg0NyA2My4xNjgzIDE0My44NDcgNjIuMDc5M0MxNDMuODQ3IDU3LjMyNzMgMTQyLjY1OSA1Mi44MjI4IDE0MC4yODMgNDguNTY1OEMxMzguMDA2IDQ0LjIwOTggMTM0LjY5IDQwLjc0NDggMTMwLjMzNCAzOC4xNzA4QzEyNi4wNzcgMzUuNTk2OCAxMjEuMTI3IDM0LjMwOTggMTE1LjQ4NCAzNC4zMDk4QzExMC41MzQgMzQuMzA5OCAxMDYuMjI3IDM1LjM0OTMgMTAyLjU2NCAzNy40MjgzTDc0LjY0NjEgNTMuNDY2M0M3My42NTYxIDU0LjE1OTMgNzMuMTYxMSA1NS4wOTk4IDczLjE2MTEgNTYuMjg3OFY2OS4wNTg4TDEwOS4wOTggNDguMjY4OFoiCiAgLz4KPC9zdmc+Cg==',
      claude: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAdN0lEQVR4nNV7CZhcVZX/Oefe915V9ZLOCgFMWLI0SVg0iI6jEkY/BUVHcSqBAdwnjig4EBKCOFMpBgdCCItxGeLfhRmDpGsUIuowMzokOiOCBIUkndAJJISlQ8ja3bW89+69Z75zq6rTZCMJ8/f7/+/3JVX93rvv3nv28zunAN7g4HxeHex61yGuH24UCgV6pHCefmL27IC7jn7+sQw81onMgIjA8n3D/JlvdQ7fpsDFCGo3KLtq0i2lV7kAhEVwR/u+wWuFAmGxeETz/6gE4EKBYEGRZcMb531sagpU1KguZHZVRNiZOv4xWvrelDuW9/jnARD9x+HHq3M/3LYXg3fGTKMih7+fsLhrLfxfHnQsk1b39io5fPf8j4y0oK7TSBcqwhwijkSkSZFS15B2VwxOyOfpcJyXzydmz87tUdFHHKq7W6Pgn1jB9c9enR/XvF84xr2+3qCjnSDcPGfp0lS+KxO+mQE+0J4Jc8Y6I3w2jnlELhMh0Dnr515ygjyHpZIV/T7oCxec53W9fdhuUaO/BcCJcmIHcJGNcO6OeR9ulfv5Ql7D/wsEQG+s6vMYkQkxpwgdIKTOsVwyVWOAmTsVwQU9V10QCdFm7LeWXKt/W+XWFvIhA57TEgUTNRHUUpsqog6H2FlRrf7gW3f1H1JdxWDKO8R4ihHd9+7XHxqOYeQhr4tQSizQVg22zzlodQyKEJABdDlObRSosYl1M1taMisQYOcTvb0H3ZQYyc2F8ogYWk92joWG4JiVA6gicq/h1BvBcSPaDrAhctAFhQLizKIFAPl31EMfwxwOG9xoVbij5viZSpoeTwhCeUZAZAabC3SU2Hh6zYSdXCg8ClO7HSz1nKkfhBumEQDicnYMEg63ACQ3A0WQWjfAAC/0j46MPFPrHX4AAbxhLRZZuF+rQbbFxW5zLUk+sOTh+EgPQ8dAAJj4dNVTu//ZtIwAyxLrnsuFuqG6fmcYWwcM2GYJP7altmEc5Euua6gxXLBgUCJ0oNoYeRgzi+qAVgSI1McKtu5e+0J9rbHPDBJASCeeyH8yI8SYb2H6GmHm709rabtkU+HyMWJzvLd6gwRAeZF/2VC9WrXKG7WppVKao/RBYHzUWJbN+E3KGWqpcQowYOBLEuQJ4jVGT9l+UDUwTG3A0NqcLnaAgfvZ4EtwMngJeLV7zCAB1hXygcQHK6/Mt/TMn/UPOVI3EvJHlaKPh6huMLX0T4o+fig2+HEMBGBPXQB5kX+ZcKdBURG9qd3d3refdOuDO5XlH9ZSs7ol1FoMgUy3zKAUUksYjGWEt6wt5FuHEnboWgFCKyG0ckOEhAAIPIDGPT9jwUovAfmuLi9dXDhPTyuWkq2Fz4wY24pXAtCXWkJ9OgC0BKSG58JgMjJf2nPDZVPwprpE/t1hzkmHuiGHGxqZISIPjcrypVJ9Q115ddri5Q8jwg8cgyEUKyC2AECIkFrRBXxvlOBbzy+u8twsFApY6u4eJIJ10M4A7V4AmDkgv/DeMIStsu5r9lVcZbZek89WquWPA0ARETK7K4llRo6NcXvj1DLg28GkM5q7n5rP4zGpwNpCPuyeP2vS2vn5CVzIh3UOFEji/MHIrlQnlrb868S6lam1qSYUh+CcUMQxa8QZxtL7m+8V6cm/ZiUrKtDWUAGZA+xgx2kLS33yd5fkBTNnelWUv6sBfIGBv6wUZTytUc7BiIQkERoAbCEFWwaZNWUKH7EXYC4QYtFtvn7WydWK+7winp7TmjbW7Ivd82b+HIvF++U58e8TR7wthWLRie/N9lbX93Vk70HAc3Nh0L6nGvudOQboyITBrnLt7euvz5/Rmdm+HmCKg96fSgDkxdsCtiFgm+cwAPbVkhoSvNj0GG9/FEIslary/ZnrZ32SmWe3hnp0OTGuLnCAFsAFAK4t0mpnJV7bh/y7QZ9TLPKRS8ACgJ67L4hScH8WKnXlyFzmPR3ZzPktYXgFIVy/4fqZn117Xf74SUsejkUlxA/PgDF04tKfVnLDg18C4q8TY2uR9q92ojnVxJiA6HRkvGLjrqySeS+0nLqP+GIDCLN+Q0SYOvcKOxYCeHa+qX1KKrq/4dr8O4FhTqT1xGpq0sZ9BGYXKgWESOXUvITEv36LJGN/9/pejgY531hMNhfsirIMNDkb6Na+Wmp6+yrV/ji1gaKzgWFJQPj531+TP1FUwRvIbrCiGv21tMyK76mkpiejddDMg6qJgUygxxDAn1Nm+Di5aNtzg1whhvZcoHxILDZEIW1VDl9qSgAWi6andtxUCmgOIHQCsGtkjw3dRhdqVLGxA3HilkYGVom6lLrrun+4RIz2MaH+kBi1k+HsPmvpFaW8fCEBiGop54RDmAm1ui6r6VtvPk2f6yd3ldyjfd2RWOfyjo6HCeG/Y2O9TyehAPmwR7T0RAPm4udu+NCYk+HkZAjxO3Kh0AtYvAiDeyFlerHp75+5Jn9i6uDyUNMHA0VaYm7AhvoyOyIhspX3/YdLk2+fcntp24dO6FUzS6XXjQ7pgCvrtqO39sRrBhKzJdRKKULtmGPrZLALFOUCTR+wzi58Zn5+9qPX5jPvuLNUvWf29EASJWXoX2rG/jobyNS6P6mlqSPELCB+xrjs5IZHwd9ckxfRb2lGhuJBHPCLNuzf4mcWi84p+OSwSF8GgIEYVedYuF8/P0KaC7Wyjh/HEIpT7nqgV65Pf3nsEYXGdOClGU6o7rJ2TWzMnX219Enx561REDWf6IvTWCSiPRO+CxivG6Xp6u5rZ0363NLVPkt8oWofR8AHxQnIiRwzGQeSOAnlJhqL7+q56rL2QgFwuFbDASCbOuelRZMXgVfPvPVnu+WMG+fPygeKPhkqNbaW2kTyLSIkYQQhsoTc/bWkh5CWTL656ykfIYqXOkIghfa/4Cd2d+O0Ymnb1NtKX1NIC2LjHkktV2RhrYg0YhQb6/qT1BLSREC4WWu4sWfOZVM2Fz6ROf+bpYGE8Vdxan9nnYOwHh4JZyVldKGCC2xWojVwGkEI0NLwgJBYywRaDCCsnz/zrZa5qLWasKsSG0CJmUA8i4gAingl1lWY+M7O2+7vEkPp99+IUY5RAsDn783vEzOT/jU06lPG2DuYoexFGsAio5zHGy7ZsVZ0Cav0h7Va5WLhwBm5yU8Cum8DwEAu9Opajwsscy4M3k6IF/gNBDgcADNihKxznBi3I03Nc3+Y89Exgg8ww2SvHeSlvmHU2OQCJQlTzAxLwKqfNKW3fv/10afDEkBG0wCJBT518X3Pm0R/EwC+aKz7r0gr1Z4NNDAkjl0KDEYrDLNhcKZG9ZWeU3DRxurTJ3RmcRkAP1ZLrexKS64gGWMmUJqBp2+4Pv/OJOXjJfAPyG8ltuCeBILWEHU+q+l9oSJKrbXY2Ku8QhNxap1h5kdT4O+evuj+lwULOJy/P+p0GBuppri6s4/v15PuWibG5fs9c2ftqKR2S8Tu3dlQiUuDamK5nJhYIem2THB6XzWeABS09MRQYsR7q6kZ05ENz+jzlGAqx6lIz8kA8BF28AwqSBuS5ZCRtYLLCPEtijAyxonPE4lvhrM2E+iwr5qs04ru7Lz1/h5h1EpvD/dx3rt1+WtBoT5PQu88QKkkeUVJAqi6iz1SSol7lMniWn5f+POOqBp+mhD/GpHGKYRIXmVExtlHdyoXKqymdi0j3EzAVwzPZD+4s1KTeyS66xzXBF4EhF8ww0UjctH03ZWaGNGdjDA8VErsjBjOenYlLtIn2j7H6EekWybfev8t4u8XSGJ2BC7vqCRg/4Ez9y3w5uKKPb+5Jv+tkSH8EixcZdBd1pIJMya2YvXF4KGkJBL2g+O7HULr3losDsHbDO9KNWVSa88EgDIijqoJjAYo+zlOIaJ1LEHRIIMQwBGR0gqhktpvBR3topJ+rNy+HX19Ysp2XN07GQU7mFFcJWpzSJVoItV4qAcOOVEo7sPruptZN/fSiUq7d2vAS0Ki98pOq4kVr2c1UdQSapCgqGasj/L8OxhYKUQJ5yTrA4aMQozkb3nG1pERGCr2SlyfXAJYA9Z9aeKirkd+ftUF0aHQH0GZh42onEBYHWttcByjG8/MHQiwFZLgl5Pvuu+5BmHrwwMckqUNyZzkoAsWLNiHhTSfZoDVS6fr6cNPdU3J2DD3Y+8B1B9HghkZpcaJOy/HqUiEhISBxABD2eHdHnrj5wkhqXMjdxGuvJYxDGlLFAT9cbIDGP5myqKuZc13rZ/74bYobB1hjBuROh5BzB0EMAoITgDAE5B4LDs4TlIKRuhAhucJ6AEM8TsTbv7hxmOuDDXogNCVp1IJJOxMJKobGQpIgZ8KtZpgrIuEZSLOh3yH9+mvIe8BAxlMFChVTe1TkKVLszG+Ehs9gpU50WE6hRx2OoDJADhZIZ4ibpcbRPVSxt7FgiKCUBOUk3Q9A1x/+sKuh44aFG1KyuiGvk3fDXDq8HrYj1iqrp/74aWhyvwqMe5zAPCZSBFYZwWaYYn0DjjcYEJzSCKLuuiatVJ1chy7uRUH40jZTmDIImDIAAGJ/UAPJoG3JywBk1ex+roIECoCiR/KiXkKRJWgsSGRvo3zLznbsD2HiPrAmT5GXbXsKhGosrW2YhCqCuNy55aociQW98mr8qMzObwwAPq0ZX5XqIkSYx1KanSUw9sF5wwiClKsFWJrq3AZQIIhSKzzh22gUZ4KgizLgeXkOyo1K1U8InpOI2yMLf7L08+ZR707lAUkIEGGvwGgaUDcDxb6mLAKDBUCLFt0VXAggEQZCSvIrsKIFbBcA02xYydQV6IQY0ghAcU1jbAtViZVafghQJitFZ6ZWicG/uirUQ2T7etxPhSuJ67iTusHVV7NyklqgWEPAOwGZP/JAK8C4PPA8KxTtKnaxxunf+P+l5uM1/Uvvhx1XjZQo8SJOSVUH4Tt65lnwzI1k/Bmop06hlpqJMStMsMuVLwdAHcnzH3aBi8ywVZkftE47kTElgZ2fqChO6wE1Ncd3IPINYO1jlPjbBKnNnXMuwSoQoYeQOhhwxtjZXrOuu2BFw9ViUYE1qLTo3dt+tHOTDot1PpaWSyBusuq07kJFPBrPwfvMUgYq5CzlvlE5+BEx8wEJJFAygAJI4bAnGmWiI/m8J7OKMqNXqyF0zVntjHwWgDqBsdrWIVrTDXuzQSmFgTZtD9K03BXf3qmQHbwwEHeNwTshfo/3njtrDe5EP9MM45NgHMkEBtC5BgyCJADwAgdaEAMADkjKJRkr5LKNl4ZAnJOJJUBAwLOSGEkUBRK3Hs4T3Cw4Y1Xw0CKZDHAGgR4jB2sBZ0+l8Z267TFD764P2r8ekOA3qndYJt2DOU/ifeb6AlDgTYWNrUmfYmmrImMw6xGzoWsI5sqbYgFI4nAmpAU6cRyVvkiKWtnXNYDc4o1O2RwGIPiNgTIM+I72Ucy+6K7IyFAQwoHvNVG/hUwdAPhgISTBCRF2dBayCCBEqQMSCXiK4C5xkQ1sC7WIcWGITGp3T7t9tK2oc0XOLhgHXKWKK9eCPlfGPLOp233xGxKNxHhTGPdMXkB0XdNqFqjwKtB45pXv3oxtV7FkQxH8q3E2howC6S+FxH2AnA/oOoD5j+YarpsyvAzNkuWC2+kReb1xvq5+cmI+HkG+FCo6ThrXehYPFRdA19Pbr3/F2qh1N3tOnBstNZntUfBoPuz7LxqSQ62f6TaqLHUwZMG/I4EsbWwCRXO77z1/ocb9Y0DFt53rfHeBc2UshEeDxm0Bbbonb2RbTZNSL8QMX4UAd9t2Z3RFoXtwilf7GCRQzfgmDNKkWJmkTR1OALId+fcJmL8niX6FbI7WwFMssTjGt5rwrBsGIqLlHxDCGOkGOXhOA9AeDrK/VB7EEUk5GF0cPPk27t+c0Ak+JoMavDY+4CGYkO0S1O7cebMkoiRF6U182adHjCcQwwXMcNHhuXCcCBOBAKrc8vx7wl4CwO/I9IqkvpVoEjJPY+OHoQIcr1hN05yDBOwLbh38lf+6b+evfqS4ziCaUw4HoAn7KnG4xXgaIcwihlGA/CoXKgzkdaeGH4PRvbgoCXUkNbsnzKwEO+/35AKSKfIx2v5ttTAdNDqM8Aun9EqkMhMuKuIiJHLzsJjAPAAA4QA/JVh2Wj43mqSCrEZJYxtGLuDSQIDi9qIG0yd/Y216VXLc2f+YX871TPvspMY7VlMfAYyn8EOpjDgiYQQSnAoJUcl+DzBgHH8C0S+vfPWrt8dFQG8oZyxkvD8epGzZ97MtzukqxD4fAIcCQDe5YltyoWKKqnZDgBLWPMyjvF9pPEWZBiWDQMqx8nzCLieEc7LKJWNrZUorlHn239hsKRQWWEhwxPK4fUTFy9fuf9jUqJrg7ZweC0b2AqEJsTjFPEZjGoao51CTAMM6j5H6vHKrmzf9KVLzZG5pPPO0ytnADSru09fl/+TCPEvSOE7gPHN2VBH1TQVdtrWTKD6q0kFkR+yAMvKuzseHjai70J2fFNrJjirmnhrMGCd+zcgXM+MX2oL9bByYiSa0ygwQR1BFw32ItAWBl4dqqlpVsKecIh3nr5w+X3eZhXyARRLXqIO5veDFEZzokZCgEnnLT/cMPQ+vu7hxVI2YgSpCRLpGaHiS4x1Hx6Ry+DuaiK7NCL6DX1+kpl/EVuz7Mzbf/T0hhsu7QTn7h2eCc/dW0vSbKiD/lp6Hyl8EJjPRYDZY9py7dv3VtcAwtMAPFNy/4E4NYLAC65gjFstSVBLqM8SQ5cJlLi7P1hrb+3N5VacX7y3JhY932jAWAdjSNp4+uJxrmmcX3Ome2YH8PJY+5o44HBDENf29r3jnObLgfHallC3e7BD8D1FZKXygTDgnHuMAG6beA78pwAla6++aJzOtCwBgPdrwkCscersNrDwFzbSL4apWeoA3j1uRFvm+d0D95CGRWD4Z8Mymcl7qrWaVioj+Xs1NksswFYE/CtEPk0kJBtoqTluY4Lrtqa7H3z/4v8oH5SBolbixbq7sdToaxgqKXSIM4tRGiRO67DdF7Pi7yvAuSFRuyQ/clvaADJaUk7oYeQbk1rt8pey2x+Rw28oXDqKMrnLAOH8QFEkxRHreICQi08/z7/V1h3PSGMZUVcSwQNh76SvLn/WMZb21uJdodaBtdZJ74MD/oRGCDlJpTz220hrjI0HOI5Hh18fpzo+/8qV9Q4UXxlqNFf6g0jSI5wulaxEu/urCR3s9I8UzvMNEE/Mvii3/vpZc4HwRgR6Z6BUS+JcLBzvyPpqhwjCN6yFqyth/M9nfu2hV5p2wlXtezNa/7UmbBP4L7W2zzH/OCSzQjZCYI8zzo0nBLWnEjsC9FY9QPdtw25dS6SVBcn4rDRetqfWXaBCpS3i3Di1y6RKGWkFuVB3ZLX+4s4WmP/yDfnRcthSKU9H2mxNB7t44oisn5zLBcMIeN6bOlrPELcmUVd7FEYImO6pxI875ttY4cIpty//d0GKxeDIvGdunPnuiOizkaJxzoFFBClurDbgvjE+2PWq5wxASzbQ7aLkqXNlAI4lMz1tYWmrQlwxkKS9gVKBgBvlJI0zoX6bQ5hz+rPmcVtLi4h4by01r4iPb43C8VrR5waYrl495+LxM2eWrEjhkXSs00Gvbqp/5Oo6tLtcL4ZWnHO1/lq6B5h/AlbN6bxt+d9P/OryF+qdnkBSHpf2WDYwJ9TqPdJToAhUJTWbCWDZtNtKj0Nxlcc/LeOoTKB8Fwkg7EGC3eLbRYQTiw8mif2RlgyLiGrGchQoIe6Fm06BT0+5+0ebOC3PY+TvG2t37KnWXDYIRjmAG9qD4MoNc/KnyP6PrTwOAC81+gAJ9R5iumNPNfk3x/CkA/4eOvxslKZXT26b9JuhcwS3f+XrV7Yi8M3A8L46DA4e8SXAbwbZ3LLGc7zmy5eMYeTxjiU3EqXEfnaStNSLs9NuX/4cKliRGvOMNFkRYFiOUyFGiwWct+nLl83ovOOnO8rIix3ijYZ5s3QpKhSzgF9gwhulS6y5t8P1C9LBLs5YtcoTYNydpVqQVO/vr5q/RcJ5gOb2l1peXnHyXQ/0ykbFRYqHmFospc/P/8vhu17Y8SkG/migVCaQ/mGQfNX9Hwpg+SnFe2vNjeSYTkKmNzUxAgTud5KxDRkdEf/WOHu3A0jaMgEl1iVivjKBnhCn5nJJtqQNpsxuOVg7ZyBJH9BI0BaGLblIX5ym6bxN8/PTvS0oFvlQRNAHuzjEUvIpd68QbE3+DQ4pQ5emjmHRMy4UWKDx8mP2/DCkL1jgDkGhfYMU8BNg3JKJt5a8mmCx6LtCLLtxAHiSdJzIYoQohx8kwMarrgonFZcMvDj/itIAxx801r03F2iVGpnhXGuk31cxdiN35RfhzJJIzop1cy7ZZsn2xal9z8jWzEkK8ROVJKWN64IvTgLoWwvd0oKSHJEEDB2+SzSfVxJmilHxeFpxlVm3rl5AEUlY/6Q+NwhQmhgkBWZJcqrGPEsI3zQttEHe0ewv9gPhTcw8XoyBDM995/N3P/ri2Mmcbbuyfc7aJeXUrMsGOvARl2PIBfokAv7Ic0/iW5r7m7r4/scYalcpDd/bVa71hFpVGfBsSBLf2PGa9Y+GAMWGDxX35v0oikoVaEGjFL3h2ktHkbVfzIbqgmpqfP9KLTU1IFgB5b77xDBKHaEvfrXeWCnHt258QDi2WQ0Ch/1gg0ECTL9nqZE5EsW90rLjPxHwX/vjxAc6oup7a4nEIOekDr7yV9FTw2V/wqDTF/2kv5yEC0HZG/pr8b3AsNyaNinCQnP9oybAwcaH5BcjAPxI4RMZ0G6+VnSRsRx4uFoQH+f+ERR/S1rp5Pl8qcQPjV1dByUEpCA6oT0bksT6HmVm7gcFgwSQUzY7UX1cYd13nePlrVEgxR2P+LSGUiaFd5X3ROdJvNLWO+D7Gc5e/IMyHl/+2c5quih07jtrtvRX5D3T71nt45P9h4ajHHLElc88w71zLm/pq8UzGOEKrag9MdLjgxJpLQNOvz75qw9uXpvPh9NKJdE7vummul3ZtOCK0QZ4ZAPu84gHA/aN4H7R5cF2+qYdEiPbuXjp5o3zZn1nIE2nR0RnKfRNE6k0TUmjRS4XPDrlrtW9nD/VG+VJX1oqhPfFz0Ga7veDrGOWgFI+T+evWmV2QjwemD8BDCPrBQuXAvLPI4dfnnT7g88OObwYEt947cPUWjoFGTpiYzzc5SlA0Ddq0ZvL0kO8/3oPjR1rRcej1P1eofuHxNodkVYhIolRyxBgGymd8XsDAFEbESxvr/4X2uUPGPlGk2+oVcTAo8XgZQMPyD4UGHP1+EX1qsvUkkeL/FgJK/06G0fsCizA6YA8QjLHfQUP7kMouhmN54bG62KDVg8fTuPuLFV1Jffv7PBHA0lS7sgKKu8lOCEV+oyvWdkWfnh7dQTgroajpkDJR2tbYMvmuFxZaBj+0B8nfQpwxamLf/y8PNJQ7cHF206YjACrYNiubcEe0JOY7UipKHl8tI5eev1v660/t/+YPrbe83fK3ffuefraS+8KnOnuj9Px7Nx2IHw4zOgdvpH6GHqE6GgnNHXplOK9ezpvLz1cq9HiNTsGFk5c1PWk/8HSQX4A2b52a70Dqk/gKT5DE7Wnzjc5ucRayxarh12zwUmB4M6844cbOlvhH7dsLy80Obhz8sKupyTIOtrusDf0oymUKFC66fJ5OmvJMt/SKjp3frFkGj/SOOigKIPs4pzWmqTBX7C+1NoyqAMDlIMN6Sts/Ggz/VOE7UJsKeRgscjHWsvQcIzDU3tfeWnw+8HGIw0fvCPlWjaEX9SMPa09CseUk1Qw/ZcYdN/+vws65Lpy0AaR65J29GI/dGh4g8PHMvVq5yE3Mvue1eblsQU6C6C6obbhu47dyFpqLnSONyvEHxjSa32AtGCVPZwEHdAC9zrrHslA+CMN+XVXs5C54YaLO9OEzg5JvTQpt+1RCa2P9PfF/9+Prv1ACq/HQyCsP/b4H3tH+1HbR62TAAAAAElFTkSuQmCC',
      opencode: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHdpZHRoPSI1MTIiIGhlaWdodD0iNTEyIj48c3ZnIHdpZHRoPSI1MTIiIGhlaWdodD0iNTEyIiB2aWV3Qm94PSIwIDAgNTEyIDUxMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjUxMiIgaGVpZ2h0PSI1MTIiIGZpbGw9IiMxMzEwMTAiPjwvcmVjdD4KPHBhdGggZD0iTTMyMCAyMjRWMzUySDE5MlYyMjRIMzIwWiIgZmlsbD0iIzVBNTg1OCI+PC9wYXRoPgo8cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTM4NCA0MTZIMTI4Vjk2SDM4NFY0MTZaTTMyMCAxNjBIMTkyVjM1MkgzMjBWMTYwWiIgZmlsbD0id2hpdGUiPjwvcGF0aD4KPC9zdmc+PHN0eWxlPkBtZWRpYSAocHJlZmVycy1jb2xvci1zY2hlbWU6IGxpZ2h0KSB7IDpyb290IHsgZmlsdGVyOiBub25lOyB9IH0KQG1lZGlhIChwcmVmZXJzLWNvbG9yLXNjaGVtZTogZGFyaykgeyA6cm9vdCB7IGZpbHRlcjogbm9uZTsgfSB9Cjwvc3R5bGU+PC9zdmc+',
    };

    function HandIcon(props) {
      const hand = String(props?.hand || '').toLowerCase();
      const size = Number(props?.size) || 20;
      const src = HAND_ICON_SRC[hand];
      if (src) {
        return h('img', {
          src,
          width: size,
          height: size,
          alt: '',
          'aria-hidden': true,
          style: { display: 'block', width: size + 'px', height: size + 'px' },
        });
      }
      const brand = HAND_BRAND_PATHS[hand];
      if (brand) {
        return h(
          'svg',
          { width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true, focusable: false },
          h('path', { d: brand }),
        );
      }
      const paths = HAND_ICON_PATHS[hand] || null;
      if (!paths) {
        // 不认识的手：退回字母，至少不空着
        return h(
          'span',
          { className: 'dsh-hands-v2-agentIconText', 'aria-hidden': true },
          handShort(hand),
        );
      }
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: false,
        },
        paths.map((d, index) => h('path', { key: index, d })),
      );
    }

    // agent 卡片主标题：服务端 label 形如「agy（文案）」，去掉括号里的注解只留名字。
    // 手下展示名：爸爸 2026-11-21 定的，agy 用全名，其余首字母大写。
    const HAND_DISPLAY = { agy: 'Antigravity', codex: 'Codex', claude: 'Claude Code', opencode: 'OpenCode' };

    function handTitle(agent) {
      const hand = String(agent?.hand || '').toLowerCase();
      if (HAND_DISPLAY[hand]) return HAND_DISPLAY[hand];
      const label = String(agent?.label || '').trim();
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

    // 会话按工作目录分组；目录未知时按所属手下分组。
    // cwd 仍保持空串，不伪造路径，因此不会进入 open-folder 白名单。
    function groupSessionsByCwd(sessions) {
      const map = new Map();
      for (const row of Array.isArray(sessions) ? sessions : []) {
        if (!row) continue;
        const cwd = String(row.cwd || '').trim();
        const hand = String(row.hand || String(row.key || '').split('/')[0] || '').trim();
        const key = cwd ? `cwd:${cwd}` : `hand:${hand || 'unknown'}`;
        let group = map.get(key);
        if (!group) {
          group = {
            key,
            cwd,
            hand,
            label: cwd ? lastPathPart(cwd) : hand || '未知手下',
            sessions: [],
            latestAt: '',
          };
          map.set(key, group);
        }
        group.sessions.push(row);
        const at = String(row.lastAt || row.startedAt || '');
        if (at > group.latestAt) group.latestAt = at;
      }
      const groups = [...map.values()];
      for (const group of groups) {
        group.sessions.sort((a, b) =>
          String(b.lastAt || b.startedAt || '').localeCompare(String(a.lastAt || a.startedAt || '')),
        );
      }
      // 最近有动静的项目排前面；会话之间同样按最近时间倒序。
      groups.sort((a, b) => String(b.latestAt).localeCompare(String(a.latestAt)));
      return groups;
    }

    function HandsRail(props) {
      const { store, t, onPick } = props;
      const slice = useStoreSlice(store, 'agents');
      return h(
        'div',
        { className: 'dsh-hands-v2-rail' },
        h(
          'div',
          { className: 'dsh-hands-v2-agentList' },
          slice.agents.map((agent) => {
            const hand = String(agent.hand || '');
            const running = Number(agent.running) || 0;
            const queued = Number(agent.queued) || 0;
            const tone = running > 0 ? 'running' : queued > 0 ? 'queued' : toneOf(agent);
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
                  style: { '--hand-color': HAND_COLOR[hand] || 'var(--dsw-alias-label-tertiary)' },
                  'aria-hidden': true,
                },
                h(HandIcon, { hand, size: 16 }),
              ),
              h('span', { className: 'dsh-hands-v2-agentText' }, h('span', { className: 'dsh-hands-v2-agentName' }, handTitle(agent))),
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
      // 按工作目录折叠：默认全展开，状态只留在组件里（不持久化、不进 store）
      const [collapsed, setCollapsed] = React.useState({});
      // 会话/目录搜索：名字或 cwd 命中都算（目录命中时目录里所有会话都留下）
      const [query, setQuery] = React.useState('');
      const needle = query.trim().toLowerCase();
      const visibleSessions = needle
        ? slice.sessions.filter((row) => {
            const name = String(row?.name || '').toLowerCase();
            const cwd = String(row?.cwd || '').toLowerCase();
            return name.includes(needle) || cwd.includes(needle);
          })
        : slice.sessions;
      const groups = groupSessionsByCwd(visibleSessions);
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
        h(
          'div',
          { className: 'dsh-hands-v2-search' },
          h('input', {
            type: 'search',
            className: 'dsh-hands-v2-searchInput',
            value: query,
            placeholder: t('searchSessions'),
            onChange: (event) => setQuery(event.target.value),
          }),
        ),
        visibleSessions.length
          ? h(
              'div',
              { className: 'dsh-hands-v2-list' },
              groups.map((group) => {
                const folderKey = group.key;
                const anyRunning = group.sessions.some((row) => toneOf(row) === 'running');
                // 有活儿的文件夹永远展开：跑着的东西藏在折叠里等于没有
                const isCollapsed = !anyRunning && collapsed[folderKey] === true;
                const folderTone = anyRunning ? 'running' : toneOf(group.sessions[0] || {});
                const children = [
                  h(
                    'div',
                    {
                      key: 'folder',
                      className: 'dsh-hands-v2-folder',
                      'data-collapsed': isCollapsed ? 'true' : 'false',
                    },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-hands-v2-folderToggle',
                        title: group.cwd || group.label,
                        onClick: () =>
                          setCollapsed((prev) => ({ ...prev, [folderKey]: prev[folderKey] !== true })),
                      },
                      h('span', { className: 'dsh-hands-v2-folderCaret' }, isCollapsed ? '▸' : '▾'),
                      h(
                        'span',
                        { className: 'dsh-hands-v2-folderName' },
                        group.cwd || group.label,
                      ),
                      h('span', {
                        className: 'dsh-hands-v2-dot',
                        'data-tone': folderTone,
                        style: { '--tone-color': TONE_COLOR[folderTone] || TONE_COLOR.unknown },
                      }),
                      h('span', { className: 'dsh-hands-v2-folderCount' }, String(group.sessions.filter((x) => x.archived !== true).length)),
                    ),
                    group.cwd
                      ? h(
                          'button',
                          {
                            type: 'button',
                            className: 'dsh-hands-v2-folderOpen',
                            title: t('openFolder'),
                            'aria-label': t('openFolder'),
                            onClick: (event) => {
                              event.stopPropagation();
                              openFolder(group.cwd);
                            },
                          },
                          '↗',
                        )
                      : null,
                  ),
                ];
                if (!isCollapsed) {
                  const archKey = 'arch:' + folderKey;
                  const archOpen = collapsed[archKey] === true;
                  let archHeaderPushed = false;
                  const orderedRows = [...group.sessions].sort(
                    (a, b) => Number(!!a.archived) - Number(!!b.archived),
                  );
                  for (const row of orderedRows) {
                    const isArchived = row.archived === true;
                    if (isArchived && !archHeaderPushed) {
                      archHeaderPushed = true;
                      const archCount = orderedRows.filter((x) => x.archived === true).length;
                      children.push(
                        h(
                          'button',
                          {
                            key: 'arch:' + folderKey,
                            type: 'button',
                            className: 'dsh-hands-v2-archRow',
                            'data-open': archOpen ? 'true' : 'false',
                            onClick: () =>
                              setCollapsed((prev) => ({ ...prev, [archKey]: prev[archKey] !== true })),
                          },
                          h('span', { className: 'dsh-hands-v2-folderCaret' }, archOpen ? '▾' : '▸'),
                          h('span', { className: 'dsh-hands-v2-archLabel' }, '已归档 (', h('span', { className: 'dsh-hands-v2-archNum' }, String(archCount)), ')'),
                        ),
                      );
                    }
                    if (isArchived && !archOpen) continue;
                    const key = String(row.key || row.sessionKey || '');
                    const tone = toneOf(row);
                    children.push(
                      h(
                        'button',
                        {
                          key: key || String(row.name || ''),
                          type: 'button',
                          className: 'dsh-hands-v2-row',
                          'data-active':
                            slice.selectedKey && key === slice.selectedKey ? 'true' : 'false',
                          'data-archived': row.archived ? 'true' : 'false',
                          onClick: () => onPick(String(row.hand || slice.hand || ''), key),
                        },
                        h(
                          'span',
                          { className: 'dsh-hands-v2-rowTop' },
                          h('span', { className: 'dsh-hands-v2-rowName' }, sessionDisplayName(row)),
                          h(
                            'span',
                            { className: 'dsh-hands-v2-rowTurns' },
                            t('v2Turns', { n: Number(row.turns) || 0 }),
                          ),
                          h('span', {
                            className: 'dsh-hands-v2-rowArch',
                            title: row.archived ? '恢复会话' : '归档会话',
                            'aria-label': row.archived ? '恢复会话' : '归档会话',
                            onClick: (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (typeof store.archiveSession === 'function') {
                                store.archiveSession(key, !row.archived, String(row.hand || slice.hand || ''));
                              }
                            },
                          }, row.archived ? '↩' : '⤓'),
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
                      ),
                    );
                  }
                }
                return h('div', { key: folderKey, className: 'dsh-hands-v2-group' }, children);
              }),
            )
          : h(
              'div',
              { className: 'dsh-hands-v2-hint' },
              slice.phase === 'loading'
                ? t('loading')
                : needle
                  ? t('searchEmpty')
                  : t('v2NoSessions'),
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
            h(MarkdownBlock, {
              text: canExpand && !expanded ? `${full.slice(0, PROMPT_LIMIT)}…` : full,
              t,
            }),
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

    // 分块气泡：思维链默认折叠、正文走 markdown、工具调用一行等宽小字。
    // 有任何一块不认识就整段回落成普通文本（BubbleAgent 里判断）。
    function AgentBlocks(props) {
      const { t, blocks, running } = props;
      const stateText = (status) => {
        const value = String(status || '').toLowerCase();
        if (value === 'completed' || value === 'ok') return t('toolDone');
        if (value === 'failed' || value === 'error') return t('toolFailed');
        if (value === 'running') return t('toolRunning');
        return '';
      };
      return h(
        'div',
        { className: 'dsh-hands-blocks' },
        blocks.map((block, index) => {
          if (block.kind === 'tool') {
            const head = [
              h('span', { key: 'icon', className: 'dsh-hands-blockToolIcon' }, '⚙'),
              h('span', { key: 'name', className: 'dsh-hands-blockToolName' }, block.name || 'tool'),
              block.detail
                ? h(
                    'span',
                    { key: 'detail', className: 'dsh-hands-blockToolDetail', title: block.detail },
                    block.detail,
                  )
                : null,
              stateText(block.status)
                ? h('span', { key: 'state', className: 'dsh-hands-blockToolState' }, stateText(block.status))
                : null,
            ];
            const output = String(block.output || '');
            // 有输出的工具（改文件/跑命令）：默认折叠，点开看内容
            if (!output) {
              return h(
                'div',
                { key: `b${index}`, className: 'dsh-hands-blockTool', 'data-status': block.status || '' },
                h('div', { className: 'dsh-hands-blockToolHead' }, head),
              );
            }
            return h(
              'details',
              { key: `b${index}`, className: 'dsh-hands-blockTool', 'data-status': block.status || '' },
              h('summary', { className: 'dsh-hands-blockToolHead' }, head),
              h('pre', { className: 'dsh-hands-blockToolBody' }, output),
            );
          }
          if (block.kind === 'reasoning') {
            return h(
              'details',
              { key: `b${index}`, className: 'dsh-hands-blockReasoning' },
              h('summary', { className: 'dsh-hands-blockReasoningHead' }, t('reasoning')),
              h('div', { className: 'dsh-hands-blockReasoningBody' }, String(block.text || '')),
            );
          }
          return h(
            'div',
            { key: `b${index}`, className: 'dsh-hands-blockText' },
            h(MarkdownBlock, {
              text: String(block.text || ''),
              streaming: !!running && index === blocks.length - 1,
              t,
            }),
          );
        }),
        running ? h('span', { className: 'dsh-hands-cursor', 'aria-hidden': true }) : null,
      );
    }

    function BubbleAgent(props) {
      const { t, turn, view } = props;
      const [expanded, setExpanded] = React.useState(false);
      const full = String(view?.text || '');
      const source = String(view?.source || 'none');
      const running = !!view?.cursor;
      const blocks = Array.isArray(turn?.blocks) ? turn.blocks : [];
      const hasNativeBlocks =
        blocks.length > 0 &&
        blocks.every(
          (block) => block && (block.kind === 'text' || block.kind === 'reasoning' || block.kind === 'tool'),
        );
      const serverDerived = hasNativeBlocks && turn?.blocksDerived === true;
      const canExpand = full.length > BODY_LIMIT && (!hasNativeBlocks || serverDerived);
      // job 文件是尾部截断的：真要折叠文本，展示最后 4000 字，不是从中间截断的开头。
      const displayText = canExpand && !expanded ? full.slice(-BODY_LIMIT) : full;
      const parsedBlocks =
        hasNativeBlocks && (!serverDerived || !displayText)
          ? blocks
          : deriveBlocksFromText(displayText);
      const useBlocks =
        parsedBlocks.length > 0 &&
        parsedBlocks.every(
          (block) => block && (block.kind === 'text' || block.kind === 'reasoning' || block.kind === 'tool'),
        );
      const fallback = (!hasNativeBlocks || serverDerived) && (!!full || blocks.length > 0);
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
          h('span', { className: 'dsh-hands-v2-bubbleIcon', style: { color: handColor } }, h(HandIcon, { hand, size: 13 })),
          h('span', { className: 'dsh-hands-v2-bubbleName' }, handLabel(hand, t)),
          fallback
            ? h(
                'span',
                {
                  className: 'dsh-hands-v2-fallback',
                  title: t('blocksFallbackHint'),
                  'data-kind': serverDerived ? 'derived' : 'text',
                },
                t('blocksFallback'),
              )
            : null,
        ),
        h(
          'div',
          {
            className: 'dsh-hands-v2-bubble dsh-hands-v2-bubbleAgent',
            'data-source': source,
            'data-fallback': fallback ? (serverDerived ? 'derived' : 'text') : undefined,
          },
          useBlocks
            ? h(AgentBlocks, { t, blocks: parsedBlocks, running })
            : full || running
              ? h(Stream, {
                  text: displayText,
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
      const queued = isQueued(turn);
      const needBody = React.useCallback(() => {
        if (id) store.ensureTurnBody(id, true);
      }, [store, id]);
      React.useEffect(() => {
        if (!id || queued || liveText) return;
        if (!autoBody && !active) return;
        store.ensureTurnBody(id);
      }, [store, id, liveText, autoBody, active, queued]);
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
      const { t, mode, onBack, row, turns, activeTurn, action, onCancel, onRerun, usage } =
        props;
      const tone = toneOf(activeTurn || row || {});
      const running = turnIsRunning(activeTurn);
      const queued = isQueued(activeTurn);
      const finished = !!activeTurn && !running;
      const busy = !!action?.pending;
      const chips = [];
      if (queued) {
        chips.push({ key: 'queued', text: statusLabelWithQueue(activeTurn, t) });
      }
      if (row?.cwd) {
        chips.push({ key: 'cwd', text: lastPathPart(row.cwd), title: String(row.cwd) });
      }
      if (row?.model) chips.push({ key: 'model', text: String(row.model), title: String(row.model) });
      if (usage && usage.hasTokens) {
        const tokens = usage.input && usage.output
          ? `${Math.round(usage.input)}/${Math.round(usage.output)}`
          : String(Math.round(usage.input + usage.output));
        chips.push({ key: 'usageTokens', text: `${t('v2Tokens')} ${tokens}`, title: t('usageHint') });
      }
      if (usage && usage.hasCost) {
        chips.push({ key: 'usageCost', text: `$${usage.cost.toFixed(2)}`, title: t('usageHint') });
      }
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
              row ? row.name || sessionDisplayName(row) : t('v2PickSession'),
            ),
          ),
          running
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-hands-v2-stopBtn',
                  title: t('v2Stop'),
                  disabled: busy,
                  onClick: onCancel,
                },
                t('v2Stop'),
              )
            : queued
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-hands-v2-btn',
                    title: t('v2Cancel'),
                    'aria-label': t('v2Cancel'),
                    disabled: busy,
                    onClick: onCancel,
                  },
                  t('v2Cancel'),
                )
              : null,
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
      const usage = React.useMemo(() => sumTurnUsage(turns), [turns]);
      // 轮次搜索：派活内容和结果摘要都能搜
      const [query, setQuery] = React.useState('');
      const needle = query.trim().toLowerCase();
      const visibleTurns = needle
        ? turns.filter((turn) =>
            `${turn?.prompt || ''}\n${turn?.excerpt || ''}`.toLowerCase().includes(needle),
          )
        : turns;
      React.useEffect(() => {
        setQuery('');
      }, [sel.key]);

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
          turns,
          activeTurn,
          action,
          usage,
          onCancel: () => runAction('cancel'),
          onRerun: () => runAction('rerun'),
        }),
        action.error ? h('div', { className: 'dsh-hands-v2-headError' }, action.error) : null,
        h(
          'div',
          { className: 'dsh-hands-v2-search' },
          h('input', {
            type: 'search',
            className: 'dsh-hands-v2-searchInput',
            value: query,
            placeholder: t('searchTurns'),
            onChange: (event) => setQuery(event.target.value),
          }),
        ),
        h(TurnList, {
          store,
          t,
          sessionKey: sel.key,
          turns: visibleTurns,
          more,
          selectedTurnId: sel.turnId,
        }),
      );
    }

    // 纯汇总给状态条和测试共用：不去重时 live/persisted 会把同一票算两次。
    function asyncBarState(snap) {
      const live = Array.isArray(snap?.live) ? snap.live : [];
      const persisted = Array.isArray(snap?.persisted) ? snap.persisted : [];
      const rows = [...live, ...persisted]
        .filter((job, index, list) => job && job.id && list.findIndex((item) => item && item.id === job.id) === index)
        .slice(0, 20);
      const running = rows.filter((job) => turnIsRunning(job)).length;
      const queued = rows.filter((job) => isQueued(job)).length;
      const failed = rows.filter((job) => job.delivery === 'failed').length;
      return { rows, running, queued, failed, visible: !!(running || queued || failed) };
    }

    // 异步任务状态条：独立轮询 /dsh-hands/async，不往 store 里塞东西。
    // 只在有活儿/有异常时显示，平时不占地方（爸爸嫌「今日次数」那种常驻数字碍眼）。
    function HandsAsyncBar(props) {
      const t = props.t || ((key) => key);
      const [snap, setSnap] = React.useState(null);
      const [open, setOpen] = React.useState(false);
      const [reload, setReload] = React.useState(0);

      React.useEffect(() => {
        let alive = true;
        let timer = null;
        const load = async () => {
          try {
            const res = await fetch('/dsh-hands/async?n=20', { cache: 'no-store' });
            if (res.ok) {
              const data = await res.json();
              if (alive) setSnap(data);
            }
          } catch {
            // 拿不到就不显示，不能因为状态条把面板搞挂
          }
          if (alive) timer = setTimeout(load, 5000);
        };
        load();
        return () => {
          alive = false;
          if (timer) clearTimeout(timer);
        };
      }, [reload]);

      if (!snap) return null;
      const { rows, running, queued, failed, visible } = asyncBarState(snap);
      // 排队也占着状态条：只有纯空闲才收起。
      if (!visible) return null;
      const cancelJob = async (id) => {
        try {
          await fetch(endpointOf('dsh-hands/cancel'), {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ id }),
          });
        } catch {
          // 取消失败就等下一轮刷新，别把面板弄挂
        }
        setReload((value) => value + 1);
      };
      const bits = [];
      if (running) bits.push(`${running} ${t('asyncRunning')}`);
      if (queued) bits.push(`${queued} ${t('asyncQueued')}`);
      if (failed) bits.push(`${failed} ${t('asyncFailed')}`);
      return h(
        'div',
        { className: 'dsh-hands-async' },
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-hands-asyncbar',
            'data-open': open ? 'true' : 'false',
            title: t('asyncHint'),
            onClick: () => setOpen((value) => !value),
          },
          `${t('asyncTasks')} ${bits.join(' · ')} ${open ? '▾' : '▸'}`,
        ),
        open
          ? h(
              'div',
              { className: 'dsh-hands-asynclist' },
              rows.length
                ? rows.map((job) => {
                    const jobQueued = isQueued(job);
                    const jobRunning = turnIsRunning(job);
                    return h(
                      'div',
                      {
                        key: String(job.id),
                        className: 'dsh-hands-asyncrow',
                        'data-status': jobQueued
                          ? 'queued'
                          : String(job.status || '').toLowerCase(),
                      },
                      h('span', { className: 'dsh-hands-asyncrowHand' }, job.hand || '—'),
                      h(
                        'span',
                        { className: 'dsh-hands-asyncrowStatus' },
                        statusLabelWithQueue(job, t),
                      ),
                      h(
                        'span',
                        { className: 'dsh-hands-asyncrowDelivery' },
                        `${t('asyncDelivery')} ${job.delivery || '—'}${
                          job.deliveryAttempts ? `·${job.deliveryAttempts}` : ''
                        }`,
                      ),
                      h('span', { className: 'dsh-hands-asyncrowId', title: String(job.id) }, String(job.id)),
                      jobRunning || jobQueued
                        ? h(
                            'button',
                            {
                              type: 'button',
                              className: 'dsh-hands-asyncrowCancel',
                              onClick: (event) => {
                                event.stopPropagation();
                                cancelJob(job.id);
                              },
                            },
                            t('asyncCancel'),
                          )
                        : null,
                      job.deliveryError
                        ? h('span', { className: 'dsh-hands-asyncrowError' }, String(job.deliveryError))
                        : null,
                    );
                  })
                : h('div', { className: 'dsh-hands-asyncrow' }, t('asyncEmpty')),
            )
          : null,
      );
    }

    // 权限请求：ACP 问「能不能跑这个工具」时，面板上点允许/拒绝（60 秒没人点按拒绝）
    function HandsPermissionBanner(props) {
      const t = props.t || ((key) => key);
      const [items, setItems] = React.useState([]);
      const [busy, setBusy] = React.useState('');

      React.useEffect(() => {
        let alive = true;
        let timer = null;
        const load = async () => {
          try {
            const res = await fetch('/dsh-hands/permissions', { cache: 'no-store' });
            if (res.ok) {
              const data = await res.json();
              if (alive) setItems(Array.isArray(data.permissions) ? data.permissions : []);
            }
          } catch {
            // 拿不到就不显示，别把面板搞挂
          }
          if (alive) timer = setTimeout(load, 3000);
        };
        load();
        return () => {
          alive = false;
          if (timer) clearTimeout(timer);
        };
      }, []);

      if (!items.length) return null;
      const answer = async (id, decision) => {
        setBusy(id);
        try {
          await fetch('/dsh-hands/permission', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ id, decision }),
          });
        } catch {
          // 回复失败就等下一轮
        }
        setBusy('');
        setItems((prev) => prev.filter((item) => item.id !== id));
      };
      return h(
        'div',
        { className: 'dsh-hands-perms' },
        items.map((item) =>
          h(
            'div',
            { key: item.id, className: 'dsh-hands-perm' },
            h(
              'span',
              { className: 'dsh-hands-permText', title: item.detail || undefined },
              `${item.hand || ''} · ${item.title || 'tool'}${item.detail ? ` · ${item.detail}` : ''}`,
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-hands-permAllow',
                disabled: busy === item.id,
                onClick: () => answer(item.id, 'allow'),
              },
              t('permAllow'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-hands-permReject',
                disabled: busy === item.id,
                onClick: () => answer(item.id, 'reject'),
              },
              t('permReject'),
            ),
          ),
        ),
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
        h(HandsAsyncBar, { key: 'async', t }),
        h(HandsPermissionBanner, { key: 'perm', t }),
        h(
          'div',
          { className: 'dsh-hands-v2-topwrap' },
          showRail ? h(HandsRail, { key: 'rail', store, t, onPick: pickHand }) : null,
          h(
            'div',
            { className: 'dsh-hands-v2-body' },
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
        ),
      );
    }

    // ── 顶层面板：和「插件」「自动化任务」「IM机器人」同级的整页窗口 ──────────
    // 右侧栏 tab 是随手瞄一眼的窄版，这里是整页的大窗口，两处共用同一个 store
    // （store 内部用引用计数，谁先卸载都不会把另一份的流掐掉）。
    const PAGE_ID = 'dsh-hands';

    const PAGE_CSS = `
      .dsh-hands-page{display:flex;flex-direction:column;flex:auto;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;color:var(--dsw-alias-label-primary)}
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
      return h(
        'div',
        { className: 'dsh-hands-page' },
        h('style', null, PAGE_CSS),
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
      isQueued,
      queuePositionOf,
      toneOf,
      statusLabel,
      statusLabelWithQueue,
      turnIsRunning,
      asyncBarState,
      deriveBlocksFromText,
      mergeTurnsById,
      resolveTurnBody,
      formatTurnMeta,
      formatTokens,
      formatCost,
      BubbleUser,
      BubbleAgent,
      AgentBlocks,
      Turn,
      HandsPage,
      HandsNavIcon,
      groupSessionsByCwd,
      sessionDisplayName,
      HandIcon,
      HAND_ICON_PATHS,
      HAND_BRAND_PATHS,
      MarkdownLite,
      MarkdownBlock,
    };
  },
});
