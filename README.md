# 年年の歌單 🐟

這是一個可直接部署到 **GitHub Pages** 的純 HTML / CSS / JavaScript 歌單網站，不需要 npm、編譯流程、資料庫或金鑰。

## 與原站一致的主要尺寸與操作

- 頁面最大寬度：**1180px**；歌曲卡片最低高度 **150px**、最小欄寬 **230px**、欄距 **18px**。
- 保留搜尋歌名、歌手、分類，依標籤篩選、隨機抽歌、複製歌名等功能。
- 手機改為單欄歌曲卡片；桌機／手機均採原創小魚與復古卡帶背景。
- 網站標題、頁首小魚圖示、分頁圖示、歌卡裝飾和著作權頁已更新為「年年の歌單」及小魚。
- 頁首只保留小魚圖示；歌曲總數置中顯示，不顯示同步狀態或手動更新按鈕。
- 版權行保留：© 2026 LionLionTomato. All Rights Reserved.

## 使用的 Google 試算表

<https://docs.google.com/spreadsheets/d/1nFJG7gG6iJQq9a9LQbHuC78lnSjyV7pOR_nrWXk80jE/edit?usp=sharing>

目前依照此試算表的**第一個工作表（gid=0）**讀取：

| 欄位 | 說明 |
|---|---|
| A | 歌名（必填） |
| B | 歌手 |
| C | 歌曲分類（可輸入多個分類，以頓號、逗號、斜線等分隔） |
| D | 字數（不會當成歌曲連結） |
| F | 網站上方「分類標籤按鈕」清單，與歌曲列數無關 |
| H、I | 網站標題、小標題、抽歌視窗標題、關閉按鈕文字等設定名稱與設定值 |

**注意**：F 欄只是建立上方分類按鈕；如希望點擊分類後看到歌曲，請在歌曲自己的 **C 欄**填入相同分類。若 C 欄空白，歌曲仍顯示，但分類為「未分類」。

如果新增歌曲後網站沒顯示，先確認試算表分享為「知道連結的任何人 → 檢視者」。

## 防止顯示舊資料

- 不使用本機離線歌單或快取過的舊歌曲做備援。
- 每次進入網站，會以唯一時間參數向 Google 試算表讀取資料。
- 每次進入網站都會重新讀取最新歌單；頁面保持開啟時每 **45 秒**自動更新，重新切回分頁時也會重抓。如需手動重試，重新整理網頁即可。
- 讀取失敗時不顯示可能過期的歌曲，而會在歌曲列表位置顯示錯誤提示。
- CSS/JS/圖示使用版本參數（本次已更新為 `20261029-nian3`）；沒有註冊新的 Service Worker。

> 注意：GitHub Pages 的 **HTML 回應快取**由 GitHub 控制，Google Sheets 的資料發布也可能有短暫傳播時間，靜態前端無法保證全球使用者在更新後的「同一秒」看到變更。此版已針對**歌曲資料的舊快取**及重新同步做最佳化；每次更新網站程式／樣式時請修改 `index.html`、`copyright.html`、`style.css` 中的 `?v=20261029-nian3` 版本字串，若改動圖片或 JS 亦同。

## 上傳至 GitHub Pages

1. 將 ZIP **解壓縮**，把 `index.html`、`script.js`、`style.css`、`copyright.html`、`assets` 資料夾、`.nojekyll` 等內容上傳到 GitHub repository 的**根目錄**（不要再多包一層資料夾）。
2. 開啟該 repository 的 **Settings → Pages**。
3. 在 **Build and deployment** 選 **Deploy from a branch**。
4. Branch 選 `main`、Folder 選 `/(root)`，儲存。
5. 網址格式通常為 `https://你的帳號.github.io/你的repo名稱/`。

如要更新站點，直接上傳替換這些檔案即可，**不需要修改試算表 ID**。

## 檔案

```
index.html             首頁
style.css              同尺寸版面 + 魚群視覺
script.js              歌單資料讀取、快取控制、互動功能
copyright.html         年年版著作權聲明
.nojekyll              GitHub Pages 設定
assets/
  nian-bg-desktop.webp 原創桌機背景
  nian-bg-mobile.webp  原創手機背景
  fish-icon.svg        魚圖示 / favicon
  favicon-192.png      App 圖示
  apple-touch-icon.png iOS 主畫面圖示
```
