// 所有頁面共用的小工具
const DATA_DIR = "data";

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`讀不到 ${path}（${res.status}）`);
  return res.json();
}

function loadLessons() {
  return loadJSON(`${DATA_DIR}/lessons.json`);
}

// 一課的某個詞性檔，例如 data/lesson1/名詞.json
function loadPosFile(lessonId, file) {
  return loadJSON(`${DATA_DIR}/${lessonId}/${encodeURIComponent(file)}`);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function shuffleArray(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 德文發音（瀏覽器內建語音）
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "de-DE";
  u.rate = 0.9;
  speechSynthesis.speak(u);
}
