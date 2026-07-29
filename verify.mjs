import { readFileSync, existsSync } from 'node:fs';

const requiredFiles = [
  'index.html', 'styles.css', 'app.js',
  'assets/logo.svg', 'assets/balance-hero.svg', 'assets/balance-task.svg',
  'assets/buddy.svg', 'assets/map-links.svg'
];
const requiredTexts = ['自学大师', '一起修好一座', '我的数学地图', '证据矩阵', '不汇总成一个分数'];
const html = readFileSync('index.html', 'utf8');
const missingFiles = requiredFiles.filter((file) => !existsSync(file));
const missingTexts = requiredTexts.filter((text) => !html.includes(text));

if (missingFiles.length || missingTexts.length) {
  console.error(JSON.stringify({ missingFiles, missingTexts }, null, 2));
  process.exit(1);
}

console.log(`Static QA passed: ${requiredFiles.length} files and ${requiredTexts.length} key PRD statements present.`);

