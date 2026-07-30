/*
 * 自学大师 V2 内容模型
 * 所有展示任务、知识点和证据要求都在这里声明。界面只渲染这些数据，
 * 不预置“已经掌握”的假结果。
 */
window.SELF_LEARN_CONTENT = (() => {
  const subjects = [
    {
      id: 'math',
      name: '数学',
      childName: '数字探险岛',
      color: 'blue',
      art: 'assets/balance-hero.svg',
      description: '用手、图和故事，发现数量、关系和规律。'
    },
    {
      id: 'chinese',
      name: '语文',
      childName: '故事语言岛',
      color: 'purple',
      art: 'assets/pattern.svg',
      description: '听一听、看一看、讲出来，让文字变成自己的故事。'
    },
    {
      id: 'english',
      name: '英语',
      childName: '声音朋友岛',
      color: 'green',
      art: 'assets/buddy.svg',
      description: '先听懂、敢开口、会在小情景里用。'
    }
  ];

  const concepts = [
    { id: 'math-equal', subject: 'math', label: '相等与比较', childLabel: '两边一样吗？', prereqs: [] },
    { id: 'math-compose', subject: 'math', label: '数的组成与分解', childLabel: '5 可以怎样合起来？', prereqs: [] },
    { id: 'math-add-meaning', subject: 'math', label: '加减的意义', childLabel: '合起来和拿走会怎样？', prereqs: ['math-compose'] },
    { id: 'math-sequence', subject: 'math', label: '计数、路线与时间', childLabel: '下一步走到哪里？', prereqs: [] },
    { id: 'math-space', subject: 'math', label: '形状、空间与规律', childLabel: '怎样搭得又稳又好看？', prereqs: [] },
    { id: 'chinese-sound', subject: 'chinese', label: '语音与拼音意识', childLabel: '这个声音像谁？', prereqs: [] },
    { id: 'chinese-story', subject: 'chinese', label: '图像理解与故事顺序', childLabel: '故事先发生了什么？', prereqs: [] },
    { id: 'chinese-character', subject: 'chinese', label: '汉字意义与构件', childLabel: '字里面藏着什么？', prereqs: [] },
    { id: 'chinese-expression', subject: 'chinese', label: '口头表达与叙事', childLabel: '把你的故事讲给小通听。', prereqs: ['chinese-story'] },
    { id: 'english-listen', subject: 'english', label: '听音与词义', childLabel: '我听见了哪个朋友？', prereqs: [] },
    { id: 'english-action', subject: 'english', label: '课堂指令与动作表达', childLabel: '听懂后我能动起来。', prereqs: ['english-listen'] },
    { id: 'english-dialogue', subject: 'english', label: '情景对话', childLabel: '我能和朋友说一句。', prereqs: ['english-listen'] },
    { id: 'english-vocabulary', subject: 'english', label: '词汇在情景中的使用', childLabel: '这个词我会在新地方用。', prereqs: ['english-listen'] }
  ];

  const scenes = [
    {
      id: 'math-balance', subject: 'math', color: 'blue', art: 'assets/balance-hero.svg',
      title: '平衡修理站', subtitle: '帮小通修好摇摇晃晃的天平',
      concepts: ['math-equal', 'math-compose'], representations: ['实物', '图', '语言', '符号'],
      realWorld: '回家找两只小碗，用同样多的积木或豆子让它们看起来一样。',
      seed: '如果两边放的东西不一样，什么时候也会一样重？',
      activity: { kind: 'balance', target: 5, transfer: '小熊有 5 块饼干，要分到两只盘子里。怎样让两边一样多？', transferOptions: ['2 和 3', '1 和 5', '4 和 0'], correct: '2 和 3' },
      misconceptions: [
        { id: 'math-balance-four', label: '右边放 4 块就停下', note: '可能还在看“快完成了”，需要回到两边逐一比较。' },
        { id: 'math-balance-six', label: '右边多放 1 块更稳', note: '可能把“平衡”理解成“右边越多越好”，需要用图和动作再看。' }
      ]
    },
    {
      id: 'math-picnic', subject: 'math', color: 'blue', art: 'assets/block.svg',
      title: '森林野餐', subtitle: '让小熊和小兔都拿到刚刚好的一份',
      concepts: ['math-add-meaning', 'math-compose'], representations: ['实物', '图', '语言'],
      realWorld: '和家长一起分 6 个小番茄，试试怎样分才公平。',
      seed: '如果来了第三个朋友，怎样分才不会有人少？',
      activity: { kind: 'choice', prompt: '桌上有 6 块饼干。两位朋友想分得一样多，你想先试哪一种？', options: [
        { id: 'a', label: '每位朋友 3 块', detail: '3 和 3 合起来是 6', correct: true },
        { id: 'b', label: '一位 4 块，一位 2 块', detail: '两个人拿得不一样多', correct: false, misconception: '比较时还没有逐一看两份。' },
        { id: 'c', label: '先把 6 块都给一位朋友', detail: '还没有开始分享', correct: false, misconception: '需要先决定“每个人都有一份”。' }
      ], transfer: '换成 8 颗草莓，两个朋友怎样各拿一样多？', transferOptions: ['4 和 4', '5 和 3', '6 和 2'], correct: '4 和 4' },
      misconceptions: []
    },
    {
      id: 'math-stairs', subject: 'math', color: 'blue', art: 'assets/stairs.svg',
      title: '楼梯探险队', subtitle: '帮小通沿着正确的脚印走到树屋',
      concepts: ['math-sequence'], representations: ['动作', '图', '语言'],
      realWorld: '找一段楼梯，边走边说出第 1、2、3……级。',
      seed: '如果每次跨两级，数数会发生什么？',
      activity: { kind: 'sequence', prompt: '把小通走上树屋的三张脚印卡排成顺序。', cards: ['先站在第 1 级', '再走到第 2 级', '最后到第 3 级'], correctOrder: ['先站在第 1 级', '再走到第 2 级', '最后到第 3 级'], transfer: '小通从第 3 级倒着走下来，第一步会到哪里？', transferOptions: ['第 2 级', '第 4 级', '树屋顶'], correct: '第 2 级' },
      misconceptions: []
    },
    {
      id: 'math-city', subject: 'math', color: 'blue', art: 'assets/pattern.svg',
      title: '城市建筑师', subtitle: '用形状搭一座有规律的小房子',
      concepts: ['math-space'], representations: ['实物', '图', '语言'],
      realWorld: '找找家里哪些东西像圆形、三角形或正方形。',
      seed: '为什么三角形的屋顶看起来更稳？',
      activity: { kind: 'build', prompt: '小房子的屋顶需要哪一种形状？', pieces: ['三角形', '圆形', '长方形'], correctPieces: ['三角形'], transfer: '路边图案是 ○ △ ○ △，下一个应该放什么？', transferOptions: ['○', '△', '□'], correct: '○' },
      misconceptions: []
    },
    {
      id: 'chinese-sound-lab', subject: 'chinese', color: 'purple', art: 'assets/speaker.svg',
      title: '拼音声音实验室', subtitle: '听一听，找出和“猫”开头声音相同的朋友',
      concepts: ['chinese-sound'], representations: ['声音', '图', '动作'],
      realWorld: '和家长玩“找同声音”的游戏：说一个词，再找一个开头相像的词。',
      seed: '“猫、马、门”里，哪些声音最像？',
      activity: { kind: 'choice', prompt: '按一下“再听一次”，然后选一个和“猫”开头声音相同的词。', say: '猫，猫。请找一个开头声音相同的词。', options: [
        { id: 'a', label: '马', detail: 'mā', correct: true },
        { id: 'b', label: '花', detail: 'huā', correct: false, misconception: '可能在听词的意思，还没有只听开头声音。' },
        { id: 'c', label: '兔', detail: 'tù', correct: false, misconception: '可以慢一点，把第一个声音拉长听。' }
      ], transfer: '“米”和哪个词开头声音更像？', transferOptions: ['木', '花', '土'], correct: '木' },
      misconceptions: []
    },
    {
      id: 'chinese-book-detective', subject: 'chinese', color: 'purple', art: 'assets/buddy.svg',
      title: '绘本侦探社', subtitle: '把小熊找雨伞的故事排好，再猜一猜',
      concepts: ['chinese-story'], representations: ['图', '语言', '动作'],
      realWorld: '请家长读一小段绘本，你来讲“先发生什么、后来怎样”。',
      seed: '小熊为什么没有一开始就带雨伞？',
      activity: { kind: 'sequence', prompt: '把故事卡排好：小熊要出门，天空下雨，小熊找到雨伞。', cards: ['天空下雨', '小熊要出门', '小熊找到雨伞'], correctOrder: ['小熊要出门', '天空下雨', '小熊找到雨伞'], transfer: '如果小熊先看到乌云，他下一步可能会做什么？', transferOptions: ['找雨伞', '把雨伞藏起来', '继续睡觉'], correct: '找雨伞' },
      misconceptions: []
    },
    {
      id: 'chinese-character-workshop', subject: 'chinese', color: 'purple', art: 'assets/pattern.svg',
      title: '汉字变形工坊', subtitle: '看看“休”字里藏着一个怎样的画面',
      concepts: ['chinese-character'], representations: ['图', '符号', '语言'],
      realWorld: '找一个你认识的字，讲讲它让你想到什么东西或画面。',
      seed: '为什么“休”字旁边像一棵树？',
      activity: { kind: 'build', prompt: '“休”字的画面像一个人靠着什么？', pieces: ['树', '太阳', '小鱼'], correctPieces: ['树'], transfer: '看到“林”字时，你觉得它像什么？', transferOptions: ['两棵树', '两条鱼', '两个太阳'], correct: '两棵树' },
      misconceptions: []
    },
    {
      id: 'chinese-story-director', subject: 'chinese', color: 'purple', art: 'assets/buddy.svg',
      title: '小小故事导演', subtitle: '画一个开头，再把你的故事讲给小通听',
      concepts: ['chinese-expression', 'chinese-story'], representations: ['图', '语言', '动作'],
      realWorld: '把今天发生的一件小事讲给家人听，记得说清“谁、在哪里、发生了什么”。',
      seed: '如果小雨点会说话，它会对谁说什么？',
      activity: { kind: 'draw', prompt: '请画一个故事开头：小通在雨天发现了一把小伞。画完后可以讲一讲。', transfer: '故事里还可以出现谁？', transferOptions: ['一只帮助小通的小猫', '没有任何人', '只重复刚才一句'], correct: '一只帮助小通的小猫' },
      roleCards: ['我是小通：我发现了一把小伞。', '我是小猫：我想帮小通想办法。', '我是讲故事的人：我来告诉大家发生了什么。'],
      misconceptions: []
    },
    {
      id: 'english-sound-friends', subject: 'english', color: 'green', art: 'assets/speaker.svg',
      title: '听音找朋友', subtitle: '听见 cat，找到那位朋友',
      concepts: ['english-listen'], representations: ['声音', '图', '语言'],
      realWorld: '和家长一起说出 3 个动物词，指一指对应的物品或图片。',
      seed: 'cat 和 hat 的声音哪里像？',
      activity: { kind: 'match', prompt: '先听声音卡，再把它和一张图片词卡连成朋友。', say: 'cat. Cat.', leftCards: [
        { id: 'cat-sound', label: '听见：cat', say: 'cat. Cat.' }
      ], rightCards: [
        { id: 'cat-picture', label: 'cat', detail: '小猫', correctWith: 'cat-sound' },
        { id: 'dog-picture', label: 'dog', detail: '小狗', misconception: '可以再听一次，只听声音，不急着猜。' },
        { id: 'fish-picture', label: 'fish', detail: '小鱼', misconception: '先把听到的声音说一遍，再选。' }
      ], transfer: '听见 dog 时，应该找哪一个词？', transferOptions: ['dog', 'cat', 'red'], correct: 'dog' },
      treasure: { word: 'cat', meaning: '小猫', collectionLabel: '我在声音和图片里找到 cat' },
      misconceptions: []
    },
    {
      id: 'english-command-station', subject: 'english', color: 'green', art: 'assets/buddy.svg',
      title: '小通的英语任务站', subtitle: '听懂指令，再帮小通选动作',
      concepts: ['english-action'], representations: ['声音', '动作', '语言'],
      realWorld: '和家长轮流说 jump、clap、sit，再做出动作。',
      seed: '如果小通说 turn around，你猜会发生什么？',
      activity: { kind: 'action', prompt: '按一下听指令：clap。小通现在应该做什么？', say: 'Clap. Clap your hands.', actions: ['拍手', '坐下', '跳一跳'], correctAction: '拍手', transfer: '听见 jump 时，小通应该？', transferOptions: ['跳一跳', '拍手', '躺下'], correct: '跳一跳' },
      treasure: { word: 'jump', meaning: '跳一跳', collectionLabel: '我把 jump 用在了新指令里' },
      misconceptions: []
    },
    {
      id: 'english-mini-theatre', subject: 'english', color: 'green', art: 'assets/buddy.svg',
      title: '情景小剧场', subtitle: '把小通和新朋友的对话排好',
      concepts: ['english-dialogue'], representations: ['语言', '动作', '图'],
      realWorld: '和家长演一次见面：Hello! I am ____. Bye!。',
      seed: '如果朋友问 How are you?，你想怎样回答？',
      activity: { kind: 'sequence', prompt: '把见面小对话排好。', cards: ['Bye!', 'Hello!', 'I am Xiaotong.'], correctOrder: ['Hello!', 'I am Xiaotong.', 'Bye!'], transfer: '第一次见朋友时，最适合先说哪一句？', transferOptions: ['Hello!', 'Bye!', 'Good night!'], correct: 'Hello!' },
      roleCards: ['我是小通：Hello! I am Xiaotong.', '我是新朋友：Hello! Nice to meet you.', '我是小导演：我来决定谁先说话。'],
      treasure: { word: 'Hello!', meaning: '你好', collectionLabel: '我在见面小剧场里说出 Hello!' },
      misconceptions: []
    },
    {
      id: 'english-treasure-book', subject: 'english', color: 'green', art: 'assets/pattern.svg',
      title: '英语宝物册', subtitle: '把会在新地方使用的词放进收藏',
      concepts: ['english-vocabulary'], representations: ['图', '语言', '动作'],
      realWorld: '在家里找一个 red 或 blue 的东西，对它说出英文颜色。',
      seed: '同一个 red 可以用来形容哪些东西？',
      activity: { kind: 'choice', prompt: '小通想找一只红色的气球。哪句话能帮到他？', options: [
        { id: 'a', label: 'red balloon', detail: '红色气球', correct: true },
        { id: 'b', label: 'blue cat', detail: '蓝色小猫', correct: false, misconception: '可以先找颜色，再找物品。' },
        { id: 'c', label: 'jump dog', detail: '跳起来的小狗', correct: false, misconception: '这个词没有告诉小通气球的颜色。' }
      ], transfer: '想说“蓝色的球”，你会选？', transferOptions: ['blue ball', 'red ball', 'cat ball'], correct: 'blue ball' },
      treasure: { word: 'blue ball', meaning: '蓝色的球', collectionLabel: '我在新场景里会说 blue ball' },
      misconceptions: []
    }
  ];

  const projects = [
    {
      id: 'project-picnic', title: '筹备森林野餐', color: 'yellow', art: 'assets/balance-card.svg',
      description: '分食物、说邀请、学会一条英语指令。',
      steps: [
        { subject: 'math', sceneId: 'math-picnic', label: '分好食物' },
        { subject: 'chinese', sceneId: 'chinese-story-director', label: '说一张邀请' },
        { subject: 'english', sceneId: 'english-command-station', label: '说出 picnic 的动作指令' }
      ]
    },
    {
      id: 'project-rescue', title: '动物救援地图', color: 'blue', art: 'assets/stairs.svg',
      description: '算路线、讲故事、听懂动物朋友的英语。',
      steps: [
        { subject: 'math', sceneId: 'math-stairs', label: '走对救援路线' },
        { subject: 'chinese', sceneId: 'chinese-book-detective', label: '讲清发生顺序' },
        { subject: 'english', sceneId: 'english-sound-friends', label: '找到动物朋友' }
      ]
    },
    {
      id: 'project-museum', title: '我的迷你博物馆', color: 'purple', art: 'assets/pattern.svg',
      description: '分类、写说明、做一张英文小标签。',
      steps: [
        { subject: 'math', sceneId: 'math-city', label: '把形状分好类' },
        { subject: 'chinese', sceneId: 'chinese-character-workshop', label: '讲讲字里的画面' },
        { subject: 'english', sceneId: 'english-treasure-book', label: '放入一个英文宝物词' }
      ]
    }
  ];

  // 问题线不是一个文本框，而是一条可被后续探索接住的兴趣线。
  // 每个场景声明孩子常会提出的观察角度、可拼成的问题片段与可继续去的场景。
  const inquiryTrails = [
    { sceneId: 'math-balance', subject: 'math', tags: ['数量', '平衡'], pieces: ['两边放同样多时，天平会安静下来', '5 可以分成几和几', '一边多一块会发生什么'], nextSceneIds: ['math-picnic', 'math-stairs'] },
    { sceneId: 'math-picnic', subject: 'math', tags: ['分享', '公平'], pieces: ['两位朋友怎样才会拿得一样多', '多来一位朋友时怎样分', '6 块饼干可以怎样分成两份'], nextSceneIds: ['math-balance', 'math-stairs'] },
    { sceneId: 'math-stairs', subject: 'math', tags: ['路线', '计数'], pieces: ['每次跨两级会数到哪里', '倒着走时第一步在哪里', '脚印为什么要排顺序'], nextSceneIds: ['math-city', 'math-balance'] },
    { sceneId: 'math-city', subject: 'math', tags: ['形状', '规律'], pieces: ['三角形屋顶看起来更稳', '图案下一块会是什么', '家里哪些东西像圆形'], nextSceneIds: ['math-stairs', 'chinese-character-workshop'] },
    { sceneId: 'chinese-sound-lab', subject: 'chinese', tags: ['声音', '口型'], pieces: ['猫和马开头的声音像不像', '把第一个声音拉长会听见什么', '哪个词和米的开头像'], nextSceneIds: ['chinese-book-detective', 'english-sound-friends'] },
    { sceneId: 'chinese-book-detective', subject: 'chinese', tags: ['故事', '为什么'], pieces: ['小熊为什么没有先带雨伞', '乌云出现后会发生什么', '故事为什么要这样排顺序'], nextSceneIds: ['chinese-story-director', 'math-stairs'] },
    { sceneId: 'chinese-character-workshop', subject: 'chinese', tags: ['汉字', '画面'], pieces: ['休字里的树在说什么', '林字为什么像两棵树', '一个字里还藏着哪些画面'], nextSceneIds: ['chinese-story-director', 'math-city'] },
    { sceneId: 'chinese-story-director', subject: 'chinese', tags: ['故事', '表达'], pieces: ['小雨点会对谁说什么', '小猫会怎样帮助小通', '故事后面还会发生什么'], nextSceneIds: ['chinese-book-detective', 'english-mini-theatre'] },
    { sceneId: 'english-sound-friends', subject: 'english', tags: ['声音', '动物'], pieces: ['cat 和 hat 哪里听起来像', 'dog 的声音要找哪位朋友', '听见一个词时怎样找到图片'], nextSceneIds: ['english-command-station', 'chinese-sound-lab'] },
    { sceneId: 'english-command-station', subject: 'english', tags: ['动作', '英语'], pieces: ['jump 和 clap 的动作有什么不同', 'turn around 会邀请小通做什么', '我还能用英语请家人做什么动作'], nextSceneIds: ['english-mini-theatre', 'math-stairs'] },
    { sceneId: 'english-mini-theatre', subject: 'english', tags: ['朋友', '对话'], pieces: ['第一次见面为什么先说 Hello', '朋友问 How are you 时我想怎样回答', '谁应该先开口'], nextSceneIds: ['english-treasure-book', 'chinese-story-director'] },
    { sceneId: 'english-treasure-book', subject: 'english', tags: ['颜色', '词语'], pieces: ['同一个 red 可以形容哪些东西', 'blue ball 为什么要先说颜色', '我还会在哪个地方用这个词'], nextSceneIds: ['english-sound-friends', 'math-city'] }
  ];

  // 世界状态只从真实完成的场景推导，不预置“已经解锁”的虚假结果。
  const worldPlaces = [
    { id: 'forest-camp', title: '森林野餐地', color: 'yellow', art: 'assets/balance-card.svg', sceneIds: ['math-picnic', 'chinese-story-director', 'english-command-station'], waiting: '野餐篮还空着。小通在等你决定先分什么、说什么、做什么。', growing: '野餐地正在热闹起来：你已经帮小通完成一部分准备。', ready: '野餐地准备好了！这些变化来自你真的完成过的探索。' },
    { id: 'rescue-path', title: '动物救援路', color: 'blue', art: 'assets/stairs.svg', sceneIds: ['math-stairs', 'chinese-book-detective', 'english-sound-friends'], waiting: '救援路上还没有脚印。先选一张任务卡，让小通知道往哪里走。', growing: '救援路出现了新的脚印。小通会保留你的进度，明天也能继续。', ready: '动物朋友已经找到路啦！这是你在不同学科留下的真实线索。' },
    { id: 'museum-hall', title: '迷你博物馆', color: 'purple', art: 'assets/pattern.svg', sceneIds: ['math-city', 'chinese-character-workshop', 'english-treasure-book'], waiting: '展台正在等第一件作品：一个形状、一幅字的画面，或一个英文词。', growing: '展台多了一件你留下的作品。下一件可以来自另一个学习岛。', ready: '迷你博物馆开馆啦！每件展品都来自你亲手完成的一次探索。' }
  ];

  return {
    subjects,
    concepts,
    scenes,
    projects,
    inquiryTrails,
    worldPlaces,
    sceneById: Object.fromEntries(scenes.map((scene) => [scene.id, scene])),
    subjectById: Object.fromEntries(subjects.map((subject) => [subject.id, subject])),
    conceptById: Object.fromEntries(concepts.map((concept) => [concept.id, concept])),
    inquiryTrailByScene: Object.fromEntries(inquiryTrails.map((trail) => [trail.sceneId, trail]))
  };
})();
