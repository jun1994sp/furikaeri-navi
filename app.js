// 振り返りナビ：アプリ本体（状態管理・画面描画・出力）
'use strict';

const STORE_KEY = 'furikaeri-navi:v1';
const APP_URL = 'https://jun1994sp.github.io/furikaeri-navi/';
const APP_VERSION = '1.0.0';

/* =========================================================
 * 保存（localStorage）
 * ======================================================= */
let storageOK = true;

function emptyDB() {
  return { version: 1, actions: [], reflections: [], draft: null };
}

function normalizeDB(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.actions) || !Array.isArray(d.reflections)) {
    throw new Error('invalid data');
  }
  return { version: 1, actions: d.actions, reflections: d.reflections, draft: d.draft || null };
}

function load() {
  try {
    localStorage.setItem(STORE_KEY + ':test', '1');
    localStorage.removeItem(STORE_KEY + ':test');
  } catch (e) {
    storageOK = false;
    return emptyDB();
  }
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? normalizeDB(JSON.parse(raw)) : emptyDB();
  } catch (e) {
    return emptyDB();
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch (e) {
    if (storageOK) toast('この端末では保存できませんでした');
    storageOK = false;
  }
}

let db = load();

/* =========================================================
 * 日付ユーティリティ（'YYYY-MM-DD' 文字列で扱う）
 * ======================================================= */
const pad = (n) => String(n).padStart(2, '0');
const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => toStr(new Date());
const maxStr = (a, b) => (a > b ? a : b);

function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toStr(d);
}

function addMonths(s, n) {
  const d = parseDate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toStr(d);
}

const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

function fmtDate(s) {
  if (!s) return '—';
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

function fmtDateY(s) {
  if (!s) return '—';
  const d = parseDate(s);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

const isoToDate = (iso) => toStr(new Date(iso));

function firstOnOrAfter(s, weekday) {
  const d = parseDate(s);
  return addDays(s, (weekday - d.getDay() + 7) % 7);
}

/* =========================================================
 * 振り返りスケジュール
 * ======================================================= */
function computeAnchor(a) {
  if (a.cycle === 'monthly') return addMonths(a.startDate, 1);
  // 開始直後すぎないよう、毎週は4日後以降・隔週は11日後以降の指定曜日を初回にする
  return firstOnOrAfter(addDays(a.startDate, a.cycle === 'biweekly' ? 11 : 4), Number(a.reviewWeekday));
}

// after より後の最初の振り返り日（終了日で打ち切り）。期間が終わっていれば null
function nextAfter(a, after) {
  if (after >= a.endDate) return null;
  const anchor = a.anchorDate || computeAnchor(a);
  let d = anchor;
  if (a.cycle === 'monthly') {
    for (let k = 1; d <= after && k < 240; k++) d = addMonths(anchor, k);
  } else if (d <= after) {
    const step = a.cycle === 'biweekly' ? 14 : 7;
    d = addDays(d, (Math.floor(diffDays(d, after) / step) + 1) * step);
  }
  return d > a.endDate ? a.endDate : d;
}

function freqLabel(f) {
  if (!f) return '';
  let s = '';
  switch (f.type) {
    case 'daily': s = '毎日'; break;
    case 'weeklyCount': s = `週${f.count || 1}回`; break;
    case 'weekdays':
      s = f.weekdays && f.weekdays.length
        ? '毎週 ' + [...f.weekdays].sort((a, b) => a - b).map((i) => WEEKDAYS[i]).join('・')
        : '曜日指定';
      break;
    case 'custom': return f.note || '';
  }
  return f.note ? `${s}（${f.note}）` : s;
}

function cycleLabel(a) {
  if (a.cycle === 'monthly') return '毎月';
  return `${a.cycle === 'biweekly' ? '隔週' : '毎週'} ${WEEKDAYS[a.reviewWeekday]}曜日`;
}

/* =========================================================
 * 行動
 * ======================================================= */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const getAction = (id) => db.actions.find((a) => a.id === id);

function newActionForm(base) {
  const t = today();
  return {
    text: '',
    kpiMemo: base ? base.kpiMemo || '' : '',
    startDate: t,
    endDate: base && base.endDate > addDays(t, 6) ? base.endDate : addMonths(t, 3),
    frequency: { type: 'weeklyCount', count: 3, weekdays: [], note: '' },
    cycle: base ? base.cycle : 'weekly',
    reviewWeekday: base ? base.reviewWeekday : 5,
  };
}

function formFromAction(a) {
  return {
    text: a.text,
    kpiMemo: a.kpiMemo,
    startDate: a.startDate,
    endDate: a.endDate,
    frequency: { ...a.frequency, weekdays: [...(a.frequency.weekdays || [])], note: a.frequency.note || '' },
    cycle: a.cycle,
    reviewWeekday: a.reviewWeekday,
  };
}

function cleanForm(f) {
  return {
    text: f.text.trim(),
    kpiMemo: f.kpiMemo.trim(),
    startDate: f.startDate,
    endDate: f.endDate,
    frequency: {
      type: f.frequency.type,
      count: Math.min(7, Math.max(1, Number(f.frequency.count) || 1)),
      weekdays: [...f.frequency.weekdays].map(Number).sort((a, b) => a - b),
      note: (f.frequency.note || '').trim(),
    },
    cycle: f.cycle,
    reviewWeekday: Number(f.reviewWeekday),
  };
}

function scheduleAction(a, after) {
  a.anchorDate = computeAnchor(a);
  a.nextReviewDate = nextAfter(a, after);
}

function createAction(f) {
  const now = new Date().toISOString();
  const a = { id: uid(), ...cleanForm(f), status: 'active', createdAt: now, updatedAt: now };
  scheduleAction(a, maxStr(a.startDate, addDays(today(), -1)));
  db.actions.push(a);
  return a;
}

function snapshot(a) {
  return {
    text: a.text,
    kpiMemo: a.kpiMemo,
    freq: freqLabel(a.frequency),
    startDate: a.startDate,
    endDate: a.endDate,
    cycle: cycleLabel(a),
  };
}

const isDue = (a) => a.status === 'active' && (!a.nextReviewDate || a.nextReviewDate <= today());
const reflectionsOf = (actionId) => db.reflections
  .filter((r) => r.actionId === actionId)
  .sort((x, y) => x.createdAt.localeCompare(y.createdAt));

const GROUPS = ['what', 'kpi', 'period', 'freq', 'cycle'];

function groupValid(g, f) {
  switch (g) {
    case 'what': return f.text.trim().length > 0;
    case 'period': return !!f.startDate && !!f.endDate && f.endDate > f.startDate;
    case 'freq':
      if (f.frequency.type === 'custom') return (f.frequency.note || '').trim().length > 0;
      if (f.frequency.type === 'weekdays') return f.frequency.weekdays.length > 0;
      return true;
    default: return true;
  }
}
const formValid = (f) => GROUPS.every((g) => groupValid(g, f));

/* =========================================================
 * 振り返りウィザード
 * ======================================================= */
function newDraft(actionId) {
  return {
    actionId,
    startedAt: new Date().toISOString(),
    data: {
      executed: null, doneCount: '', achieved: null,
      factors: [], otherText: '', mainFactor: null,
      step4: { q1: '', q2: '', q3: '' },
      step5: { mindset: '', passion: '', ability: '' },
      decision: null, edit: null, editFor: null,
      nextReviewDate: '', nextManual: false,
    },
  };
}

function routeOf(d) {
  if (d.executed === false) return 'notDone';
  if (d.executed === true && d.achieved === true) return 'achieved';
  if (d.executed === true && d.achieved === false) return 'notAchieved';
  return null;
}

function getSteps(d) {
  const s = ['executed'];
  if (d.executed === true) s.push('achieved');
  if (routeOf(d)) {
    s.push('factors');
    if (d.factors.length !== 1) s.push('main');
    s.push('step4', 'step5', 'decision');
    if (d.decision === 'modify' || d.decision === 'replace') s.push('edit');
    s.push('next');
  }
  return s;
}

function stepValid(step, d) {
  switch (step) {
    case 'executed': return d.executed !== null;
    case 'achieved': return d.achieved !== null;
    case 'factors': return d.factors.length > 0 && (!d.factors.includes(OTHER_FACTOR_ID) || d.otherText.trim().length > 0);
    case 'main': return !!d.mainFactor && d.factors.includes(d.mainFactor);
    case 'decision': return !!d.decision;
    case 'edit': return !!d.edit && formValid(d.edit);
    default: return true;
  }
}

function factorName(route, id, otherText) {
  if (id === OTHER_FACTOR_ID) return otherText ? `その他（${otherText}）` : 'その他';
  const f = ROUTES[route].factors.find((x) => x.id === id);
  return f ? f.name : id;
}

function proposedNext(d, a) {
  const t = today();
  if (d.decision === 'replace') {
    const tmp = cleanForm(d.edit);
    tmp.anchorDate = computeAnchor(tmp);
    return nextAfter(tmp, maxStr(tmp.startDate, addDays(t, -1)));
  }
  let tmp = a;
  if (d.decision === 'modify') {
    tmp = { ...a, ...cleanForm(d.edit) };
    tmp.anchorDate = computeAnchor(tmp);
  }
  // 予定日より前に振り返った場合は、その予定日の分を済ませたものとして次の回を提案する
  return nextAfter(tmp, maxStr(t, a.nextReviewDate || t));
}

function startReflection(actionId) {
  if (db.draft && db.draft.actionId !== actionId) {
    const other = getAction(db.draft.actionId);
    if (other && !confirm(`途中の振り返り（${other.text}）があります。破棄して新しく始めますか？`)) return;
    db.draft = null;
  }
  if (!db.draft) db.draft = newDraft(actionId);
  save();
  go({ type: 'wizard', step: firstOpenStep(db.draft.data) });
}

function firstOpenStep(d) {
  const steps = getSteps(d);
  return steps.find((s) => !stepValid(s, d)) || steps[steps.length - 1];
}

function wizardNext() {
  const d = db.draft.data;
  let steps = getSteps(d);
  const cur = view.step;
  if (!stepValid(cur, d)) return;
  if (cur === 'factors') {
    if (d.factors.length === 1) d.mainFactor = d.factors[0];
    else if (!d.factors.includes(d.mainFactor)) d.mainFactor = null;
    steps = getSteps(d);
  }
  const idx = steps.indexOf(cur);
  if (idx === steps.length - 1) { finishReflection(); return; }
  const nextStep = steps[idx + 1];
  if (nextStep === 'next' && !d.nextManual) {
    d.nextReviewDate = proposedNext(d, getAction(db.draft.actionId)) || '';
  }
  save();
  go({ type: 'wizard', step: nextStep });
}

function finishReflection() {
  const dr = db.draft;
  const d = dr.data;
  const a = getAction(dr.actionId);
  const t = today();
  const route = routeOf(d);
  const r = {
    id: uid(),
    actionId: a.id,
    createdAt: new Date().toISOString(),
    actionSnapshot: snapshot(a),
    executed: d.executed,
    doneCount: String(d.doneCount || '').trim(),
    achieved: d.executed ? d.achieved : null,
    route,
    factors: [...d.factors],
    otherText: d.otherText.trim(),
    mainFactor: d.factors.length === 1 ? d.factors[0] : d.mainFactor,
    step4: { ...d.step4 },
    step5: { ...d.step5 },
    decision: d.decision,
    newActionId: null,
    newSnapshot: null,
    nextReviewDate: null,
    actionEnded: false,
  };
  const now = new Date().toISOString();
  if (!d.nextReviewDate) d.nextReviewDate = proposedNext(d, a) || '';
  a.lastReviewedAt = t;
  a.updatedAt = now;

  if (d.decision === 'continue') {
    a.nextReviewDate = d.nextReviewDate || null;
    if (!a.nextReviewDate) { a.status = 'ended'; a.endedAt = t; r.actionEnded = true; }
  } else if (d.decision === 'modify') {
    Object.assign(a, cleanForm(d.edit));
    scheduleAction(a, t);
    if (d.nextReviewDate) a.nextReviewDate = d.nextReviewDate;
    if (!a.nextReviewDate) { a.status = 'ended'; a.endedAt = t; r.actionEnded = true; }
    r.newSnapshot = snapshot(a);
  } else if (d.decision === 'replace') {
    a.status = 'ended';
    a.endedAt = t;
    const n = createAction(d.edit);
    if (d.nextReviewDate) n.nextReviewDate = d.nextReviewDate;
    n.replaces = a.id;
    a.replacedBy = n.id;
    r.newActionId = n.id;
    r.newSnapshot = snapshot(n);
    r.actionEnded = true;
  }
  r.nextReviewDate = d.decision === 'replace' ? getAction(r.newActionId).nextReviewDate : a.nextReviewDate;

  db.reflections.push(r);
  db.draft = null;
  save();
  go({ type: 'done', id: r.id }, true);
}

/* =========================================================
 * ルーティング
 * ======================================================= */
let view = { tab: 'home' };
let formState = null;     // 行動の登録・編集フォーム
let histMode = 'reflections';
let trendRange = 'all';

function go(v, replace) {
  view = v;
  if (replace) history.replaceState(v, '');
  else history.pushState(v, '');
  render();
  window.scrollTo(0, 0);
}

window.addEventListener('popstate', (e) => {
  view = e.state || { tab: 'home' };
  render();
});

/* =========================================================
 * 描画ヘルパー
 * ======================================================= */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl = (s) => esc(s).replace(/\n/g, '<br>');

function routeVars(route) {
  const R = ROUTES[route];
  return `--step-color:${R.color};--step-soft:${R.soft};`;
}

function routeBadge(route) {
  const R = ROUTES[route];
  return `<span class="route-badge" style="--badge-color:${R.color};--badge-soft:${R.soft}"><span class="mark">${R.mark}</span>${R.name}</span>`;
}

function dot(route, title) {
  const R = ROUTES[route];
  return `<span class="dot" style="--d-color:${R.color}" title="${esc(title || R.short)}" aria-label="${esc(title || R.short)}">${R.mark}</span>`;
}

function topbar(title, opts = {}) {
  return `<header class="topbar">
    <button type="button" class="icon-btn" data-action="back" aria-label="戻る">‹</button>
    <div class="title">${esc(title)}</div>
    ${opts.close ? `<button type="button" class="icon-btn" data-action="closeWizard" aria-label="閉じる" style="margin-left:-44px">✕</button>` : ''}
  </header>`;
}

function bottomBar(inner) {
  return `<div class="bottombar"><div class="bottombar-inner">${inner}</div></div>`;
}

function textarea(model, value, placeholder, rows = 3) {
  return `<textarea class="textarea" rows="${rows}" data-model="${model}" placeholder="${esc(placeholder || '')}">${esc(value)}</textarea>`;
}

/* =========================================================
 * 行動フォーム（登録・編集・ウィザード内で共用）
 * ======================================================= */
function renderGroup(g, f, p) {
  switch (g) {
    case 'what':
      return `<div class="field">
        <label for="f-text">決めた行動<span class="req">必須</span></label>
        <textarea id="f-text" class="textarea" rows="3" data-model="${p}.text" placeholder="例：既存顧客に新サービスの案内電話をする">${esc(f.text)}</textarea>
        <span class="hint">「何を」「どのように」行うかを、具体的に書きましょう。</span>
      </div>`;
    case 'kpi':
      return `<div class="field">
        <label for="f-kpi">この行動で達成したいKPI<span class="opt">任意</span></label>
        <input id="f-kpi" class="input" data-model="${p}.kpiMemo" value="${esc(f.kpiMemo)}" placeholder="例：新規アポ 月20件">
        <span class="hint">メモしておくと、振り返りで「成果が出たか」を判断しやすくなります。</span>
      </div>`;
    case 'period': {
      const months = [1, 2, 3].map((m) => {
        const on = f.startDate && f.endDate === addMonths(f.startDate, m);
        return `<button type="button" class="chip" aria-pressed="${on}" data-action="periodMonths" data-prefix="${p}" data-months="${m}">${m}か月</button>`;
      }).join('');
      const bad = !groupValid('period', f);
      return `<div class="field">
        <span class="label">実行する期間<span class="req">必須</span></span>
        <div class="date-row">
          <input type="date" class="input" aria-label="開始日" data-model="${p}.startDate" data-rerender value="${esc(f.startDate)}">
          <span class="tilde">〜</span>
          <input type="date" class="input" aria-label="終了日" data-model="${p}.endDate" data-rerender value="${esc(f.endDate)}">
        </div>
        <div class="chips">${months}</div>
        ${bad ? '<span class="hint" style="color:var(--red)">終了日は開始日より後にしてください。</span>' : '<span class="hint">KPIの期間（例：直近3か月）に合わせましょう。</span>'}
      </div>`;
    }
    case 'freq': {
      const fr = f.frequency;
      const types = FREQ_TYPES.map((t) => `<button type="button" class="chip" aria-pressed="${fr.type === t.key}" data-action="set" data-path="${p}.frequency.type" data-value="${t.key}">${t.label}</button>`).join('');
      let detail = '';
      if (fr.type === 'weeklyCount') {
        detail = `<div class="stepper" role="group" aria-label="週あたりの回数">
          <button type="button" class="btn" data-action="inc" data-path="${p}.frequency.count" data-delta="-1" data-min="1" data-max="7" aria-label="減らす">−</button>
          <span class="val">週${fr.count}回</span>
          <button type="button" class="btn" data-action="inc" data-path="${p}.frequency.count" data-delta="1" data-min="1" data-max="7" aria-label="増やす">＋</button>
        </div>`;
      } else if (fr.type === 'weekdays') {
        detail = `<div class="chips" role="group" aria-label="実行する曜日">${[1, 2, 3, 4, 5, 6, 0].map((i) => `<button type="button" class="chip day" aria-pressed="${fr.weekdays.includes(i)}" data-action="toggleIn" data-path="${p}.frequency.weekdays" data-value="${i}">${WEEKDAYS[i]}</button>`).join('')}</div>`;
      }
      const custom = fr.type === 'custom';
      return `<div class="field">
        <span class="label">実行する頻度<span class="req">必須</span></span>
        <div class="chips">${types}</div>
        ${detail}
        <input class="input" data-model="${p}.frequency.note" value="${esc(fr.note)}" placeholder="${custom ? '例：月初と月末に1回ずつ' : '補足（任意）例：1回30分、午前中に'}" aria-label="${custom ? '頻度' : '頻度の補足'}">
        <span class="hint">振り返りでは「この頻度どおりに実行できたか」を確認します。</span>
      </div>`;
    }
    case 'cycle': {
      const cycles = CYCLES.map((c) => `<button type="button" class="chip" aria-pressed="${f.cycle === c.key}" data-action="set" data-path="${p}.cycle" data-value="${c.key}">${c.label}</button>`).join('');
      const days = f.cycle === 'monthly' ? '' : `<span class="hint">振り返る曜日</span><div class="chips" role="group" aria-label="振り返る曜日">${[1, 2, 3, 4, 5, 6, 0].map((i) => `<button type="button" class="chip day" aria-pressed="${Number(f.reviewWeekday) === i}" data-action="set" data-path="${p}.reviewWeekday" data-value="${i}" data-type="num">${WEEKDAYS[i]}</button>`).join('')}</div>`;
      let preview = '';
      if (groupValid('period', f)) {
        const tmp = cleanForm(f);
        tmp.anchorDate = computeAnchor(tmp);
        const first = nextAfter(tmp, maxStr(tmp.startDate, addDays(today(), -1)));
        preview = `<div class="note">📅 最初の振り返り：<b>${fmtDate(first)}</b>（以降 ${cycleLabel(tmp)}、${fmtDate(tmp.endDate)}まで）</div>`;
      }
      return `<div class="field">
        <span class="label">振り返りの周期</span>
        <div class="chips">${cycles}</div>
        ${days}
        ${preview}
      </div>`;
    }
  }
  return '';
}

const GROUP_TITLES = {
  what: ['どんな行動をしますか？', 'KPIを必ず達成するために、実行する行動を1つ決めます。'],
  kpi: ['何のための行動ですか？', 'この行動でどのKPIを達成したいのかをメモします。'],
  period: ['いつまで続けますか？', '行動を続ける期間を決めます。'],
  freq: ['どのくらいの頻度で行いますか？', '「いつ・何回やるか」を決めると、実行できたかを判断しやすくなります。'],
  cycle: ['どのくらいの間隔で振り返りますか？', '決めた周期で振り返り、行動を調整していきます。'],
  confirm: ['この内容で登録します', '内容を確認してください。あとから編集もできます。'],
};

function actionKV(a) {
  return `<dl class="kv">
    <dt>🎯 KPI</dt><dd>${a.kpiMemo ? esc(a.kpiMemo) : '<span class="muted">未設定</span>'}</dd>
    <dt>🔁 頻度</dt><dd>${esc(freqLabel(a.frequency))}</dd>
    <dt>📆 期間</dt><dd>${fmtDateY(a.startDate)} 〜 ${fmtDateY(a.endDate)}</dd>
    <dt>🪞 振り返り</dt><dd>${esc(cycleLabel(a))}</dd>
  </dl>`;
}

function renderActionNew() {
  if (!formState) { go({ tab: 'home' }, true); return ''; }
  const steps = [...GROUPS, 'confirm'];
  const i = Math.min(view.step || 0, steps.length - 1);
  const g = steps[i];
  const [title, q] = GROUP_TITLES[g];
  const body = g === 'confirm'
    ? `<div class="card"><div class="a-text" style="font-weight:800;font-size:17px;margin-bottom:10px">${nl(formState.text)}</div>${actionKV(cleanForm(formState))}</div>`
    : renderGroup(g, formState, 'form');
  const valid = g === 'confirm' ? formValid(formState) : groupValid(g, formState);
  return `${topbar('行動を登録')}
    <div class="progress" style="--step-color:var(--navy)"><span style="width:${((i + 1) / steps.length) * 100}%"></span></div>
    <main class="page fade-in" style="--step-color:var(--navy)">
      <div class="step-head">
        <div class="step-num" style="background:var(--navy);font-size:17px">${i + 1}/${steps.length}</div>
        <div><h2>${title}</h2></div>
      </div>
      <p class="question">${q}</p>
      ${body}
    </main>
    ${bottomBar(`<button type="button" class="btn btn-navy" id="nextBtn" data-action="actionNewNext" ${valid ? '' : 'disabled'}>${g === 'confirm' ? '登録する' : '次へ'}</button>`)}`;
}

function renderActionEdit() {
  const a = getAction(view.id);
  if (!a || !formState) { go({ tab: 'home' }, true); return ''; }
  return `${topbar('行動を編集')}
    <main class="page fade-in" style="--step-color:var(--navy)">
      ${GROUPS.map((g) => `<div class="card">${renderGroup(g, formState, 'form')}</div>`).join('')}
    </main>
    ${bottomBar(`<button type="button" class="btn btn-navy" id="nextBtn" data-action="saveEdit" ${formValid(formState) ? '' : 'disabled'}>保存する</button>`)}`;
}

function calendarBlock(a) {
  if (!a || a.status !== 'active') return '';
  return `<div class="card">
    <div class="chart-title">📅 振り返り日をカレンダーに登録</div>
    <p class="small muted" style="margin-bottom:10px">${esc(cycleLabel(a))}・${fmtDate(a.nextReviewDate || a.anchorDate)}から${fmtDate(a.endDate)}まで、繰り返しの予定として登録します。</p>
    <div class="btn-row">
      <a class="btn" href="${esc(googleCalUrl(a))}" target="_blank" rel="noopener">Googleカレンダー</a>
      <button type="button" class="btn" data-action="ics" data-id="${a.id}">iPhone・その他（.ics）</button>
    </div>
  </div>`;
}

function renderActionCreated() {
  const a = getAction(view.id);
  if (!a) { go({ tab: 'home' }, true); return ''; }
  return `<header class="appbar"><h1>登録しました 🎉</h1><p>決めた行動を実行し、振り返り日に確認しましょう。</p></header>
    <main class="page fade-in">
      <div class="card"><div style="font-weight:800;font-size:17px;margin-bottom:10px">${nl(a.text)}</div>${actionKV(a)}
        <div class="note" style="margin-top:12px">次の振り返り：<b>${fmtDate(a.nextReviewDate)}</b></div>
      </div>
      ${calendarBlock(a)}
    </main>
    ${bottomBar(`<button type="button" class="btn btn-navy" data-action="home">ホームへ</button>`)}`;
}

/* =========================================================
 * ホーム
 * ======================================================= */
function renderHome() {
  const t = today();
  const active = db.actions.filter((a) => a.status === 'active')
    .sort((x, y) => (isDue(y) - isDue(x)) || String(x.nextReviewDate).localeCompare(String(y.nextReviewDate)));
  const draftAction = db.draft && getAction(db.draft.actionId);
  const dueCount = active.filter(isDue).length;

  const cards = active.map((a) => {
    const due = isDue(a);
    const last = reflectionsOf(a.id).slice(-1)[0];
    const left = diffDays(t, a.endDate);
    return `<article class="card action-card ${due ? 'due' : ''}">
      <button type="button" class="main" data-action="startReflection" data-id="${a.id}">
        <div class="a-text">${nl(a.text)}</div>
        <div class="meta">
          ${a.kpiMemo ? `<span>🎯 ${esc(a.kpiMemo)}</span>` : ''}
          <span>🔁 ${esc(freqLabel(a.frequency))}</span>
          <span>📆 ${left >= 0 ? `残り${left}日` : '期間終了'}</span>
        </div>
      </button>
      <div class="foot">
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          ${due ? '<span class="badge due">● 振り返り時期</span>' : `<span class="badge">次回 ${fmtDate(a.nextReviewDate)}</span>`}
          ${last ? `<span class="small muted" style="display:inline-flex;align-items:center;gap:4px">前回 ${dotSmall(last.route)}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <button type="button" class="link-btn" style="text-decoration:none;color:var(--muted);font-size:14px" data-action="openAction" data-id="${a.id}">詳細</button>
          <button type="button" class="btn" style="min-height:40px;padding:6px 14px;${due ? 'background:var(--purple);border-color:var(--purple);color:#fff' : ''}" data-action="startReflection" data-id="${a.id}">振り返る ›</button>
        </div>
      </div>
    </article>`;
  }).join('');

  const empty = `<div class="card empty">
      <div class="big">🧭</div>
      <p style="font-weight:800;color:var(--text);font-size:17px">まずは行動を登録しましょう</p>
      <p class="small" style="margin-top:6px">KPIを達成するために決めた行動を登録します。<br>決めた周期で「実行できたか」「成果は出たか」を振り返り、次の行動につなげます。</p>
    </div>
    ${howtoCard()}`;

  return `<header class="appbar">
      <h1>振り返り<span class="accent">ナビ</span></h1>
      <p>振り返りから次の行動へ${dueCount ? ` ・ <b>振り返り時期の行動が${dueCount}件</b>` : ''}</p>
    </header>
    <main class="page fade-in">
      ${storageOK ? '' : '<div class="warn">⚠️ この端末では記録を保存できません（プライベートブラウズ中など）。画面を閉じると内容が消えます。</div>'}
      ${draftAction ? `<div class="banner">
          <div class="grow"><b>途中の振り返りがあります</b><div class="small muted">${esc(draftAction.text)}</div></div>
          <button type="button" class="btn btn-primary" style="min-height:42px" data-action="resumeDraft">続きから</button>
          <button type="button" class="icon-btn" data-action="discardDraft" aria-label="途中の振り返りを破棄">🗑️</button>
        </div>` : ''}
      ${active.length ? `<h2 class="section-title">進行中の行動（${active.length}）</h2>${cards}` : empty}
      <button type="button" class="btn btn-navy btn-block" data-action="newAction">＋ 行動を登録</button>
    </main>`;
}

function howtoCard() {
  return `<div class="card howto">
    <div class="chart-title">📖 使い方</div>
    <ol class="small">
      <li><b>行動を登録</b>：KPIを達成するための行動と、期間・頻度・振り返りの周期を決めます。</li>
      <li><b>STEP 1</b>：決めた頻度どおりに実行できたか、成果は出たかに答えます。</li>
      <li><b>STEP 2〜4</b>：ルートごとに要因を選び、一番の要因を決め、改善策を考えます。</li>
      <li><b>STEP 5</b>：考え方・熱意・能力の3つの視点で、次の行動を決めます。</li>
      <li><b>STEP 6</b>：実行し、次の振り返り日に STEP 1 へ戻ります。</li>
    </ol>
    <div class="flow-mini" style="margin-top:10px">
      <div style="background:var(--red-soft)"><span style="color:var(--red)">✕</span> 未実行</div>
      <div style="background:var(--blue-soft)"><span style="color:var(--blue)">◎</span> 目標達成</div>
      <div style="background:var(--orange-soft)"><span style="color:var(--orange)">△</span> 目標未達成</div>
    </div>
  </div>`;
}

/* =========================================================
 * ウィザード描画
 * ======================================================= */
function stepMeta(step, route) {
  const R = route ? ROUTES[route] : null;
  switch (step) {
    case 'executed': return { num: 1, color: 'var(--navy)', soft: 'var(--blue-soft)', title: '決めたことを実行できましたか？' };
    case 'achieved': return { num: 1, color: 'var(--navy)', soft: 'var(--blue-soft)', title: '成果は出ましたか？' };
    case 'factors': return { num: 2, color: R.color, soft: R.soft, title: R.step2Title };
    case 'main': return { num: 3, color: R.color, soft: R.soft, title: R.step3Title };
    case 'step4': return { num: 4, color: R.color, soft: R.soft, title: R.step4Title };
    case 'step5': return { num: 5, color: 'var(--purple)', soft: 'var(--purple-soft)', title: '次の行動を決める' };
    case 'decision': return { num: 5, color: 'var(--purple)', soft: 'var(--purple-soft)', title: 'この行動をどうしますか？' };
    case 'edit': return { num: 5, color: 'var(--purple)', soft: 'var(--purple-soft)', title: '' };
    case 'next': return { num: 6, color: 'var(--purple)', soft: 'var(--purple-soft)', title: '実行する' };
  }
  return { num: '', color: 'var(--navy)', soft: 'var(--surface-2)', title: '' };
}

function choiceBtn({ key, value, pressed, color, soft, icon, title, sub }) {
  return `<button type="button" class="choice" data-action="choose" data-key="${key}" data-value="${value}" aria-pressed="${pressed}" style="--choice-color:${color};--choice-soft:${soft}">
    <span class="ico" aria-hidden="true">${icon}</span>
    <span><strong>${title}</strong>${sub ? `<span class="sub">${sub}</span>` : ''}</span>
  </button>`;
}

function renderWizard() {
  const dr = db.draft;
  const a = dr && getAction(dr.actionId);
  if (!dr || !a) { if (dr) { db.draft = null; save(); } go({ tab: 'home' }, true); return ''; }
  const d = dr.data;
  const steps = getSteps(d);
  let step = view.step;
  if (!steps.includes(step)) { step = firstOpenStep(d); view.step = step; history.replaceState(view, ''); }
  const route = routeOf(d);
  const R = route && ROUTES[route];
  const m = stepMeta(step, route);
  const total = route ? steps.length : 9;
  const idx = steps.indexOf(step);
  const isLast = idx === steps.length - 1 && route;
  const choiceStep = ['executed', 'achieved', 'decision'].includes(step);

  let body = '';
  let question = '';
  switch (step) {
    case 'executed':
      question = `決めた頻度（<b>${esc(freqLabel(a.frequency))}</b>）どおりに実行できたかで判断します。一部だけ実行した場合は「できなかった」を選びましょう。`;
      body = `<div class="choices">
        ${choiceBtn({ key: 'executed', value: 'true', pressed: d.executed === true, color: 'var(--green)', soft: 'var(--green-soft)', icon: '✓', title: 'できた（実行）', sub: '決めた頻度どおりに実行できた' })}
        ${choiceBtn({ key: 'executed', value: 'false', pressed: d.executed === false, color: 'var(--red)', soft: 'var(--red-soft)', icon: '✕', title: 'できなかった（未実行）', sub: '一部だけ・まったく実行できなかった' })}
      </div>`;
      break;
    case 'achieved':
      question = 'KPIは、この時点で目指すペースに届いていますか？';
      body = `<div class="card" style="text-align:center">
          <div class="small muted">この行動のKPI</div>
          <div style="font-size:20px;font-weight:800">${a.kpiMemo ? esc(a.kpiMemo) : '<span class="muted" style="font-size:15px">KPIメモは未登録です（感覚で判断してOK）</span>'}</div>
        </div>
        <div class="choices">
        ${choiceBtn({ key: 'achieved', value: 'true', pressed: d.achieved === true, color: 'var(--blue)', soft: 'var(--blue-soft)', icon: '◎', title: '成果が出た', sub: '目標達成ルートへ' })}
        ${choiceBtn({ key: 'achieved', value: 'false', pressed: d.achieved === false, color: 'var(--orange)', soft: 'var(--orange-soft)', icon: '△', title: '成果が出なかった', sub: '目標未達成ルートへ' })}
      </div>`;
      break;
    case 'factors': {
      question = `${R.step2Question}<br><span class="small">当てはまるものをすべて選んでください（複数選択OK）</span>`;
      const list = R.factors.map((f) => `<button type="button" class="factor" data-action="toggleFactor" data-id="${f.id}" aria-pressed="${d.factors.includes(f.id)}">
          <span class="check" aria-hidden="true">✓</span>
          <span><span class="fname">${f.name}</span><span class="fdesc">${f.desc}</span></span>
        </button>`).join('');
      const otherOn = d.factors.includes(OTHER_FACTOR_ID);
      body = `${route === 'notDone' ? `<div class="field">
          <label for="w-done">実際に実行できた回数<span class="opt">任意</span></label>
          <input id="w-done" class="input" data-model="draft.data.doneCount" value="${esc(d.doneCount)}" placeholder="例：週3回の予定が1回">
        </div>` : ''}
        <div class="factors">${list}
          <button type="button" class="factor" data-action="toggleFactor" data-id="${OTHER_FACTOR_ID}" aria-pressed="${otherOn}">
            <span class="check" aria-hidden="true">✓</span>
            <span><span class="fname">その他</span><span class="fdesc">上記以外の要因</span></span>
          </button>
          ${otherOn ? `<input class="input" data-model="draft.data.otherText" value="${esc(d.otherText)}" placeholder="その他の要因を書いてください" aria-label="その他の要因">` : ''}
        </div>`;
      break;
    }
    case 'main':
      question = `${R.step3Question}<br><span class="small">STEP 2で選んだ中から1つ選びます。</span>`;
      body = `<div class="factors" role="radiogroup">${d.factors.map((id) => {
        const f = R.factors.find((x) => x.id === id);
        return `<button type="button" class="factor radio" role="radio" data-action="selectMain" data-id="${id}" aria-checked="${d.mainFactor === id}">
          <span class="check" aria-hidden="true">●</span>
          <span><span class="fname">${esc(factorName(route, id, d.otherText))}</span>${f ? `<span class="fdesc">${f.desc}</span>` : ''}</span>
        </button>`;
      }).join('')}</div>`;
      break;
    case 'step4': {
      const mainId = d.factors.length === 1 ? d.factors[0] : d.mainFactor;
      question = route === 'achieved' ? '成果をさらに伸ばすために、考えてみましょう（任意）' : '一番の要因をふまえて、改善策を考えましょう（任意）';
      body = `<div class="note" style="background:${R.soft}">一番の${route === 'achieved' ? '要因' : '原因'}：<b>${esc(factorName(route, mainId, d.otherText))}</b></div>
        ${R.step4Questions.map((q) => `<div class="qblock">
          <div class="qlabel"><span class="qi" aria-hidden="true">${q.icon}</span>${q.label}</div>
          ${textarea(`draft.data.step4.${q.key}`, d.step4[q.key], '自由に書いてください')}
        </div>`).join('')}`;
      break;
    }
    case 'step5':
      question = '目標達成と自己成長のために、3つの視点で検討しましょう（任意）';
      body = PERSPECTIVES.map((p) => `<div class="card persp" style="--p-color:${p.color}">
          <div class="phead"><span aria-hidden="true">${p.icon}</span><strong>${p.name}</strong><span class="small muted">${p.sub}</span></div>
          <ul>${p.points.map((x) => `<li>${x}</li>`).join('')}</ul>
          <div class="pq">${p.question}</div>
          ${textarea(`draft.data.step5.${p.key}`, d.step5[p.key], 'メモ（任意）', 2)}
        </div>`).join('');
      break;
    case 'decision':
      question = '振り返りをふまえて、これからの行動を決めましょう。';
      body = `<div class="choices">${Object.entries(DECISIONS).map(([k, v]) => choiceBtn({ key: 'decision', value: k, pressed: d.decision === k, color: 'var(--purple)', soft: 'var(--surface)', icon: v.icon, title: v.label, sub: v.desc })).join('')}</div>`;
      break;
    case 'edit':
      m.title = d.decision === 'modify' ? '行動を修正する' : '新しい行動を決める';
      question = d.decision === 'modify' ? '今の内容をもとに、見直したい部分を修正しましょう。' : '今の行動は終了し、新しい行動を登録します。KPIメモと期間は引き継いでいます。';
      body = GROUPS.map((g) => `<div class="card">${renderGroup(g, d.edit, 'draft.data.edit')}</div>`).join('');
      break;
    case 'next': {
      const target = d.decision === 'continue' ? a : cleanForm(d.edit);
      const proposed = proposedNext(d, a);
      question = '決めた行動を実行し、次回の振り返りで確認しましょう。';
      body = `<div class="card">
          <div class="small muted">${DECISIONS[d.decision].label}</div>
          <div style="font-weight:800;font-size:17px">${nl(target.text)}</div>
          <div class="small muted" style="margin-top:4px">🔁 ${esc(freqLabel(target.frequency))} ・ 📆 〜${fmtDate(target.endDate)}</div>
        </div>
        ${proposed === null && d.decision === 'continue'
          ? `<div class="warn">この行動の期間（〜${fmtDate(a.endDate)}）は終了しました。完了すると、この行動は<b>終了</b>になります。<br>続ける場合は、前の画面に戻って「修正して続ける」で期間を延ばしてください。</div>`
          : `<div class="field">
              <label for="w-next">次の振り返り日</label>
              <input id="w-next" type="date" class="input" data-model="draft.data.nextReviewDate" data-manual value="${esc(d.nextReviewDate)}" min="${today()}">
              <span class="hint">周期（${esc(cycleLabel(target))}）から自動で計算しています。変更もできます。</span>
            </div>`}
        ${d.decision !== 'continue' ? '<div class="note">完了後に、新しい予定をカレンダーへ登録できます。</div>' : ''}
        <div class="note" style="text-align:center">↩︎ 次回の振り返りで STEP 1 に戻ります</div>`;
      break;
    }
  }

  const valid = stepValid(step, d);
  return `${topbar('振り返り', { close: true })}
    <div class="progress" style="--step-color:${m.color}"><span style="width:${((idx + 1) / total) * 100}%"></span></div>
    <main class="page fade-in" style="--step-color:${m.color};--step-soft:${m.soft}">
      <div class="ctx">
        <div class="ctx-action">${nl(a.text)}</div>
        <dl>
          ${a.kpiMemo ? `<dt>KPI</dt><dd>${esc(a.kpiMemo)}</dd>` : ''}
          <dt>頻度</dt><dd>${esc(freqLabel(a.frequency))}</dd>
        </dl>
      </div>
      ${route && step !== 'executed' && step !== 'achieved' ? `<div>${routeBadge(route)}</div>` : ''}
      <div class="step-head">
        <div class="step-num" style="background:${m.color}">${m.num}</div>
        <div><div class="kicker">STEP ${m.num}</div><h2>${m.title}</h2></div>
      </div>
      ${question ? `<p class="question">${question}</p>` : ''}
      ${body}
    </main>
    ${choiceStep ? '' : bottomBar(`<button type="button" class="btn btn-primary" id="nextBtn" data-action="wizardNext" style="${isLast ? '' : `background:${m.color};border-color:${m.color}`}" ${valid ? '' : 'disabled'}>${isLast ? '振り返りを完了する ✓' : '次へ'}</button>`)}`;
}

/* =========================================================
 * まとめ（完了画面・履歴詳細・出力）
 * ======================================================= */
function reflectionParts(r) {
  const R = ROUTES[r.route];
  const factors = r.factors.map((id) => factorName(r.route, id, r.otherText));
  const main = r.mainFactor ? factorName(r.route, r.mainFactor, r.otherText) : '';
  const step4 = R.step4Questions.filter((q) => (r.step4[q.key] || '').trim()).map((q) => ({ q: q.label, a: r.step4[q.key].trim() }));
  const step5 = PERSPECTIVES.filter((p) => (r.step5[p.key] || '').trim()).map((p) => ({ q: p.name, a: r.step5[p.key].trim() }));
  let decisionText = DECISIONS[r.decision] ? DECISIONS[r.decision].label : '';
  let after = '';
  if (r.decision === 'modify' && r.newSnapshot) after = `${r.newSnapshot.text}（${r.newSnapshot.freq}／〜${fmtDate(r.newSnapshot.endDate)}）`;
  if (r.decision === 'replace' && r.newSnapshot) after = `${r.newSnapshot.text}（${r.newSnapshot.freq}／〜${fmtDate(r.newSnapshot.endDate)}）`;
  const next = r.nextReviewDate ? fmtDateY(r.nextReviewDate) : (r.actionEnded && r.decision !== 'replace' ? 'なし（この行動は終了）' : '—');
  return { R, factors, main, step4, step5, decisionText, after, next };
}

function summaryCard(r) {
  const p = reflectionParts(r);
  const s = r.actionSnapshot;
  const item = (label, val, cls = '') => `<div class="s-item ${cls}"><div class="s-label">${label}</div><div class="s-val">${val}</div></div>`;
  const qa = (list) => list.map((x) => `<div class="qa"><span class="q">${esc(x.q)}</span><span>${nl(x.a)}</span></div>`).join('');
  return `<article class="card summary" id="summaryCard" style="--s-color:${p.R.color};--s-soft:${p.R.soft}">
    <div class="s-head">
      <div class="s-date">${fmtDateY(isoToDate(r.createdAt))} の振り返り</div>
      <div class="s-route">${p.R.mark} ${p.R.name}</div>
      <div class="small" style="opacity:.92">${p.R.result}${r.doneCount ? `（${esc(r.doneCount)}）` : ''}</div>
    </div>
    <div class="s-body">
      ${item('振り返った行動', `<b>${nl(s.text)}</b><div class="small muted">${s.kpiMemo ? `🎯 ${esc(s.kpiMemo)}　` : ''}🔁 ${esc(s.freq)}</div>`)}
      ${item(`STEP 2　${p.R.step2Title.replace('を選ぶ', '')}`, esc(p.factors.join('、')))}
      ${item(`STEP 3　${p.R.step3Title.replace('を決める', '')}`, `<b>${esc(p.main)}</b>`, 's-main')}
      ${p.step4.length ? item(`STEP 4　${p.R.step4Title}`, qa(p.step4)) : ''}
      ${p.step5.length ? item('STEP 5　3つの視点', qa(p.step5)) : ''}
      ${item('STEP 5・6　これからの行動', `<b>${esc(p.decisionText)}</b>${p.after ? `<div>${nl(p.after)}</div>` : ''}<div class="small" style="margin-top:4px">次の振り返り：<b>${p.next}</b></div>`, 's-next')}
      <div class="s-foot">振り返りナビ</div>
    </div>
  </article>`;
}

function summaryText(r) {
  const p = reflectionParts(r);
  const s = r.actionSnapshot;
  const L = [];
  L.push(`【振り返り】${fmtDateY(isoToDate(r.createdAt))}`);
  L.push(`■ 行動：${s.text}`);
  if (s.kpiMemo) L.push(`　KPI：${s.kpiMemo}`);
  L.push(`　頻度：${s.freq}`);
  L.push(`■ 結果：${p.R.mark} ${p.R.name}（${p.R.result}${r.doneCount ? `／${r.doneCount}` : ''}）`);
  L.push(`■ ${p.R.step2Title.replace('を選ぶ', '')}：${p.factors.join('、')}`);
  L.push(`■ ${p.R.step3Title.replace('を決める', '')}：${p.main}`);
  if (p.step4.length) {
    L.push(`■ ${p.R.step4Title}`);
    p.step4.forEach((x) => L.push(`　・${x.q} → ${x.a.replace(/\n/g, ' ')}`));
  }
  if (p.step5.length) {
    L.push('■ 3つの視点');
    p.step5.forEach((x) => L.push(`　・${x.q}：${x.a.replace(/\n/g, ' ')}`));
  }
  L.push(`■ これからの行動：${p.decisionText}${p.after ? `\n　→ ${p.after}` : ''}`);
  L.push(`■ 次の振り返り：${p.next}`);
  return L.join('\n');
}

function shareButtons(r) {
  return `<div class="btn-row">
    <button type="button" class="btn" data-action="copyText" data-id="${r.id}">📋 テキストをコピー</button>
    ${navigator.share ? `<button type="button" class="btn" data-action="shareText" data-id="${r.id}">📤 共有</button>` : ''}
    <button type="button" class="btn" data-action="saveImage" data-id="${r.id}">🖼️ 画像で保存</button>
  </div>`;
}

function renderDone() {
  const r = db.reflections.find((x) => x.id === view.id);
  if (!r) { go({ tab: 'home' }, true); return ''; }
  const target = r.decision === 'replace' ? getAction(r.newActionId) : (r.decision === 'modify' ? getAction(r.actionId) : null);
  return `<header class="appbar"><h1>振り返り完了 ✨</h1><p>おつかれさまでした。決めた行動を実行しましょう。</p></header>
    <main class="page fade-in">
      ${summaryCard(r)}
      ${shareButtons(r)}
      ${target ? calendarBlock(target) : ''}
    </main>
    ${bottomBar(`<button type="button" class="btn btn-navy" data-action="home">ホームへ</button>`)}`;
}

function renderReflectionDetail() {
  const r = db.reflections.find((x) => x.id === view.id);
  if (!r) { go({ tab: 'history' }, true); return ''; }
  return `${topbar('振り返りの詳細')}
    <main class="page fade-in">
      ${summaryCard(r)}
      ${shareButtons(r)}
      <button type="button" class="btn btn-danger" data-action="deleteReflection" data-id="${r.id}">この振り返りを削除</button>
    </main>`;
}

function renderActionDetail() {
  const a = getAction(view.id);
  if (!a) { go({ tab: 'home' }, true); return ''; }
  const refs = reflectionsOf(a.id);
  const next = a.replacedBy && getAction(a.replacedBy);
  const prev = a.replaces && getAction(a.replaces);
  return `${topbar('行動の詳細')}
    <main class="page fade-in">
      <div class="card">
        <div style="display:flex;gap:6px;margin-bottom:8px">${a.status === 'active' ? (isDue(a) ? '<span class="badge due">● 振り返り時期</span>' : '<span class="badge">進行中</span>') : '<span class="badge ended">終了</span>'}</div>
        <div style="font-weight:800;font-size:18px;margin-bottom:10px">${nl(a.text)}</div>
        ${actionKV(a)}
        ${a.status === 'active' ? `<div class="note" style="margin-top:12px">次の振り返り：<b>${fmtDateY(a.nextReviewDate)}</b></div>` : ''}
        ${prev ? `<p class="small" style="margin-top:10px">入れ替え前：<button type="button" class="link-btn" data-action="openAction" data-id="${prev.id}">${esc(prev.text)}</button></p>` : ''}
        ${next ? `<p class="small" style="margin-top:10px">入れ替え後：<button type="button" class="link-btn" data-action="openAction" data-id="${next.id}">${esc(next.text)}</button></p>` : ''}
      </div>
      ${a.status === 'active' ? `<button type="button" class="btn btn-primary btn-block" data-action="startReflection" data-id="${a.id}">この行動を振り返る</button>` : ''}
      <div class="card">
        <div class="chart-title">🪞 振り返りの経過（${refs.length}回）</div>
        ${refs.length ? `<div class="timeline" style="margin-bottom:12px">${refs.map((r) => dot(r.route, `${fmtDate(isoToDate(r.createdAt))} ${ROUTES[r.route].short}`)).join('<span class="muted">›</span>')}</div>
          <div class="list">${refs.slice().reverse().map(reflectionRow).join('')}</div>` : '<p class="small muted">まだ振り返りはありません。</p>'}
      </div>
      ${calendarBlock(a)}
      <div class="btn-row">
        <button type="button" class="btn" data-action="editAction" data-id="${a.id}">✏️ 編集</button>
        ${a.status === 'active'
          ? `<button type="button" class="btn" data-action="endAction" data-id="${a.id}">⏹ 終了する</button>`
          : `<button type="button" class="btn" data-action="reopenAction" data-id="${a.id}">▶️ 再開する</button>`}
      </div>
      <button type="button" class="btn btn-danger" data-action="deleteAction" data-id="${a.id}">この行動と振り返りを削除</button>
    </main>`;
}

function reflectionRow(r) {
  const main = r.mainFactor ? factorName(r.route, r.mainFactor, r.otherText) : '';
  return `<button type="button" class="row-btn" data-action="openReflection" data-id="${r.id}">
    ${dot(r.route)}
    <span class="grow">
      <span class="t" style="display:block">${esc(r.actionSnapshot.text)}</span>
      <span class="small muted">${fmtDateY(isoToDate(r.createdAt))}・${ROUTES[r.route].short}${main ? `・${esc(main)}` : ''}</span>
    </span>
    <span class="chev" aria-hidden="true">›</span>
  </button>`;
}

/* =========================================================
 * 履歴
 * ======================================================= */
function renderHistory() {
  const seg = `<div class="seg" role="group" aria-label="表示の切り替え">
    <button type="button" data-action="histMode" data-mode="reflections" aria-pressed="${histMode === 'reflections'}">振り返り</button>
    <button type="button" data-action="histMode" data-mode="actions" aria-pressed="${histMode === 'actions'}">行動別</button>
  </div>`;
  let body = '';
  if (histMode === 'reflections') {
    const list = db.reflections.slice().sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    body = list.length ? `<div class="list">${list.map(reflectionRow).join('')}</div>`
      : '<div class="card empty"><div class="big">🗂️</div>まだ振り返りの記録はありません。</div>';
  } else {
    const list = db.actions.slice().sort((x, y) => (x.status === 'active' ? 0 : 1) - (y.status === 'active' ? 0 : 1) || y.createdAt.localeCompare(x.createdAt));
    body = list.length ? `<div class="list">${list.map((a) => {
      const refs = reflectionsOf(a.id);
      return `<button type="button" class="row-btn" data-action="openAction" data-id="${a.id}" style="flex-direction:column;align-items:stretch;gap:8px">
        <span style="display:flex;gap:8px;align-items:center">
          <span class="badge ${a.status === 'active' ? '' : 'ended'}">${a.status === 'active' ? '進行中' : '終了'}</span>
          <span class="t" style="flex:1">${esc(a.text)}</span><span class="chev" aria-hidden="true">›</span>
        </span>
        ${refs.length ? `<span class="timeline">${refs.map((r) => dot(r.route, `${fmtDate(isoToDate(r.createdAt))} ${ROUTES[r.route].short}`)).join('')}</span>` : '<span class="small muted">振り返りはまだありません</span>'}
      </button>`;
    }).join('')}</div>` : '<div class="card empty"><div class="big">🧭</div>まだ行動が登録されていません。</div>';
  }
  return `<header class="appbar"><h1>履歴</h1><p>これまでの振り返りと、行動ごとの経過</p></header>
    <main class="page fade-in">${seg}${body}</main>`;
}

/* =========================================================
 * 傾向
 * ======================================================= */
function renderTrends() {
  const ranges = [['all', '全期間'], ['3m', '直近3か月'], ['1m', '直近1か月']];
  const seg = `<div class="seg" role="group" aria-label="集計期間">${ranges.map(([k, l]) => `<button type="button" data-action="trendRange" data-range="${k}" aria-pressed="${trendRange === k}">${l}</button>`).join('')}</div>`;
  const from = trendRange === '3m' ? addMonths(today(), -3) : trendRange === '1m' ? addMonths(today(), -1) : '0000-00-00';
  const list = db.reflections.filter((r) => isoToDate(r.createdAt) >= from);
  const head = `<header class="appbar"><h1>傾向</h1><p>自分の振り返りのクセを見つけましょう</p></header>`;
  if (!list.length) {
    return `${head}<main class="page fade-in">${seg}<div class="card empty"><div class="big">📊</div>この期間の振り返りはまだありません。<br>振り返りを重ねると、ここに傾向が表示されます。</div></main>`;
  }
  const n = list.length;
  const counts = { notDone: 0, achieved: 0, notAchieved: 0 };
  list.forEach((r) => { counts[r.route]++; });
  const executed = counts.achieved + counts.notAchieved;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
  const execRate = pct(executed, n);
  const achRate = pct(counts.achieved, executed);

  const stats = `<div class="stats">
    <div class="stat"><div class="v">${n}<small>回</small></div><div class="l">振り返り</div></div>
    <div class="stat"><div class="v">${execRate}<small>%</small></div><div class="l">実行率</div></div>
    <div class="stat"><div class="v">${achRate === null ? '—' : `${achRate}<small>%</small>`}</div><div class="l">成果が出た率<br><span style="font-size:10px">（実行できた回のうち）</span></div></div>
  </div>`;

  const stack = `<div class="card">
    <div class="chart-title">ルートの内訳</div>
    <div class="stack" role="img" aria-label="${ROUTE_ORDER.map((k) => `${ROUTES[k].short} ${counts[k]}回`).join('、')}">
      ${ROUTE_ORDER.filter((k) => counts[k]).map((k) => `<span style="flex:${counts[k]};background:${ROUTES[k].color}" title="${ROUTES[k].short}：${counts[k]}回（${pct(counts[k], n)}%）"></span>`).join('')}
    </div>
    <div class="legend">${ROUTE_ORDER.map((k) => `<span><span class="sw" style="background:${ROUTES[k].color}"></span>${ROUTES[k].mark} ${ROUTES[k].short} <b>${counts[k]}</b>回</span>`).join('')}</div>
  </div>`;

  const bars = (rows, max) => `<div class="bars">${rows.map((x) => `<div class="bar-row" title="${esc(x.title)}">
      <span class="bl">${esc(x.label)}</span>
      <span class="track"><span class="fill" style="display:block;width:${(x.v / max) * 100}%;--b-color:${x.color}"></span></span>
      <span class="bv">${x.v}</span>
    </div>`).join('')}</div>`;

  const perRoute = ROUTE_ORDER.filter((k) => counts[k]).map((k) => {
    const R = ROUTES[k];
    const c = {};
    list.filter((r) => r.route === k).forEach((r) => r.factors.forEach((id) => { c[id] = (c[id] || 0) + 1; }));
    const rows = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({
      label: id === OTHER_FACTOR_ID ? 'その他' : factorName(k, id), v, color: R.color,
      title: `${id === OTHER_FACTOR_ID ? 'その他' : factorName(k, id)}：${v}回（${R.short}の振り返り${counts[k]}回中）`,
    }));
    return `<div class="card">
      <div class="chart-title" style="margin-bottom:2px">${dotSmall(k)}${R.short}の要因</div>
      <p class="small muted" style="margin-bottom:10px">${counts[k]}回の振り返りで、各要因を選んだ回数</p>
      ${bars(rows, counts[k])}
    </div>`;
  }).join('');

  const mc = {};
  list.forEach((r) => { if (r.mainFactor) { const key = `${r.route}|${r.mainFactor}`; mc[key] = (mc[key] || 0) + 1; } });
  const mainRows = Object.entries(mc).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key, v]) => {
    const [route, id] = key.split('|');
    const label = `${ROUTES[route].mark} ${id === OTHER_FACTOR_ID ? 'その他' : factorName(route, id)}`;
    return { label, v, color: ROUTES[route].color, title: `${ROUTES[route].short}・${label}：${v}回` };
  });
  const mainCard = mainRows.length ? `<div class="card">
    <div class="chart-title">「一番の要因」ランキング</div>
    ${bars(mainRows, mainRows[0].v)}
    <p class="small muted" style="margin-top:8px">記号：✕ 未実行　◎ 目標達成　△ 目標未達成</p>
  </div>` : '';

  return `${head}<main class="page fade-in">${seg}${stats}${stack}${mainCard}${perRoute}</main>`;
}

function dotSmall(route) {
  return `<span class="dot" style="--d-color:${ROUTES[route].color};width:24px;height:24px;font-size:12px" aria-hidden="true">${ROUTES[route].mark}</span>`;
}

/* =========================================================
 * 設定
 * ======================================================= */
function renderSettings() {
  return `<header class="appbar"><h1>設定</h1><p>データの管理と使い方</p></header>
    <main class="page fade-in">
      <div class="card">
        <div class="chart-title">💾 バックアップ</div>
        <p class="small muted" style="margin-bottom:12px">記録はこの端末のブラウザにだけ保存され、外部には送信されません。機種変更やブラウザのデータ削除に備えて、ときどきバックアップを保存しましょう。</p>
        <p class="small" style="margin-bottom:12px">現在の記録：行動 <b>${db.actions.length}</b>件・振り返り <b>${db.reflections.length}</b>件</p>
        <div class="btn-row">
          <button type="button" class="btn" data-action="exportData">保存する</button>
          <button type="button" class="btn" data-action="importData">復元する</button>
        </div>
      </div>
      ${howtoCard()}
      <div class="card">
        <div class="chart-title">📱 ホーム画面に追加</div>
        <p class="small muted">iPhone：Safariの共有ボタン →「ホーム画面に追加」<br>Android：Chromeのメニュー →「ホーム画面に追加」<br>アプリのようにすぐ開けるようになります。</p>
      </div>
      <button type="button" class="btn btn-danger" data-action="wipe">すべてのデータを削除</button>
      <p class="small muted" style="text-align:center">振り返りナビ v${APP_VERSION}</p>
    </main>`;
}

/* =========================================================
 * メイン描画
 * ======================================================= */
const app = document.getElementById('app');

function render() {
  let html = '';
  let mode = 'tab';
  if (view.type) {
    mode = 'full';
    switch (view.type) {
      case 'wizard': html = renderWizard(); break;
      case 'actionNew': html = renderActionNew(); break;
      case 'actionEdit': html = renderActionEdit(); break;
      case 'actionCreated': html = renderActionCreated(); break;
      case 'done': html = renderDone(); break;
      case 'reflection': html = renderReflectionDetail(); break;
      case 'action': html = renderActionDetail(); break;
      default: view = { tab: 'home' };
    }
    if (!html) return; // go() でリダイレクト済み
  }
  if (!view.type) {
    switch (view.tab) {
      case 'history': html = renderHistory(); break;
      case 'trends': html = renderTrends(); break;
      case 'settings': html = renderSettings(); break;
      default: html = renderHome();
    }
  }
  app.innerHTML = html;
  const hasBottom = !!app.querySelector('.bottombar');
  document.body.classList.toggle('has-tabbar', mode === 'tab');
  document.body.classList.toggle('has-bottombar', hasBottom);
  document.querySelectorAll('#tabbar button').forEach((b) => {
    if (mode === 'tab' && b.dataset.tab === (view.tab || 'home')) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

function refreshValidity() {
  const btn = document.getElementById('nextBtn');
  if (!btn) return;
  let ok = true;
  if (view.type === 'wizard' && db.draft) ok = stepValid(view.step, db.draft.data);
  else if (view.type === 'actionNew' && formState) {
    const g = [...GROUPS, 'confirm'][view.step || 0];
    ok = g === 'confirm' ? formValid(formState) : groupValid(g, formState);
  } else if (view.type === 'actionEdit' && formState) ok = formValid(formState);
  btn.disabled = !ok;
}

/* =========================================================
 * モデル更新
 * ======================================================= */
function modelRoot() {
  return { draft: db.draft, form: formState };
}

function getPath(path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), modelRoot());
}

function setPath(path, val) {
  const parts = path.split('.');
  let o = modelRoot();
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = val;
}

function coerce(el, v) {
  if (el.dataset.type === 'num') return Number(v);
  return v;
}

let advancing = false;   // 選択肢タップ後の自動遷移の二重実行防止
let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-model]');
  if (!el) return;
  setPath(el.dataset.model, coerce(el, el.value));
  if (el.hasAttribute('data-manual') && db.draft) db.draft.data.nextManual = true;
  if (el.dataset.model.startsWith('draft')) saveSoon();
  refreshValidity();
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-rerender]');
  if (el) render();
});

/* =========================================================
 * 操作
 * ======================================================= */
const actions = {
  tab: (el) => go({ tab: el.dataset.tab }),
  home: () => go({ tab: 'home' }),
  back: () => {
    if (history.state && history.length > 1) history.back();
    else go({ tab: 'home' }, true);
  },
  closeWizard: () => {
    save();
    toast('途中の内容は保存されています');
    go({ tab: 'home' });
  },

  newAction: () => {
    formState = newActionForm();
    go({ type: 'actionNew', step: 0 });
  },
  actionNewNext: () => {
    const steps = [...GROUPS, 'confirm'];
    const i = view.step || 0;
    const g = steps[i];
    if (g === 'confirm') {
      if (!formValid(formState)) return;
      const a = createAction(formState);
      formState = null;
      save();
      go({ type: 'actionCreated', id: a.id }, true);
      return;
    }
    if (!groupValid(g, formState)) return;
    go({ type: 'actionNew', step: i + 1 });
  },
  editAction: (el) => {
    const a = getAction(el.dataset.id);
    formState = formFromAction(a);
    go({ type: 'actionEdit', id: a.id });
  },
  saveEdit: () => {
    const a = getAction(view.id);
    if (!formValid(formState)) return;
    Object.assign(a, cleanForm(formState));
    a.updatedAt = new Date().toISOString();
    scheduleAction(a, maxStr(a.lastReviewedAt || addDays(a.startDate, -1), addDays(today(), -1)));
    formState = null;
    save();
    toast('保存しました');
    history.back();
  },
  openAction: (el) => go({ type: 'action', id: el.dataset.id }),
  openReflection: (el) => go({ type: 'reflection', id: el.dataset.id }),
  endAction: (el) => {
    const a = getAction(el.dataset.id);
    if (!confirm('この行動を終了しますか？（記録は残ります）')) return;
    a.status = 'ended';
    a.endedAt = today();
    if (db.draft && db.draft.actionId === a.id) db.draft = null;
    save();
    render();
  },
  reopenAction: (el) => {
    const a = getAction(el.dataset.id);
    a.status = 'active';
    a.nextReviewDate = nextAfter(a, addDays(today(), -1)) || today();
    save();
    toast('再開しました');
    render();
  },
  deleteAction: (el) => {
    const id = el.dataset.id;
    if (!confirm('この行動と、その振り返りの記録をすべて削除します。元に戻せません。よろしいですか？')) return;
    db.actions = db.actions.filter((a) => a.id !== id);
    db.reflections = db.reflections.filter((r) => r.actionId !== id);
    if (db.draft && db.draft.actionId === id) db.draft = null;
    save();
    go({ tab: 'home' }, true);
  },
  deleteReflection: (el) => {
    if (!confirm('この振り返りを削除します。元に戻せません。よろしいですか？')) return;
    db.reflections = db.reflections.filter((r) => r.id !== el.dataset.id);
    save();
    history.back();
  },

  startReflection: (el) => startReflection(el.dataset.id),
  resumeDraft: () => go({ type: 'wizard', step: firstOpenStep(db.draft.data) }),
  discardDraft: () => {
    if (!confirm('途中の振り返りを破棄しますか？')) return;
    db.draft = null;
    save();
    render();
  },
  choose: (el) => {
    const d = db.draft.data;
    const key = el.dataset.key;
    const raw = el.dataset.value;
    const val = raw === 'true' ? true : raw === 'false' ? false : raw;
    const prevRoute = routeOf(d);
    d[key] = val;
    if (key === 'executed' && val === false) d.achieved = null;
    if (key === 'executed' && val === true && prevRoute === 'notDone') d.achieved = null;
    if (routeOf(d) !== prevRoute) { d.factors = []; d.otherText = ''; d.mainFactor = null; }
    if (key === 'decision') {
      if (d.editFor !== val) {
        const a = getAction(db.draft.actionId);
        d.edit = val === 'modify' ? formFromAction(a) : val === 'replace' ? newActionForm(a) : null;
        d.editFor = val;
      }
      d.nextManual = false;
    }
    save();
    render();
    if (advancing) return;
    advancing = true;
    setTimeout(() => { advancing = false; wizardNext(); }, 180);
  },
  toggleFactor: (el) => {
    const d = db.draft.data;
    const id = el.dataset.id;
    d.factors = d.factors.includes(id) ? d.factors.filter((x) => x !== id) : [...d.factors, id];
    if (!d.factors.includes(d.mainFactor)) d.mainFactor = null;
    save();
    render();
    if (id === OTHER_FACTOR_ID && d.factors.includes(id)) {
      const inp = app.querySelector('[data-model="draft.data.otherText"]');
      if (inp) inp.focus();
    }
  },
  selectMain: (el) => {
    db.draft.data.mainFactor = el.dataset.id;
    save();
    render();
  },
  wizardNext: () => wizardNext(),

  set: (el) => {
    setPath(el.dataset.path, coerce(el, el.dataset.value));
    if (el.dataset.path.startsWith('draft')) save();
    render();
  },
  inc: (el) => {
    const v = Number(getPath(el.dataset.path)) + Number(el.dataset.delta);
    setPath(el.dataset.path, Math.min(Number(el.dataset.max), Math.max(Number(el.dataset.min), v)));
    if (el.dataset.path.startsWith('draft')) save();
    render();
  },
  toggleIn: (el) => {
    const arr = getPath(el.dataset.path);
    const v = Number(el.dataset.value);
    const i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1); else arr.push(v);
    if (el.dataset.path.startsWith('draft')) save();
    render();
  },
  periodMonths: (el) => {
    const f = getPath(el.dataset.prefix);
    f.endDate = addMonths(f.startDate || today(), Number(el.dataset.months));
    if (el.dataset.prefix.startsWith('draft')) save();
    render();
  },

  histMode: (el) => { histMode = el.dataset.mode; render(); },
  trendRange: (el) => { trendRange = el.dataset.range; render(); },

  copyText: async (el) => {
    const r = db.reflections.find((x) => x.id === el.dataset.id);
    const ok = await copyToClipboard(summaryText(r));
    toast(ok ? 'コピーしました' : 'コピーできませんでした');
  },
  shareText: async (el) => {
    const r = db.reflections.find((x) => x.id === el.dataset.id);
    try { await navigator.share({ title: '振り返り', text: summaryText(r) }); } catch (e) { /* キャンセル */ }
  },
  saveImage: (el) => saveImage(el.dataset.id),
  ics: (el) => downloadICS(getAction(el.dataset.id)),

  exportData: () => {
    const data = { ...db, draft: null, exportedAt: new Date().toISOString(), app: 'furikaeri-navi' };
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `furikaeri-navi-backup-${today().replace(/-/g, '')}.json`);
    toast('バックアップを保存しました');
  },
  importData: () => document.getElementById('importFile').click(),
  wipe: () => {
    if (!confirm('すべての行動と振り返りを削除します。元に戻せません。よろしいですか？')) return;
    if (!confirm('本当に削除しますか？（バックアップを保存していない場合、復元できません）')) return;
    db = emptyDB();
    save();
    toast('すべてのデータを削除しました');
    render();
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el, e); }
});

document.getElementById('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = normalizeDB(JSON.parse(await file.text()));
    if (!confirm(`バックアップ（行動 ${data.actions.length}件・振り返り ${data.reflections.length}件）で、現在のデータを置き換えます。よろしいですか？`)) return;
    db = { ...data, draft: null };
    save();
    toast('復元しました');
    render();
  } catch (err) {
    toast('このファイルは読み込めませんでした');
  }
});

/* =========================================================
 * 出力（クリップボード・画像・カレンダー）
 * ======================================================= */
let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
    return ok;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function saveImage(id) {
  const el = document.getElementById('summaryCard');
  if (!el || typeof html2canvas !== 'function') { toast('画像を作成できませんでした'); return; }
  toast('画像を作成しています…');
  try {
    const bg = getComputedStyle(document.body).backgroundColor;
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: bg, useCORS: true, logging: false });
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const r = db.reflections.find((x) => x.id === id);
    const name = `furikaeri-${isoToDate(r ? r.createdAt : new Date().toISOString()).replace(/-/g, '')}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
      try { await navigator.share({ files: [file], title: '振り返り' }); } catch (e) { /* キャンセル */ }
    } else {
      downloadBlob(blob, name);
      toast('画像を保存しました');
    }
  } catch (e) {
    toast('画像を作成できませんでした');
  }
}

const ymd = (s) => s.replace(/-/g, '');

function calendarInfo(a) {
  const start = a.nextReviewDate || a.anchorDate;
  const end = addDays(start, 1);
  const until = ymd(a.endDate);
  const rule = a.cycle === 'monthly'
    ? `RRULE:FREQ=MONTHLY;UNTIL=${until}`
    : `RRULE:FREQ=WEEKLY;INTERVAL=${a.cycle === 'biweekly' ? 2 : 1};UNTIL=${until}`;
  const title = `振り返り：${a.text}`;
  const desc = [
    a.kpiMemo ? `KPI：${a.kpiMemo}` : '',
    `頻度：${freqLabel(a.frequency)}`,
    `期間：${fmtDateY(a.startDate)}〜${fmtDateY(a.endDate)}`,
    `振り返りナビ ${APP_URL}`,
  ].filter(Boolean).join('\n');
  return { start, end, rule, title, desc };
}

function googleCalUrl(a) {
  const c = calendarInfo(a);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: c.title,
    dates: `${ymd(c.start)}/${ymd(c.end)}`,
    details: c.desc,
    recur: c.rule,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// RFC 5545：1行75オクテット以内で折り返す
function icsFold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 73) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

function downloadICS(a) {
  if (!a) return;
  const c = calendarInfo(a);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//furikaeri-navi//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${a.id}-${Date.now()}@furikaeri-navi`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(c.start)}`,
    `DTEND;VALUE=DATE:${ymd(c.end)}`,
    c.rule,
    `SUMMARY:${icsEscape(c.title)}`,
    `DESCRIPTION:${icsEscape(c.desc)}`,
    'BEGIN:VALARM',
    'TRIGGER:PT9H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(c.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].map(icsFold);
  downloadBlob(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' }), 'furikaeri-review.ics');
}

/* =========================================================
 * 起動
 * ======================================================= */
history.replaceState(view, '');
render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
