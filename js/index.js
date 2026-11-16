// 首頁：從 data/lessons.json 產生課程列表
(async function () {
  const box = document.getElementById("lessons");
  try {
    const lessons = await loadLessons();
    const total = lessons.reduce((n, l) => n + l.count, 0);
    document.getElementById("total").textContent = `${lessons.length} 課 · ${total} 個單字`;
    box.innerHTML = lessons.map(l => `
      <a class="lesson-card" href="practice.html?lesson=${encodeURIComponent(l.id)}">
        <h2>${esc(l.title)}</h2>
        <div class="meta">Lektion ${l.number} · ${l.count} 個單字</div>
        <div class="chips">${l.pos.map(p => `<span class="chip">${esc(p.name)} ${p.count}</span>`).join("")}</div>
      </a>`).join("");
  } catch (e) {
    box.innerHTML = `<p class="empty">${esc(e.message)}<br>請先執行 python3 scripts/convert.py，並用本機伺服器開啟。</p>`;
  }
})();
