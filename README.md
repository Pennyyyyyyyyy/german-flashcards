# 德文字卡

依課本整理的德文單字字卡練習網站。

🔗 網站：（GitHub Pages 網址）

## 功能

- 每一課一組字卡，可以勾選要練的詞性（或全選）
- 「正面顯示冠詞」開關：開啟時正面顯示冠詞並依性別上色（der 藍 / die 紅 / das 綠）
- 翻面看完整冠詞、中文、複數形
- 猜性別模式：看單字選 der / die / das
- 德文發音

## 新增一課

1. 把 `第N課單字(全).xlsx` 放進 `單字檔案/`
2. `python3 scripts/convert.py --check` 檢查內容
3. 確認無誤後 `python3 scripts/convert.py` 產生資料
4. commit 並 push

專案規則寫在 [`CLAUDE.md`](CLAUDE.md)，AI 依照它來檢查單字、新增內容。

## 本機預覽

```bash
pip3 install openpyxl
python3 scripts/convert.py
python3 -m http.server 8000
```

打開 http://localhost:8000
