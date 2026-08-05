const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-GB");
const BASELINES = { "1.8": 3800, "1.9": 4400, "2.0": 5200, "2.2": 6200, "2.8": 7600, "3.0": 9000, "3.2": 19000, unknown: 5800 };

const state = {
  listings: [], view: "all",
  saved: new Set(JSON.parse(localStorage.getItem("z3-scout-saved") || "[]")),
  local: JSON.parse(localStorage.getItem("z3-scout-local") || "[]")
};

const esc = (value = "") => String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const clamp = (n, min = 1, max = 10) => Math.min(max, Math.max(min, n));
const scoreColor = (score) => score >= 8 ? "#537659" : score >= 6 ? "#b47a24" : "#dc3d2f";
const confidenceLevel = (confidence) => confidence >= 70 ? 3 : confidence >= 45 ? 2 : 1;
const validUrl = (value) => { try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) ? u.href : "#"; } catch { return "#"; } };

function scoreListing(raw) {
  const engine = String(raw.engine || "unknown");
  const price = Number(raw.price) || 0;
  const mileage = Number(raw.mileage) || 0;
  const year = Number(raw.year) || 0;
  const text = `${raw.title || ""} ${raw.description || ""}`.toLowerCase();
  const base = BASELINES[engine] || BASELINES.unknown;
  const yearFactor = year ? 1 + ((year - 1999) * 0.025) : 1;
  const mileageFactor = mileage ? clamp(1 + ((70000 - mileage) / 10000) * 0.025, .78, 1.25) : 1;
  const expectedPrice = Math.round((base * yearFactor * mileageFactor) / 50) * 50;
  const ratio = price && expectedPrice ? price / expectedPrice : 1.15;
  const dealScore = Number(clamp(7.2 - ((ratio - 1) * 10)).toFixed(1));

  let condition = 3.4;
  const reasons = [];
  const positive = [
    [/full service history|full history|fsh/, 2.0, "Full service history claimed"],
    [/service history|service record|service book/, 1.0, "Some service history mentioned"],
    [/recently serviced|recent service|just serviced/, .6, "Recent service claimed"],
    [/new (soft )?top|new (hood|roof)|roof replaced/, .7, "Replacement roof mentioned"],
    [/garage(d| kept)/, .4, "Garaged storage claimed"],
    [/(10|11|12) months? mot|mot (until|to) (20\d\d|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/, .5, "Useful MOT remaining"],
    [/rust[ -]?free|no rust|corrosion[ -]?free/, .5, "Advert explicitly addresses corrosion"],
    [/excellent condition|immaculate|cherished/, .35, "Positive condition claim"],
  ];
  const negative = [
    [/no service history|history (lost|missing)|no history/, -2.4, "Little or no service history"],
    [/cat(egory)?\s*[nsdc]|write[ -]?off|insurance loss/, -3.2, "Insurance category / write-off wording"],
    [/rust|corrosion|welding/, -2.0, "Rust, corrosion or welding mentioned"],
    [/damage|damaged|accident/, -2.6, "Damage or accident mentioned"],
    [/project|spares or repair|non[ -]?runner|won't start|does not start/, -3.3, "Project or non-runner wording"],
    [/roof leak|leaking roof|hood leak|torn roof/, -1.7, "Roof problem mentioned"],
    [/warning light|engine light|abs light|airbag light/, -1.3, "Warning light mentioned"],
  ];
  const matched = new Set();
  const noServiceEvidence = /no service history|history (lost|missing)|no history/.test(text);
  for (const [pattern, value, label] of [...positive, ...negative]) {
    if ((label === "Full service history claimed" || label === "Some service history mentioned") && noServiceEvidence) continue;
    if (label === "Some service history mentioned" && matched.has("Full service history claimed")) continue;
    if (pattern.test(text) && !matched.has(label)) { condition += value; matched.add(label); reasons.push({ text: label, type: value > 0 ? "positive" : "negative" }); }
  }
  if (!/service|history|invoice|record/.test(text)) reasons.push({ text: "Service evidence is not stated", type: "neutral" });
  if (!/rust|corrosion|sill|jacking point/.test(text)) reasons.push({ text: "Corrosion condition is not stated", type: "neutral" });
  if (mileage > 120000) { condition -= .5; reasons.push({ text: "Higher mileage warrants closer inspection", type: "neutral" }); }
  const conditionScore = Number(clamp(condition).toFixed(1));
  const overallScore = Number(clamp((dealScore * .55) + (conditionScore * .45)).toFixed(1));
  let confidence = 15 + (price ? 20 : 0) + (mileage ? 20 : 0) + (year ? 15 : 0) + (engine !== "unknown" ? 15 : 0);
  if (reasons.some(r => r.type !== "neutral")) confidence += 15;
  confidence = Math.min(confidence, 100);
  const priceDifference = price ? Math.round(((expectedPrice - price) / expectedPrice) * 100) : 0;
  if (price) reasons.unshift({ text: priceDifference >= 0 ? `${Math.abs(priceDifference)}% below the modelled benchmark` : `${Math.abs(priceDifference)}% above the modelled benchmark`, type: priceDifference >= 0 ? "positive" : "negative" });
  return { ...raw, engine, price, mileage, year, expectedPrice, priceDifference, dealScore, conditionScore, overallScore, confidence, reasons };
}

function freshness(dateValue) {
  if (!dateValue) return "date unknown";
  const days = Math.max(0, Math.floor((Date.now() - new Date(dateValue).getTime()) / 86400000));
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`;
}

function confidenceBars(value) {
  const level = confidenceLevel(value);
  return `<span class="confidence" title="${value}% evidence confidence">${[1,2,3].map(i => `<i class="${i <= level ? "on" : ""}"></i>`).join("")}</span>`;
}

function card(listing, rank) {
  const saved = state.saved.has(listing.id);
  const delta = listing.priceDifference >= 0 ? `${listing.priceDifference}% below guide` : `${Math.abs(listing.priceDifference)}% above guide`;
  return `<article class="listing-card" tabindex="0" data-id="${esc(listing.id)}" aria-label="View ${esc(listing.title)}">
    <div class="score-rail"><div class="score-ring" style="--score:${listing.overallScore};--score-color:${scoreColor(listing.overallScore)}"><strong>${listing.overallScore}<small>/10</small></strong></div><span class="rank">No. ${String(rank).padStart(2,"0")}</span></div>
    <div class="card-body">
      <div class="source-row"><span class="source ${listing.isDemo ? "demo" : ""}">${esc(listing.isDemo ? "Demo" : listing.source)}</span><span class="freshness">${freshness(listing.foundAt)}</span></div>
      <h3>${esc(listing.title)}</h3><p class="specs">${listing.year || "Year?"} · ${esc(listing.engine)}L · ${listing.mileage ? `${number.format(listing.mileage)} miles` : "Mileage?"}${listing.location ? ` · ${esc(listing.location)}` : ""}</p>
      <div class="price-row"><span class="price">${listing.price ? money.format(listing.price) : "Price n/a"}</span>${listing.price ? `<span class="market-delta ${listing.priceDifference < 0 ? "over" : ""}">${delta}</span>` : ""}</div>
      <div class="mini-scores"><span>Deal <b>${listing.dealScore}</b></span><span>Condition <b>${listing.conditionScore}</b></span>${confidenceBars(listing.confidence)}</div>
    </div>
    <button class="save-button ${saved ? "saved" : ""}" data-save="${esc(listing.id)}" aria-label="${saved ? "Remove from" : "Add to"} saved">${saved ? "♥" : "♡"}</button>
  </article>`;
}

function filteredListings() {
  const maxPrice = Number($("#priceFilter").value);
  const engine = $("#engineFilter").value;
  const highConfidence = $("#highConfidence").checked;
  const filtered = state.listings.filter(item =>
    (state.view !== "saved" || state.saved.has(item.id)) &&
    (!item.price || item.price <= maxPrice) &&
    (engine === "all" || item.engine === engine) &&
    (!highConfidence || item.confidence >= 45)
  );
  const sort = $("#sortFilter").value;
  return filtered.sort((a,b) => sort === "price" ? (a.price || Infinity) - (b.price || Infinity) : sort === "newest" ? new Date(b.foundAt || 0) - new Date(a.foundAt || 0) : (b[`${sort}Score`] || 0) - (a[`${sort}Score`] || 0));
}

function render() {
  const listings = filteredListings();
  $("#listingGrid").innerHTML = listings.map(card).join("");
  $("#emptyState").classList.toggle("hidden", listings.length > 0);
  $("#savedCount").textContent = state.saved.size;
  bindCards();
}

function showDetail(id) {
  const item = state.listings.find(x => x.id === id); if (!item) return;
  const reasons = item.reasons?.length ? item.reasons : [{text:"The source supplied too little detail for a condition assessment",type:"neutral"}];
  $("#detailContent").innerHTML = `<div class="sheet-inner"><div class="sheet-handle"></div><div class="sheet-head"><div><span class="eyebrow">${esc(item.source)} · ${freshness(item.foundAt)}</span><h2>${esc(item.title)}</h2></div><button class="close-button" id="detailClose" aria-label="Close">×</button></div>
    <div class="detail-score"><div class="score-ring" style="--score:${item.overallScore};--score-color:${scoreColor(item.overallScore)}"><strong>${item.overallScore}<small>/10</small></strong></div><div><strong>${item.overallScore >= 8 ? "Worth a quick look." : item.overallScore >= 6 ? "Promising, with questions." : "Proceed with caution."}</strong><p>${item.confidence}% evidence confidence. Scores reflect advert wording, not verified vehicle condition.</p></div></div>
    <div class="score-breakdown"><div class="score-box"><span>Deal score</span><strong>${item.dealScore}/10</strong></div><div class="score-box"><span>Condition score</span><strong>${item.conditionScore}/10</strong></div></div>
    <div class="reason-list">${reasons.map(r => `<div class="reason ${r.type}"><span class="reason-icon">${r.type === "positive" ? "↑" : r.type === "negative" ? "!" : "?"}</span><span>${esc(r.text)}</span></div>`).join("")}</div>
    <a class="primary-button" href="${esc(validUrl(item.url))}" target="_blank" rel="noopener noreferrer">Open original advert ↗</a><a class="secondary-link" href="https://www.gov.uk/check-mot-history" target="_blank" rel="noopener noreferrer">Check MOT history on GOV.UK</a></div>`;
  $("#detailDialog").showModal();
  $("#detailClose").onclick = () => $("#detailDialog").close();
}

function bindCards() {
  $$(".listing-card").forEach(el => {
    el.addEventListener("click", e => { if (!e.target.closest("[data-save]")) showDetail(el.dataset.id); });
    el.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && !e.target.closest("[data-save]")) { e.preventDefault(); showDetail(el.dataset.id); } });
  });
  $$('[data-save]').forEach(button => button.onclick = (event) => {
    event.stopPropagation(); const id = button.dataset.save;
    state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id);
    localStorage.setItem("z3-scout-saved", JSON.stringify([...state.saved])); render();
  });
}

async function loadData(showNotice = false) {
  $("#refreshButton").disabled = true; $("#refreshButton").firstElementChild.style.display = "inline-block";
  try {
    const response = await fetch(`./data/listings.json?v=${Date.now()}`, {cache:"no-store"});
    if (!response.ok) throw new Error("Data file unavailable");
    const data = await response.json();
    state.listings = [...state.local.map(scoreListing), ...(data.listings || []).map(item => item.overallScore ? item : scoreListing(item))];
    state.listings = [...new Map(state.listings.map(x => [x.id, x])).values()];
    $("#updatedDate").textContent = new Date(data.generatedAt).toLocaleDateString("en-GB", {day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
    $("#listingCount").textContent = state.listings.length;
    $("#bestScore").textContent = state.listings.length ? Math.max(...state.listings.map(x => x.overallScore)).toFixed(1) : "—";
    $("#sourceCount").textContent = new Set(state.listings.map(x => x.source)).size;
    const notice = $("#dataNotice");
    if (data.mode === "demo") { notice.innerHTML = `<strong>Demonstration data.</strong> These are fictional examples, not live adverts. Follow SETUP.md to turn on daily discovery, or use “Add advert” now.`; notice.classList.remove("hidden"); }
    else if (data.warnings?.length) { notice.textContent = data.warnings.join(" "); notice.classList.remove("hidden"); }
    else if (showNotice) { notice.textContent = "Latest published data loaded."; notice.classList.remove("hidden"); setTimeout(() => notice.classList.add("hidden"), 2500); }
    render();
  } catch (error) {
    $("#dataNotice").textContent = "Could not load the published shortlist. If you are opening the files directly, use a local web server or your GitHub Pages address."; $("#dataNotice").classList.remove("hidden");
  } finally { $("#refreshButton").disabled = false; }
}

$("#filterToggle").onclick = () => { const open = $("#filterPanel").hidden; $("#filterPanel").hidden = !open; $("#filterToggle").setAttribute("aria-expanded", open); $("#filterToggle span").textContent = open ? "−" : "＋"; };
[$("#priceFilter"),$("#engineFilter"),$("#sortFilter"),$("#highConfidence")].forEach(control => control.addEventListener("change", render));
$("#refreshButton").onclick = () => loadData(true);
$("#addButton").onclick = () => $("#addDialog").showModal();
$$('dialog').forEach(dialog => dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); }));
$$('.nav-item').forEach(button => button.onclick = () => {
  state.view = button.dataset.view; $$('.nav-item').forEach(x => x.classList.toggle("active", x === button));
  const method = state.view === "method"; $("#methodPanel").classList.toggle("hidden", !method); $("#listingGrid").classList.toggle("hidden", method); $("#emptyState").classList.add("hidden"); $(".toolbar").classList.toggle("hidden", method); $(".hero").classList.toggle("hidden", method); $("#dataNotice").classList.toggle("hidden", method || !$("#dataNotice").textContent);
  $("#viewTitle").textContent = state.view === "saved" ? "Your saved Z3s" : "Today’s shortlist"; if (!method) render(); window.scrollTo({top:0,behavior:"smooth"});
});

$("#addForm").addEventListener("submit", event => {
  event.preventDefault(); if (event.submitter?.value === "cancel") { $("#addDialog").close(); return; }
  const fd = new FormData(event.currentTarget); const url = validUrl(fd.get("url"));
  if (url === "#") { alert("Please enter a valid http or https advert link."); return; }
  const listing = {id:`local-${Date.now()}`,title:fd.get("title"),price:Number(fd.get("price")),mileage:Number(fd.get("mileage")),year:Number(fd.get("year")),engine:fd.get("engine"),url,description:fd.get("description"),source:"My find",location:"",foundAt:new Date().toISOString(),isLocal:true};
  state.local.unshift(listing); localStorage.setItem("z3-scout-local", JSON.stringify(state.local)); state.listings.unshift(scoreListing(listing)); event.currentTarget.reset(); $("#addDialog").close(); render(); showDetail(listing.id);
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js");
loadData();
