(() => {
  const screens = [...document.querySelectorAll('[data-screen]')];
  const navButtons = [...document.querySelectorAll('[data-nav]')];
  const toast = document.querySelector('#toast');
  const state = {
    audio: localStorage.getItem('selfLearnAudio') !== 'off',
    blocks: Number(localStorage.getItem('selfLearnBlocks') || 0),
    questions: JSON.parse(localStorage.getItem('selfLearnQuestions') || '[]'),
    startedAt: Number(localStorage.getItem('selfLearnStartedAt') || Date.now())
  };
  let toastTimer;

  const routeMap = new Set(['home', 'task', 'map', 'parent']);
  const currentRoute = () => (location.hash || '#home').slice(1);

  function setRoute(route, focusQuestion = false) {
    const next = routeMap.has(route) ? route : 'home';
    if (currentRoute() !== next) location.hash = next;
    renderRoute(next);
    if (focusQuestion) setTimeout(() => document.querySelector('#questionInput')?.focus(), 120);
  }

  function renderRoute(route) {
    screens.forEach((screen) => { screen.hidden = screen.dataset.screen !== route; });
    navButtons.forEach((button) => button.classList.toggle('active', button.dataset.nav === route || (route === 'task' && button.dataset.nav === 'question')));
    document.title = `${({ home: '自学大师', task: '平衡探险', map: '我的数学地图', parent: '学习证据' })[route]}｜自学大师`;
    if (route === 'task') renderTask();
    if (route === 'map' || route === 'parent') renderQuestions();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function announce(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('visible');
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
  }

  function speak(message) {
    if (!state.audio) {
      announce('声音提示已关闭。你可以继续看屏幕上的文字。');
      return;
    }
    if (!('speechSynthesis' in window)) {
      announce(message);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  function saveState() {
    localStorage.setItem('selfLearnAudio', state.audio ? 'on' : 'off');
    localStorage.setItem('selfLearnBlocks', String(state.blocks));
    localStorage.setItem('selfLearnQuestions', JSON.stringify(state.questions.slice(-12)));
    localStorage.setItem('selfLearnStartedAt', String(state.startedAt));
  }

  function renderTask() {
    const count = Math.min(5, state.blocks);
    const rightPan = document.querySelector('#rightPan');
    const stage = document.querySelector('#balancePlayground');
    const result = document.querySelector('#taskResult');
    const tokens = [...document.querySelectorAll('[data-add-block]')];
    const evidence = [...document.querySelectorAll('.evidence-trail li')];
    if (!rightPan || !stage || !result) return;

    rightPan.innerHTML = Array.from({ length: count }, () => '<img src="assets/block.svg" alt="右盘上的一块积木" />').join('');
    tokens.forEach((token, index) => { token.disabled = index < count; });
    stage.classList.toggle('balanced', count === 5);
    evidence.forEach((item, index) => item.classList.toggle('done', index <= (count === 5 ? 2 : 0)));

    if (count === 0) {
      result.className = 'task-result';
      result.textContent = '先选一种办法，或者直接点积木放到右盘。';
    } else if (count < 5) {
      result.className = 'task-result';
      result.textContent = `右边现在有 ${count} 块。你发现天平有什么变化了吗？`;
    } else {
      result.className = 'task-result success';
      result.innerHTML = '两边一样重了！你愿意讲讲，你是怎样想到的？ <button class="inline-link" type="button" data-route="map">去看看我的地图 →</button>';
      result.querySelector('button')?.addEventListener('click', () => setRoute('map'));
    }
  }

  function addBlock() {
    if (state.blocks >= 5) {
      speak('右边已经有五块积木了。两边一样重。你愿意讲讲你的办法吗？');
      announce('两边已经一样重了。试着用自己的话讲讲看。');
      return;
    }
    state.blocks += 1;
    saveState();
    renderTask();
    if (state.blocks === 5) {
      speak('你让两边一样重了。现在，不用急着做下一题。先说说你是怎么知道的。');
      announce('两边一样重了！系统记录了“动手”的证据。');
    } else {
      speak(`右边有 ${state.blocks} 块了。你觉得还差几块？`);
    }
  }

  function chooseMethod(method) {
    document.querySelectorAll('[data-method-choice]').forEach((button) => button.classList.toggle('selected', button.dataset.methodChoice === method));
    const messages = {
      one: '一个个放上去完全正确。慢一点没关系，先看清每一步。',
      draw: '好主意。你可以先画五个小圆点，再想一想右边需要怎样画。',
      fast: '我们可以看看新的办法：五也可以看成三和二。不过这只是邀请，你随时可以回到一个个数。'
    };
    speak(messages[method]);
    announce(messages[method]);
  }

  function addQuestion(question) {
    const value = question.trim();
    if (!value) {
      announce('先把你想问的话说出来或写下来。');
      return;
    }
    state.questions.push(value);
    saveState();
    renderQuestions();
    document.querySelector('#questionInput').value = '';
    speak(`我记下来了：${value}`);
    announce('小通已经把这个问题放进你的兴趣线。');
  }

  function renderQuestions() {
    const latest = state.questions.at(-1) || '“如果两边东西不一样，为什么也能一样重？”';
    const latestQuestion = document.querySelector('#latestQuestion');
    if (latestQuestion) latestQuestion.textContent = `“${latest.replace(/[“”]/g, '')}”`;
    const count = document.querySelector('#questionCount');
    if (count) count.textContent = `${6 + state.questions.length} 个`;
  }

  function updateTimer() {
    const seconds = Math.max(0, 18 * 60 - Math.floor((Date.now() - state.startedAt) / 1000));
    const value = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    const timer = document.querySelector('#timer');
    if (timer) timer.textContent = value;
    const stage = Math.min(4, Math.max(1, Math.floor((18 * 60 - seconds) / (18 * 60 / 4)) + 1));
    const stageNode = document.querySelector('#sessionStage');
    if (stageNode) stageNode.textContent = stage;
  }

  document.addEventListener('click', (event) => {
    const routeButton = event.target.closest('[data-route]');
    if (routeButton) {
      const route = routeButton.dataset.route;
      const method = routeButton.dataset.method;
      setRoute(route, routeButton.dataset.nav === 'question');
      if (method) setTimeout(() => chooseMethod(method), 80);
      return;
    }
    const sayButton = event.target.closest('[data-say]');
    if (sayButton) speak(sayButton.dataset.say);
    const token = event.target.closest('[data-add-block]');
    if (token && !token.disabled) addBlock();
    const methodButton = event.target.closest('[data-method-choice]');
    if (methodButton) chooseMethod(methodButton.dataset.methodChoice);
    const concept = event.target.closest('[data-concept]');
    if (concept) announce(concept.dataset.concept);
  });

  document.querySelector('#audioToggle')?.addEventListener('click', () => {
    state.audio = !state.audio;
    saveState();
    const action = document.querySelector('#audioToggle');
    action.setAttribute('aria-pressed', String(state.audio));
    action.querySelector('span').textContent = state.audio ? '声音已开启' : '声音已关闭';
    if (state.audio) speak('声音提示已开启。');
  });

  document.querySelector('#questionForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    addQuestion(new FormData(event.currentTarget).get('question') || '');
  });

  document.querySelectorAll('[data-add-block]').forEach((token) => {
    token.addEventListener('dragstart', (event) => event.dataTransfer.setData('text/plain', 'block'));
  });
  const rightPan = document.querySelector('#rightPan');
  rightPan?.addEventListener('dragover', (event) => { event.preventDefault(); rightPan.classList.add('dragover'); });
  rightPan?.addEventListener('dragleave', () => rightPan.classList.remove('dragover'));
  rightPan?.addEventListener('drop', (event) => { event.preventDefault(); rightPan.classList.remove('dragover'); addBlock(); });

  window.addEventListener('hashchange', () => renderRoute(currentRoute()));
  renderRoute(currentRoute());
  renderTask();
  renderQuestions();
  updateTimer();
  setInterval(updateTimer, 1000);
})();

