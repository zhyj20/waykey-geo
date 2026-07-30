import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const files = [
  'index.html', 'styles.css', 'app.js', 'data.js',
  '设计说明与验收.md',
  'assets/logo.svg', 'assets/balance-hero.svg', 'assets/block.svg',
  'assets/buddy.svg', 'assets/speaker.svg', 'assets/stairs.svg', 'assets/pattern.svg'
];
const missingFiles = files.filter((file) => !existsSync(file));
if (missingFiles.length) throw new Error(`Missing required files: ${missingFiles.join(', ')}`);

const html = readFileSync('index.html', 'utf8');
const app = readFileSync('app.js', 'utf8');
const css = readFileSync('styles.css', 'utf8');
const dataSource = readFileSync('data.js', 'utf8');
const designDoc = readFileSync('设计说明与验收.md', 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(dataSource, sandbox, { filename: 'data.js' });
const content = sandbox.window.SELF_LEARN_CONTENT;

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const expectedSubjects = ['math', 'chinese', 'english'];
expect(content.subjects.map((item) => item.id).join('|') === expectedSubjects.join('|'), 'Three required subjects are not defined.');
expect(content.scenes.length === 12, `Expected 12 learning scenes, got ${content.scenes.length}.`);
for (const subject of expectedSubjects) {
  const scenes = content.scenes.filter((scene) => scene.subject === subject);
  expect(scenes.length === 4, `${subject} must have four learning scenes.`);
  expect(scenes.every((scene) => scene.activity && (scene.activity.prompt || scene.subtitle) && scene.activity.transfer && scene.activity.transferOptions?.length >= 2), `${subject} scenes need explore and transfer content.`);
}

const sceneIds = [
  'math-balance', 'math-picnic', 'math-stairs', 'math-city',
  'chinese-sound-lab', 'chinese-book-detective', 'chinese-character-workshop', 'chinese-story-director',
  'english-sound-friends', 'english-command-station', 'english-mini-theatre', 'english-treasure-book'
];
expect(sceneIds.every((id) => content.sceneById[id]), 'One or more named teaching scenes are missing.');
expect(content.projects.length === 3, 'Expected three cross-subject projects.');
expect(['project-picnic', 'project-rescue', 'project-museum'].every((id) => content.projects.some((item) => item.id === id)), 'Named projects are missing.');
expect(content.projects.every((project) => new Set(project.steps.map((step) => content.sceneById[step.sceneId]?.subject)).size === 3), 'Every project must connect all three subjects.');
expect(content.inquiryTrails?.length === 12 && Object.keys(content.inquiryTrailByScene || {}).length === 12, 'Every learning scene needs a question-trail entry.');
expect(content.inquiryTrails.every((trail) => trail.tags?.length >= 2 && trail.pieces?.length >= 3 && trail.nextSceneIds?.length >= 1), 'Question trails need tags, child-selectable pieces, and follow-up scenes.');
expect(content.worldPlaces?.length === 3 && content.worldPlaces.every((place) => place.sceneIds?.length === 3), 'Three persistent world places must derive from real scene progress.');
const englishScenes = content.scenes.filter((scene) => scene.subject === 'english');
expect(englishScenes.every((scene) => scene.treasure?.word && scene.treasure?.collectionLabel), 'Every English scene needs a real transfer-earned treasure definition.');
expect(content.sceneById['english-sound-friends'].activity.kind === 'match', 'English sound friends must use a connect-the-pair interaction.');
expect(['现有问题 → 重构原则', '信息架构与学习旅程', '可扩展内容模型', '验收标准'].every((heading) => designDoc.includes(heading)), 'The design-and-acceptance delivery document is incomplete.');
const balance = content.sceneById['math-balance'];
expect(balance.misconceptions?.length >= 2, 'Balance mission needs two misconception hypotheses.');
expect(['one', 'split', 'draw'].every((method) => app.includes(`data-method="${method}"`)), 'Balance mission needs three valid starting strategies.');
expect(content.scenes.every((scene) => scene.realWorld && scene.seed && scene.representations?.length >= 3), 'Every scene needs a real-world challenge, a discovery seed, and multiple representations.');
const supportedActivityKinds = new Set(['balance', 'choice', 'match', 'sequence', 'build', 'draw', 'action']);
expect(content.scenes.every((scene) => supportedActivityKinds.has(scene.activity.kind)), 'One or more scene activity kinds have no runtime renderer.');
const rolePlayScenes = content.scenes.filter((scene) => scene.roleCards?.length >= 2);
expect(rolePlayScenes.length >= 2, 'At least two language scenes need role-play choices.');

const requiredAppContracts = [
  'selfLearningMasterV2', 'localStorage', 'MediaRecorder', 'SpeechSynthesisUtterance',
  'completeExplore', 'completeExpression', 'completeTransfer', 'completeDelayedReview',
  'evidenceGuidance', 'data-drag-block', 'draw-alternative', 'toggle-pause',
  'data-hold-parent', 'delete-data', 'review-answer', 'renderParent',
  'summary:', 'unknown:', 'recommendation:', 'operationLog', 'renderOperationReplay',
  'recording-replay', 'toggle-interest', 'interestThemes', 'breakEvery = 8 * 60'
  , 'renderSupportLadder', 'support-step', 'useSupport', 'supportLevel',
  'renderRolePlay', 'role-select', 'role-confirm', 'confirmRolePlay',
  'renderWorldState', 'worldPlaceProgress', 'question-workshop', 'saveQuestion',
  'question-followup', 'setupQuestionCanvas', 'startQuestionRecording', 'collectTreasure',
  'match-left', 'match-right', 'chooseMatch', 'speech-control', 'controlSpeech',
  'window.speechSynthesis.pause', 'window.speechSynthesis.resume'
];
const missingContracts = requiredAppContracts.filter((token) => !app.includes(token));
expect(!missingContracts.length, `Missing interaction/data contracts: ${missingContracts.join(', ')}`);
expect(!/\b(fetch|XMLHttpRequest|sendBeacon)\s*\(/.test(app), 'The child experience must not upload learning data by default.');
expect(app.includes('<audio controls') && app.includes('runtime.recordingUrl'), 'Child recordings need a local replay path.');
expect(!/排行榜|连续答对|金币|限时抢答/.test(app), 'The child experience must not include competitive reward mechanics.');

const requiredHtml = ['data.js', 'app.js', 'live-region', 'parent-gate', 'privacy-dialog', 'skip-link'];
const missingHtml = requiredHtml.filter((token) => !html.includes(token));
expect(!missingHtml.length, `Missing app shell/accessibility hooks: ${missingHtml.join(', ')}`);
expect(css.includes('reduced-motion') && css.includes(':focus-visible') && css.includes('draggable-block') && css.includes('support-ladder') && css.includes('role-play') && css.includes('world-state') && css.includes('question-workshop') && css.includes('match-grid'), 'Accessibility and alternate-interaction styles are incomplete.');

console.log(JSON.stringify({
  status: 'passed',
  subjects: content.subjects.length,
  scenes: content.scenes.length,
  projects: content.projects.length,
  checked: ['content model', 'three-subject projects', 'five-stage evidence hooks', 'multi-representation evidence', 'question trails', 'persistent world state', 'English transfer treasures', 'support ladder', 'role-play expression', 'sound pause/replay fallback', 'local-only privacy', 'drag click alternative', 'parent interest settings', 'parent gate/delete', 'keyboard/motion styles']
}, null, 2));
