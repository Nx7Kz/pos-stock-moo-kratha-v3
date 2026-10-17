// c8 เขียนพาธเต็มของเครื่อง (D:\...) ลง lcov แต่ sonar-scanner รันใน Docker จึงต้องเปลี่ยนเป็นพาธจากรากโปรเจกต์
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = path.dirname(backendDir);
const file = path.join(backendDir, 'coverage', 'lcov.info');

const out = fs.readFileSync(file, 'utf8').replaceAll(/^SF:(.+)$/gm, (_, p) =>
  'SF:' + path.relative(rootDir, p).split(path.sep).join('/'));
fs.writeFileSync(file, out);
console.log('  lcov.info -> พาธจากรากโปรเจกต์แล้ว');
