'use strict';

/**
 * 年年の歌單｜Google 試算表即時連動
 * A：歌名、B：歌手、C：分類、D：字數（不是連結）、F：篩選標籤
 * H：設定名稱、I：設定值
 * 不使用 localStorage / sessionStorage / IndexedDB / Service Worker 留存歌單。
 * 每次讀取 Google Sheets 都帶上唯一參數以避開瀏覽器 / CDN 的舊資料快取。
 */
const SHEET_ID = '1nFJG7gG6iJQq9a9LQbHuC78lnSjyV7pOR_nrWXk80jE';
const SHEET_GID = '0';
const RECHECK_MS = 45_000;
const SHEET_TIMEOUT_MS = 15_000;
const FISH_ICON_URL = './assets/fish-icon.svg?v=20261030-nian4';
const palette = [
  ['#6f8795','#edf3f5'],['#7f9aaa','#eef5f4'],['#8da0b6','#f0f3f8'],
  ['#78918b','#eef4f1'],['#a18f99','#f6f1f4'],['#9b947e','#f5f2ea'],
  ['#8393a0','#eef2f5'],['#7795a3','#edf5f7'],['#8f98aa','#f3f4ee'],
  ['#9a8e88','#f6f1ed'],['#7189a8','#edf1f8'],['#6d9a98','#edf6f5'],
  ['#907f9d','#f3eff6'],['#ad928f','#f8f1f0'],['#8ca0a6','#edf3f5']
];

let songs = [];
let tags = [];
let activeTag = null;
let query = '';
let loadedAt = 0;
let requestSerial = 0;
let activeRequest = null;
let lastRenderedFingerprint = '';

const el = (id) => document.getElementById(id);
const clean = (value) => String(value === null || value === undefined ? '' : value)
  .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
  .trim();

function cell(row, index) {
  const c = row && Array.isArray(row.c) ? row.c[index] : null;
  if (!c) return '';
  return clean(c.f !== undefined && c.f !== null ? c.f : c.v);
}

function parseTags(value) {
  return clean(value)
    .replace(/[｜|／\/;；、，\n\r]/g, ',')
    .split(',')
    .map(clean)
    .filter((tag) => tag && !['-','—','標籤'].includes(tag));
}

function settingsFromRows(rows) {
  const settings = {};
  const allowed = ['網站標題','網站小標題','抽歌視窗標題','關閉按鈕文字'];
  for (const row of rows) {
    // 新試算表的設定欄為 H / I；也相容原站的其他欄位放置方式。
    for (let i = 0; i < Math.max(9, row && row.c ? row.c.length : 0) - 1; i++) {
      const originalKey = cell(row,i);
      const normalizedKey = originalKey.replace(/[：:\s]/g,'');
      const next = cell(row,i+1);
      for (const k of allowed) {
        if (normalizedKey.includes(k) && next) settings[k] = next;
      }
      const matched = originalKey.match(/^(網站標題|網站小標題|抽歌視窗標題|關閉按鈕文字)\s*[：:]\s*(.+)$/);
      if (matched && clean(matched[2])) settings[matched[1]] = clean(matched[2]);
    }
  }
  return {
    title: settings['網站標題'] || '年年の歌單',
    subtitle: settings['網站小標題'] || '他很壞嘟嘟嘟',
    modalTitle: settings['抽歌視窗標題'] || '🐟年年推薦',
    closeText: settings['關閉按鈕文字'] || '就這個了!'
  };
}

function applySettings(settings) {
  // 先更新所有標題，再解除隱藏，避免預設舊標題閃現。
  el('siteTitle').textContent = settings.title;
  el('siteSubtitle').textContent = settings.subtitle;
  el('modalTitle').textContent = settings.modalTitle;
  el('closeModal').textContent = settings.closeText;
  document.title = settings.title;
  document.body.classList.remove('settings-pending');
}

function parseSheet(response) {
  if (!response || response.status !== 'ok' || !response.table || !Array.isArray(response.table.rows)) {
    throw new Error('試算表沒有提供可讀取的資料，請確認共用權限。');
  }
  const rows = response.table.rows;
  const nextSongs = [];
  const masterTags = [];
  for (const row of rows) {
    const title = cell(row,0);
    const artist = cell(row,1);
    const category = cell(row,2);
    const colD = cell(row,3); // 年年試算表 D 欄為「字數」，不可作為歌曲連結。
    const masterTagCell = cell(row,5);
    masterTags.push(...parseTags(masterTagCell));
    const looksLikeHeader = ['歌名','歌曲','曲名','title'].includes(title.toLowerCase());
    if (title && !looksLikeHeader) {
      nextSongs.push({
        title,
        artist: artist || '未填歌手',
        category: category || '未分類',
        // 相容未來若 D 欄改成網址的情況；目前 D=字數，不會誤認成連結。
        link: /^https?:\/\//i.test(colD) ? colD : ''
      });
    }
  }
  const inferred = nextSongs.flatMap((song) => parseTags(song.category));
  return {
    nextSongs,
    nextTags: Array.from(new Set(masterTags.length ? masterTags : inferred)),
    settings: settingsFromRows(rows)
  };
}

function setBusy(isBusy, initial) {
  if (initial) el('randomBtn').disabled = true;
  el('grid').setAttribute('aria-busy', isBusy ? 'true' : 'false');
}

function discardActiveRequest() {
  if (!activeRequest) return;
  const req = activeRequest;
  activeRequest = null;
  clearTimeout(req.timeout);
  req.script.remove();
  try { delete window[req.callbackName]; } catch (_) { window[req.callbackName] = undefined; }
}

function loadSheet(options = {}) {
  if (document.visibilityState === 'hidden' && !options.force) return;
  const initial = loadedAt === 0;
  discardActiveRequest();
  const serial = ++requestSerial;
  const callbackName = `nianSheetCallback_${serial}_${Date.now()}`;
  const script = document.createElement('script');
  const params = new URLSearchParams({
    gid: SHEET_GID,
    headers: '0',
    tqx: `out:json;responseHandler:${callbackName}`,
    _fresh: `${Date.now()}_${serial}_${Math.random().toString(36).slice(2)}`
  });
  // 只從這份新的 Google Sheets 抓資料；不設置任何舊歌單備援。
  script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?${params}`;
  script.async = true;
  script.referrerPolicy = 'no-referrer';
  setBusy(true,initial);
  if (initial) {
    el('count').textContent = '讀取最新歌單中…';
    el('empty').style.display = 'none';
  }

  const isCurrent = () => activeRequest && activeRequest.serial === serial;
  const fail = (message) => {
    if (!isCurrent()) return;
    discardActiveRequest();
    // 讀取失敗就清掉畫面，不展示可能已過期的舊資料。
    songs = [];tags = [];activeTag = null;loadedAt = 0;lastRenderedFingerprint = '';
    el('randomBtn').disabled = true;
    el('count').textContent = '目前無法確認最新歌單';
    if (initial) {
      // 首次載入失敗時顯示明確提示，不把 HTML 的預設文字當成最新標題。
      el('siteTitle').textContent = '暫時無法取得最新標題';
      el('siteSubtitle').textContent = '請稍後重新整理再試一次';
      document.title = '年年の歌單｜載入失敗';
      document.body.classList.remove('settings-pending');
    }
    el('grid').replaceChildren();
    el('grid').setAttribute('aria-busy','false');
    el('tags').replaceChildren();
    el('empty').textContent = `無法取得最新歌單（${message}），請重新整理頁面再試一次。`;
    el('empty').style.display = 'block';
  };

  window[callbackName] = (response) => {
    if (!isCurrent()) return;
    let parsed;
    try { parsed = parseSheet(response); }
    catch (error) { console.error('年年歌單讀取失敗：',error);fail('試算表讀取失敗，請檢查分享權限');return; }
    discardActiveRequest();
    const fingerprint = JSON.stringify([parsed.nextSongs,parsed.nextTags,parsed.settings]);
    songs = parsed.nextSongs;
    tags = parsed.nextTags;
    if (activeTag !== null && !tags.includes(activeTag)) activeTag = null;
    applySettings(parsed.settings);
    if (fingerprint !== lastRenderedFingerprint) {
      lastRenderedFingerprint = fingerprint;
      renderTags();
      renderSongs();
    } else {
      updateCount();
    }
    el('empty').textContent = '沒有找到符合條件的歌曲';
    loadedAt = Date.now();
    el('randomBtn').disabled = songs.length === 0;
    el('grid').setAttribute('aria-busy','false');
  };
  script.onerror = () => fail('連線失敗，無法讀取最新歌單');
  const timeout = setTimeout(() => fail('讀取逾時'),SHEET_TIMEOUT_MS);
  activeRequest = {serial,callbackName,script,timeout};
  document.head.appendChild(script);
}

function renderTags() {
  const container = el('tags');
  container.replaceChildren();
  tags.forEach((tag,index) => {
    const colors = palette[index % palette.length];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tag' + (activeTag === tag ? ' active' : '');
    button.textContent = tag;
    button.style.setProperty('--tag',colors[0]);
    button.style.setProperty('--tagLight',colors[1]);
    button.setAttribute('aria-pressed',String(activeTag === tag));
    button.addEventListener('click',() => {
      activeTag = activeTag === tag ? null : tag;
      renderTags();
      renderSongs();
    });
    container.appendChild(button);
  });
}

function matchSong(song) {
  const text = `${song.title} ${song.artist} ${song.category}`.toLocaleLowerCase();
  const matchesSearch = !query || text.includes(query.toLocaleLowerCase());
  const cats = parseTags(song.category);
  const matchesTag = !activeTag || cats.includes(activeTag) || song.artist === activeTag || song.category.includes(activeTag);
  return matchesSearch && matchesTag;
}

function updateCount() {
  const count = songs.filter(matchSong).length;
  el('count').textContent = `共 ${count} 首 / 全部 ${songs.length} 首`;
  el('empty').style.display = count ? 'none' : 'block';
}

function copySongText(text,button) {
  async function copy() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const temp = document.createElement('textarea');
      temp.value = text;
      temp.style.position = 'fixed';
      temp.style.left = '-9999px';
      document.body.appendChild(temp);
      temp.select();
      const succeeded = document.execCommand('copy');
      temp.remove();
      if (!succeeded) throw new Error('無法複製');
    }
  }
  copy().then(() => {
    button.textContent = '✓ 已複製';button.classList.add('done');
    setTimeout(() => {if(button.isConnected){button.textContent='複製';button.classList.remove('done');}},1300);
  }).catch(() => {button.textContent = '複製失敗';setTimeout(() => {if(button.isConnected)button.textContent='複製';},1600);});
}

function renderSongs() {
  const grid = el('grid');
  const visible = songs.filter(matchSong);
  const fragment = document.createDocumentFragment();
  visible.forEach((song) => {
    const card = document.createElement('article');
    card.className = 'card';
    const decor = document.createElement('img');
    decor.className = 'decor-fish';
    decor.src = FISH_ICON_URL;
    decor.alt = '';
    decor.setAttribute('aria-hidden','true');
    const title = document.createElement('h3');
    title.className = 'song';title.textContent = song.title;
    const artist = document.createElement('div');
    artist.className = 'artist';artist.textContent = song.artist;
    const cat = document.createElement('span');
    cat.className = 'cat';cat.textContent = parseTags(song.category).join(' ') || '未分類';
    const copy = document.createElement('button');
    copy.className='copy';copy.type='button';copy.textContent='複製';
    copy.setAttribute('aria-label',`複製歌曲 ${song.title} - ${song.artist}`);
    copy.addEventListener('click',() => copySongText(`${song.title} - ${song.artist}`,copy));
    card.append(decor,title,artist,cat,copy);
    if(song.link){card.title='雙擊開啟歌曲連結';card.addEventListener('dblclick',() => window.open(song.link,'_blank','noopener,noreferrer'));}
    fragment.appendChild(card);
  });
  grid.replaceChildren(fragment);
  updateCount();
}

function openModal() {
  const filtered = songs.filter(matchSong);
  if (!filtered.length) return;
  const picked = filtered[Math.floor(Math.random()*filtered.length)];
  el('pickSong').textContent = picked.title;
  el('pickArtist').textContent = `${picked.artist}｜${parseTags(picked.category).join(' ') || '未分類'}`;
  el('modal').classList.add('show');
  el('modal').setAttribute('aria-hidden','false');
  el('closeModal').focus();
}
function closeModal() {
  el('modal').classList.remove('show');
  el('modal').setAttribute('aria-hidden','true');
  el('randomBtn').focus();
}

function initFloats() {
  const symbols = ['♪','♫','✦','♬','✧'];
  const layer = el('floatLayer');
  for(let i=0;i<22;i++){
    const symbol=document.createElement('span');
    symbol.className='float';symbol.textContent=symbols[i%symbols.length];
    symbol.style.setProperty('--left',`${Math.random()*100}%`);
    symbol.style.setProperty('--dur',`${10+Math.random()*14}s`);
    symbol.style.setProperty('--delay',`${-Math.random()*16}s`);
    layer.appendChild(symbol);
  }
}

function clearLegacyCaches() {
  // 若訪客以前安裝過此來源的離線 Service Worker，嘗試解除舊版控制。
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.filter((reg) => reg.scope.includes(location.pathname.replace(/[^/]*$/,''))).forEach((reg) => reg.unregister()))
      .catch(() => {});
  }
  // 只刪除舊歌單自己建立的快取桶，不影響同一個 origin 其他網站。
  if ('caches' in window) {
    caches.keys().then((keys) => Promise.all(keys.filter((key) => /^(fang-fang|nian-nian|playlist)-/i.test(key)).map((key) => caches.delete(key)))).catch(() => {});
  }
}

function boot() {
  el('search').addEventListener('input',(event)=>{query=event.target.value.trim();renderSongs();});
  el('randomBtn').addEventListener('click',openModal);
  el('closeModal').addEventListener('click',closeModal);
  el('modal').addEventListener('click',(event)=>{if(event.target===el('modal'))closeModal();});
  document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&el('modal').classList.contains('show'))closeModal();});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible') loadSheet({force:true});
  });
  window.addEventListener('pageshow',(event)=>{
    if(event.persisted) loadSheet({force:true});
  });
  window.addEventListener('focus',()=>{
    if(loadedAt && Date.now()-loadedAt>15_000)loadSheet({force:true});
  });
  setInterval(()=>{if(document.visibilityState==='visible')loadSheet();},RECHECK_MS);
  initFloats();clearLegacyCaches();loadSheet({force:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();