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
  speechSynthesis: { cancel() {}, speak() {} },
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

function triggerHold() {
  const holdTarget = { closest(selector) { return selector === '[data-hold-parent]' ? { dataset: {} } : null; } };
  listeners.document.get('pointerdown')?.({ target: holdTarget });
  const timer = timers.find((item) => item.ms === 1800);
  expect(timer, 'Parent hold timer was not registered.');
  timer.fn();
  go('parent');
}

expect(appNode.innerHTML.includes('三座学习岛'), 'Child home did not render.');
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

go('mission/chinese-book-detective');
expect(appNode.innerHTML.includes('绘本侦探社'), 'Chinese mission did not render.');
go('mission/english-command-station');
expect(appNode.innerHTML.includes('英语任务站'), 'English mission did not render.');
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
  scenarios: ['math five-stage evidence', 'support ladder', 'delayed review', 'child operation replay', 'Chinese mission', 'English mission', 'role-play expression', 'parent gate', 'interest setting', 'local data deletion']
}, null, 2));
