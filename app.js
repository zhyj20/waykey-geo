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

  function speak(message) {
    if (!state.profile.sound) {
      announce('声音提示已关闭。你可以看着图和文字继续探索。');
      return;
    }
    if (!('speechSynthesis' in window)) {
      announce(message);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.88;
    window.speechSynthesis.speak(utterance);
  }

  function parseRoute() {
    const raw = (location.hash || '#home').slice(1).split('/');
    if (raw[0] === 'mission' && content.sceneById[raw[1]]) return { name: 'mission', sceneId: raw[1] };
    if (raw[0] === 'subject' && content.subjectById[raw[1]]) return { name: 'subject', subjectId: raw[1] };
    if (raw[0] === 'review' && content.sceneById[raw[1]]) return { name: 'review', sceneId: raw[1] };
    if (['home', 'discoveries', 'projects', 'parent'].includes(raw[0])) return { name: raw[0] };
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
        expressionMode: null,
        selectedSentence: null,
        drawingData: null,
        recorded: false,
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
    if (answer === activity.correct) {
      progress.transferComplete = true;
      progress.stage = Math.max(progress.stage, 3);
      addEvidence({ scene, phase: 'transfer', representation: '图', prompted: false, note: `在新故事中选择“${answer}”`, outcome: '迁移尝试' });
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

  function completeSeed(scene, text, kind = 'question') {
    const progress = sceneProgress(scene.id);
    if (!progress.transferComplete) {
      announce('先换一个故事试一试，再把发现种下去。');
      return;
    }
    if (kind === 'question') {
      state.questions.push({ id: `${Date.now()}`, sceneId: scene.id, subject: scene.subject, text, at: Date.now(), source: '任务中的发现' });
      state.questions = state.questions.slice(-60);
      addEvidence({ scene, phase: 'seed', representation: '语言', prompted: false, note: `孩子留下问题：“${text}”`, outcome: '主动提问' });
    } else {
      addEvidence({ scene, phase: 'seed', representation: '动作', prompted: false, note: `孩子选择离屏挑战：${text}`, outcome: '离屏探索' });
    }
    progress.seedComplete = true;
    progress.completedAt = Date.now();
    progress.stage = 4;
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
        <div class="section-heading"><div><h2>今天可以从这里开始</h2><p>每科都只有一个小目标；选你最想先试的那一张。</p></div><button class="text-button" type="button" data-route="projects">查看跨学科项目</button></div>
        <div class="subject-grid">${recommendations.map((scene) => sceneCard(scene)).join('')}</div>
        <div class="section-heading"><div><h2>三座学习岛</h2><p>不必按课本页码排队。学校进度、你的兴趣和已经收集到的证据会一起决定下一步。</p></div></div>
        <div class="subject-grid">${content.subjects.map((subject) => {
          const subjectScenes = content.scenes.filter((scene) => scene.subject === subject.id);
          const finished = subjectScenes.filter((scene) => sceneProgress(scene.id).comple…9051 tokens truncated…irection === 'up' ? selected - 1 : selected + 1;
    if (next < 0 || next >= list.length) {
      announce('这张卡已经在最合适的一端了。');
      return;
    }
    [list[selected], list[next]] = [list[next], list[selected]];
    progress.sequence = list;
    progress.selectedSequenceIndex = next;
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
    setFeedback(sceneId, `你选了：“${sentence}” 这是一种把想法说出来的办法。`, true);
    saveState();
    render();
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
      runtime.mediaRecorder = new MediaRecorder(stream);
      runtime.recordingStartedAt = Date.now();
      runtime.mediaRecorder.ondataavailable = (event) => { if (event.data.size) runtime.mediaChunks.push(event.data); };
      runtime.mediaRecorder.onstop = () => {
        const blob = new Blob(runtime.mediaChunks, { type: runtime.mediaRecorder.mimeType || 'audio/webm' });
        if (runtime.recordingUrl) URL.revokeObjectURL(runtime.recordingUrl);
        runtime.recordingUrl = URL.createObjectURL(blob);
        const progress = sceneProgress(sceneId);
        progress.recorded = true;
        progress.recordingSeconds = Math.max(1, Math.round((Date.now() - runtime.recordingStartedAt) / 1000));
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

  function saveFreeQuestion() {
    const text = document.querySelector('#free-question')?.value.trim();
    if (!text) { announce('先把想问的话说出来或请家长代记。'); return; }
    state.questions.push({ id: `${Date.now()}`, sceneId: 'free', subject: 'chinese', text, at: Date.now(), source: '自由问题' });
    state.questions = state.questions.slice(-60);
    saveState();
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
    state = defaultState();
    announce('这台电脑上的学习数据已经删除。');
    setRoute('home');
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
      case 'toggle-sound': state.profile.sound = !state.profile.sound; saveState(); render(); if (state.profile.sound) speak('声音提示已经打开。'); break;
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
      case 'choice-answer': chooseOption(sceneId, actionNode.dataset.answerId); break;
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
      case 'expression-confirm': confirmExpression(sceneId); break;
      case 'record-start': startRecording(sceneId); break;
      case 'record-stop': stopRecording(); break;
      case 'draw-clear': clearDrawing(); break;
      case 'draw-save': saveDrawing(sceneId, actionNode.dataset.context); break;
      case 'draw-alternative': useDrawAlternative(sceneId, actionNode.dataset.context); break;
      case 'transfer-answer': completeTransfer(content.sceneById[sceneId], actionNode.dataset.answer); break;
      case 'review-answer': completeDelayedReview(content.sceneById[sceneId], actionNode.dataset.answer); break;
      case 'seed-question': completeSeed(content.sceneById[sceneId], actionNode.dataset.question, 'question'); break;
      case 'seed-offline': completeSeed(content.sceneById[sceneId], content.sceneById[sceneId].realWorld, 'offline'); break;
      case 'save-free-question': saveFreeQuestion(); break;
      case 'project-start': startProject(actionNode.dataset.projectId); break;
      case 'take-break': state.session.paused = true; state.session.breakOpen = false; saveState(); render(); announce('好，去活动一下。回来后可以继续。'); break;
      case 'close-break': state.session.breakOpen = false; saveState(); render(); break;
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
