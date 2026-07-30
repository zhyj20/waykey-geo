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

go('mission/chinese-book-detective');
expect(appNode.innerHTML.includes('绘本侦探社'), 'Chinese mission did not render.');
go('mission/english-command-station');
expect(appNode.innerHTML.includes('英语任务站'), 'English mission did not render.');
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
  scenarios: ['math five-stage evidence', 'delayed review', 'child operation replay', 'Chinese mission', 'English mission', 'parent gate', 'interest setting', 'local data deletion']
}, null, 2));
