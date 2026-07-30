(() => {
  const content = window.SELF_LEARN_CONTENT;
  const app = document.querySelector('#app');
  const liveRegion = document.querySelector('#live-region');
  const parentGate = document.querySelector('#parent-gate');
  const privacyDialog = document.querySelector('#privacy-dialog');
  const STORAGE_KEY = 'selfLearningMasterV2';
  const DAY = 24 * 60 * 60 * 1000;
  const runtime = {
    drawing: false,
    drawingCanvas: null,
    drawingContext: null,
    mediaRecorder: null,
    mediaChunks: [],
    recordingStartedAt: 0,
    recordingUrl: null,
    recordingSceneId: null,
    speechState: 'idle',
    speechToken: 0,
    lastSpeech: '',
    questionCanvas: null,
    questionDrawingContext: null,
    questionDrawing: false,
    questionMediaRecorder: null,
    questionMediaChunks: [],
    questionRecordingStartedAt: 0,
    questionRecordingUrl: null,
    questionRecordingId: null,
    discardSceneRecording: false,
    discardQuestionRecording: false,
    holdTimer: null,
    toastTimer: null
  };

  function defaultState() {
    return {
      profile: {
        name: '小宇',
        textbook: '按兴趣探索',
        schoolTopic: '',
        screenMinutes: 18,
        sound: true,
        reducedMotion: false,
        voicePermission: false,
        interestThemes: ['动物', '故事', '搭建']
      },
      session: { active: false, paused: false, elapsed: 0, lastBreakAt: 0, breakOpen: false },
      sceneProgress: {},
      evidence: [],
      questions: [],
      questionDraft: { sceneId: 'math-balance', mode: 'why', pieceIndex: 0, captureMode: 'build', drawingData: null },
      treasures: [],
      reviews: [],
      projects: {},
      parentUnlocked: false,
      version: 2
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || saved.version !== 2) return defaultState();
      const base = defaultState();
      return {
        ...base,
        ...saved,
        profile: { ...base.profile, ...(saved.profile || {}) },
        session: { ...base.session, ...(saved.session || {}) },
        sceneProgress: saved.sceneProgress || {},
        evidence: Array.isArray(saved.evidence) ? saved.evidence : [],
        questions: Array.isArray(saved.questions) ? saved.questions : [],
        questionDraft: { ...base.questionDraft, ...(saved.questionDraft || {}) },
        treasures: Array.isArray(saved.treasures) ? saved.treasures : [],
        reviews: Array.isArray(saved.reviews) ? saved.reviews : [],
        projects: saved.projects || {}
      };
    } catch {
      return defaultState();
    }
  }

  let state = loadState();

  function saveState() {
    const safeState = JSON.parse(JSON.stringify(state));
    safeState.parentUnlocked = false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
  }

  function escapeHTML(value = '') {
    return String(value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function announce(message) {
    liveRegion.textContent = message;
    const toast = document.querySelector('#toast');
    if (!toast) return;
    clearTimeout(runtime.toastTimer);
    toast.textContent = message;
    toast.classList.add('visible');
    runtime.toastTimer = setTimeout(() => toast.classList.remove('visible'), 3400);
  }

  function speechControlLabel() {
    if (runtime.speechState === 'speaking') return '暂停声音';
    if (runtime.speechState === 'paused') return '继续声音';
    if (runtime.lastSpeech) return '重听声音';
    return '声音控制';
  }

  function updateSpeechControls() {
    document.querySelectorAll('[data-speech-control-label]').forEach((node) => { node.textContent = speechControlLabel(); });
    document.querySelectorAll('[data-speech-control]').forEach((node) => {
      node.setAttribute('aria-label', speechControlLabel());
      node.setAttribute('aria-pressed', String(runtime.speechState === 'speaking' || runtime.speechState === 'paused'));
    });
  }

  function setSpeechState(next) {
    runtime.speechState = next;
    updateSpeechControls();
  }

  function stopSpeech() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeechState('idle');
  }

  function speak(message) {
    runtime.lastSpeech = message;
    if (!state.profile.sound) {
      announce('声音提示已关闭。你可以看着图和文字继续探索。');
      return;
    }
    if (!('speechSynthesis' in window)) {
      announce(message);
      return;
    }
    const token = ++runtime.speechToken;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.88;
    utterance.onend = () => { if (token === runtime.speechToken) setSpeechState('idle'); };
    utterance.onerror = () => { if (token === runtime.speechToken) setSpeechState('idle'); };
    setSpeechState('speaking');
    window.speechSynthesis.speak(utterance);
  }

  function controlSpeech() {
    if (!state.profile.sound) {
      announce('声音提示现在关着。需要时可以先打开声音，或者继续看文字和图。');
      return;
    }
    if (!('speechSynthesis' in window)) {
      announce('这台电脑暂时不能播放声音。每一处声音提示都有文字或图卡可以继续。');
      return;
    }
    if (runtime.speechState === 'speaking') {
      window.speechSynthesis.pause();
      setSpeechState('paused');
      announce('声音先停在这里。想继续时再按一次。');
      return;
    }
    if (runtime.speechState === 'paused') {
      window.speechSynthesis.resume();
      setSpeechState('speaking');
      return;
    }
    if (runtime.lastSpeech) {
      speak(runtime.lastSpeech);
    } else {
      announce('想听题目时，按题目旁边的“听一遍”就可以。');
    }
  }

  function toggleSound() {
    state.profile.sound = !state.profile.sound;
    if (!state.profile.sound) stopSpeech();
    saveState();
    render();
    if (state.profile.sound) announce('声音提示已经打开。想听时请主动按“听一遍”；右上角可以暂停或重听。');
    else announce('声音提示已关闭。所有任务仍有文字、图卡和操作替代。');
  }

  function parseRoute() {
    const raw = (location.hash || '#home').slice(1).split('/');
    if (raw[0] === 'mission' && content.sceneById[raw[1]]) return { name: 'mission', sceneId: raw[1] };
    if (raw[0] === 'subject' && content.subjectById[raw[1]]) return { name: 'subject', subjectId: raw[1] };
    if (raw[0] === 'review' && content.sceneById[raw[1]]) return { name: 'review', sceneId: raw[1] };
    if (['home', 'discoveries', 'projects', 'parent', 'question-workshop'].includes(raw[0])) return { name: raw[0] };
    return { name: 'home' };
  }

  function setRoute(route) {
    const next = route.startsWith('#') ? route : `#${route}`;
    if (location.hash === next) render();
    else location.hash = next;
  }

  function sceneProgress(sceneId) {
    if (!state.sceneProgress[sceneId]) {
      state.sceneProgress[sceneId] = {
        stage: 0,
        startedAt: Date.now(),
        hints: 0,
        exploreComplete: false,
        expressionComplete: false,
        transferComplete: false,
        seedComplete: false,
        method: null,
        rightCount: 0,
        sequence: null,
        selectedPieces: [],
        selectedAnswer: null,
        selectedAction: null,
        selectedMatchLeft: null,
        selectedMatchRight: null,
        lastMatchKey: null,
        expressionMode: null,
        selectedSentence: null,
        roleChoice: null,
        supportLevel: 'wait',
        drawingData: null,
        recorded: false,
        operationLog: [],
        showReplay: false,
        transferAnswer: null,
        feedback: '',
        completedAt: null
      };
    }
    return state.sceneProgress[sceneId];
  }

  function startSession() {
    if (!state.session.active) {
      state.session.active = true;
      state.session.paused = false;
      saveState();
    }
  }

  function sceneStatus(sceneId) {
    const progress = state.sceneProgress[sceneId];
    if (!progress) return { label: '还没开始', className: 'unobserved' };
    if (progress.completedAt) return { label: '留下发现', className: 'stable' };
    if (progress.transferComplete) return { label: '正在换故事', className: 'transferring' };
    if (progress.expressionComplete) return { label: '正在说想法', className: 'explaining' };
    if (progress.exploreComplete) return { label: '已经试过', className: 'context' };
    return { label: '刚刚开始', className: 'emerging' };
  }

  function conceptEvents(conceptId) {
    return state.evidence.filter((item) => item.concepts.includes(conceptId));
  }

  function conceptStatus(conceptId) {
    const events = conceptEvents(conceptId);
    if (!events.length) return { code: 'unobserved', label: '还没一起玩过', detail: '下一次从一个小场景开始。' };
    const reps = new Set(events.map((item) => item.representation));
    const independent = events.filter((item) => !item.prompted);
    const explained = events.some((item) => item.phase === 'expression' && !item.prompted);
    const transferred = events.some((item) => item.phase === 'transfer' && !item.prompted);
    const delayed = events.some((item) => item.phase === 'delay' && !item.prompted);
    if (delayed && transferred && reps.size >= 2) return { code: 'stable', label: '隔几天也记得', detail: '已见到迁移与延迟证据。' };
    if (transferred && reps.size >= 2) return { code: 'transferring', label: '会换个故事试', detail: '还要过几天再看看。' };
    if (explained && reps.size >= 2) return { code: 'explaining', label: '能讲讲想法', detail: '下一次换一个场景。' };
    if (independent.length) return { code: 'context', label: '这次能自己试', detail: '还不知道换地方会不会也这样想。' };
    return { code: 'emerging', label: '正在发现', detail: '有提示时已经愿意试一试。' };
  }

  function evidenceGuidance(phase, prompted, misconception) {
    const unknown = misconception || {
      explore: '还不知道换一种表示方式时会不会也这样想。',
      expression: '还不知道孩子能否在没有提示时把理由讲清楚。',
      transfer: '还不知道换到别的故事后能否继续使用这个办法。',
      delay: '还需要在更多真实场景中慢慢观察。',
      seed: '下次可以从孩子留下的问题继续探索。'
    }[phase] || '还需要在新的场景里再观察一次。';
    const recommendation = prompted
      ? '下次先换成孩子更熟悉的材料，再邀请他自己试一次。'
      : phase === 'transfer'
        ? '3—7 天后换一个小故事做一次延迟回访。'
        : phase === 'delay'
          ? '把这次观察和另一种表示方式放在一起看，不急着下结论。'
          : '下一步换一种表达或真实场景，再收集一条证据。';
    return { unknown, recommendation };
  }

  function addEvidence({ scene, phase, representation, prompted = false, note, outcome = '尝试', misconception = null, unknown, recommendation }) {
    const guidance = evidenceGuidance(phase, prompted, misconception);
    const record = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      at: Date.now(),
      sceneId: scene.id,
      subject: scene.subject,
      concepts: scene.concepts,
      phase,
      representation,
      prompted,
      note,
      summary: note,
      outcome,
      misconception,
      unknown: unknown || guidance.unknown,
      recommendation: recommendation || guidance.recommendation
    };
    state.evidence.push(record);
    state.evidence = state.evidence.slice(-180);
    saveState();
    return record;
  }

  function recordOperation(sceneId, description) {
    const progress = sceneProgress(sceneId);
    progress.operationLog = [...(progress.operationLog || []), {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      at: Date.now(),
      description
    }].slice(-8);
  }

  function completeExplore(scene, { representation, note, prompted = false }) {
    const progress = sceneProgress(scene.id);
    if (!progress.exploreComplete) {
      progress.exploreComplete = true;
      progress.stage = Math.max(progress.stage, 1);
      addEvidence({ scene, phase: 'explore', representation, prompted, note, outcome: '完成探索' });
    }
    saveState();
  }

  function completeExpression(scene, { representation, note, prompted = false }) {
    const progress = sceneProgress(scene.id);
    if (!progress.exploreComplete) {
      announce('先用自己的办法试一试，再告诉小通你怎样想。');
      return false;
    }
    if (!progress.expressionComplete) {
      progress.expressionComplete = true;
      progress.stage = Math.max(progress.stage, 2);
      addEvidence({ scene, phase: 'expression', representation, prompted, note, outcome: '表达想法' });
    }
    saveState();
    return true;
  }

  function completeTransfer(scene, answer) {
    const progress = sceneProgress(scene.id);
    const activity = scene.activity;
    progress.transferAnswer = answer;
    recordOperation(scene.id, `在新故事里选择“${answer}”。`);
    if (answer === activity.correct) {
      progress.transferComplete = true;
      progress.stage = Math.max(progress.stage, 3);
      addEvidence({ scene, phase: 'transfer', representation: '图', prompted: false, note: `在新故事中选择“${answer}”`, outcome: '迁移尝试' });
      collectTreasure(scene);
      progress.feedback = '你换了一个故事，还是愿意用刚才的想法。小通想再听你说说理由。';
      announce('这次是换故事的证据，不是重复做题。');
    } else {
      addEvidence({ scene, phase: 'transfer', representation: '图', prompted: true, note: `在迁移任务中选择“${answer}”`, outcome: '需要再看', misconception: '新场景下的想法还不确定。' });
      progress.feedback = '这个新故事有一点不一样。没关系，我们先把刚才的办法和现在的图放在一起看。';
      announce('小通记下：换故事时还需要一起看看。');
    }
    saveState();
    render();
  }

  function collectTreasure(scene) {
    if (!scene.treasure || state.treasures.some((item) => item.sceneId === scene.id)) return;
    state.treasures.push({
      id: `${scene.id}-${Date.now()}`,
      sceneId: scene.id,
      subject: scene.subject,
      word: scene.treasure.word,
      meaning: scene.treasure.meaning,
      note: scene.treasure.collectionLabel,
      at: Date.now(),
      source: '独立迁移'
    });
    state.treasures = state.treasures.slice(-30);
  }

  function completeSeed(scene, text, kind = 'question') {
    const progress = sceneProgress(scene.id);
    if (!progress.transferComplete) {
      announce('先换一个故事试一试，再把发现种下去。');
      return;
    }
    if (kind === 'question') {
      saveQuestion({ sceneId: scene.id, text, source: '任务中的发现', mode: 'starter' });
      addEvidence({ scene, phase: 'seed', representation: '语言', prompted: false, note: `孩子留下问题：“${text}”`, outcome: '主动提问' });
    } else {
      addEvidence({ scene, phase: 'seed', representation: '动作', prompted: false, note: `孩子选择离屏挑战：${text}`, outcome: '离屏探索' });
    }
    progress.seedComplete = true;
    progress.completedAt = Date.now();
    progress.stage = 4;
    markQuestionsVisitedByScene(scene.id);
    if (!state.reviews.some((review) => review.sceneId === scene.id && review.status === 'waiting')) {
      state.reviews.push({ id: `${scene.id}-${Date.now()}`, sceneId: scene.id, dueAt: Date.now() + 3 * DAY, status: 'waiting' });
    }
    saveState();
    announce('小通把这颗发现种子放进了你的发现册。三天后会换个故事再见面。');
    render();
  }

  function completeDelayedReview(scene, answer) {
    const review = state.reviews.find((item) => item.sceneId === scene.id && item.status === 'waiting');
    if (!review || review.dueAt > Date.now()) {
      announce('这张回访卡还在等合适的时间。我们先去做别的小探索。');
      return;
    }
    const correct = answer === scene.activity.correct;
    review.status = correct ? 'done' : 'revisit';
    review.completedAt = Date.now();
    addEvidence({
      scene,
      phase: 'delay',
      representation: '语言',
      prompted: !correct,
      note: correct ? `隔几天后的新故事里，孩子选择“${answer}”。` : `隔几天后的新故事里，孩子选择“${answer}”。`,
      outcome: correct ? '延迟回访' : '延迟回访待再看',
      misconception: correct ? null : '隔几天后换故事时，孩子的办法还不稳定。'
    });
    if (correct) {
      announce('小通只记下了一次隔几天后的观察：你在新故事里又愿意用这个办法。它不是分数，也不是“永久学会”。');
    } else {
      announce('小通记下：隔几天后换故事时还想再看看。没关系，这正是回访的意义。');
    }
    saveState();
    setRoute('discoveries');
  }

  function formatElapsed(seconds) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes} 分 ${String(rest).padStart(2, '0')} 秒`;
  }

  function updateSessionUI() {
    const maximum = state.profile.screenMinutes * 60;
    const percent = Math.min(100, Math.round((state.session.elapsed / maximum) * 100));
    document.querySelectorAll('[data-session-time]').forEach((node) => { node.textContent = formatElapsed(state.session.elapsed); });
    document.querySelectorAll('[data-session-fill]').forEach((node) => { node.style.width = `${percent}%`; });
  }

  function tick() {
    if (!state.session.active || state.session.paused) return;
    state.session.elapsed += 1;
    const breakEvery = 8 * 60;
    if (state.session.elapsed >= breakEvery && state.session.elapsed - state.session.lastBreakAt >= breakEvery) {
      state.session.breakOpen = true;
      state.session.lastBreakAt = state.session.elapsed;
      saveState();
      render();
      return;
    }
    if (state.session.elapsed % 10 === 0) saveState();
    updateSessionUI();
  }

  function renderHeader(route) {
    const nav = [
      ['home', '今天探索'],
      ['discoveries', '我的发现册'],
      ['projects', '一起做项目']
    ];
    return `
      <header class="topbar">
        <div class="topbar-inner">
          <button class="brand" type="button" data-route="home" aria-label="回到自学大师首页"><img src="assets/logo.svg" alt="" /><span>自学大师</span></button>
          <nav class="child-nav" aria-label="儿童学习导航">
            ${nav.map(([key, label]) => `<button class="nav-button ${route.name === key ? 'active' : ''}" type="button" data-route="${key}">${label}</button>`).join('')}
          </nav>
          <div class="top-actions">
            <button class="top-action" type="button" data-action="toggle-sound" aria-pressed="${state.profile.sound}"><img src="assets/speaker.svg" alt="" /><span>${state.profile.sound ? '声音开着' : '声音关着'}</span></button>
            <button class="top-action" type="button" data-action="speech-control" data-speech-control aria-label="${speechControlLabel()}" aria-pressed="${runtime.speechState === 'speaking' || runtime.speechState === 'paused'}"><span data-speech-control-label>${speechControlLabel()}</span></button>
            <button class="top-action" type="button" data-action="toggle-pause"><span>${state.session.paused ? '继续探索' : '暂停一下'}</span></button>
            <button class="top-action parent-link" type="button" data-action="open-parent">家长入口</button>
          </div>
        </div>
      </header>`;
  }

  function renderSessionRail() {
    const maximum = state.profile.screenMinutes * 60;
    const percent = Math.min(100, Math.round((state.session.elapsed / maximum) * 100));
    const message = state.session.paused ? '已经暂停。眼睛和身体都可以休息一下。' : '不赶时间，觉得累了可以随时暂停。';
    return `
      <section class="session-rail" aria-label="今天的健康学习节奏">
        <img src="assets/clock.svg" alt="" />
        <div><strong>今天的探索节奏</strong><p>${message}</p></div>
        <div class="session-progress"><div class="session-progress-track"><div class="session-progress-fill" data-session-fill style="width:${percent}%"></div></div><small>已一起探索 <b data-session-time>${formatElapsed(state.session.elapsed)}</b></small></div>
      </section>`;
  }

  function worldPlaceProgress(place) {
    const completed = place.sceneIds.filter((sceneId) => sceneProgress(sceneId).completedAt);
    const nextSceneId = place.sceneIds.find((sceneId) => !sceneProgress(sceneId).completedAt) || place.sceneIds[0];
    return { completed: completed.length, nextSceneId };
  }

  function renderWorldState() {
    const places = content.worldPlaces || [];
    if (!places.length) return '';
    return `<section class="world-state" aria-label="小通的小世界"><div class="section-heading"><div><h2>小通的小世界</h2><p>你完成的真实探索，会让这里慢慢发生变化；不是积分，也不是排名。</p></div></div><div class="world-grid">${places.map((place) => {
      const progress = worldPlaceProgress(place);
      const copy = progress.completed === 0 ? place.waiting : progress.completed === place.sceneIds.length ? place.ready : place.growing;
      return `<article class="world-place ${place.color}"><img src="${place.art}" alt="" /><div><span class="card-kicker">${progress.completed}/${place.sceneIds.length} 个真实探索</span><h3>${escapeHTML(place.title)}</h3><p>${escapeHTML(copy)}</p><button class="text-button" type="button" data-action="start-scene" data-scene-id="${progress.nextSceneId}">${progress.completed === place.sceneIds.length ? '再去看看' : '帮小通走下一步'}</button></div></article>`;
    }).join('')}</div></section>`;
  }

  function sceneCard(scene, compact = false) {
    const status = sceneStatus(scene.id);
    const subject = content.subjectById[scene.subject];
    return `
      <button class="scene-card ${scene.color}" type="button" data-action="start-scene" data-scene-id="${scene.id}">
        <div class="card-content">
          <span class="card-kicker">${escapeHTML(subject.name)} · ${escapeHTML(status.label)}</span>
          <h3>${escapeHTML(scene.title)}</h3>
          <p>${escapeHTML(compact ? scene.subtitle : scene.realWorld)}</p>
          <span class="scene-meta">${escapeHTML(scene.concepts.length > 1 ? '可以用不止一种办法' : '从一个小问题开始')}</span>
        </div>
        <img class="card-art" src="${scene.art}" alt="" />
      </button>`;
  }

  function renderHome() {
    const recommendations = content.subjects.map((subject) => content.scenes.find((scene) => scene.subject === subject.id && !sceneProgress(scene.id).completedAt) || content.scenes.find((scene) => scene.subject === subject.id));
    return `
      <div class="page-wrap">
        <p class="greeting">你好，${escapeHTML(state.profile.name)}。今天想从哪一个小问题出发？</p>
        <div class="hero-grid">
          <section class="hero-card" aria-labelledby="home-title">
            <div class="hero-copy">
              <p class="eyebrow">不是刷题，是一起发现</p>
              <h1 id="home-title">每一个“为什么”，<br />都可以变成一场冒险。</h1>
              <p>你可以动手、画一画、说一说，也可以先慢慢试。小通会记住你的办法，不只记住答案。</p>
              <div class="hero-actions"><button class="button button-primary" type="button" data-action="start-scene" data-scene-id="${recommendations[0].id}">开始一个小任务</button><button class="button button-secondary" type="button" data-route="discoveries">看看我的发现</button></div>
            </div>
            <img class="hero-illustration" src="assets/balance-hero.svg" alt="小通正在探索天平" />
          </section>
          <aside class="companion-card" aria-label="学习伙伴小通">
            <div class="companion-head"><img src="assets/buddy.svg" alt="小通" /><div><b>小通在等你</b><p>不会也没关系。先告诉我：哪里最奇怪？</p></div></div>
            <div class="speech-bubble">“你的办法可以很慢，也可以很特别。我们先试试看。”</div>
            <div class="companion-controls"><button class="read-button" type="button" data-say="不会也没关系。你的办法可以很慢，也可以很特别。我们先试试看。">听小通说</button><button class="text-button" type="button" data-route="projects">做个大项目</button></div>
          </aside>
        </div>
        ${renderSessionRail()}
        ${renderWorldState()}
        <div class="section-heading"><div><h2>今天可以从这里开始</h2><p>每科都只有一个小目标；选你最想先试的那一张。</p></div><button class="text-button" type="button" data-route="projects">查看跨学科项目</button></div>
        <div class="subject-grid">${recommendations.map((scene) => sceneCard(scene)).join('')}</div>
        <div class="section-heading"><div><h2>三座学习岛</h2><p>不必按课本页码排队。学校进度、你的兴趣和已经收集到的证据会一起决定下一步。</p></div></div>
        <div class="subject-grid">${content.subjects.map((subject) => {
          const subjectScenes = content.scenes.filter((scene) => scene.subject === subject.id);
          const finished = subjectScenes.filter((scene) => sceneProgress(scene.id).completedAt).length;
          return `<button class="subject-card ${subject.color}" type="button" data-action="show-subject" data-subject="${subject.id}"><div class="card-content"><span class="card-kicker">${finished}/${subjectScenes.length} 个探索留下发现</span><h3>${escapeHTML(subject.childName)}</h3><p>${escapeHTML(subject.description)}</p></div><img class="card-art" src="${subject.art}" alt="" /></button>`;
        }).join('')}</div>
        <div class="section-heading"><div><h2>你的问题线</h2><p>问题不会被判对错；它们会变成下一次探索的入口。</p></div></div>
        ${renderQuestionLine(true)}
      </div>`;
  }

  function questionModes() {
    return [
      ['notice', '我发现……', '把看到的事留下来。'],
      ['guess', '我猜……', '先大胆猜一猜。'],
      ['why', '我想知道为什么……', '把一个为什么留下来。'],
      ['what-if', '如果……会怎样？', '试着想象后面会发生什么。']
    ];
  }

  function getQuestionDraft() {
    const fallbackSceneId = content.scenes[0]?.id;
    if (!state.questionDraft || !content.sceneById[state.questionDraft.sceneId]) {
      state.questionDraft = { sceneId: fallbackSceneId, mode: 'why', pieceIndex: 0, captureMode: 'build', drawingData: null };
    }
    const draft = state.questionDraft;
    const trail = content.inquiryTrailByScene[draft.sceneId];
    if (!trail) draft.sceneId = fallbackSceneId;
    const freshTrail = content.inquiryTrailByScene[draft.sceneId];
    if (!questionModes().some(([id]) => id === draft.mode)) draft.mode = 'why';
    if (!Number.isInteger(draft.pieceIndex) || draft.pieceIndex < 0 || draft.pieceIndex >= freshTrail.pieces.length) draft.pieceIndex = 0;
    if (!['build', 'draw', 'voice'].includes(draft.captureMode)) draft.captureMode = 'build';
    return draft;
  }

  function questionTextForDraft(draft = getQuestionDraft()) {
    const trail = content.inquiryTrailByScene[draft.sceneId];
    const piece = trail.pieces[draft.pieceIndex] || trail.pieces[0];
    if (draft.mode === 'notice') return `我发现……${piece}`;
    if (draft.mode === 'guess') return `我猜……${piece}`;
    if (draft.mode === 'what-if') return `如果……${piece}，会怎样？`;
    return `我想知道为什么……${piece}？`;
  }

  function renderQuestionItem(item, parent = false) {
    const scene = content.sceneById[item.sceneId];
    const subject = content.subjectById[item.subject];
    const tags = (item.tags || []).map((tag) => `<span class="question-tag">${escapeHTML(tag)}</span>`).join('');
    const status = item.status === 'following' ? '正在继续' : item.status === 'visited' ? '已经去试过' : '还想试一试';
    const drawing = item.drawingData ? `<img class="question-drawing" src="${item.drawingData}" alt="孩子留下的问题画" />` : '';
    const audio = item.audioSessionId && item.audioSessionId === runtime.questionRecordingId && runtime.questionRecordingUrl
      ? `<audio controls preload="metadata" src="${runtime.questionRecordingUrl}">这台电脑不能播放这段本地录音。</audio>`
      : item.audioSessionId ? '<small>这段录音只留在当次浏览器会话，刷新后不会保留。</small>' : '';
    const continueButton = !parent && scene && item.status !== 'visited'
      ? `<button class="text-button" type="button" data-action="question-followup" data-question-id="${item.id}">用这个问题继续</button>` : '';
    return `<article class="question-item"><div class="question-item-head"><b>${escapeHTML(subject?.name || '发现')} · ${escapeHTML(scene?.title || '自由问题')}</b><span>${status}</span></div><p>“${escapeHTML(item.text)}”</p>${tags ? `<div class="question-tags">${tags}</div>` : ''}${drawing}${audio}${continueButton}</article>`;
  }

  function renderQuestionLine(compact = false) {
    const latest = state.questions.slice(-3).reverse();
    return `
      <section class="question-line ${compact ? 'surface-card' : ''}">
        <div class="question-line-head"><div>${compact ? '<h2>你的问题线</h2><p>一个问题可以用图卡拼出来、画出来，或说给小通听。</p>' : '<h2>小通正在收集的问题</h2><p>问题不用写得很完整。你可以选、拼、画，或在家长同意后说出来。</p>'}</div><button class="button button-secondary small-button" type="button" data-route="question-workshop">做一个问题</button></div>
        <div class="question-feed">${latest.length ? latest.map((item) => renderQuestionItem(item)).join('') : '<div class="empty-state">还没有问题也没关系。选一张图卡，拼出“我发现”“我猜”或“我想知道为什么”。</div>'}</div>
      </section>`;
  }

  function renderQuestionVoicePanel(draft) {
    const recording = runtime.questionMediaRecorder?.state === 'recording';
    if (!state.profile.voicePermission) {
      return `<section class="question-capture-panel"><h3>说给小通听</h3><p>录音默认关闭。可以继续用图卡或画图；如果想录一段自己的问题，请请家长在家长入口里打开“允许本地录音”。</p><button class="button button-quiet small-button" type="button" data-action="open-parent">请家长帮忙</button></section>`;
    }
    return `<section class="question-capture-panel"><h3>说给小通听</h3><p>${recording ? '正在本机录音。想到哪里就说到哪里。' : '录音不会上传；停止后会在本次浏览器会话里留下可回听的问题。'}</p><div class="hero-actions">${recording ? '<button class="button button-yellow small-button" type="button" data-action="question-record-stop">停下来，留下这个问题</button>' : '<button class="button button-secondary small-button" type="button" data-action="question-record-start">开始本地录音</button>'}<button class="read-button" type="button" data-say="你可以说：我发现、我猜、我想知道为什么，或者如果会怎样。">听问题提示</button></div>${runtime.questionRecordingId ? `<p class="helper-text">刚才的问题已经放进发现册。你也可以继续再录一个。</p>` : ''}</section>`;
  }

  function renderQuestionWorkshop() {
    const draft = getQuestionDraft();
    const trail = content.inquiryTrailByScene[draft.sceneId];
    const scene = content.sceneById[draft.sceneId];
    const contexts = content.subjects.map((subject) => content.scenes.find((item) => item.subject === subject.id && !sceneProgress(item.id).completedAt) || content.scenes.find((item) => item.subject === subject.id));
    const preview = questionTextForDraft(draft);
    const buildPanel = `<section class="question-builder"><h2>先选一个开头</h2><div class="question-mode-grid">${questionModes().map(([id, label, note]) => `<button class="question-mode ${draft.mode === id ? 'selected' : ''}" type="button" data-action="question-mode" data-question-mode="${id}"><b>${label}</b><span>${note}</span></button>`).join('')}</div><h2>再拼一块你想问的事</h2><div class="question-piece-grid">${trail.pieces.map((piece, index) => `<button class="question-piece ${draft.pieceIndex === index ? 'selected' : ''}" type="button" data-action="question-piece" data-piece-index="${index}">${escapeHTML(piece)}</button>`).join('')}</div><div class="question-preview"><b>你做出来的问题</b><p>“${escapeHTML(preview)}”</p><button class="button button-primary" type="button" data-action="question-save">把它放进发现册</button></div></section>`;
    const drawPanel = `<section class="question-capture-panel"><h2>画一个想知道的东西</h2><p>不用画漂亮。画一件让你好奇的事、一个路线或一个故事开头。</p><canvas class="draw-canvas question-canvas" id="question-canvas" width="840" height="520" tabindex="0" aria-label="问题画板，使用鼠标、手指或触控笔画出你想问的东西；也可以切回图卡拼问题"></canvas><div class="hero-actions"><button class="button button-quiet small-button" type="button" data-action="question-draw-clear">重新画</button><button class="button button-primary small-button" type="button" data-action="question-draw-save">把问题画放进发现册</button><button class="button button-quiet small-button" type="button" data-action="question-capture" data-capture-mode="build">我想用图卡拼</button></div></section>`;
    const capture = draft.captureMode === 'draw' ? drawPanel : draft.captureMode === 'voice' ? renderQuestionVoicePanel(draft) : buildPanel;
    return `
      <div class="page-wrap question-workshop"><button class="back-button" type="button" data-route="discoveries">回到我的发现册</button><section class="mission-header"><img src="assets/buddy.svg" alt="" /><div><p class="eyebrow">小通的问题工坊</p><h1>把一个“为什么”做出来</h1><p>不需要打字。你可以拼图卡、画出来，或者在家长同意后说给小通听。</p></div></section><section class="mission-stage"><h2>这次想从哪里问起？</h2><div class="question-context-grid">${contexts.map((item) => `<button class="question-context ${item.id === scene.id ? 'selected' : ''}" type="button" data-action="question-context" data-scene-id="${item.id}"><b>${escapeHTML(content.subjectById[item.subject].name)}</b><span>${escapeHTML(item.title)}</span></button>`).join('')}</div><div class="question-capture-tabs"><button class="question-capture-tab ${draft.captureMode === 'build' ? 'selected' : ''}" type="button" data-action="question-capture" data-capture-mode="build">拼图卡</button><button class="question-capture-tab ${draft.captureMode === 'draw' ? 'selected' : ''}" type="button" data-action="question-capture" data-capture-mode="draw">画出来</button><button class="question-capture-tab ${draft.captureMode === 'voice' ? 'selected' : ''}" type="button" data-action="question-capture" data-capture-mode="voice">说出来</button></div>${capture}</section></div>`;
  }

  function renderSubject(subjectId) {
    const subject = content.subjectById[subjectId];
    if (!subject) return renderHome();
    const subjectScenes = content.scenes.filter((scene) => scene.subject === subjectId);
    return `
      <div class="page-wrap">
        <button class="back-button" type="button" data-route="home">回到今天探索</button>
        <section class="hero-card ${subject.color}" aria-label="${escapeHTML(subject.name)}学习岛">
          <div class="hero-copy"><p class="eyebrow">${escapeHTML(subject.name)} · ${escapeHTML(subject.childName)}</p><h1>${escapeHTML(subject.description)}</h1><p>从一个情景开始，先试一试，再把你的想法告诉小通。</p></div><img class="hero-illustration" src="${subject.art}" alt="" />
        </section>
        <div class="section-heading"><div><h2>选择一张任务卡</h2><p>每一张都有动手、表达、换故事和发现种子。</p></div></div>
        <div class="scene-grid">${subjectScenes.map((scene) => sceneCard(scene, true)).join('')}</div>
      </div>`;
  }

  function missionStepper(progress) {
    const labels = ['选任务', '先试试', '说想法', '换故事', '留发现'];
    const index = progress.stage + 1;
    return `<div class="mission-stepper" aria-label="本次学习的五步"><div class="step-chip done">${labels[0]}</div>${labels.slice(1).map((label, i) => `<div class="step-chip ${i + 1 === index ? 'active' : ''} ${i + 1 < index ? 'done' : ''}">${label}</div>`).join('')}</div>`;
  }

  function feedbackMarkup(progress) {
    return progress.feedback ? `<div class="activity-feedback ${progress.feedbackGood ? 'good' : 'gentle'}">${escapeHTML(progress.feedback)}</div>` : '';
  }

  function renderBalance(scene, progress) {
    const target = scene.activity.target;
    const rightBlocks = Array.from({ length: progress.rightCount }, () => '<img class="block-piece" src="assets/block.svg" alt="一块积木" />').join('');
    const leftBlocks = Array.from({ length: target }, () => '<img class="block-piece" src="assets/block.svg" alt="一块积木" />').join('');
    return `
      <div class="method-row" role="group" aria-label="选择一种开始方法">
        <button class="method-button ${progress.method === 'one' ? 'selected' : ''}" type="button" data-action="balance-method" data-method="one"><b>一个个放</b><span>慢一点，每一步都看见。</span></button>
        <button class="method-button ${progress.method === 'split' ? 'selected' : ''}" type="button" data-action="balance-method" data-method="split"><b>先想 3 和 2</b><span>把 5 看成两小群。</span></button>
        <button class="method-button ${progress.method === 'draw' ? 'selected' : ''}" type="button" data-action="balance-method" data-method="draw"><b>先画 5 个点</b><span>用图帮眼睛想一想。</span></button>
      </div>
      <div class="balance-stage" aria-label="天平操作区">
        <div class="balance-pan left"><h3>左边已经有 ${target} 块</h3>${leftBlocks}</div>
        <div class="balance-pan ${progress.rightCount === target ? 'balanced' : ''}" id="balance-drop-zone" tabindex="0" aria-label="右边天平盘，现在有${progress.rightCount}块积木"><h3>右边有 ${progress.rightCount} 块</h3>${rightBlocks || '<span>还没有放积木</span>'}</div>
        <div class="balance-actions">
          <button class="button button-primary small-button" type="button" data-action="balance-add" data-count="1">放 1 块</button>
          <button class="button button-secondary small-button" type="button" data-action="balance-add" data-count="3">先放 3 块</button>
          <button class="button button-secondary small-button" type="button" data-action="balance-add" data-count="2">再放 2 块</button>
          <button class="button button-quiet small-button" type="button" data-action="balance-guess" data-count="4">我猜 4 块</button>
          <button class="button button-quiet small-button" type="button" data-action="balance-hint">给我一个小提示</button>
        </div>
      </div>
      <div class="hint-line"><span class="status-pill">可以拖积木到右盘，也可以点按钮放。</span><button class="draggable-block" type="button" draggable="true" data-drag-block="1" aria-label="拖动一块积木到右边天平盘"><img src="assets/block.svg" alt="" />拖一块积木</button><button class="read-button" type="button" data-say="左边有五块积木。右边也要有几块，天平才会一样？">再听题目</button></div>
      ${feedbackMarkup(progress)}`;
  }

  function renderChoice(scene, progress) {
    const activity = scene.activity;
    return `
      ${activity.say ? `<div class="instruction-row"><button class="read-button" type="button" data-say="${escapeHTML(activity.say)}">按一下听声音</button><p>声音只在你主动按下时播放。</p></div>` : ''}
      <div class="choice-grid">${activity.options.map((option) => `<button class="choice-card ${progress.selectedAnswer === option.id ? 'selected' : ''}" type="button" data-action="choice-answer" data-answer-id="${option.id}"><b>${escapeHTML(option.label)}</b><span>${escapeHTML(option.detail)}</span></button>`).join('')}</div>
      ${feedbackMarkup(progress)}`;
  }

  function renderMatch(scene, progress) {
    const activity = scene.activity;
    return `
      <div class="instruction-row"><button class="read-button" type="button" data-say="${escapeHTML(activity.say || activity.prompt)}">先听声音卡</button><p>先点一张声音卡，再点一张图片词卡，把它们连成朋友。</p></div>
      <div class="match-grid"><section class="match-column"><h3>声音卡</h3>${activity.leftCards.map((card) => `<button class="match-card ${progress.selectedMatchLeft === card.id ? 'selected' : ''}" type="button" data-action="match-left" data-match-id="${card.id}" data-say="${escapeHTML(card.say || card.label)}"><b>${escapeHTML(card.label)}</b><span>点一下听，再选它。</span></button>`).join('')}</section><section class="match-column"><h3>图片词卡</h3>${activity.rightCards.map((card) => `<button class="match-card ${progress.selectedMatchRight === card.id ? 'selected' : ''}" type="button" data-action="match-right" data-match-id="${card.id}"><b>${escapeHTML(card.label)}</b><span>${escapeHTML(card.detail)}</span></button>`).join('')}</section></div>
      <p class="helper-text">连错也没关系。小通只会请你再听一遍、再换一张卡看看。</p>
      ${feedbackMarkup(progress)}`;
  }

  function renderSequence(scene, progress) {
    const activity = scene.activity;
    const order = progress.sequence || activity.cards.slice();
    return `
      <div class="sequence-wrap"><div class="sequence-list">${order.map((item, index) => `<button class="sequence-card ${progress.selectedSequenceIndex === index ? 'active' : ''}" type="button" data-action="sequence-select" data-index="${index}"><b>${index + 1}</b><span>${escapeHTML(item)}</span><small>选中后可上下移动</small></button>`).join('')}</div><div class="sequence-controls"><button type="button" data-action="sequence-move" data-direction="up">往上放</button><button type="button" data-action="sequence-move" data-direction="down">往下放</button><button type="button" data-action="sequence-confirm">我排好了</button></div></div>
      ${feedbackMarkup(progress)}`;
  }

  function renderBuild(scene, progress) {
    const activity = scene.activity;
    return `
      <div class="build-grid">${activity.pieces.map((piece) => `<button class="build-piece ${progress.selectedPieces.includes(piece) ? 'selected' : ''}" type="button" data-action="build-toggle" data-piece="${escapeHTML(piece)}"><b>${escapeHTML(piece)}</b><span>点一下选它；再点一次可以放回去。</span></button>`).join('')}</div>
      <div class="stage-footer"><span class="status-pill">你选择了 ${progress.selectedPieces.length || 0} 个材料</span><button class="button button-primary" type="button" data-action="build-confirm">我想这样搭</button></div>
      ${feedbackMarkup(progress)}`;
  }

  function renderAction(scene, progress) {
    const activity = scene.activity;
    return `
      <div class="instruction-row"><button class="read-button" type="button" data-say="${escapeHTML(activity.say)}">按一下听指令</button><p>听见后，用你觉得对的动作卡回应。</p></div>
      <div class="action-grid">${activity.actions.map((action) => `<button class="action-card ${progress.selectedAction === action ? 'selected' : ''}" type="button" data-action="action-answer" data-action-name="${escapeHTML(action)}"><b>${escapeHTML(action)}</b><span>选好后，小通会告诉你下一步。</span></button>`).join('')}</div>
      ${feedbackMarkup(progress)}`;
  }

  function renderDraw(scene, progress, context = 'explore') {
    return `
      <div class="draw-wrap"><canvas class="draw-canvas" id="drawing-canvas" width="840" height="520" tabindex="0" aria-label="自由画板，使用鼠标、手指或触控笔画图；不方便画时可选择想法卡"></canvas><aside class="draw-tools"><h3>画的时候想一想</h3><p>画完不需要漂亮。你可以圈一圈、画人物、画路线，或者画你想到的办法。</p><button class="button button-secondary small-button" type="button" data-action="draw-clear">重新画</button><button class="button button-primary small-button" type="button" data-action="draw-save" data-context="${context}">把这张画放进发现册</button><button class="button button-quiet small-button" type="button" data-action="draw-alternative" data-scene-id="${scene.id}" data-context="${context}">我想用想法卡说</button><button class="read-button" type="button" data-say="画完不需要漂亮。请用画告诉小通你想到的办法。">听一遍</button></aside></div>
      ${feedbackMarkup(progress)}`;
  }

  function renderExplore(scene, progress) {
    const kind = scene.activity.kind;
    const activityBody = {
      balance: renderBalance,
      choice: renderChoice,
      match: renderMatch,
      sequence: renderSequence,
      build: renderBuild,
      draw: renderDraw,
      action: renderAction
    }[kind](scene, progress);
    return `
      <h2>先用你的办法试一试</h2>
      <div class="instruction-row"><p>${escapeHTML(scene.activity.prompt || '慢慢试，小通会看见你的办法。')}</p><button class="read-button" type="button" data-say="${escapeHTML(scene.activity.prompt || scene.subtitle)}">听题目</button></div>
      <div class="activity-panel">${activityBody}</div>
      ${renderSupportLadder(scene, progress)}
      <div class="stage-footer"><button class="button button-quiet" type="button" data-route="home">先去别处看看</button><button class="button button-primary" type="button" data-action="mission-next" data-scene-id="${scene.id}">我试好了，想说说想法</button></div>`;
  }

  function renderSupportLadder(scene, progress) {
    const active = progress.supportLevel || 'wait';
    const supports = [
      ['wait', '小通先等等', '我想自己再看看。'],
      ['represent', '换一种看法', '用图、动作或实物再看一眼。'],
      ['clue', '给我小线索', '只给一小点，不说完整答案。'],
      ['together', '一起走一步', '我们只做下一小步。'],
      ['teach', '我来教小通', '把你的办法演、画或说出来。']
    ];
    return `<section class="support-ladder" aria-label="小通的陪伴办法"><div><h3>想换一种陪伴吗？</h3><p>不用着急。选你现在最需要的一小步。</p></div><div class="support-options">${supports.map(([id, label, note]) => `<button class="support-option ${active === id ? 'selected' : ''}" type="button" data-action="support-step" data-scene-id="${scene.id}" data-support="${id}"><b>${label}</b><span>${note}</span></button>`).join('')}</div></section>`;
  }

  function renderExpression(scene, progress) {
    const sentences = [
      '我先看一看，再慢慢试。',
      '我发现可以把它分成两小群。',
      '我想换一张图再证明一次。'
    ];
    return `
      <h2>把你的想法告诉小通</h2><p>你不一定要打字。选一种你舒服的办法就好。</p>
      <div class="expression-grid">
        <button class="expression-card ${progress.expressionMode === 'cards' ? 'selected' : ''}" type="button" data-action="expression-mode" data-mode="cards"><h3>选一句想法卡</h3><p>用一句话说出你刚才怎样做。</p></button>
        <button class="expression-card ${progress.expressionMode === 'voice' ? 'selected' : ''}" type="button" data-action="expression-mode" data-mode="voice"><h3>说给小通听</h3><p>只在本机录音，不会自动上传。</p></button>
        <button class="expression-card ${progress.expressionMode === 'draw' ? 'selected' : ''}" type="button" data-action="expression-mode" data-mode="draw"><h3>再画一张图</h3><p>画出你的办法、故事或动作。</p></button>
      </div>
      ${progress.expressionMode === 'cards' ? `<div class="sentence-options">${sentences.map((sentence) => `<button class="sentence-option ${progress.selectedSentence === sentence ? 'selected' : ''}" type="button" data-action="sentence-choose" data-sentence="${escapeHTML(sentence)}">${escapeHTML(sentence)}</button>`).join('')}</div>` : ''}
      ${progress.expressionMode === 'voice' ? renderVoicePanel(scene, progress) : ''}
      ${progress.expressionMode === 'draw' ? renderDraw(scene, progress, 'expression') : ''}
      ${renderRolePlay(scene, progress)}
      ${renderOperationReplay(scene, progress)}
      ${feedbackMarkup(progress)}
      <div class="stage-footer"><button class="button button-quiet" type="button" data-action="mission-prev" data-scene-id="${scene.id}">回到刚才的任务</button><button class="button button-primary" type="button" data-action="expression-confirm" data-scene-id="${scene.id}">我已经表达了，换个故事试试</button></div>`;
  }

  function renderVoicePanel(scene, progress) {
    const recording = runtime.mediaRecorder && runtime.mediaRecorder.state === 'recording';
    const replay = progress.recorded && runtime.recordingUrl && runtime.recordingSceneId === scene.id
      ? `<div class="recording-replay"><b>回听我刚才说的话</b><audio controls preload="metadata" src="${runtime.recordingUrl}">这台电脑不能播放这段录音。</audio><small>录音只留在这次浏览器会话；刷新或删除本机数据后不会保留。</small></div>`
      : '';
    return `<div class="recording-status"><b>语音只在你按下录音后才会使用麦克风。</b><p>${recording ? '正在录音。说完后按“停下来”。' : progress.recorded ? '已经留下本次会话的本地录音。你也可以不用录音，改用想法卡或画图。' : '如果电脑不支持录音，也可以直接用想法卡或画图。'}</p><div class="hero-actions">${recording ? '<button class="button button-yellow small-button" type="button" data-action="record-stop">停下来</button>' : '<button class="button button-secondary small-button" type="button" data-action="record-start">开始本地录音</button>'}<button class="read-button" type="button" data-say="请告诉小通，你刚才是怎样想到的。">听提示</button></div>${replay}</div>`;
  }

  function renderRolePlay(scene, progress) {
    if (!scene.roleCards?.length) return '';
    return `<section class="role-play"><div><h3>演给小通看</h3><p>选一个角色，站起来演一句、做一个动作，或者让小通听你讲。</p></div><div class="role-card-grid">${scene.roleCards.map((role) => `<button class="role-card ${progress.roleChoice === role ? 'selected' : ''}" type="button" data-action="role-select" data-scene-id="${scene.id}" data-role="${escapeHTML(role)}">${escapeHTML(role)}</button>`).join('')}</div><button class="button button-secondary small-button" type="button" data-action="role-confirm" data-scene-id="${scene.id}">我演完了，告诉小通</button></section>`;
  }

  function renderOperationReplay(scene, progress) {
    const operations = progress.operationLog || [];
    const canReplay = operations.length || progress.drawingData || (progress.recorded && runtime.recordingSceneId === scene.id && runtime.recordingUrl);
    if (!canReplay) return '';
    if (!progress.showReplay) return `<button class="text-button operation-replay-trigger" type="button" data-action="toggle-operation-replay" data-scene-id="${scene.id}">回看我刚才的办法</button>`;
    return `<section class="operation-replay" aria-label="孩子刚才的操作回看"><div class="operation-replay-head"><div><h3>回看我刚才的办法</h3><p>不是重做一遍，只是看看你是怎么走到这里的。</p></div><button class="text-button" type="button" data-action="toggle-operation-replay" data-scene-id="${scene.id}">收起来</button></div>${operations.length ? `<ol>${operations.map((item) => `<li>${escapeHTML(item.description)}</li>`).join('')}</ol>` : ''}${progress.drawingData ? `<img class="replay-drawing" src="${progress.drawingData}" alt="孩子刚才留下的探索画" />` : ''}</section>`;
  }

  function renderTransfer(scene, progress) {
    const activity = scene.activity;
    return `
      <h2>换一个故事看看</h2><p>这不是下一道题。我们只是想知道：换了地方，你还会不会用刚才的想法？</p>
      <div class="transfer-card"><h3>${escapeHTML(activity.transfer)}</h3><div class="transfer-options">${activity.transferOptions.map((option) => `<button class="transfer-option ${progress.transferAnswer === option ? 'selected' : ''}" type="button" data-action="transfer-answer" data-scene-id="${scene.id}" data-answer="${escapeHTML(option)}"><b>${escapeHTML(option)}</b><span>选一个你愿意先试的办法。</span></button>`).join('')}</div></div>
      ${feedbackMarkup(progress)}
      <div class="stage-footer"><button class="button button-quiet" type="button" data-action="mission-prev" data-scene-id="${scene.id}">回去再讲讲</button><button class="button button-primary" type="button" data-action="mission-next" data-scene-id="${scene.id}">我换故事试过了</button></div>`;
  }

  function renderSeed(scene) {
    const starters = [
      `我发现…… ${scene.seed}`,
      `我猜…… ${scene.seed}`,
      `我想知道为什么…… ${scene.seed}`,
      `如果……会怎样？ ${scene.seed}`
    ];
    return `
      <h2>留下一颗发现种子</h2><p>选一句最像你的想法的话。它会留在发现册里，成为下一次任务的入口。</p>
      <div class="seed-grid"><section class="seed-card"><h3>我想留下一个问题</h3><p>问题不用写得很完整。可以选一句，也可以用图卡拼、画出来或说给小通听。</p><div class="question-starters">${starters.map((starter) => `<button class="question-starter" type="button" data-action="seed-question" data-scene-id="${scene.id}" data-question="${escapeHTML(starter)}">${escapeHTML(starter)}</button>`).join('')}</div><button class="button button-secondary small-button" type="button" data-action="open-question-workshop" data-scene-id="${scene.id}">我想自己做一个问题</button></section><section class="offline-card"><h3>离开屏幕试一试</h3><p>${escapeHTML(scene.realWorld)}</p><button class="button button-green small-button" type="button" data-action="seed-offline" data-scene-id="${scene.id}">我想去试试</button><p class="sr-only">选择后不会要求上传照片。</p></section></div>
      <div class="stage-footer"><button class="button button-quiet" type="button" data-action="mission-prev" data-scene-id="${scene.id}">回去再看看</button><button class="button button-secondary" type="button" data-route="discoveries">打开我的发现册</button></div>`;
  }

  function renderMission(sceneId) {
    const scene = content.sceneById[sceneId];
    if (!scene) return renderHome();
    startSession();
    const progress = sceneProgress(scene.id);
    const subject = content.subjectById[scene.subject];
    const stageRenderer = [renderExplore, renderExpression, renderTransfer, renderSeed][Math.min(progress.stage, 3)];
    return `
      <div class="page-wrap mission-shell"><div class="mission-topline"><button class="back-button" type="button" data-route="home">回到今天探索</button><span class="status-pill">${escapeHTML(subject.name)} · ${escapeHTML(sceneStatus(scene.id).label)}</span></div>
        <section class="mission-header"><img src="${scene.art}" alt="" /><div><p class="eyebrow">${escapeHTML(subject.childName)}</p><h1>${escapeHTML(scene.title)}</h1><p>${escapeHTML(scene.subtitle)}</p></div><button class="button button-quiet small-button" type="button" data-action="toggle-pause">${state.session.paused ? '继续' : '暂停一下'}</button></section>
        ${missionStepper(progress)}
        <section class="mission-stage" aria-live="polite">${stageRenderer(scene, progress)}</section>
      </div>`;
  }

  function renderReview(sceneId) {
    const scene = content.sceneById[sceneId];
    const review = state.reviews.find((item) => item.sceneId === sceneId && item.status === 'waiting');
    if (!scene || !review) return renderDiscoveries();
    const days = Math.ceil((review.dueAt - Date.now()) / DAY);
    if (days > 0) {
      return `<div class="page-wrap"><section class="mission-stage"><p class="eyebrow">隔几天再见面</p><h1>这张回访卡还在等一等</h1><p>大约 ${days} 天后，小通会换一个故事问你同一个想法。现在可以去做别的小探索。</p><button class="button button-primary" type="button" data-route="discoveries">回到发现册</button></section></div>`;
    }
    return `
      <div class="page-wrap mission-shell"><div class="mission-topline"><button class="back-button" type="button" data-route="discoveries">回到发现册</button><span class="status-pill">隔几天，再换个故事</span></div>
        <section class="mission-header"><img src="${scene.art}" alt="" /><div><p class="eyebrow">不是复习测验</p><h1>还记得你自己的办法吗？</h1><p>隔了几天，小通把它放进一个新故事里。慢慢想，你也可以选“我还想再看看”。</p></div></section>
        <section class="mission-stage"><h2>${escapeHTML(scene.activity.transfer)}</h2><div class="transfer-options">${scene.activity.transferOptions.map((option) => `<button class="transfer-option" type="button" data-action="review-answer" data-scene-id="${scene.id}" data-answer="${escapeHTML(option)}"><b>${escapeHTML(option)}</b><span>这是我的想法</span></button>`).join('')}<button class="transfer-option" type="button" data-action="review-answer" data-scene-id="${scene.id}" data-answer="我还想再看看"><b>我还想再看看</b><span>这也是很有用的回答。</span></button></div><p class="helper-text">小通不会因为这一次就说“你已经掌握”。它只会把这条新证据和你之前的操作、图或语言放在一起看。</p></section>
      </div>`;
  }

  function renderDiscoveries() {
    const groups = content.subjects.map((subject) => ({ subject, concepts: content.concepts.filter((concept) => concept.subject === subject.id) }));
    const waitingReviews = state.reviews.filter((review) => review.status === 'waiting');
    return `
      <div class="page-wrap"><div class="section-heading"><div><h2>我的发现册</h2><p>这里不写分数。它只记得：你试过什么、讲过什么、还想问什么。</p></div><button class="button button-secondary small-button" type="button" data-route="home">再选一个任务</button></div>
        <div class="discoveries-layout"><section class="discovery-map"><h1>我正在长出的想法</h1><p>颜色是路标，不是好坏。每条路都可以慢慢走。</p><div class="concept-list">${groups.map(({subject, concepts}) => concepts.map((concept) => { const status = conceptStatus(concept.id); return `<article class="concept-card ${status.code}"><i class="concept-dot" aria-hidden="true"></i><div><b>${escapeHTML(concept.childLabel)}</b><span>${escapeHTML(status.detail)}</span></div><small>${escapeHTML(status.label)}</small></article>`; }).join('')).join('')}</div></section>
          <aside>${renderQuestionLine(false)}${renderEnglishTreasureBook()}${waitingReviews.length ? `<section class="question-line"><h2>过几天再见面</h2><p>这些不是作业。等时间到了，小通会换一个故事问你。</p><div class="question-feed">${waitingReviews.map((review) => { const scene = content.sceneById[review.sceneId]; const days = Math.max(0, Math.ceil((review.dueAt - Date.now()) / DAY)); return `<article class="question-item"><b>${escapeHTML(scene.title)}</b><p>${days > 0 ? `大约 ${days} 天后再来看看` : '已经可以回来换一个故事试试'}</p>${days === 0 ? `<button class="text-button" type="button" data-route="review/${scene.id}">打开回访卡</button>` : ''}</article>`; }).join('')}</div></section>` : ''}</aside>
        </div></div>`;
  }

  function renderEnglishTreasureBook() {
    const treasures = state.treasures.filter((item) => item.subject === 'english');
    return `<section class="treasure-book"><h2>英语宝物册</h2><p>只有在新故事里真的用过的词，才会来到这里。</p><div class="treasure-list">${treasures.length ? treasures.map((item) => `<article class="treasure-item"><b>${escapeHTML(item.word)}</b><span>${escapeHTML(item.meaning)}</span><small>${escapeHTML(item.note)}</small></article>`).join('') : '<div class="empty-state">先去听、说、做一个英语任务。换个故事还能用上时，宝物就会出现。</div>'}</div></section>`;
  }

  function projectProgress(project) {
    return project.steps.filter((step) => sceneProgress(step.sceneId).completedAt).length;
  }

  function renderProjects() {
    return `
      <div class="page-wrap"><div class="section-heading"><div><h2>一起做个大项目</h2><p>一个问题会穿过语文、数学和英语。先做一小步，也能让世界发生变化。</p></div><button class="button button-secondary small-button" type="button" data-route="home">回到今天探索</button></div>
      <div class="project-grid">${content.projects.map((project) => { const completed = projectProgress(project); const next = project.steps.find((step) => !sceneProgress(step.sceneId).completedAt) || project.steps[0]; return `<button class="project-card ${project.color}" type="button" data-action="project-start" data-project-id="${project.id}"><div class="card-content"><span class="card-kicker">已经完成 ${completed}/${project.steps.length} 步</span><h3>${escapeHTML(project.title)}</h3><p>${escapeHTML(project.description)}</p><div class="project-steps">${project.steps.map((step) => `<span class="project-step"><i></i>${escapeHTML(step.label)}</span>`).join('')}</div></div><img class="card-art" src="${project.art}" alt="" /></button>`; }).join('')}</div>
      <div class="empty-state" style="margin-top:22px"><b>项目不是考试。</b> 做完其中一步后，可以先去别的地方探索；下一次再回来继续。</div></div>`;
  }

  function latestEvidence(limit = 8) {
    return state.evidence.slice(-limit).reverse();
  }

  function getUnknowns() {
    return content.concepts.map((concept) => ({ concept, status: conceptStatus(concept.id) })).filter(({status}) => status.code !== 'stable').slice(0, 7);
  }

  function nextRecommendation() {
    const dueReview = state.reviews.find((review) => review.status === 'waiting' && review.dueAt <= Date.now());
    if (dueReview) {
      const scene = content.sceneById[dueReview.sceneId];
      return { title: `打开「${scene.title}」回访卡`, reason: '这不是测验：隔几天后换一个故事，能帮助我们看见这个办法是否还能出现。' };
    }
    const childQuestion = state.questions.slice().reverse().find((item) => item.status !== 'visited' && content.inquiryTrailByScene[item.sceneId]);
    if (childQuestion) {
      const trail = content.inquiryTrailByScene[childQuestion.sceneId];
      const nextScene = [...trail.nextSceneIds, childQuestion.sceneId].map((sceneId) => content.sceneById[sceneId]).find(Boolean);
      if (nextScene) {
        return { title: nextScene.title, reason: `这只是下一步假设：孩子留下了“${childQuestion.text}”。先换到相关的小故事继续看，不把问题当作答题任务。` };
      }
    }
    const interests = state.profile.interestThemes || [];
    const schoolWords = String(state.profile.schoolTopic || '').replace(/\s+/g, '');
    const candidates = content.scenes.map((scene) => {
      const progress = sceneProgress(scene.id);
      const concepts = scene.concepts.map((id) => ({ concept: content.concepts.find((item) => item.id === id), status: conceptStatus(id) }));
      const unfinished = !progress.completedAt;
      const needsEvidence = concepts.filter(({ status }) => !['stable', 'transferring'].includes(status.code)).length;
      const missingPrereq = concepts.some(({ concept }) => concept.prereqs.some((id) => conceptStatus(id).code === 'unobserved'));
      const sceneWords = `${scene.title} ${scene.subtitle} ${scene.realWorld}`;
      const matchesInterest = interests.some((theme) => sceneWords.includes(theme));
      const matchesSchool = schoolWords && sceneWords.replace(/\s+/g, '').includes(schoolWords);
      const score = (unfinished ? 8 : 0) + needsEvidence * 3 + (matchesInterest ? 4 : 0) + (matchesSchool ? 5 : 0) - (missingPrereq ? 1 : 0);
      return { scene, concepts, missingPrereq, matchesInterest, matchesSchool, score };
    }).sort((a, b) => b.score - a.score);
    const pick = candidates[0];
    if (!pick) return { title: '换一个孩子的问题继续探索', reason: '已经留有发现的任务，可以从问题线中挑一个再深入。' };
    const subject = content.subjectById[pick.scene.subject];
    const reasonBits = [];
    if (pick.matchesSchool) reasonBits.push('和家长写下的学校主题有关');
    if (pick.matchesInterest) reasonBits.push('贴近孩子现在喜欢的主题');
    if (pick.missingPrereq) reasonBits.push('前面的概念还没被观察到，但这不是禁止进入的门槛，可以先从这个真实场景试起');
    if (!reasonBits.length) reasonBits.push(`还缺少关于“${subject.name}·${pick.scene.subtitle}”的真实互动证据`);
    return { title: pick.scene.title, reason: `这只是下一步假设：${reasonBits.join('；')}。系统不会据此给孩子贴标签。` };
  }

  function renderParent() {
    if (!state.parentUnlocked) {
      setTimeout(openParentGate, 0);
      return '<div class="page-wrap"><div class="empty-state">正在打开家长入口……</div></div>';
    }
    const evidence = latestEvidence();
    const unknowns = getUnknowns();
    const recommended = nextRecommendation();
    const uniqueConcepts = new Set(state.evidence.flatMap((item) => item.concepts)).size;
    const themeOptions = ['动物', '故事', '搭建', '音乐', '运动', '自然'];
    return `
      <div class="page-wrap parent-shell"><div class="parent-head"><div><h1>这段时间，孩子打开了哪些理解通道？</h1><p>只展示真实交互留下的证据、仍不确定的地方与下一步理由。没有总分，也不把“尚未观察”当成落后。</p></div><button class="button button-secondary small-button" type="button" data-route="home">回到儿童模式</button></div>
      <div class="metric-grid"><article class="metric"><strong>${state.evidence.length}</strong><b>条真实互动证据</b><span>来源于操作、图、语言、动作或迁移。</span></article><article class="metric"><strong>${uniqueConcepts}</strong><b>个概念被观察到</b><span>被观察到不等于已经掌握。</span></article><article class="metric"><strong>${state.questions.length}</strong><b>个孩子的问题</b><span>问题会成为后续任务线索。</span></article><article class="metric"><strong>${state.reviews.filter((review) => review.status === 'waiting').length}</strong><b>张延迟回访卡</b><span>会在 3 天后换故事再看。</span></article></div>
      <div class="parent-grid"><section class="parent-section"><h2>发生了什么</h2><p>每条记录都能追溯到一次具体交互，而不是一个汇总分数。</p><div class="evidence-list">${evidence.length ? evidence.map((item) => { const scene = content.sceneById[item.sceneId]; return `<article class="evidence-row"><div class="evidence-meta"><span>${escapeHTML(content.subjectById[item.subject].name)}</span><span>${escapeHTML(scene.title)}</span><span>${escapeHTML(item.phase)}</span><span>${item.prompted ? '有提示' : '独立尝试'}</span></div><p>${escapeHTML(item.summary || item.note)}</p><small>仍不确定：${escapeHTML(item.unknown || '需要更多场景观察。')} · 建议：${escapeHTML(item.recommendation || '换一种表示再试一次。')}</small></article>`; }).join('') : '<div class="empty-state">还没有互动证据。孩子完成第一场探索后，这里才会出现记录。</div>'}</div></section>
      <aside class="parent-section"><h2>我们还不知道什么</h2><p>未知不是失败，而是下一次验证的方向。</p><div class="unknown-list">${unknowns.map(({concept, status}) => `<article class="unknown-row"><b>${escapeHTML(concept.label)}</b><span>${escapeHTML(status.detail)}</span></article>`).join('')}</div><div class="next-step-card"><b>系统的下一步假设：${escapeHTML(recommended.title)}</b><p>${escapeHTML(recommended.reason)}</p></div></aside></div>
      <div class="parent-grid" style="margin-top:20px"><section class="parent-section"><h2>家长设置</h2><p>这些设置只保存在本机。语音与图片不会默认上传。</p><div class="settings-grid"><label>教材/方向<select data-setting="textbook"><option ${state.profile.textbook === '按兴趣探索' ? 'selected' : ''}>按兴趣探索</option><option ${state.profile.textbook === '人教版' ? 'selected' : ''}>人教版</option><option ${state.profile.textbook === '部编版' ? 'selected' : ''}>部编版</option><option ${state.profile.textbook === '其他教材' ? 'selected' : ''}>其他教材</option></select></label><label>学校正在学什么<input data-setting="schoolTopic" value="${escapeHTML(state.profile.schoolTopic)}" placeholder="例如：10以内加减" /></label><label>每次屏幕探索分钟数<select data-setting="screenMinutes"><option value="12" ${state.profile.screenMinutes === 12 ? 'selected' : ''}>12 分钟</option><option value="15" ${state.profile.screenMinutes === 15 ? 'selected' : ''}>15 分钟</option><option value="18" ${state.profile.screenMinutes === 18 ? 'selected' : ''}>18 分钟</option></select></label><label>孩子名字<input data-setting="name" value="${escapeHTML(state.profile.name)}" /></label></div><div class="interest-settings"><b>孩子最近想探索什么</b><p>这些只是下一步推荐的线索，不会锁住学习路径。</p><div class="interest-chips">${themeOptions.map((theme) => `<button class="interest-chip ${(state.profile.interestThemes || []).includes(theme) ? 'selected' : ''}" type="button" data-action="toggle-interest" data-interest="${theme}" aria-pressed="${(state.profile.interestThemes || []).includes(theme)}">${theme}</button>`).join('')}</div></div><div class="switch-row"><label><input type="checkbox" data-setting="voicePermission" ${state.profile.voicePermission ? 'checked' : ''} /> 允许孩子主动使用本地录音</label><span>默认关闭</span></div><div class="switch-row"><label><input type="checkbox" data-setting="reducedMotion" ${state.profile.reducedMotion ? 'checked' : ''} /> 减少动效</label><span>更舒适地看屏幕</span></div><button class="text-button" type="button" data-action="open-privacy">查看本地数据与隐私说明</button><div class="danger-zone"><button class="button danger-button small-button" type="button" data-action="delete-data">删除这台电脑上的全部学习数据</button></div></section>
      <section class="parent-section"><h2>孩子的问题线</h2><p>不要急着给答案。这里会保留问题来自哪里、关心什么，以及后来有没有被带进新的场景。</p><div class="question-feed">${state.questions.length ? state.questions.slice(-8).reverse().map((item) => renderQuestionItem(item, true)).join('') : '<div class="empty-state">暂时没有保存的问题。孩子可以在任务最后选问题卡，也可以在问题工坊里拼、画或说出一个问题。</div>'}</div></section></div>
      </div>`;
  }

  function renderBreakBanner() {
    if (!state.session.breakOpen) return '';
    return `<aside class="break-banner" aria-live="polite"><b>小通提醒：眼睛和身体该换个地方啦。</b><p>请看看远处、站起来走几步，或者去完成一个离屏小挑战。回来后会从这里继续。</p><div class="break-actions"><button class="button button-green small-button" type="button" data-action="take-break">我去活动一下</button><button class="button button-quiet small-button" type="button" data-action="close-break">我已经准备好了</button></div></aside>`;
  }

  function render() {
    const route = parseRoute();
    document.body.classList.toggle('reduced-motion', state.profile.reducedMotion);
    const page = route.name === 'home' ? renderHome()
      : route.name === 'subject' ? renderSubject(route.subjectId)
      : route.name === 'discoveries' ? renderDiscoveries()
      : route.name === 'projects' ? renderProjects()
      : route.name === 'parent' ? renderParent()
      : route.name === 'question-workshop' ? renderQuestionWorkshop()
      : route.name === 'mission' ? renderMission(route.sceneId)
      : route.name === 'review' ? renderReview(route.sceneId)
      : renderHome();
    app.innerHTML = `<div class="app-shell">${renderHeader(route)}<main id="main-content" class="page-main">${page}</main>${renderBreakBanner()}<div class="toast" id="toast" role="status"></div></div>`;
    updateSessionUI();
    const activeScene = route.name === 'mission' ? content.sceneById[route.sceneId] : null;
    if (activeScene && (activeScene.activity.kind === 'draw' || (sceneProgress(activeScene.id).stage === 1 && sceneProgress(activeScene.id).expressionMode === 'draw'))) setupCanvas(activeScene.id);
    if (route.name === 'question-workshop' && getQuestionDraft().captureMode === 'draw') setupQuestionCanvas();
  }

  function setFeedback(sceneId, message, good = false) {
    const progress = sceneProgress(sceneId);
    progress.feedback = message;
    progress.feedbackGood = good;
    saveState();
  }

  function selectBalanceMethod(sceneId, method) {
    const scene = content.sceneById[sceneId];
    const progress = sceneProgress(sceneId);
    progress.method = method;
    recordOperation(sceneId, `选择“${method === 'one' ? '一个个放' : method === 'split' ? '先想 3 和 2' : '先画 5 个点'}”的办法。`);
    const messages = {
      one: '一个一个放完全是好办法。每放一块，都可以看看两边差多少。',
      split: '把 5 想成 3 和 2 是一种邀请。你也可以随时回到一个个放。',
      draw: '好，先用图把看到的数量留住。画完后再看看右边要有几块。'
    };
    setFeedback(sceneId, messages[method]);
    if (method === 'draw') {
      progress.expressionMode = 'draw';
    }
    saveState();
    render();
  }

  function addBalance(sceneId, amount, isGuess = false) {
    const scene = content.sceneById[sceneId];
    const progress = sceneProgress(sceneId);
    const target = scene.activity.target;
    progress.rightCount = Math.min(target + 2, progress.rightCount + amount);
    recordOperation(sceneId, `${isGuess ? '先猜一猜并' : ''}在右边放 ${amount} 块，现在右边有 ${progress.rightCount} 块。`);
    if (progress.rightCount === target) {
      completeExplore(scene, { representation: progress.method === 'draw' ? '图' : '实物', note: `孩子用“${progress.method === 'split' ? '3 和 2 的分组' : progress.method === 'draw' ? '画图' : '逐一放置'}”让两边都出现 ${target} 块。`, prompted: progress.hints > 0 });
      setFeedback(sceneId, '天平安静下来了。小通不急着说“你会了”，更想知道：你是怎样知道两边一样的？', true);
    } else if (progress.rightCount > target) {
      addEvidence({ scene, phase: 'explore', representation: '实物', prompted: true, note: `右边放到 ${progress.rightCount} 块，孩子正在比较两边。`, outcome: '需要再看', misconception: '可能把平衡理解为放得更多。' });
      setFeedback(sceneId, `右边现在有 ${progress.rightCount} 块。天平没有责怪你，它只是邀请你数一数：左边和右边各有几块？`);
    } else {
      if (isGuess || progress.rightCount === 4) addEvidence({ scene, phase: 'explore', representation: '实物', prompted: true, note: '孩子先猜右边放 4 块。', outcome: '需要再看', misconception: '可能还没有逐一比较两边数量。' });
      setFeedback(sceneId, `右边有 ${progress.rightCount} 块。你发现还差几块了吗？`);
    }
    saveState();
    render();
  }

  function useBalanceHint(sceneId) {
    const progress = sceneProgress(sceneId);
    progress.hints += 1;
    recordOperation(sceneId, '请小通给了一个小提示。');
    setFeedback(sceneId, '小提示：不用急着找“更快”的办法。把左边的积木一块一块数出来，再看看右边是不是也有同样多。');
    saveState();
    render();
  }

  function supportMessage(scene, support) {
    const nextStep = {
      balance: '先把一边的一块，和另一边的一块配成朋友，再看看有没有落单的。',
      choice: '先把每张卡最明显的图或第一个声音慢慢看、听一遍。',
      match: '先只听一张声音卡，再找一张你觉得最像它的图片词卡。',
      sequence: '先找一张你觉得“故事刚开始”时才会出现的卡。',
      build: '先问一问：这个地方最需要遮挡、支撑，还是让人走过去？',
      draw: '先只画一个人、一个物品或一个地点，不用一下画完整故事。',
      action: '先听一遍，再用身体做出你听到的动作。'
    }[scene.activity.kind] || '先说出你最先注意到的一点。';
    if (support === 'wait') return '好，小通先不说答案。你可以自己再看一会儿；想换一种陪伴时再按这里。';
    if (support === 'represent') return `我们换一种看法：${nextStep}`;
    if (support === 'clue') return `只给一小点线索：${nextStep}`;
    if (support === 'together') return `我们只走下一步，不做完整答案：${nextStep}`;
    return '太好了，小通想跟着你学。先试一试，等你走到“说想法”时，可以用动作、画或角色把你的办法教给小通。';
  }

  function useSupport(sceneId, support) {
    const scene = content.sceneById[sceneId];
    if (!scene) return;
    const progress = sceneProgress(sceneId);
    const validSupports = ['wait', 'represent', 'clue', 'together', 'teach'];
    if (!validSupports.includes(support)) return;
    progress.supportLevel = support;
    if (support === 'clue' || support === 'together') progress.hints += 1;
    recordOperation(sceneId, `选择“小通${support === 'wait' ? '先等等' : support === 'represent' ? '换一种看法' : support === 'clue' ? '给一小线索' : support === 'together' ? '一起走一步' : '跟我学'}”的陪伴方式。`);
    const message = supportMessage(scene, support);
    setFeedback(sceneId, message, support === 'wait' || support === 'teach');
    saveState();
    render();
  }

  function chooseOption(sceneId, answerId) {
    const scene = content.sceneById[sceneId];
    const progress = sceneProgress(sceneId);
    const option = scene.activity.options.find((item) => item.id === answerId);
    if (!option) return;
    progress.selectedAnswer = answerId;
    recordOperation(sceneId, `选择“${option.label}”。`);
    if (option.correct) {
      completeExplore(scene, { representation: scene.subject === 'english' || scene.id === 'chinese-sound-lab' ? '声音' : '图', note: `孩子选择“${option.label}”。`, prompted: progress.hints > 0 });
      setFeedback(sceneId, `你选了“${option.label}”。小通想听你说说：你是从哪里发现它的？`, true);
    } else {
      addEvidence({ scene, phase: 'explore', representation: scene.subject === 'english' || scene.id === 'chinese-sound-lab' ? '声音' : '图', prompted: true, note: `孩子选择“${option.label}”。`, outcome: '需要再看', misconception: option.misconception || '这个场景下的想法还不确定。' });
      setFeedback(sceneId, option.misconception || '这个选择很有意思。我们再用图或声音慢慢看看。');
    }
    saveState();
    render();
  }

  function chooseMatch(sceneId, side, cardId) {
    const scene = content.sceneById[sceneId];
    if (!scene || scene.activity.kind !== 'match') return;
    const progress = sceneProgress(sceneId);
    const activity = scene.activity;
    if (side === 'left' && !activity.leftCards.some((card) => card.id === cardId)) return;
    if (side === 'right' && !activity.rightCards.some((card) => card.id === cardId)) return;
    if (side === 'left') progress.selectedMatchLeft = cardId;
    else progress.selectedMatchRight = cardId;
    recordOperation(sceneId, `把${side === 'left' ? '声音' : '图片词'}卡“${cardId}”放到连线桌上。`);
    if (progress.selectedMatchLeft && progress.selectedMatchRight) {
      const right = activity.rightCards.find((card) => card.id === progress.selectedMatchRight);
      const pairKey = `${progress.selectedMatchLeft}|${progress.selectedMatchRight}`;
      if (right?.correctWith === progress.selectedMatchLeft) {
        completeExplore(scene, { representation: '声音', note: `孩子把声音卡“${progress.selectedMatchLeft}”和图片词卡“${right.label}”连成朋友。`, prompted: progress.hints > 0 });
        setFeedback(sceneId, '这两张卡成朋友啦。小通想听你说说：你是从声音、图，还是自己的记忆里发现的？', true);
      } else if (progress.lastMatchKey !== pairKey) {
        progress.lastMatchKey = pairKey;
        addEvidence({ scene, phase: 'explore', representation: '声音', prompted: true, note: `孩子尝试把“${progress.selectedMatchLeft}”连到“${right?.label || '一张图片词卡'}”。`, outcome: '需要再看', misconception: right?.misconception || '声音和图片词的连接还需要慢一点再听一次。' });
        setFeedback(sceneId, right?.misconception || '这次连线很有意思。我们只重听这一张声音卡，再看看图卡。');
      }
    } else {
      setFeedback(sceneId, '现在再选另一边的一张卡，把它们连成朋友。');
    }
    saveState();
    render();
  }

  function selectSequence(sceneId, index) {
    const progress = sceneProgress(sceneId);
    progress.selectedSequenceIndex = Number(index);
    recordOperation(sceneId, `选中了第 ${Number(index) + 1} 张顺序卡。`);
    saveState();
    render();
  }

  function moveSequence(sceneId, direction) {
    const scene = content.sceneById[sceneId];
    const progress = sceneProgress(sceneId);
    const list = progress.sequence || scene.activity.cards.slice();
    const selected = progress.selectedSequenceIndex;
    if (selected === undefined || selected === null) {
      announce('先点一张故事卡，再决定往上还是往下放。');
      return;
    }
    const next = direction === 'up' ? selected - 1 : selected + 1;
    if (next < 0 || next >= list.length) {
      announce('这张卡已经在最合适的一端了。');
      return;
    }
    [list[selected], list[next]] = [list[next], list[selected]];
    progress.sequence = list;
    progress.selectedSequenceIndex = next;
    recordOperation(sceneId, `把一张顺序卡往${direction === 'up' ? '上' : '下'}移动。`);
    saveState();
    render();
  }

  function confirmSequence(sceneId) {
    const scene = content.sceneById[sceneId];
    const progress = sceneProgress(sceneId);
    const current = progress.sequence || scene.activity.cards.slice();
    const correct = current.every((item, index) => item === scene.activity.correctOrder[index]);
    if (correct) {
      completeExplore(scene, { representation: '图', note: `孩子将 ${current.length} 张顺序卡排好。`, prompted: progress.hints > 0 });
      setFeedback(sceneId, '顺序排好了。现在请你告诉小通：你为什么把这一张放在最前面？', true);
    } else {
      addEvidence({ scene, phase: 'explore', representation: '图', prompted: true, note: '孩子尝试排列顺序卡。', outcome: '需要再看', misconception: '故事或步骤顺序仍需用语言复述验证。' });
      setFeedback(sceneId, '这个顺序有自己的故事。试着从“先发生什么”开始讲一遍，再决定要不要移动一张卡。');
    }
    saveState();
    render();
  }

  function toggleBuild(sceneId, piece) {
    const progress = sceneProgress(sceneId);
    const selected = new Set(progress.selectedPieces || []);
    selected.has(piece) ? selected.delete(piece) : selected.add(piece);
    progress.selectedPieces = [...selected];
    recordOperation(sceneId, `${selected.has(piece) ? '选了' : '放回了'}“${piece}”。`);
    saveState();
    render();
  }

  function confirmBuild(sceneId) {
    const scene = content.sceneById[sceneId];
    const progress = sceneProgress(sceneId);
    const expected = scene.activity.correctPieces.slice().sort().join('|');
    const actual = progress.selectedPieces.slice().sort().join('|');
    if (expected === actual) {
      completeExplore(scene, { representation: '图', note: `孩子选用“${progress.selectedPieces.join('、')}”完成搭建。`, prompted: progress.hints > 0 });
      setFeedback(sceneId, '你选的材料很有理由。小通想知道：它为什么适合这里？', true);
    } else {
      addEvidence({ scene, phase: 'explore', representation: '图', prompted: true, note: `孩子尝试使用“${progress.selectedPieces.join('、') || '还没有选择材料'}”。`, outcome: '需要再看', misconception: '功能和形状的关系还需要在具体场景里试一试。' });
      setFeedback(sceneId, '先别急着换答案。想一想：这个地方需要的是屋顶、树，还是别的东西？');
    }
    saveState();
    render();
  }

  function chooseAction(sceneId, action) {
    const scene = content.sceneById[sceneId];
    const progress = sceneProgress(sceneId);
    progress.selectedAction = action;
    recordOperation(sceneId, `听到指令后选择“${action}”。`);
    if (action === scene.activity.correctAction) {
      completeExplore(scene, { representation: '动作', note: `孩子听到指令后选择“${action}”。`, prompted: progress.hints > 0 });
      setFeedback(sceneId, `小通收到“${action}”的动作卡啦。你也可以站起来真的做一次。`, true);
    } else {
      addEvidence({ scene, phase: 'explore', representation: '动作', prompted: true, note: `孩子听到指令后选择“${action}”。`, outcome: '需要再看', misconception: '英语声音与动作意义的连接还需要再次听辨。' });
      setFeedback(sceneId, '我们再听一次，不需要急着选。听见的声音像是在邀请小通做什么？');
    }
    saveState();
    render();
  }

  function setExpressionMode(sceneId, mode) {
    const progress = sceneProgress(sceneId);
    progress.expressionMode = mode;
    saveState();
    render();
  }

  function chooseSentence(sceneId, sentence) {
    const progress = sceneProgress(sceneId);
    progress.selectedSentence = sentence;
    recordOperation(sceneId, `选了一张想法卡：“${sentence}”。`);
    setFeedback(sceneId, `你选了：“${sentence}” 这是一种把想法说出来的办法。`, true);
    saveState();
    render();
  }

  function selectRole(sceneId, role) {
    const scene = content.sceneById[sceneId];
    if (!scene?.roleCards?.includes(role)) return;
    const progress = sceneProgress(sceneId);
    progress.roleChoice = role;
    recordOperation(sceneId, `选择角色：“${role}”。`);
    setFeedback(sceneId, '选好了。你可以站起来演一句、做一个动作，或者把这个角色的话讲给小通听。', true);
    saveState();
    render();
  }

  function confirmRolePlay(sceneId) {
    const scene = content.sceneById[sceneId];
    if (!scene) return;
    const progress = sceneProgress(sceneId);
    if (!progress.roleChoice) {
      announce('先选一个角色。你也可以回到想法卡、录音或画图。');
      return;
    }
    if (completeExpression(scene, {
      representation: '动作',
      note: `孩子用角色“${progress.roleChoice}”完成角色扮演并讲述自己的想法。`,
      prompted: false
    })) {
      recordOperation(sceneId, `用“${progress.roleChoice}”完成角色扮演。`);
      setFeedback(sceneId, '小通看见了你的表演，也听见了你的想法。现在可以把这个想法放进新故事里试试看。', true);
      saveState();
      render();
    }
  }

  async function startRecording(sceneId) {
    if (!state.profile.voicePermission) {
      announce('录音功能默认关闭。请请家长在家长入口中开启“允许本地录音”，或改用想法卡、画图。');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      announce('这台电脑暂时不能录音。你可以用想法卡或画图表达。');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      runtime.mediaChunks = [];
      runtime.discardSceneRecording = false;
      runtime.mediaRecorder = new MediaRecorder(stream);
      runtime.recordingStartedAt = Date.now();
      runtime.mediaRecorder.ondataavailable = (event) => { if (event.data.size) runtime.mediaChunks.push(event.data); };
      runtime.mediaRecorder.onstop = () => {
        if (runtime.discardSceneRecording) {
          runtime.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
          runtime.mediaRecorder = null;
          runtime.discardSceneRecording = false;
          return;
        }
        const blob = new Blob(runtime.mediaChunks, { type: runtime.mediaRecorder.mimeType || 'audio/webm' });
        if (runtime.recordingUrl) URL.revokeObjectURL(runtime.recordingUrl);
        runtime.recordingUrl = URL.createObjectURL(blob);
        const progress = sceneProgress(sceneId);
        progress.recorded = true;
        progress.recordingSeconds = Math.max(1, Math.round((Date.now() - runtime.recordingStartedAt) / 1000));
        runtime.recordingSceneId = sceneId;
        recordOperation(sceneId, `留下了 ${progress.recordingSeconds} 秒的本地口头解释。`);
        runtime.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
        runtime.mediaRecorder = null;
        saveState();
        render();
        announce('录音只留在本次浏览器会话。你可以继续，也可以改用想法卡。');
      };
      runtime.mediaRecorder.start();
      render();
    } catch {
      announce('没有拿到麦克风权限。你仍然可以用图和想法卡表达。');
    }
  }

  function stopRecording() {
    if (runtime.mediaRecorder?.state === 'recording') runtime.mediaRecorder.stop();
  }

  function confirmExpression(sceneId) {
    const scene = content.sceneById[sceneId];
    const progress = sceneProgress(sceneId);
    let evidence = null;
    if (progress.expressionMode === 'cards' && progress.selectedSentence) evidence = { representation: '语言', note: `孩子选择想法卡：“${progress.selectedSentence}”。`, prompted: false };
    if (progress.expressionMode === 'voice' && progress.recorded) evidence = { representation: '语言', note: `孩子留下 ${progress.recordingSeconds || 1} 秒本地口头解释（音频未上传）。`, prompted: false };
    if (progress.expressionMode === 'draw' && progress.drawingData) evidence = { representation: '图', note: '孩子将自己的画放进发现册。', prompted: false };
    if (!evidence) {
      announce('选一种表达方式，再让小通知道你刚才怎样想。');
      return;
    }
    if (completeExpression(scene, evidence)) {
      setFeedback(sceneId, '小通收到你的想法了。现在把同一个想法放进新故事里试试看。', true);
      saveState();
      render();
    }
  }

  function setupCanvas(sceneId) {
    const canvas = document.querySelector('#drawing-canvas');
    if (!canvas) return;
    runtime.drawingCanvas = canvas;
    const context = canvas.getContext('2d');
    runtime.drawingContext = context;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#4f6bff';
    context.lineWidth = 7;
    const progress = sceneProgress(sceneId);
    if (progress.drawingData) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.src = progress.drawingData;
    }
    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
    };
    canvas.addEventListener('pointerdown', (event) => {
      runtime.drawing = true;
      canvas.setPointerCapture(event.pointerId);
      const p = point(event);
      context.beginPath();
      context.moveTo(p.x, p.y);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!runtime.drawing) return;
      const p = point(event);
      context.lineTo(p.x, p.y);
      context.stroke();
    });
    const end = () => { runtime.drawing = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  function clearDrawing() {
    const canvas = runtime.drawingCanvas;
    const context = runtime.drawingContext;
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const route = parseRoute();
    if (route.name === 'mission') {
      const progress = sceneProgress(route.sceneId);
      progress.drawingData = null;
      saveState();
    }
  }

  function saveDrawing(sceneId, context) {
    const scene = content.sceneById[sceneId];
    const canvas = runtime.drawingCanvas;
    if (!canvas) {
      announce('画板还没准备好。请再试一次。');
      return;
    }
    const progress = sceneProgress(sceneId);
    progress.drawingData = canvas.toDataURL('image/png');
    recordOperation(sceneId, '留下了一张自己的探索画。');
    if (context === 'expression') {
      setFeedback(sceneId, '这张画可以帮小通看见你的想法。现在可以继续换故事。', true);
    } else {
      completeExplore(scene, { representation: '图', note: '孩子用自由画板留下自己的探索图。', prompted: progress.hints > 0 });
      setFeedback(sceneId, '小通看见了你的图。你愿意用一句话讲讲图里发生了什么吗？', true);
    }
    saveState();
    render();
  }

  function useDrawAlternative(sceneId, context) {
    const scene = content.sceneById[sceneId];
    const progress = sceneProgress(sceneId);
    if (context === 'expression') {
      progress.expressionMode = 'cards';
      setFeedback(sceneId, '当然可以。选一句想法卡，也是在讲你的故事。', true);
    } else {
      completeExplore(scene, { representation: '语言', note: '孩子选择用想法卡或口头讲述来开始故事。', prompted: false });
      setFeedback(sceneId, '用一句话开始也很好。下一步可以选想法卡，把故事告诉小通。', true);
    }
    saveState();
    render();
  }

  function nextMissionStage(sceneId) {
    const scene = content.sceneById[sceneId];
    const progress = sceneProgress(sceneId);
    if (progress.stage === 0) {
      if (!progress.exploreComplete) { announce('先完成一次自己的探索，再说说你的想法。'); return; }
      progress.stage = 1;
    } else if (progress.stage === 1) {
      if (!progress.expressionComplete) { announce('先用一句话、声音或图，把想法告诉小通。'); return; }
      progress.stage = 2;
    } else if (progress.stage === 2) {
      if (!progress.transferComplete) { announce('先在新故事里试一次。'); return; }
      progress.stage = 3;
    }
    saveState();
    render();
  }

  function previousMissionStage(sceneId) {
    const progress = sceneProgress(sceneId);
    progress.stage = Math.max(0, progress.stage - 1);
    saveState();
    render();
  }

  function saveQuestion({ sceneId, text, source = '问题工坊', mode = 'why', drawingData = null, audioSessionId = null }) {
    const scene = content.sceneById[sceneId] || content.scenes[0];
    const trail = content.inquiryTrailByScene[scene.id];
    const question = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      sceneId: scene.id,
      subject: scene.subject,
      text,
      at: Date.now(),
      source,
      mode,
      tags: trail?.tags || [],
      status: 'open',
      drawingData,
      audioSessionId
    };
    state.questions.push(question);
    state.questions = state.questions.slice(-60);
    saveState();
    return question;
  }

  function openQuestionWorkshop(sceneId) {
    const draft = getQuestionDraft();
    if (sceneId && content.sceneById[sceneId]) {
      draft.sceneId = sceneId;
      draft.pieceIndex = 0;
    }
    draft.captureMode = 'build';
    draft.drawingData = null;
    saveState();
    setRoute('question-workshop');
  }

  function setQuestionContext(sceneId) {
    if (!content.sceneById[sceneId]) return;
    const draft = getQuestionDraft();
    draft.sceneId = sceneId;
    draft.pieceIndex = 0;
    saveState();
    render();
  }

  function setQuestionMode(mode) {
    if (!questionModes().some(([id]) => id === mode)) return;
    const draft = getQuestionDraft();
    draft.mode = mode;
    saveState();
    render();
  }

  function setQuestionPiece(index) {
    const draft = getQuestionDraft();
    const trail = content.inquiryTrailByScene[draft.sceneId];
    const pieceIndex = Number(index);
    if (!Number.isInteger(pieceIndex) || pieceIndex < 0 || pieceIndex >= trail.pieces.length) return;
    draft.pieceIndex = pieceIndex;
    saveState();
    render();
  }

  function setQuestionCapture(mode) {
    if (!['build', 'draw', 'voice'].includes(mode)) return;
    const draft = getQuestionDraft();
    draft.captureMode = mode;
    saveState();
    render();
  }

  function saveBuiltQuestion() {
    const draft = getQuestionDraft();
    const question = saveQuestion({ sceneId: draft.sceneId, text: questionTextForDraft(draft), source: '图卡拼问题', mode: draft.mode });
    announce('这个问题已经放进发现册。下次可以用它继续探索。');
    render();
    return question;
  }

  function followQuestion(questionId) {
    const question = state.questions.find((item) => item.id === questionId);
    if (!question) return;
    const trail = content.inquiryTrailByScene[question.sceneId];
    const candidates = [...(trail?.nextSceneIds || []), question.sceneId];
    const sceneId = candidates.find((id) => content.sceneById[id] && !sceneProgress(id).completedAt) || candidates.find((id) => content.sceneById[id]);
    if (!sceneId) {
      announce('小通先把这个问题留在发现册里。下次我们可以从它开始。');
      return;
    }
    question.status = 'following';
    question.followedAt = Date.now();
    saveState();
    setRoute(`mission/${sceneId}`);
    announce('小通带着你的问题，换到一个新故事里继续看。');
  }

  function markQuestionsVisitedByScene(sceneId) {
    state.questions.forEach((question) => {
      const trail = content.inquiryTrailByScene[question.sceneId];
      if (question.status === 'following' && (question.sceneId === sceneId || trail?.nextSceneIds?.includes(sceneId))) {
        question.status = 'visited';
        question.visitedAt = Date.now();
      }
    });
  }

  function setupQuestionCanvas() {
    const canvas = document.querySelector('#question-canvas');
    if (!canvas) return;
    runtime.questionCanvas = canvas;
    const context = canvas.getContext('2d');
    runtime.questionDrawingContext = context;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#7a5bd6';
    context.lineWidth = 7;
    const draft = getQuestionDraft();
    if (draft.drawingData) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.src = draft.drawingData;
    }
    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
    };
    canvas.addEventListener('pointerdown', (event) => {
      runtime.questionDrawing = true;
      canvas.setPointerCapture(event.pointerId);
      const p = point(event);
      context.beginPath();
      context.moveTo(p.x, p.y);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!runtime.questionDrawing) return;
      const p = point(event);
      context.lineTo(p.x, p.y);
      context.stroke();
    });
    const end = () => { runtime.questionDrawing = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  function clearQuestionDrawing() {
    const canvas = runtime.questionCanvas;
    const context = runtime.questionDrawingContext;
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    getQuestionDraft().drawingData = null;
    saveState();
  }

  function saveQuestionDrawing() {
    const canvas = runtime.questionCanvas;
    if (!canvas) {
      announce('画板还没准备好。请再试一次。');
      return;
    }
    const draft = getQuestionDraft();
    const scene = content.sceneById[draft.sceneId];
    const drawingData = canvas.toDataURL('image/png');
    saveQuestion({ sceneId: scene.id, text: `我画了一张关于“${scene.title}”的疑问图。`, source: '问题画', mode: 'draw', drawingData });
    draft.drawingData = null;
    draft.captureMode = 'build';
    saveState();
    announce('这张问题画已经放进发现册。小通不会要求上传它。');
    render();
  }

  async function startQuestionRecording() {
    if (!state.profile.voicePermission) {
      announce('录音默认关闭。可以先用图卡或画图；需要录音时请家长在家长入口开启。');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      announce('这台电脑暂时不能录音。你仍然可以用图卡或画图留下问题。');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      runtime.questionMediaChunks = [];
      runtime.discardQuestionRecording = false;
      runtime.questionMediaRecorder = new MediaRecorder(stream);
      runtime.questionRecordingStartedAt = Date.now();
      runtime.questionMediaRecorder.ondataavailable = (event) => { if (event.data.size) runtime.questionMediaChunks.push(event.data); };
      runtime.questionMediaRecorder.onstop = () => {
        if (runtime.discardQuestionRecording) {
          runtime.questionMediaRecorder.stream.getTracks().forEach((track) => track.stop());
          runtime.questionMediaRecorder = null;
          runtime.discardQuestionRecording = false;
          return;
        }
        const blob = new Blob(runtime.questionMediaChunks, { type: runtime.questionMediaRecorder.mimeType || 'audio/webm' });
        if (runtime.questionRecordingUrl) URL.revokeObjectURL(runtime.questionRecordingUrl);
        const audioSessionId = `question-audio-${Date.now()}`;
        runtime.questionRecordingUrl = URL.createObjectURL(blob);
        runtime.questionRecordingId = audioSessionId;
        const draft = getQuestionDraft();
        const scene = content.sceneById[draft.sceneId];
        const seconds = Math.max(1, Math.round((Date.now() - runtime.questionRecordingStartedAt) / 1000));
        saveQuestion({ sceneId: scene.id, text: `我说了一个关于“${scene.title}”的问题（${seconds} 秒本机录音）。`, source: '本机录音问题', mode: 'voice', audioSessionId });
        runtime.questionMediaRecorder.stream.getTracks().forEach((track) => track.stop());
        runtime.questionMediaRecorder = null;
        saveState();
        render();
        announce('这个问题只留在本次浏览器会话里，可以回听，不会自动上传。');
      };
      runtime.questionMediaRecorder.start();
      render();
    } catch {
      announce('没有拿到麦克风权限。你仍然可以用图卡或画图留下问题。');
    }
  }

  function stopQuestionRecording() {
    if (runtime.questionMediaRecorder?.state === 'recording') runtime.questionMediaRecorder.stop();
  }

  function saveFreeQuestion() {
    const text = document.querySelector('#free-question')?.value.trim();
    if (!text) { announce('先把想问的话说出来或请家长代记。'); return; }
    saveQuestion({ sceneId: 'chinese-story-director', text, source: '家长代记原话', mode: 'free' });
    announce('这句话已经放进发现册。下次可以从它开始探索。');
    render();
  }

  function startProject(projectId) {
    const project = content.projects.find((item) => item.id === projectId);
    if (!project) return;
    const step = project.steps.find((item) => !sceneProgress(item.sceneId).completedAt) || project.steps[0];
    state.projects[projectId] = { startedAt: Date.now() };
    saveState();
    setRoute(`mission/${step.sceneId}`);
    announce(`我们先做“${step.label}”。项目可以下次再继续。`);
  }

  function openParentGate() {
    if (state.parentUnlocked) { setRoute('parent'); return; }
    parentGate.innerHTML = `<div class="modal-body"><h2 id="parent-gate-title">家长入口</h2><p>这是轻量防误入，不是账户验证。请长按下面按钮约 2 秒后进入设置和学习证据页。</p><button class="hold-button" type="button" data-hold-parent>长按进入家长模式</button><div class="modal-actions"><button class="button button-quiet small-button" type="button" data-action="close-parent-gate">先回儿童模式</button></div></div>`;
    if (!parentGate.open) parentGate.showModal();
  }

  function openPrivacyDialog() {
    privacyDialog.innerHTML = `<div class="modal-body"><h2 id="privacy-title">这台电脑上的数据</h2><p>任务进度、问题、证据摘要、设置和画图会保存在这台浏览器中。录音只保留在当前浏览器会话，不会自动上传，也不会写入学习档案。点击“删除全部学习数据”可清除本机保存内容。</p><div class="modal-actions"><button class="button button-primary small-button" type="button" data-action="close-privacy">知道了</button></div></div>`;
    if (!privacyDialog.open) privacyDialog.showModal();
  }

  function deleteData() {
    const confirmed = window.confirm('确定删除这台电脑上的全部学习数据吗？删除后不能恢复。');
    if (!confirmed) return;
    localStorage.removeItem(STORAGE_KEY);
    if (runtime.recordingUrl) URL.revokeObjectURL(runtime.recordingUrl);
    if (runtime.questionRecordingUrl) URL.revokeObjectURL(runtime.questionRecordingUrl);
    if (runtime.mediaRecorder?.state === 'recording') {
      runtime.discardSceneRecording = true;
      runtime.mediaRecorder.stop();
    }
    if (runtime.questionMediaRecorder?.state === 'recording') {
      runtime.discardQuestionRecording = true;
      runtime.questionMediaRecorder.stop();
    }
    runtime.recordingUrl = null;
    runtime.recordingSceneId = null;
    runtime.questionRecordingUrl = null;
    runtime.questionRecordingId = null;
    state = defaultState();
    announce('这台电脑上的学习数据已经删除。');
    setRoute('home');
  }

  function toggleInterest(theme) {
    const selected = new Set(state.profile.interestThemes || []);
    selected.has(theme) ? selected.delete(theme) : selected.add(theme);
    state.profile.interestThemes = [...selected];
    saveState();
    render();
    announce(`${theme}${selected.has(theme) ? '已经加入' : '已经移出'}下一步探索线索。`);
  }

  function toggleOperationReplay(sceneId) {
    const progress = sceneProgress(sceneId);
    progress.showReplay = !progress.showReplay;
    saveState();
    render();
  }

  function updateSetting(event) {
    const target = event.target.closest('[data-setting]');
    if (!target) return;
    const key = target.dataset.setting;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    state.profile[key] = key === 'screenMinutes' ? Number(value) : value;
    saveState();
    render();
  }

  function handleAction(event) {
    const actionNode = event.target.closest('[data-action]');
    const routeNode = event.target.closest('[data-route]');
    const sayNode = event.target.closest('[data-say]');
    if (sayNode) speak(sayNode.dataset.say);
    if (routeNode) { setRoute(routeNode.dataset.route); return; }
    if (!actionNode) return;
    const action = actionNode.dataset.action;
    const route = parseRoute();
    const sceneId = actionNode.dataset.sceneId || route.sceneId;
    switch (action) {
      case 'toggle-sound': toggleSound(); break;
      case 'speech-control': controlSpeech(); break;
      case 'toggle-pause': state.session.paused = !state.session.paused; saveState(); render(); announce(state.session.paused ? '已经暂停。去看看远处，回来时会从这里继续。' : '欢迎回来，我们慢慢继续。'); break;
      case 'open-parent': openParentGate(); break;
      case 'close-parent-gate': parentGate.close(); break;
      case 'open-privacy': openPrivacyDialog(); break;
      case 'close-privacy': privacyDialog.close(); break;
      case 'start-scene': setRoute(`mission/${actionNode.dataset.sceneId}`); break;
      case 'show-subject': setRoute(`subject/${actionNode.dataset.subject}`); break;
      case 'balance-method': selectBalanceMethod(sceneId, actionNode.dataset.method); break;
      case 'balance-add': addBalance(sceneId, Number(actionNode.dataset.count)); break;
      case 'balance-guess': addBalance(sceneId, Number(actionNode.dataset.count), true); break;
      case 'balance-hint': useBalanceHint(sceneId); break;
      case 'support-step': useSupport(sceneId, actionNode.dataset.support); break;
      case 'choice-answer': chooseOption(sceneId, actionNode.dataset.answerId); break;
      case 'match-left': chooseMatch(sceneId, 'left', actionNode.dataset.matchId); break;
      case 'match-right': chooseMatch(sceneId, 'right', actionNode.dataset.matchId); break;
      case 'sequence-select': selectSequence(sceneId, actionNode.dataset.index); break;
      case 'sequence-move': moveSequence(sceneId, actionNode.dataset.direction); break;
      case 'sequence-confirm': confirmSequence(sceneId); break;
      case 'build-toggle': toggleBuild(sceneId, actionNode.dataset.piece); break;
      case 'build-confirm': confirmBuild(sceneId); break;
      case 'action-answer': chooseAction(sceneId, actionNode.dataset.actionName); break;
      case 'mission-next': nextMissionStage(sceneId); break;
      case 'mission-prev': previousMissionStage(sceneId); break;
      case 'expression-mode': setExpressionMode(sceneId, actionNode.dataset.mode); break;
      case 'sentence-choose': chooseSentence(sceneId, actionNode.dataset.sentence); break;
      case 'role-select': selectRole(sceneId, actionNode.dataset.role); break;
      case 'role-confirm': confirmRolePlay(sceneId); break;
      case 'expression-confirm': confirmExpression(sceneId); break;
      case 'record-start': startRecording(sceneId); break;
      case 'record-stop': stopRecording(); break;
      case 'draw-clear': clearDrawing(); break;
      case 'draw-save': saveDrawing(sceneId, actionNode.dataset.context); break;
      case 'draw-alternative': useDrawAlternative(sceneId, actionNode.dataset.context); break;
      case 'toggle-operation-replay': toggleOperationReplay(sceneId); break;
      case 'transfer-answer': completeTransfer(content.sceneById[sceneId], actionNode.dataset.answer); break;
      case 'review-answer': completeDelayedReview(content.sceneById[sceneId], actionNode.dataset.answer); break;
      case 'seed-question': completeSeed(content.sceneById[sceneId], actionNode.dataset.question, 'question'); break;
      case 'seed-offline': completeSeed(content.sceneById[sceneId], content.sceneById[sceneId].realWorld, 'offline'); break;
      case 'open-question-workshop': openQuestionWorkshop(actionNode.dataset.sceneId); break;
      case 'question-context': setQuestionContext(actionNode.dataset.sceneId); break;
      case 'question-mode': setQuestionMode(actionNode.dataset.questionMode); break;
      case 'question-piece': setQuestionPiece(actionNode.dataset.pieceIndex); break;
      case 'question-capture': setQuestionCapture(actionNode.dataset.captureMode); break;
      case 'question-save': saveBuiltQuestion(); break;
      case 'question-followup': followQuestion(actionNode.dataset.questionId); break;
      case 'question-draw-clear': clearQuestionDrawing(); break;
      case 'question-draw-save': saveQuestionDrawing(); break;
      case 'question-record-start': startQuestionRecording(); break;
      case 'question-record-stop': stopQuestionRecording(); break;
      case 'save-free-question': saveFreeQuestion(); break;
      case 'project-start': startProject(actionNode.dataset.projectId); break;
      case 'take-break': state.session.paused = true; state.session.breakOpen = false; saveState(); render(); announce('好，去活动一下。回来后可以继续。'); break;
      case 'close-break': state.session.breakOpen = false; saveState(); render(); break;
      case 'toggle-interest': toggleInterest(actionNode.dataset.interest); break;
      case 'delete-data': deleteData(); break;
      default: break;
    }
  }

  function renderSubjectOverlay(subjectId) {
    const subject = content.subjectById[subjectId];
    if (!subject) return;
    const main = document.querySelector('#main-content');
    if (main) {
      main.innerHTML = renderSubject(subjectId);
      window.scrollTo({ top: 0, behavior: state.profile.reducedMotion ? 'auto' : 'smooth' });
    }
  }

  document.addEventListener('click', handleAction);
  document.addEventListener('change', updateSetting);
  document.addEventListener('dragstart', (event) => {
    if (!event.target.closest('[data-drag-block]')) return;
    event.dataTransfer?.setData('text/plain', 'block');
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  });
  document.addEventListener('dragover', (event) => {
    if (!event.target.closest('#balance-drop-zone')) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('drop', (event) => {
    const target = event.target.closest('#balance-drop-zone');
    const route = parseRoute();
    if (!target || route.name !== 'mission' || content.sceneById[route.sceneId]?.activity.kind !== 'balance') return;
    event.preventDefault();
    addBalance(route.sceneId, 1);
  });
  document.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('[data-hold-parent]');
    if (!button) return;
    clearTimeout(runtime.holdTimer);
    runtime.holdTimer = setTimeout(() => {
      state.parentUnlocked = true;
      parentGate.close();
      setRoute('parent');
      announce('已进入家长模式。这里没有总分，只有真实证据与下一步理由。');
    }, 1800);
  });
  document.addEventListener('pointerup', () => clearTimeout(runtime.holdTimer));
  document.addEventListener('pointercancel', () => clearTimeout(runtime.holdTimer));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && parentGate.open) parentGate.close();
  });
  window.addEventListener('hashchange', render);
  setInterval(tick, 1000);
  render();
})();
