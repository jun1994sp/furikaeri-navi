// 振り返りナビ：資料（振り返りフロー図・要因一覧表）の文言定義
'use strict';

const ROUTES = {
  notDone: {
    key: 'notDone',
    name: '未実行ルート',
    short: '未実行',
    result: '実行できなかった',
    mark: '✕',
    color: 'var(--red)',
    soft: 'var(--red-soft)',
    step2Title: '未実行の要因を選ぶ',
    step2Question: 'なぜ、決めたことを実行できなかったのか？',
    step3Title: '一番の原因を決める',
    step3Question: '一番大きかった原因はどれですか？',
    step4Title: '改善策を考える',
    step4Questions: [
      { key: 'q1', icon: '💬', label: '障壁になったことは？' },
      { key: 'q2', icon: '⚙️', label: 'どうすれば実行できる？' },
      { key: 'q3', icon: '🤝', label: '周りに助けてほしいことは？' },
    ],
    factors: [
      { id: 'n1', name: '時間不足', desc: '時間がなかった' },
      { id: 'n2', name: '優先順位', desc: '他のことを優先した' },
      { id: 'n3', name: '失念', desc: '忘れていた' },
      { id: 'n4', name: '知識不足', desc: 'やり方がわからなかった' },
      { id: 'n5', name: '計画不足', desc: '何から始めればよいかわからなかった' },
      { id: 'n6', name: '先延ばし', desc: '後回しにしてしまった' },
      { id: 'n7', name: '環境要因', desc: '周りの協力や準備が足りなかった' },
    ],
  },
  achieved: {
    key: 'achieved',
    name: '目標達成ルート',
    short: '目標達成',
    result: '実行できた・成果が出た',
    mark: '◎',
    color: 'var(--blue)',
    soft: 'var(--blue-soft)',
    step2Title: '達成要因を選ぶ',
    step2Question: 'なぜ、目標を達成できたのか？',
    step3Title: '一番の要因を決める',
    step3Question: '一番大きかった要因はどれですか？',
    step4Title: '成果をさらに出すために',
    step4Questions: [
      { key: 'q1', icon: '🔁', label: '何を続ける？' },
      { key: 'q2', icon: '📈', label: 'もっと良い行動は？' },
      { key: 'q3', icon: '🤝', label: '周りに助けてほしいことは？' },
    ],
    factors: [
      { id: 'a1', name: '計画性', desc: '計画どおりに進められた' },
      { id: 'a2', name: '行動量', desc: '十分な回数や量を実行できた' },
      { id: 'a3', name: '行動の質', desc: 'やり方や内容がよかった' },
      { id: 'a4', name: '継続性', desc: '途中でやめずに続けられた' },
      { id: 'a5', name: '協力体制', desc: '周りの協力があった' },
      { id: 'a6', name: '改善力', desc: '途中でやり方を見直せた' },
      { id: 'a7', name: '環境要因', desc: 'タイミングや状況がよかった' },
    ],
  },
  notAchieved: {
    key: 'notAchieved',
    name: '目標未達成ルート',
    short: '目標未達成',
    result: '実行できた・成果が出なかった',
    mark: '△',
    color: 'var(--orange)',
    soft: 'var(--orange-soft)',
    step2Title: '未達成要因を選ぶ',
    step2Question: '実行したのに、なぜ目標を達成できなかったのか？',
    step3Title: '一番の原因を決める',
    step3Question: '一番大きかった原因はどれですか？',
    step4Title: '改善策を考える',
    step4Questions: [
      { key: 'q1', icon: '🔄', label: '何を変えるか？' },
      { key: 'q2', icon: '⛔', label: '何をやめるか？' },
      { key: 'q3', icon: '🤝', label: '周りに助けてほしいことは？' },
    ],
    factors: [
      { id: 'u1', name: '計画不足', desc: '計画に無理や問題があった' },
      { id: 'u2', name: '行動量不足', desc: '実行した回数や量が足りなかった' },
      { id: 'u3', name: '行動の質', desc: 'やり方や内容がよくなかった' },
      { id: 'u4', name: '継続不足', desc: '途中で続けられなくなった' },
      { id: 'u5', name: '協力不足', desc: '周りの協力が足りなかった' },
      { id: 'u6', name: '改善不足', desc: 'うまくいかない方法を変えなかった' },
      { id: 'u7', name: '環境要因', desc: 'タイミングや状況が悪かった' },
    ],
  },
};

const ROUTE_ORDER = ['notDone', 'achieved', 'notAchieved'];

// STEP5「次の行動を決める」3つの視点
const PERSPECTIVES = [
  {
    key: 'mindset',
    icon: '🚩',
    name: '考え方',
    sub: '行動の方向性',
    color: 'var(--red)',
    points: ['理念・ビジョン・フィロソフィー', '目的・何のために・在り方', '心構え・物事への姿勢'],
    question: 'どのような考え方・在り方で取り組むか？',
  },
  {
    key: 'passion',
    icon: '🔥',
    name: '熱意',
    sub: '行動の原動力',
    color: 'var(--blue)',
    points: ['目的・目標に対する情熱', '努力し続けるエネルギー', '実現したいという強い意志'],
    question: 'どうすれば主体的に行動し続けられるか？',
  },
  {
    key: 'ability',
    icon: '📊',
    name: '能力',
    sub: '成果を生み出す力',
    color: 'var(--green)',
    points: ['技術・知識・経験・思考力・判断力', '実行力など、成果につなげる力', '先天的なものと後天的に獲得できるものがある', '学習と実践の積み重ねで高められる'],
    question: 'どのような能力を高めるか？何を学び、どう実践するか？',
  },
];

const DECISIONS = {
  continue: { label: 'このまま続ける', desc: '内容も頻度も変えずに継続します', icon: '▶️' },
  modify: { label: '修正して続ける', desc: '行動の内容・頻度・期間などを見直します', icon: '✏️' },
  replace: { label: '別の行動に入れ替える', desc: '今の行動は終了し、新しい行動を登録します（KPIメモと期間は引き継ぎ）', icon: '🔀' },
};

const FREQ_TYPES = [
  { key: 'daily', label: '毎日' },
  { key: 'weeklyCount', label: '週◯回' },
  { key: 'weekdays', label: '曜日指定' },
  { key: 'custom', label: '自由に書く' },
];

const CYCLES = [
  { key: 'weekly', label: '毎週' },
  { key: 'biweekly', label: '隔週' },
  { key: 'monthly', label: '毎月' },
];

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const OTHER_FACTOR_ID = 'other';
