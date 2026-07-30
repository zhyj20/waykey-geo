import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const listeners = { document: new Map(), window: new Map() };
const timers = [];
const store = new Map();
const appNode = { innerHTML: '' };
const liveNode = { textContent: '' };
const parentGate = {
  innerHTML: '', open: false,
  showModal() { this.open = true; },
  close() { this.open = false; }
};
const privacyDialog = {
  innerHTML: '', open: false,
  showModal() { this.open = true; },
  close() { this.open = false; }
};

const document = {
  body: { classList: { toggle() {} } },
  querySelector(selector) {
    return ({ '#app': appNode, '#live-region': liveNode, '#parent-gate': parentGate, '#privacy-dialog': privacyDialog }[selector] || null);
  },
  querySelectorAll() { return []; },
  addEventListener(type, handler) { listeners.document.set(type, handler); }
};
const location = { hash: '' };
const window = {
  addEventListener(type, handler) { listeners.window.set(type, handler); },
  speechSynthesis: { cancel() {}, speak() {}, pause() {}, resume() {} },
  confirm() { return true; }
};
const sandbox = {
  window, document, location, navigator: {}, console, Math, Date, JSON,
  localStorage: {
    getItem(key) { return store.get(key) || null; },
    setItem(key, value) { store.set(key, value); },
    removeItem(key) { store.delete(key); }
  },
  SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
  setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; },
  clearTimeout() {}, setInterval() { return 1; }, URL: { revokeObjectURL() {} }
};
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(readFileSync('data.js', 'utf8'), sandbox, { filename: 'data.js' });
vm.runInContext(readFileSync('app.js', 'utf8'), sandbox, { filename: 'app.js' });

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function go(route) {
  location.hash = `#${route}`;
  listeners.window.get('hashchange')?.();
}

function clickAction(action, dataset = {}) {
  const actionNode = { dataset: { action, ...dataset } };
  listeners.document.get('click')?.({ target: { closest(selector) { return selector === '[data-action]' ? actionNode : null; } } });
}

function clickSay(text) {
  const sayNode = { dataset: { say: text } };
  listeners.document.get('click')?.({ target: { closest(selector) { return selector === '[data-say]' ? sayNode : null; } } });
}

function triggerHold() {
  const holdTarget = { closest(selector) { return selector === '[data-hold-parent]' ? { dataset: {} } : null; } };
  listeners.document.get('pointerdown')?.({ target: holdTarget });
  const timer = timers.find((item) => item.ms === 1800);
  expect(timer, 'Parent hold timer was not registered.');
  timer.fn();
  go('parent');
}

expect(appNode.innerHTML.includes('三座学习岛'), 'Child home did not render.');
expect(appNode.innerHTML.includes('小通的小世界'), 'Persistent child world did not render on home.');
expect(!store.has('selfLearningMasterV2'), 'Opening the child home must not fabricate saved progress before any interaction.');
clickSay('小通先说一小段话。');
clickAction('speech-control');
clickAction('speech-control');
go('mission/math-balance');
expect(appNode.innerHTML.includes('平衡修理站'), 'Math mission did not render.');
expect(appNode.innerHTML.includes('想换一种陪伴吗'), 'Support ladder did not render in the child mission.');
clickAction('support-step', { support: 'clue' });
clickAction('balance-method', { method: 'one' });
for (let index = 0; index < 5; index += 1) clickAction('balance-add', { count: '1' });
clickAction('mission-next');
clickAction('expression-mode', { mode: 'cards' });
clickAction('sentence-choose', { sentence: '我先看一看，再慢慢试。' });
clickAction('expression-confirm');
clickAction('transfer-answer', { answer: '2 和 3' });
clickAction('seed-question', { question: '我想知道为什么两边一样。' });
const completedState = JSON.parse(store.get('selfLearningMasterV2'));
expect(completedState.evidence.length >= 4, 'Math mission did not create multi-stage evidence.');
expect(completedState.reviews.length === 1, 'Math mission did not create a delayed review card.');
expect(completedState.sceneProgress['math-balance'].operationLog.length >= 3, 'Child operation replay was not recorded.');
expect(completedState.sceneProgress['math-balance'].supportLevel === 'clue', 'Selected support level did not persist locally.');

go('mission/math-picnic');
clickAction('choice-answer', { answerId: 'a' });
clickAction('expression-mode', { mode: 'cards' });
clickAction('sentence-choose', { sentence: '我发现可以把它分成两小群。' });
clickAction('expression-confirm');
clickAction('transfer-answer', { answer: '4 和 4' });
clickAction('seed-question', { question: '如果多来一位朋友，要怎样分？' });
go('home');
expect(appNode.innerHTML.includes('野餐地正在热闹起来'), 'World state did not change after a real project scene was completed.');

go('mission/chinese-book-detective');
expect(appNode.innerHTML.includes('绘本侦探社'), 'Chinese mission did not render.');
go('mission/english-command-station');
expect(appNode.innerHTML.includes('英语任务站'), 'English mission did not render.');
go('mission/english-sound-friends');
expect(appNode.innerHTML.includes('声音卡') && appNode.innerHTML.includes('图片词卡'), 'Connect-the-pair English interaction did not render.');
clickAction('match-left', { matchId: 'cat-sound' });
clickAction('match-right', { matchId: 'cat-picture' });
clickAction('expression-mode', { mode: 'cards' });
clickAction('sentence-choose', { sentence: '我想换一张图再证明一次。' });
clickAction('expression-confirm');
clickAction('transfer-answer', { answer: 'dog' });
const treasureState = JSON.parse(store.get('selfLearningMasterV2'));
expect(treasureState.treasures.some((item) => item.word === 'cat' && item.source === '独立迁移'), 'English treasure was not earned from independent transfer.');
go('mission/english-mini-theatre');
clickAction('sequence-select', { index: '1' });
clickAction('sequence-move', { direction: 'up' });
clickAction('sequence-select', { index: '2' });
clickAction('sequence-move', { direction: 'up' });
clickAction('sequence-confirm');
expect(appNode.innerHTML.includes('演给小通看'), 'Role-play expression did not render.');
clickAction('role-select', { role: '我是新朋友：Hello! Nice to meet you.' });
clickAction('role-confirm');
const rolePlayState = JSON.parse(store.get('selfLearningMasterV2'));
expect(rolePlayState.sceneProgress['english-mini-theatre'].expressionComplete, 'Role-play did not create expression evidence.');
expect(rolePlayState.evidence.some((item) => item.sceneId === 'english-mini-theatre' && item.phase === 'expression' && item.representation === '动作'), 'Role-play evidence was not recorded as an action-based expression.');
go('question-workshop');
expect(appNode.innerHTML.includes('把一个“为什么”做出来') && appNode.innerHTML.includes('拼图卡'), 'Child question workshop did not render.');
clickAction('question-capture', { captureMode: 'draw' });
expect(appNode.innerHTML.includes('question-canvas'), 'Question drawing route did not render a child drawing surface.');
clickAction('question-capture', { captureMode: 'voice' });
expect(appNode.innerHTML.includes('录音默认关闭'), 'Question voice route did not provide the consent-safe fallback.');
clickAction('question-capture', { captureMode: 'build' });
clickAction('question-context', { sceneId: 'chinese-book-detective' });
clickAction('question-mode', { questionMode: 'why' });
clickAction('question-piece', { pieceIndex: '1' });
clickAction('question-save');
const questionState = JSON.parse(store.get('selfLearningMasterV2'));
const builtQuestion = questionState.questions.at(-1);
expect(builtQuestion.source === '图卡拼问题' && builtQuestion.tags.includes('故事') && builtQuestion.status === 'open', 'Child-built question did not retain its form, tags, and tracking state.');
clickAction('question-followup', { questionId: builtQuestion.id });
expect(location.hash === '#mission/chinese-story-director', 'Question follow-up did not route to a related cross-scene exploration.');
const allSceneRoutes = [
  ['math-balance', '平衡修理站'], ['math-picnic', '森林野餐'], ['math-stairs', '楼梯探险队'], ['math-city', '城市建筑师'],
  ['chinese-sound-lab', '拼音声音实验室'], ['chinese-book-detective', '绘本侦探社'], ['chinese-character-workshop', '汉字变形工坊'], ['chinese-story-director', '小小故事导演'],
  ['english-sound-friends', '听音找朋友'], ['english-command-station', '英语任务站'], ['english-mini-theatre', '情景小剧场'], ['english-treasure-book', '英语宝物册']
];
for (const [sceneId, title] of allSceneRoutes) {
  go(`mission/${sceneId}`);
  expect(appNode.innerHTML.includes(title) && !appNode.innerHTML.includes('undefined'), `${sceneId} did not render a valid child mission.`);
}
go('parent');
const parentOpenTimer = timers.filter((item) => item.ms === 0).at(-1);
expect(parentOpenTimer, 'Parent gate opening was not scheduled.');
parentOpenTimer.fn();
expect(parentGate.open, 'Parent gate did not open for a direct parent route.');
triggerHold();
expect(appNode.innerHTML.includes('家长设置') && appNode.innerHTML.includes('孩子最近想探索什么'), 'Parent settings did not render.');
clickAction('toggle-interest', { interest: '音乐' });
const withInterest = JSON.parse(store.get('selfLearningMasterV2'));
expect(withInterest.profile.interestThemes.includes('音乐'), 'Interest theme did not persist locally.');
clickAction('delete-data');
expect(!store.has('selfLearningMasterV2'), 'Delete data did not clear local learning data.');

console.log(JSON.stringify({
  status: 'passed',
  scenarios: ['no fabricated home progress', 'math five-stage evidence', 'support ladder', 'delayed review', 'child operation replay', 'persistent world state', 'all 12 child missions', 'Chinese mission', 'English match interaction', 'English transfer treasure', 'role-play expression', 'question workshop and follow-up', 'sound pause/replay control', 'parent gate', 'interest setting', 'local data deletion']
}, null, 2));
