window.__ModuleLoader__.load({
  id: 'dsh-hands',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // ── 文案 ────────────────────────────────────────────────────────────────
    const NS = 'sidebar.hands';
    const TAB_ID = 'dsh-hands';
    const TAB_KIND = 'hands';

    const en = {
      title: 'Hands',
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
      statusUnknown: 'Unknown',
      exitCode: 'Exit code',
      loadFailed: 'Could not read the dispatch feed.',
      showMore: 'Show older',
      justNow: 'just now',
      minutesAgo: '{n} min ago',
      durationMinSec: '{m}m {s}s',
      durationMin: '{m}m',
      handAgy: 'agy · copy',
      handCodex: 'codex · planning',
      handClaude: 'claude · architecture',
      handOpencode: 'opencode · coding',
    };

    const zh = {
      title: '手下任务',
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
      statusUnknown: '未知',
      exitCode: '退出码',
      loadFailed: '读取调度输出失败。',
      showMore: '显示更早',
      justNow: '刚刚',
      minutesAgo: '{n} 分钟前',
      durationMinSec: '{m} 分 {s} 秒',
      durationMin: '{m} 分',
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

    function endpointOf(name) {
      const base =
        typeof document !== 'undefined' && document.baseURI
          ? document.baseURI
          : typeof location !== 'undefined'
            ? location.href
            : 'http://127.0.0.1/';
      return new URL(name, base).href;
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

    // ── 接线 ────────────────────────────────────────────────────────────────
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-hands: locale');
      const t = ctx.locale.bind(NS);
      const feed = createHandsFeed();

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
                  inject: () => ({ feed }),
                },
                HandsSidebar,
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

    return { inject: ['slots', 'locale'], apply };
  },
});
