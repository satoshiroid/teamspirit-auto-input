const FAV_KEYS = ["製品分野","業務区分","業務種別_技術要素１","業務種別_技術要素２","業務種別_技術要素3","アウトプット名称"];
// 社内業務ジョブ（TeamSpiritに割当済み）。match=ダイアログ内でジョブ行を特定する識別文字列。
const SHANAI_JOBS = [
  { label: "労務懇談会", match: "社内業務_労務懇談会" },
  { label: "定期健康診断", match: "社内業務_定期健康診断" },
  { label: "代表者連絡会", match: "社内業務_代表者連絡会" },
  { label: "客先所定内移動時間", match: "客先所定内移動時間" },
  { label: "個人面談", match: "社内業務_個人面談" },
];
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const show = id => { ["view-main","view-settings","view-auto"].forEach(v=>$("#"+v).classList.toggle("hidden", v!==id)); };
const pad = n => String(n).padStart(2,"0");

function setStatus(launched, loggedIn, browserName){
  $("#dot").classList.toggle("on", !!loggedIn);
  const b = browserName ? `（${browserName}）` : "";
  $("#statusText").textContent = !launched ? "未起動" : (loggedIn ? "ログイン済み"+b : "未ログイン"+b+"（ブラウザでログインしてください）");
}
async function refreshStatus(){ const s = await api.browserStatus(); setStatus(s.launched, s.loggedIn, s.browserName); }

$("#btnLaunch").onclick = async () => {
  $("#btnLaunch").disabled = true; $("#statusText").textContent = "起動中…";
  try { const r = await api.launchBrowser(); setStatus(true, r.loggedIn, r.browserName); }
  catch(e){ alert("起動失敗: "+e.message); }
  $("#btnLaunch").disabled = false;
};
$("#btnRecheck").onclick = refreshStatus;
$("#btnSettings").onclick = () => { loadSettings(); show("view-settings"); };
$("#btnAuto").onclick = () => { initAuto(); show("view-auto"); };
$("#btnBack1").onclick = () => show("view-main");
$("#btnBack2").onclick = () => show("view-auto");

function fillForm(cfg){
  $("#jobMatch").value = cfg.kousu?.jobMatch || "";
  FAV_KEYS.forEach(k => { const el = $(`[data-fav="${k}"]`); if(el) el.value = (cfg.kousu?.favorites||{})[k] || ""; });
  $$("[data-pk]").forEach(el => el.value = (cfg.kousu?.picklists||{})[el.dataset.pk] || "");
  $("#kinmuBasho").value = cfg.constants?.kinmuBasho || "";
  $("#gyomuNaiyo").value = cfg.constants?.gyomuNaiyo || "";
}
async function loadSettings(){ fillForm(await api.getConfig()); }
function formToConfig(){
  const favorites = {}; FAV_KEYS.forEach(k=>{ const v=$(`[data-fav="${k}"]`).value.trim(); if(v) favorites[k]=v; });
  const picklists = {}; $$("[data-pk]").forEach(el=>{ if(el.value) picklists[el.dataset.pk]=el.value; });
  return {
    constants: { kinmuBasho: $("#kinmuBasho").value, gyomuNaiyo: $("#gyomuNaiyo").value.trim(), breakDefault:{start:"12:00",end:"13:00"} },
    kousu: { jobMatch: $("#jobMatch").value.trim(), favorites, picklists }
  };
}
$("#btnSave").onclick = async () => {
  const cfg = formToConfig();
  const missing = [];
  if(!cfg.kousu.jobMatch) missing.push("主ジョブ");
  FAV_KEYS.forEach(k => { if(!cfg.kousu.favorites[k]) missing.push(k); });
  ["知識","技能"].forEach(k => { if(!cfg.kousu.picklists[k]) missing.push(k); });
  if(!cfg.constants.kinmuBasho) missing.push("勤務場所");
  if(!cfg.constants.gyomuNaiyo) missing.push("業務内容");
  if(missing.length){ alert("未入力の項目があります。すべて入力してください:\n\n・"+missing.join("\n・")); return; }
  await api.saveConfig(cfg);
  alert("保存しました");
  show("view-main");
};
$("#btnDefault").onclick = async () => { fillForm(await api.getDefault()); };
$("#btnFetch").onclick = async () => {
  $("#btnFetch").disabled = true; const old = $("#btnFetch").textContent; $("#btnFetch").textContent = "取得中…";
  try {
    const r = await api.fetchSettings();
    if(!r){ alert("入力済みの日が見つかりませんでした。1日分手入力してから取得してください。"); }
    else {
      if(r.jobText){ const m=r.jobText.split(/\s+/).find(p=>/^\d{5,}_/.test(p)); if(m) $("#jobMatch").value=m; }
      FAV_KEYS.forEach((k,i)=>{ const el=$(`[data-fav="${k}"]`); if(el && r.codes[i]) el.value=r.codes[i]; });
      const pks=$$("[data-pk]"); (r.selects||[]).forEach((v,i)=>{ if(pks[i]&&v) pks[i].value=v; });
      if(r.kinmuBasho) $("#kinmuBasho").value = r.kinmuBasho;
      if(r.gyomuNaiyo) $("#gyomuNaiyo").value = r.gyomuNaiyo;
      alert("TeamSpiritから取得しました（実際の入力値）:\n\n対象ジョブ: "+(r.jobText||"-")+"\nコード: "+(r.codes||[]).filter(Boolean).join(" / ")+"\n知識・技能: "+((r.selects||[]).filter(Boolean).join(" / ")||"-")+"\n勤務場所: "+(r.kinmuBasho||"-")+"\n業務内容: "+(r.gyomuNaiyo||"-")+"\n\n↑この値で設定欄を更新しました。確認して『保存』してください。");
    }
  } catch(e){ alert("取得失敗: "+e.message); }
  $("#btnFetch").textContent = old; $("#btnFetch").disabled = false;
};

let pickedImage = null;
function initAuto(){
  const d=new Date(); $("#ym").value = `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
  pickedImage = null; $("#imgPrev").classList.add("hidden"); $("#btnOcr").disabled = true;
  $("#confirmCard").classList.add("hidden"); $("#logCard").classList.add("hidden");
  $("#tbl tbody").innerHTML = "";
  $("#shanaiTbl tbody").innerHTML = "";
}
$("#btnPick").onclick = async () => {
  const p = await api.pickImage(); if(!p) return;
  pickedImage = p; $("#imgPrev").src = "file://"+p; $("#imgPrev").classList.remove("hidden"); $("#btnOcr").disabled = false;
};
let ocrStageMsg = "開始中…";
api.onOcrProgress(m => { ocrStageMsg = m; });
$("#btnOcr").onclick = async () => {
  if(!pickedImage) return;
  $("#btnOcr").disabled = true; const old=$("#btnOcr").textContent; $("#btnOcr").textContent="読み取り中…";
  ocrStageMsg = "開始中…";
  $("#ocrProgress").classList.remove("hidden");
  const t0 = Date.now();
  const timer = setInterval(() => {
    const sec = Math.floor((Date.now()-t0)/1000);
    $("#ocrStage").textContent = `${ocrStageMsg}　（経過 ${sec} 秒）`;
  }, 500);
  try {
    const res = await api.runOcr(pickedImage);
    if(!res.days || !res.days.length){
      alert("OCRで日付・出退勤を検出できませんでした。\nエンジン: "+(res.engine||"なし（未インストール）")+
            (res.error ? ("\n詳細: "+res.error) : "\n画像が不鮮明か、未対応レイアウトの可能性があります。"));
    }
    renderConfirm(res.days||[]);
    $("#confirmCard").classList.remove("hidden");
  } catch(e){ alert("OCR失敗: "+e.message); }
  clearInterval(timer);
  $("#ocrProgress").classList.add("hidden");
  $("#btnOcr").textContent=old; $("#btnOcr").disabled=false;
};
function normTimeR(s){
  s=(s||'').trim().replace('：',':');
  if(/^\d{1,2}:\d{2}$/.test(s)){const [h,m]=s.split(':');return pad(+h)+':'+m;}
  const d=s.replace(/\D/g,'');
  if(d.length===3)return '0'+d[0]+':'+d.slice(1);
  if(d.length===4)return d.slice(0,2)+':'+d.slice(2);
  return s;
}
function addRow(day="", start="", end=""){
  const tr=document.createElement("tr");
  tr.innerHTML = `<td><input class="d" value="${day}" placeholder="日"></td><td><input class="s" value="${start}" placeholder="HH:MM"></td><td><input class="e" value="${end}" placeholder="HH:MM"></td><td><button class="sec del">×</button></td>`;
  tr.querySelector(".del").onclick=()=>tr.remove();
  const fmt = el => el.addEventListener('blur', ()=>{ el.value = normTimeR(el.value); });
  fmt(tr.querySelector(".s")); fmt(tr.querySelector(".e"));
  $("#tbl tbody").appendChild(tr);
}
function renderConfirm(days){ $("#tbl tbody").innerHTML=""; days.forEach(d=>addRow(d.day??d.date, d.start, d.end)); if(!days.length) addRow(); }
$("#btnAddRow").onclick = () => addRow();
function addShanaiRow(day="", match="", start="", end=""){
  const tr=document.createElement("tr");
  const opts = SHANAI_JOBS.map(j=>`<option value="${j.match}"${j.match===match?" selected":""}>${j.label}</option>`).join("");
  tr.innerHTML = `<td><input class="sd" value="${day}" placeholder="日"></td>`+
    `<td><select class="sj"><option value="">（選択）</option>${opts}</select></td>`+
    `<td><input class="ss" value="${start}" placeholder="HH:MM"></td>`+
    `<td><input class="se2" value="${end}" placeholder="HH:MM"></td>`+
    `<td><button class="sec del">×</button></td>`;
  tr.querySelector(".del").onclick=()=>tr.remove();
  const fmt = el => el.addEventListener('blur', ()=>{ el.value = normTimeR(el.value); });
  fmt(tr.querySelector(".ss")); fmt(tr.querySelector(".se2"));
  tr.querySelector(".sj").style.width="100%"; tr.querySelector(".ss").style.width="90px"; tr.querySelector(".se2").style.width="90px";
  $("#shanaiTbl tbody").appendChild(tr);
}
$("#btnAddShanai").onclick = () => addShanaiRow();
$("#btnManual").onclick = () => { $("#tbl tbody").innerHTML=""; for(let i=0;i<3;i++) addRow(); $("#confirmCard").classList.remove("hidden"); };
$("#btnStart").onclick = async () => {
  const ym = $("#ym").value;
  const days = $$("#tbl tbody tr").map(tr=>{
    const dRaw = tr.querySelector(".d").value.trim();
    const day = dRaw.includes("-") ? dRaw.slice(-2) : pad(parseInt(dRaw,10));
    return { date: `${ym}-${pad(parseInt(day,10))}`, start: tr.querySelector(".s").value.trim(), end: tr.querySelector(".e").value.trim() };
  }).filter(d=>d.start && d.end && !isNaN(parseInt(d.date.slice(-2),10)));
  if(!days.length){ alert("有効な行がありません"); return; }

  // 社内業務を該当日に紐付け（日番号でマッチ）
  const byNum = {}; days.forEach(d=>{ byNum[parseInt(d.date.slice(-2),10)] = d; });
  const shanaiErr = [];
  let shanaiCount = 0;
  $$("#shanaiTbl tbody tr").forEach(tr=>{
    const dn = parseInt(tr.querySelector(".sd").value.trim(),10);
    const job = tr.querySelector(".sj").value;
    const start = normTimeR(tr.querySelector(".ss").value.trim());
    const end = normTimeR(tr.querySelector(".se2").value.trim());
    if(!dn && !job && !start && !end) return; // 空行
    if(!dn || !job || !start || !end){ shanaiErr.push(`・${tr.querySelector(".sd").value||"?"}日: 種別・開始・終了をすべて入力してください`); return; }
    const d = byNum[dn];
    if(!d){ shanaiErr.push(`・${dn}日: 上の確認表に同じ日がありません（先に客先の出退勤を入れてください）`); return; }
    (d.shanai = d.shanai || []).push({ job, start, end });
    shanaiCount++;
  });
  if(shanaiErr.length){ alert("社内業務の入力に問題があります:\n\n"+shanaiErr.join("\n")); return; }

  const msg = shanaiCount
    ? `${days.length}日分（うち社内業務 ${shanaiCount}件）を TeamSpirit に入力します。よろしいですか？`
    : `${days.length}日分を TeamSpirit に入力します。よろしいですか？`;
  if(!confirm(msg)) return;
  $("#logCard").classList.remove("hidden"); $("#log").textContent=""; $("#btnStart").disabled=true;
  try { const r = await api.startRun(days); appendLog(`\n=== 結果: ${r.filter(x=>x.ok).length}/${r.length} 日 成功 ===`); }
  catch(e){ appendLog("ERROR: "+e.message); }
  $("#btnStart").disabled=false;
};
function appendLog(m){ const el=$("#log"); el.textContent += m+"\n"; el.scrollTop=el.scrollHeight; }
api.onLog(appendLog);

refreshStatus();
show("view-main");
