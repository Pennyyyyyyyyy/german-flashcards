#!/usr/bin/env python3
"""把 單字檔案/ 裡的 Excel 轉成網站用的 JSON。

用法（在專案根目錄執行）：
    python3 scripts/convert.py           # 轉換 + 檢查
    python3 scripts/convert.py --check   # 只檢查，不寫檔

規則：
- 只讀 Excel，絕不修改 Excel。
- 輸出到 data/lessonN/<詞性>.json，並重建 data/lessons.json。
- 檢查到的疑點只會「列出來」，不會自動更正任何內容。
"""
import json
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("需要 openpyxl：請先執行 pip3 install openpyxl")

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "單字檔案"
OUT = ROOT / "data"

COLUMNS = ["性別(名詞)", "單字", "複數形", "音節數", "中文翻譯", "詞性", "課本出處"]
GENDERS = {"der", "die", "das"}
UNSORTED = "未分類"
CN_NUM = {"零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
          "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}

# 常見字尾 → 性別（只用來提醒，例外很多，不代表一定錯）
SUFFIX_HINTS = [
    (("ung", "heit", "keit", "schaft", "ion", "tät", "ik", "ei"), "die"),
    (("chen", "lein", "ment", "um"), "das"),
    (("ismus", "ling"), "der"),
]


def cn_to_int(s):
    """'三' -> 3, '十二' -> 12, '二十' -> 20, '7' -> 7"""
    if s.isdigit():
        return int(s)
    if "十" in s:
        a, _, b = s.partition("十")
        return (CN_NUM.get(a, 1) if a else 1) * 10 + (CN_NUM.get(b, 0) if b else 0)
    return CN_NUM.get(s)


def lesson_number(path, rows):
    m = re.search(r"第(.+?)課", path.stem)
    if m and cn_to_int(m.group(1)) is not None:
        return cn_to_int(m.group(1))
    for r in rows:  # 備用：從「課本出處」的 LektionN 抓
        m = re.search(r"Lektion\s*(\d+)", str(r.get("課本出處") or ""))
        if m:
            return int(m.group(1))
    return None


def clean(v):
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def split_list(s, seps=r"[/／;；、,，]"):
    return [p.strip() for p in re.split(seps, s) if p.strip()] if s else []


def read_excel(path):
    ws = openpyxl.load_workbook(path, data_only=True).active
    header = [clean(c) for c in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]
    missing = [c for c in COLUMNS if c not in header]
    if missing:
        raise ValueError(f"{path.name} 缺少欄位：{missing}（第一列必須是 {COLUMNS}）")
    idx = {c: header.index(c) for c in COLUMNS}
    rows = []
    for n, raw in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if all(v is None or str(v).strip() == "" for v in raw):
            continue
        r = {c: raw[idx[c]] if idx[c] < len(raw) else None for c in COLUMNS}
        r["_row"] = n
        rows.append(r)
    return rows


def check(path, rows):
    """回傳疑點清單 [(列號, 單字, 說明)]，不修改任何資料。"""
    issues = []
    seen = {}
    for r in rows:
        n, word = r["_row"], clean(r["單字"])
        for c in COLUMNS:
            v = r[c]
            if isinstance(v, str) and v != v.strip():
                issues.append((n, word, f"「{c}」前後有多餘空白（網站會自動忽略）"))
        art_raw, pos_raw = clean(r["性別(名詞)"]), clean(r["詞性"])
        arts = split_list(art_raw)
        pos = split_list(pos_raw)
        if not word:
            issues.append((n, word, "缺少「單字」"))
            continue
        if not clean(r["中文翻譯"]):
            issues.append((n, word, "缺少「中文翻譯」"))
        if not pos:
            issues.append((n, word, f"缺少「詞性」（會放進「{UNSORTED}」）"))
        bad = [a for a in arts if a not in GENDERS]
        if bad:
            issues.append((n, word, f"冠詞不是 der/die/das：{bad}"))
        is_noun = "名詞" in pos
        if is_noun and not arts:
            issues.append((n, word, "名詞沒有冠詞（國名等可能本來就沒有，請確認）"))
        if arts and not is_noun:
            issues.append((n, word, f"不是名詞卻有冠詞「{art_raw}」"))
        if is_noun and word[:1].islower():
            issues.append((n, word, "德文名詞字首通常大寫"))
        if clean(r["複數形"]) and not is_noun:
            issues.append((n, word, "不是名詞卻有複數形"))
        if is_noun and len(arts) == 1:
            low = word.lower()
            if low.endswith("in") and arts[0] != "die" and word[:1].isupper() and len(low) > 4:
                issues.append((n, word, f"字尾 -in 的陰性名詞通常是 die，目前是 {arts[0]}"))
            for sufs, g in SUFFIX_HINTS:
                hit = next((s for s in sufs if low.endswith(s)), None)
                if hit == "chen" and low.endswith("kuchen"):
                    continue  # der Kuchen 不是縮小詞
                if hit and len(low) > len(hit) + 1 and arts[0] != g:
                    issues.append((n, word, f"字尾 -{hit} 通常是 {g}，目前是 {arts[0]}（可能是例外）"))
        key = word  # 大小寫不同視為不同字（essen 動詞 / das Essen 名詞）
        if key in seen:
            issues.append((n, word, f"和第 {seen[key]} 列重複"))
        seen.setdefault(key, n)
    return issues


def to_entry(lesson_id, r):
    pos = split_list(clean(r["詞性"]), r"[;；、,，]") or [UNSORTED]
    arts = [a for a in split_list(clean(r["性別(名詞)"])) if a in GENDERS]
    return {
        "id": f"{lesson_id}-{r['_row']}",
        "word": clean(r["單字"]),
        "articles": arts,
        "plural": clean(r["複數形"]),
        "syllables": clean(r["音節數"]),
        "zh": clean(r["中文翻譯"]),
        "pos": pos,
        "ref": clean(r["課本出處"]),
    }


def pos_filename(p):
    return re.sub(r"\s+", "", p) + ".json"


def main():
    only_check = "--check" in sys.argv
    files = sorted(p for p in SRC.glob("*.xlsx") if not p.name.startswith(("~$", ".")))
    if not files:
        sys.exit(f"在 {SRC} 找不到 Excel 檔")

    lessons, total_issues = [], 0
    for path in files:
        rows = read_excel(path)
        num = lesson_number(path, rows)
        if num is None:
            print(f"⚠️  {path.name}：看不出是第幾課，檔名請用「第N課單字(全).xlsx」，先略過")
            continue
        lesson_id = f"lesson{num}"

        issues = check(path, rows)
        total_issues += len(issues)
        print(f"\n=== {path.name} → {lesson_id}（{len(rows)} 個單字）===")
        for n, word, msg in issues:
            print(f"  第 {n:>3} 列  {word or '(空白)':<22} {msg}")
        if not issues:
            print("  ✅ 沒有自動檢查到的問題")

        entries = [to_entry(lesson_id, r) for r in rows if clean(r["單字"])]
        groups = {}
        for e in entries:
            for p in e["pos"]:
                groups.setdefault(p, []).append(e)

        if not only_check:
            d = OUT / lesson_id
            d.mkdir(parents=True, exist_ok=True)
            for p, items in groups.items():
                (d / pos_filename(p)).write_text(
                    json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        order = sorted(groups, key=lambda p: (-len(groups[p]), p))
        lessons.append({
            "id": lesson_id,
            "number": num,
            "title": (re.search(r"第.+?課", path.stem) or [f"Lektion {num}"])[0],
            "source": path.name,
            "count": len(entries),
            "pos": [{"name": p, "file": pos_filename(p), "count": len(groups[p])} for p in order],
        })

    lessons.sort(key=lambda l: l["number"])
    if not only_check:
        OUT.mkdir(exist_ok=True)
        (OUT / "lessons.json").write_text(
            json.dumps(lessons, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\n已輸出 {len(lessons)} 課到 data/")
    print(f"自動檢查疑點共 {total_issues} 筆（僅供參考，不會自動修改）")


if __name__ == "__main__":
    main()
