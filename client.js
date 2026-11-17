window.__ModuleLoader__.load({
  id: 'dsh-hands',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // ── 文案 ────────────────────────────────────────────────────────────────
    const NS = 'settings.handsDispatch';

    const en = {
      nav: 'Hands dispatch',
      title: 'Hands dispatch',
      intro: 'Recent jobs dispatched to the four hands: who got it, whether it succeeded, and how long it took.',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      updated: 'Updated {time}',
      autoRefresh: 'Refreshes every 5 seconds',
      recent: 'Latest {n}',
      completed: 'Completed',
      successRate: 'Success rate',
      avgDuration: 'Avg. duration',
      active: 'Running',
      allHands: 'All',
      allStatus: 'All',
      handsLabel: 'Hands',
      resultLabel: 'Result',
      filterOk: 'Succeeded',
      filterFailed: 'Failed',
      filterRunning: 'Running',
      statusOk: 'Succeeded',
      statusError: 'Failed',
      statusTimeout: 'Timed out',
      statusUnparsed: 'Unparsed',
      statusRunning: 'Running',
      statusUnknown: 'Unknown',
      empty: 'No dispatches yet',
      emptyHint: 'Call hands_run or one of the per-hand tools and the run shows up here.',
      noMatch: 'No runs match these filters.',
      loadFailed: 'Could not read the dispatch log.',
      justNow: 'just now',
      minutesAgo: '{n} min ago',
      durationMinSec: '{m}m {s}s',
      durationMin: '{m}m',
      session: 'Session',
      noSession: 'No session',
      writable: 'Can write',
      readOnly: 'Read-only',
      promptLabel: 'Brief',
      responseLabel: 'Response excerpt',
      errorLabel: 'Error',
      startedAt: 'Started',
      tool: 'Tool',
      cwd: 'Working directory',
      model: 'Model',
      exitCode: 'Exit code',
      showMore: 'Show more',
      noPrompt: '(no brief)',
      handAgy: 'agy · copy',
      handCodex: 'codex · planning',
      handClaude: 'claude · architecture',
      handOpencode: 'opencode · coding',
    };

    const zh = {
      nav: '手下调度',
      title: '手下调度',
      intro: '最近派给四个手下的活：派给谁、成没成、跑了多久。',
      refresh: '刷新',
      refreshing: '刷新中…',
      updated: '更新于 {time}',
      autoRefresh: '每 5 秒自动刷新',
      recent: '最近 {n} 条',
      completed: '已完成',
      successRate: '成功率',
      avgDuration: '平均耗时',
      active: '正在跑',
      allHands: '全部',
      allStatus: '全部',
      handsLabel: '手下',
      resultLabel: '结果',
      filterOk: '成功',
      filterFailed: '失败',
      filterRunning: '进行中',
      statusOk: '成功',
      statusError: '失败',
      statusTimeout: '超时',
      statusUnparsed: '输出未解析',
      statusRunning: '进行中',
      statusUnknown: '未知',
      empty: '还没有派过活',
      emptyHint: '调用 hands_run 或某个手下的工具之后，记录会出现在这里。',
      noMatch: '没有符合筛选条件的记录。',
      loadFailed: '读取调度日志失败。',
      justNow: '刚刚',
      minutesAgo: '{n} 分钟前',
      durationMinSec: '{m} 分 {s} 秒',
      durationMin: '{m} 分',
      session: '会话',
      noSession: '未命名',
      writable: '可写',
      readOnly: '只读',
      promptLabel: '派活内容',
      responseLabel: '答复摘录',
      errorLabel: '错误',
      startedAt: '开始时间',
      tool: '入口',
      cwd: '工作目录',
      model: '模型',
      exitCode: '退出码',
      showMore: '显示更多',
      noPrompt: '（没有内容）',
      handAgy: 'agy · 文案',
      handCodex: 'codex · 规划',
      handClaude: 'claude · 架构',
      handOpencode: 'opencode · 写码',
    };

    // ── 小工具 ──────────────────────────────────────────────────────────────
    const HAND_ORDER = ['agy', 'codex', 'claude', 'opencode'];
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

    function formatDateTime(iso) {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return iso || '—';
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }

    function endpoint() {
      const base =
        typeof document !== 'undefined' && document.baseURI
          ? document.baseURI
          : typeof location !== 'undefined'
            ? location.href
            : 'http://127.0.0.1/';
      return new URL('dsh-hands/log?n=300', base).href;
    }

    // ── 设置页图标 ──────────────────────────────────────────────────────────
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

    // ── 设置页 ──────────────────────────────────────────────────────────────
    const CSS = `
      .dsh-hands-page{display:flex;flex-direction:column;gap:14px;width:100%;max-width:760px;color:var(--dsw-alias-label-primary);font-size:13px}
      .dsh-hands-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
      .dsh-hands-title{margin:0;font-size:18px;font-weight:600;line-height:26px}
      .dsh-hands-intro{margin:4px 0 0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
      .dsh-hands-refresh{box-sizing:border-box;flex:none;height:30px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}
      .dsh-hands-refresh:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .dsh-hands-refresh:disabled{opacity:.55;cursor:default}
      .dsh-hands-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
      .dsh-hands-stat{padding:10px 12px;border:.5px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-settings-card-fill)}
      .dsh-hands-statLabel{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;white-space:nowrap}
      .dsh-hands-statValue{margin-top:2px;font-size:18px;font-weight:600;line-height:24px;font-variant-numeric:tabular-nums;white-space:nowrap}
      .dsh-hands-statValue[data-tone=running]{color:var(--dsw-alias-state-business-primary)}
      .dsh-hands-statValue[data-tone=ok]{color:var(--dsw-alias-state-success-primary)}
      .dsh-hands-statValue[data-tone=failed]{color:var(--dsw-alias-state-error-primary)}
      .dsh-hands-filters{display:flex;flex-direction:column;gap:7px}
      .dsh-hands-chipRow{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
      .dsh-hands-chipRowLabel{flex:none;min-width:32px;color:var(--dsw-alias-label-tertiary);font-size:11px}
      .dsh-hands-chip{display:inline-flex;align-items:center;gap:5px;height:27px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
      .dsh-hands-chip:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .dsh-hands-chip[data-active=true]{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-interactive-bg-active)}
      .dsh-hands-chipCount{color:var(--dsw-alias-label-tertiary);font-size:11px;font-variant-numeric:tabular-nums}
      .dsh-hands-list{display:flex;flex-direction:column;border-top:.5px solid var(--dsw-alias-border-l2)}
      .dsh-hands-row{border-bottom:.5px solid var(--dsw-alias-border-l2)}
      .dsh-hands-rowHead{box-sizing:border-box;display:flex;flex-direction:column;gap:2px;width:100%;padding:10px 4px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
      .dsh-hands-rowHead:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .dsh-hands-rowHead:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px;border-radius:var(--dsw-radius-sm)}
      .dsh-hands-rowTop{display:flex;align-items:center;gap:8px;min-width:0;line-height:20px}
      .dsh-hands-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--tone-color)}
      .dsh-hands-dot[data-tone=running]{animation:dsh-hands-pulse 1.6s ease-out infinite}
      @keyframes dsh-hands-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--tone-color) 45%,transparent)}70%{box-shadow:0 0 0 5px transparent}100%{box-shadow:0 0 0 0 transparent}}
      .dsh-hands-hand{flex:none;font-size:11px;font-weight:600;line-height:16px;color:var(--hand-color);white-space:nowrap}
      .dsh-hands-status{flex:none;font-size:11px;line-height:16px;color:var(--tone-color);white-space:nowrap}
      .dsh-hands-prompt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
      .dsh-hands-duration{flex:none;color:var(--dsw-alias-label-secondary);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
      .dsh-hands-rowSub{display:flex;align-items:center;gap:6px;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
      .dsh-hands-rowSub>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-hands-grow{flex:1}
      .dsh-hands-detail{display:flex;flex-direction:column;gap:9px;margin:0 4px 12px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}
      .dsh-hands-detailLabel{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
      .dsh-hands-detailText{max-height:170px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:19px}
      .dsh-hands-error{color:var(--dsw-alias-state-error-primary)}
      .dsh-hands-metaGrid{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 10px;font-size:11px;line-height:17px}
      .dsh-hands-metaKey{color:var(--dsw-alias-label-tertiary)}
      .dsh-hands-metaValue{min-width:0;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary)}
      .dsh-hands-empty{padding:36px 16px;border:.5px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);text-align:center;color:var(--dsw-alias-label-tertiary)}
      .dsh-hands-emptyTitle{color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;line-height:20px}
      .dsh-hands-emptyHint{margin-top:3px;font-size:12px;line-height:18px}
      .dsh-hands-errorBox{padding:9px 12px;border:.5px solid var(--dsw-alias-state-error-primary);border-radius:var(--dsw-radius-md);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
      .dsh-hands-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
      .dsh-hands-more{align-self:center;margin-top:4px;padding:5px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
      .dsh-hands-more:hover{background:var(--dsw-alias-interactive-bg-hover)}
      @media (max-width:560px){.dsh-hands-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.dsh-hands-title{font-size:17px}}
      @media (prefers-reduced-motion:reduce){.dsh-hands-dot[data-tone=running]{animation:none}}
    `;

    function Stat({ label, value, tone }) {
      return h(
        'div',
        { className: 'dsh-hands-stat' },
        h('div', { className: 'dsh-hands-statLabel' }, label),
        h('div', { className: 'dsh-hands-statValue', 'data-tone': tone }, value),
      );
    }

    function FilterChip({ active, label, count, onClick }) {
      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-hands-chip',
          'data-active': active ? 'true' : 'false',
          onClick,
        },
        label,
        count === undefined ? null : h('span', { className: 'dsh-hands-chipCount' }, count),
      );
    }

    function HandsPage({ t }) {
      const [state, setState] = React.useState({
        phase: 'loading',
        entries: [],
        running: [],
        checkedAt: '',
        error: '',
      });
      const [refreshing, setRefreshing] = React.useState(false);
      const [handFilter, setHandFilter] = React.useState('all');
      const [statusFilter, setStatusFilter] = React.useState('all');
      const [visible, setVisible] = React.useState(60);
      const [openId, setOpenId] = React.useState('');
      const alive = React.useRef(true);

      const load = React.useCallback(async () => {
        setRefreshing(true);
        try {
          const response = await fetch(endpoint(), {
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { accept: 'application/json' },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          if (!alive.current) return;
          setState({
            phase: 'ready',
            entries: Array.isArray(data.entries) ? data.entries : [],
            running: Array.isArray(data.running) ? data.running : [],
            checkedAt: String(data.checkedAt || ''),
            error: '',
          });
        } catch (error) {
          if (!alive.current) return;
          setState((previous) => ({
            ...previous,
            phase: previous.entries.length ? 'ready' : 'error',
            error: String(error?.message ?? error),
          }));
        } finally {
          if (alive.current) setRefreshing(false);
        }
      }, []);

      React.useEffect(() => {
        alive.current = true;
        load();
        const timer = setInterval(load, 5000);
        return () => {
          alive.current = false;
          clearInterval(timer);
        };
      }, [load]);

      React.useEffect(() => {
        setVisible(60);
      }, [handFilter, statusFilter]);

      const rows = React.useMemo(() => {
        const running = state.running.map((entry) => ({ ...entry, running: true, status: 'RUNNING' }));
        return running.concat(state.entries);
      }, [state.running, state.entries]);

      const completed = state.entries.filter((entry) => toneOf(entry) !== 'running');
      const okCount = completed.filter((entry) => isOk(entry)).length;
      const failedCount = completed.length - okCount;
      const runningCount = rows.filter((entry) => toneOf(entry) === 'running').length;
      const rate = completed.length ? Math.round((okCount / completed.length) * 100) : null;
      const avgMs = completed.length
        ? completed.reduce((total, entry) => total + (Number(entry.ms) || 0), 0) / completed.length
        : 0;

      const handCounts = React.useMemo(() => {
        const counts = {};
        for (const entry of rows) {
          const key = String(entry.hand || 'unknown').toLowerCase();
          counts[key] = (counts[key] || 0) + 1;
        }
        return counts;
      }, [rows]);

      const filtered = React.useMemo(() => {
        return rows.filter((entry) => {
          if (handFilter !== 'all' && String(entry.hand || '').toLowerCase() !== handFilter) return false;
          if (statusFilter === 'all') return true;
          const tone = toneOf(entry);
          if (statusFilter === 'ok') return tone === 'ok';
          if (statusFilter === 'failed') return tone === 'failed' || tone === 'timeout' || tone === 'unknown';
          if (statusFilter === 'running') return tone === 'running';
          return true;
        });
      }, [rows, handFilter, statusFilter]);

      const shown = filtered.slice(0, visible);
      const updatedTime = state.checkedAt ? formatTime(state.checkedAt, t) : '';

      function renderDetail(entry) {
        const meta = [
          [t('tool'), entry.tool || '—'],
          [t('startedAt'), formatDateTime(entry.startedAt || entry.at)],
          [t('cwd'), entry.cwd || '—'],
          [t('model'), entry.model || '—'],
          [t('exitCode'), entry.exitCode === undefined ? '—' : String(entry.exitCode)],
          [t('session'), entry.session || t('noSession')],
        ];
        return h(
          'div',
          { className: 'dsh-hands-detail' },
          h('div', { className: 'dsh-hands-detailLabel' }, t('promptLabel')),
          h('div', { className: 'dsh-hands-detailText' }, entry.prompt || t('noPrompt')),
          entry.excerpt
            ? h('div', { className: 'dsh-hands-detailLabel' }, t('responseLabel'))
            : null,
          entry.excerpt ? h('div', { className: 'dsh-hands-detailText' }, entry.excerpt) : null,
          entry.error
            ? h('div', { className: 'dsh-hands-detailLabel' }, t('errorLabel'))
            : null,
          entry.error
            ? h('div', { className: 'dsh-hands-detailText dsh-hands-error' }, entry.error)
            : null,
          h(
            'div',
            { className: 'dsh-hands-metaGrid' },
            meta.flatMap(([key, value], index) => [
              h('span', { className: 'dsh-hands-metaKey', key: `k${index}` }, key),
              h('span', { className: 'dsh-hands-metaValue', key: `v${index}` }, value),
            ]),
          ),
        );
      }

      function renderRow(entry, index) {
        const tone = toneOf(entry);
        const key = entry.id || `${entry.startedAt || entry.at || 'run'}-${index}`;
        const open = openId === key;
        const hand = String(entry.hand || '').toLowerCase();
        const tool = entry.tool || hand || '—';
        return h(
          'div',
          { className: 'dsh-hands-row', key },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-hands-rowHead',
              'aria-expanded': open ? 'true' : 'false',
              onClick: () => setOpenId(open ? '' : key),
            },
            h(
              'span',
              { className: 'dsh-hands-rowTop' },
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
                statusLabel(entry, t),
              ),
              h('span', { className: 'dsh-hands-prompt' }, entry.prompt || t('noPrompt')),
              h('span', { className: 'dsh-hands-duration' }, formatDuration(entry.ms, t)),
            ),
            h(
              'span',
              { className: 'dsh-hands-rowSub' },
              h('span', null, `${t('session')} · ${entry.session || t('noSession')}`),
              h('span', null, '·'),
              h('span', null, tool),
              h('span', { className: 'dsh-hands-grow' }),
              h('span', null, formatTime(entry.startedAt || entry.at, t)),
              h('span', null, '·'),
              h('span', null, entry.write ? t('writable') : t('readOnly')),
            ),
          ),
          open ? renderDetail(entry) : null,
        );
      }

      const handChips = [
        h(FilterChip, {
          key: 'all',
          active: handFilter === 'all',
          label: t('allHands'),
          count: rows.length,
          onClick: () => setHandFilter('all'),
        }),
        ...HAND_ORDER.map((hand) =>
          h(FilterChip, {
            key: hand,
            active: handFilter === hand,
            label: hand,
            count: handCounts[hand] || 0,
            onClick: () => setHandFilter(hand),
          }),
        ),
      ];

      const statusChips = [
        ['all', t('allStatus'), rows.length],
        ['ok', t('filterOk'), okCount],
        ['failed', t('filterFailed'), failedCount],
        ['running', t('filterRunning'), runningCount],
      ].map(([value, label, count]) =>
        h(FilterChip, {
          key: value,
          active: statusFilter === value,
          label,
          count,
          onClick: () => setStatusFilter(value),
        }),
      );

      let list;
      if (state.phase === 'loading') {
        list = h(
          'div',
          { className: 'dsh-hands-empty' },
          h('div', { className: 'dsh-hands-emptyTitle' }, t('refreshing')),
        );
      } else if (!rows.length) {
        list = h(
          'div',
          { className: 'dsh-hands-empty' },
          h('div', { className: 'dsh-hands-emptyTitle' }, t('empty')),
          h('div', { className: 'dsh-hands-emptyHint' }, t('emptyHint')),
        );
      } else if (!filtered.length) {
        list = h(
          'div',
          { className: 'dsh-hands-empty' },
          h('div', { className: 'dsh-hands-emptyTitle' }, t('noMatch')),
        );
      } else {
        list = h(
          'div',
          { className: 'dsh-hands-list' },
          shown.map(renderRow),
          filtered.length > shown.length
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-hands-more',
                  onClick: () => setVisible((value) => value + 100),
                },
                `${t('showMore')} (${filtered.length - shown.length})`,
              )
            : null,
        );
      }

      return h(
        'div',
        { className: 'dsh-hands-page' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'dsh-hands-head' },
          h(
            'div',
            null,
            h('h2', { className: 'dsh-hands-title' }, t('title')),
            h('p', { className: 'dsh-hands-intro' }, t('intro')),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-hands-refresh',
              disabled: refreshing,
              onClick: load,
            },
            refreshing ? t('refreshing') : t('refresh'),
          ),
        ),
        h(
          'div',
          { className: 'dsh-hands-stats' },
          h(Stat, { label: t('completed'), value: String(completed.length) }),
          h(Stat, {
            label: t('successRate'),
            value: rate === null ? '—' : `${rate}%`,
            tone: rate === null ? undefined : rate >= 80 ? 'ok' : 'failed',
          }),
          h(Stat, {
            label: t('avgDuration'),
            value: completed.length ? formatDuration(avgMs, t) : '—',
          }),
          h(Stat, {
            label: t('active'),
            value: String(runningCount),
            tone: runningCount ? 'running' : undefined,
          }),
        ),
        h(
          'div',
          { className: 'dsh-hands-filters' },
          h(
            'div',
            { className: 'dsh-hands-chipRow' },
            h('span', { className: 'dsh-hands-chipRowLabel' }, t('handsLabel')),
            handChips,
          ),
          h(
            'div',
            { className: 'dsh-hands-chipRow' },
            h('span', { className: 'dsh-hands-chipRowLabel' }, t('resultLabel')),
            statusChips,
          ),
        ),
        state.error
          ? h(
              'div',
              { className: 'dsh-hands-errorBox' },
              `${t('loadFailed')} ${state.error}`,
            )
          : null,
        list,
        h(
          'div',
          { className: 'dsh-hands-footer' },
          h('span', null, `${t('autoRefresh')} · ${t('recent', { n: rows.length })}`),
          h('span', null, updatedTime ? t('updated', { time: updatedTime }) : ''),
        ),
      );
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-hands: locale');
      const t = ctx.locale.bind(NS);
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'hands-dispatch',
            order: 12,
            label: () => t('nav'),
            locale: NS,
          },
          HandsPage,
        ),
      );
      ctx.slots.inject('settings.section.icon', () =>
        ctx.slots.register(
          {
            name: 'settings.section.icon',
            id: 'hands-dispatch',
            locale: NS,
          },
          HandsIcon,
        ),
      );
    }

    return { inject: ['slots', 'locale'], apply };
  },
});
