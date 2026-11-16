// 練習頁：practice.html?lesson=lesson1
const params = new URLSearchParams(location.search);
const lessonId = params.get("lesson");

const state = {
  lesson: null,
  byPos: {},          // 詞性 -> 單字陣列
  mode: "cards",      // "cards" | "gender"
  selectedPos: new Set(),
  showArticle: false,
  shuffle: true,
  deck: [],
  i: 0,
  flipped: false,
  score: { right: 0, total: 0 },
  answered: false,
};

const $ = id => document.getElementById(id);

// ---------- 顏色 ----------
function genderClass(e) {
  if (!e.articles.length) return "";
  return e.articles.length === 1 ? `g-${e.articles[0]}` : `g-${e.articles[0]} g-multi`;
}
function multiStyle(e) {
  if (e.articles.length < 2) return "";
  const [a, b] = e.articles;
  return `--c1b: var(--${a}-bg); --c2b: var(--${b}-bg);`;
}
function articleHTML(e) {
  return e.articles.map(a => `<span class="art-${a}">${a}</span>`).join(" / ");
}

// ---------- 載入 ----------
async function init() {
  const lessons = await loadLessons();
  state.lesson = lessons.find(l => l.id === lessonId) || lessons[0];
  if (!state.lesson) throw new Error("還沒有任何課程資料");
  document.title = `${state.lesson.title} · 德文字卡`;
  $("title").textContent = `${state.lesson.title}`;

  const files = await Promise.all(state.lesson.pos.map(p => loadPosFile(state.lesson.id, p.file)));
  state.lesson.pos.forEach((p, k) => { state.byPos[p.name] = files[k]; });
  state.lesson.pos.forEach(p => state.selectedPos.add(p.name));

  renderPosList();
  bindEvents();
  rebuildDeck();
}

function renderPosList() {
  $("pos-list").innerHTML = state.lesson.pos.map(p => `
    <label><input type="checkbox" class="pos" value="${esc(p.name)}" checked>
      ${esc(p.name)} <span class="count">${p.count}</span></label>`).join("");
}

// ---------- 牌組 ----------
function rebuildDeck() {
  const seen = new Set();
  let words = [];
  if (state.mode === "gender") {
    // 猜性別：只用有冠詞的名詞
    for (const list of Object.values(state.byPos))
      for (const e of list)
        if (e.articles.length && !seen.has(e.id)) { seen.add(e.id); words.push(e); }
  } else {
    for (const p of state.lesson.pos)
      if (state.selectedPos.has(p.name))
        for (const e of state.byPos[p.name])
          if (!seen.has(e.id)) { seen.add(e.id); words.push(e); }  // 一個字有兩種詞性時只出現一次
  }
  state.deck = state.shuffle ? shuffleArray(words) : words;
  state.i = 0;
  state.score = { right: 0, total: 0 };
  render();
}

function render() {
  $("cards-view").hidden = state.mode !== "cards";
  $("gender-view").hidden = state.mode !== "gender";
  $("pos-row").hidden = state.mode !== "cards";
  $("show-article-wrap").hidden = state.mode !== "cards";
  state.mode === "cards" ? renderCard() : renderGender();
}

// ---------- 字卡模式 ----------
function renderCard() {
  const card = $("card");
  state.flipped = false;
  card.classList.remove("flipped");
  const e = state.deck[state.i];
  if (!e) {
    $("front").className = "face front-face";
    $("front").innerHTML = `<p class="empty">請至少勾選一個詞性</p>`;
    $("back").innerHTML = "";
    $("progress").textContent = "0 / 0";
    $("prev").disabled = $("next").disabled = true;
    return;
  }
  const g = genderClass(e);
  const showArt = state.showArticle && e.articles.length;

  // 正面：開「顯示冠詞」→ 冠詞＋顏色；關 → 白色只有單字
  const front = $("front");
  front.className = `face front-face ${showArt ? "colored " + g : ""}`;
  front.style.cssText = showArt ? multiStyle(e) : "";
  front.innerHTML = `
    <button class="speak" title="發音" data-say="${esc(e.word)}">🔊</button>
    <div class="word">${showArt ? `<span class="article">${e.articles.join("/")}</span>` : ""}${esc(e.word)}</div>
    <span class="hint">點一下翻面</span>`;

  // 背面：一律顯示完整冠詞＋顏色＋中文
  const back = $("back");
  back.className = `face back-face ${e.articles.length ? "colored " + g : ""}`;
  back.style.cssText = multiStyle(e);
  const info = [e.pos.join("・"), e.plural ? `複數 ${esc(e.plural)}` : "", e.ref ? esc(e.ref) : ""].filter(Boolean).join(" · ");
  back.innerHTML = `
    <button class="speak" title="發音" data-say="${esc((e.articles[0] ? e.articles[0] + " " : "") + e.word)}">🔊</button>
    <div class="word">${e.articles.length ? `<span class="article">${articleHTML(e)}</span>` : ""}${esc(e.word)}</div>
    <div class="zh">${esc(e.zh)}</div>
    <div class="info">${info}</div>`;

  $("progress").textContent = `${state.i + 1} / ${state.deck.length}`;
  $("prev").disabled = state.i === 0;
  $("next").disabled = state.i >= state.deck.length - 1;
}

function flip() {
  if (!state.deck.length) return;
  state.flipped = !state.flipped;
  $("card").classList.toggle("flipped", state.flipped);
}
function move(d) {
  const n = state.i + d;
  if (n < 0 || n >= state.deck.length) return;
  state.i = n;
  render();
}

// ---------- 猜性別模式 ----------
function renderGender() {
  state.answered = false;
  const e = state.deck[state.i];
  const face = $("g-face");
  document.querySelectorAll(".choice").forEach(b => { b.disabled = !e; b.classList.remove("right", "wrong"); });
  $("g-feedback").textContent = "";
  $("g-score").textContent = `答對 ${state.score.right} / ${state.score.total}`;
  if (!e) {
    face.className = "face";
    face.innerHTML = `<p class="empty">這一課沒有可以猜性別的名詞</p>`;
    $("g-progress").textContent = "";
    $("g-next").disabled = true;
    return;
  }
  face.className = "face";
  face.style.cssText = "";
  face.innerHTML = `<div class="word">${esc(e.word)}</div><span class="hint">der、die 還是 das？</span>`;
  $("g-progress").textContent = `${state.i + 1} / ${state.deck.length}`;
  $("g-next").disabled = true;
}

function answer(g) {
  const e = state.deck[state.i];
  if (!e || state.answered) return;
  state.answered = true;
  // 有兩種性別的字（例如 der/das Joghurt）猜到其中一種就算對
  const ok = e.articles.includes(g);
  state.score.total++;
  if (ok) state.score.right++;
  document.querySelectorAll(".choice").forEach(b => {
    b.disabled = true;
    if (e.articles.includes(b.dataset.g)) b.classList.add("right");
    else b.classList.add("wrong");
  });
  const face = $("g-face");
  face.className = `face colored ${genderClass(e)}`;
  face.style.cssText = multiStyle(e);
  face.innerHTML = `
    <button class="speak" title="發音" data-say="${esc(e.articles[0] + " " + e.word)}">🔊</button>
    <div class="word"><span class="article">${articleHTML(e)}</span>${esc(e.word)}</div>
    <div class="zh">${esc(e.zh)}</div>
    ${e.plural ? `<div class="info">複數 ${esc(e.plural)}</div>` : ""}`;
  $("g-feedback").textContent = ok ? "✓ 答對了" : `✗ 正確是 ${e.articles.join(" / ")}`;
  $("g-score").textContent = `答對 ${state.score.right} / ${state.score.total}`;
  const last = state.i >= state.deck.length - 1;
  $("g-next").disabled = false;
  $("g-next").textContent = last ? "再來一輪" : "下一題 →";
}

function nextGender() {
  if (!state.answered) return;
  if (state.i >= state.deck.length - 1) { rebuildDeck(); $("g-next").textContent = "下一題 →"; return; }
  state.i++;
  renderGender();
}

// ---------- 事件 ----------
function bindEvents() {
  $("mode").addEventListener("click", ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    state.mode = b.dataset.mode;
    document.querySelectorAll("#mode button").forEach(x => x.classList.toggle("on", x === b));
    rebuildDeck();
  });

  $("pos-all").addEventListener("change", ev => {
    document.querySelectorAll(".pos").forEach(c => { c.checked = ev.target.checked; });
    state.selectedPos = new Set(ev.target.checked ? state.lesson.pos.map(p => p.name) : []);
    rebuildDeck();
  });
  $("pos-list").addEventListener("change", ev => {
    if (!ev.target.classList.contains("pos")) return;
    ev.target.checked ? state.selectedPos.add(ev.target.value) : state.selectedPos.delete(ev.target.value);
    $("pos-all").checked = state.selectedPos.size === state.lesson.pos.length;
    rebuildDeck();
  });

  $("show-article").addEventListener("change", ev => { state.showArticle = ev.target.checked; renderCard(); });
  $("shuffle").addEventListener("change", ev => { state.shuffle = ev.target.checked; rebuildDeck(); });

  $("card").addEventListener("click", ev => {
    if (ev.target.closest(".speak")) return;
    flip();
  });
  $("prev").addEventListener("click", () => move(-1));
  $("next").addEventListener("click", () => move(1));

  document.querySelectorAll(".choice").forEach(b => b.addEventListener("click", () => answer(b.dataset.g)));
  $("g-next").addEventListener("click", nextGender);

  document.addEventListener("click", ev => {
    const s = ev.target.closest(".speak");
    if (s) { ev.stopPropagation(); speak(s.dataset.say); }
  });

  document.addEventListener("keydown", ev => {
    if (ev.target.matches("input")) return;
    if (state.mode === "cards") {
      if (ev.key === " ") { ev.preventDefault(); flip(); }
      if (ev.key === "ArrowRight") move(1);
      if (ev.key === "ArrowLeft") move(-1);
    } else {
      const map = { "1": "der", "2": "die", "3": "das" };
      if (map[ev.key]) answer(map[ev.key]);
      if (ev.key === "Enter") nextGender();
    }
  });
}

init().catch(e => {
  document.querySelector("main").insertAdjacentHTML("beforeend", `<p class="empty">${esc(e.message)}</p>`);
});
