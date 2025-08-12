// Results index (metadata only)
interface CalcResultMeta {
  resultID: number;          // unique
  applicationID: number;     // which app this belongs to
  createdAt: string;         // ISO date
  isActive: boolean;         // active result for this app?
  hasSummer: boolean;        // true if summer lines exist in this result
  label?: string;            // optional user label (e.g., “Aug auth v2”)
}

interface CalcResultLine {
  lineID: number;
  resultID: number;
  applicationID: number;
  startDate: string;      // YYYY-MM-DD
  childID: number;
  providerID: number;
  baseType: string;       // e.g., CCFT, LFHPT, FFNCLHome
  units: {                // allow multiple at once
    fd : number;          // Full Day Units
    pd : number;          // Partial Day Units
    hd : number;          // Half Day Units
    hrs : number;         // Hours (FFN or add-ons)
  };
  region: string;
  xCode: '0' | '9';
  isSummer: boolean;
}

function hasAnyUnits(units) {
  return (units.fd|0) > 0 || (units.pd|0) > 0 || (units.hd|0) > 0 || (units.hrs|0) > 0;
}

// ---- storage helpers ----
function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

// ---- IDs ----
function nextResultID() {
  const metas = loadJSON('calcResultsMeta', []);
  const max = metas.reduce((m,r)=> Math.max(m, r.resultID), 700000000);
  return max + 1;
}

// ---- CRUD: results ----
function listResultsByApp(applicationID) {
  const metas = loadJSON('calcResultsMeta', []);
  return metas.filter(m => m.applicationID === applicationID)
              .sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
}

function getResultLines(resultID) {
  return loadJSON(`calcResultsLines:${resultID}`, []);
}

function saveCalculationResult({ applicationID, lines, setActive=false, label, hasSummer=false }) {
  const resultID = nextResultID();
  const createdAt = new Date().toISOString();
  const meta = { resultID, applicationID, createdAt, isActive:false, hasSummer, label };

  // Persist
  const metas = loadJSON('calcResultsMeta', []);
  metas.push(meta);
  saveJSON('calcResultsMeta', metas);
  saveJSON(`calcResultsLines:${resultID}`, lines.map((ln, idx) => ({
    ...ln,
    resultID,
    applicationID,
    lineID: idx + 1,
  })));

  if (setActive) setActiveResult(applicationID, resultID);
  return resultID;
}

function setActiveResult(applicationID, resultID) {
  const metas = loadJSON('calcResultsMeta', []);
  let changed = false;
  for (const m of metas) {
    if (m.applicationID === applicationID) {
      const shouldBeActive = (m.resultID === resultID);
      if (m.isActive !== shouldBeActive) { m.isActive = shouldBeActive; changed = true; }
    }
  }
  if (changed) saveJSON('calcResultsMeta', metas);
}

function getActiveResultID(applicationID) {
  const metas = loadJSON('calcResultsMeta', []);
  return (metas.find(m => m.applicationID === applicationID && m.isActive) || {}).resultID ?? null;
}


// Example mapper: your existing authorization objects -> storage lines
function buildResultLinesFromAuthorization(authOut) {
  return authOut.map(a => ({
    startDate: a.startDate,
    childID: a.childID,
    providerID: a.providerID,
    baseType: a.baseType,     // e.g., 'CCPT', 'LFHFT', 'FFNMutHome'
    units: a.units, // may include multiple keys
    region: String(a.region),
    xCode: a.xCode,
    isSummer: !!a.isSummer,
  })).filter(ln => hasAnyUnits(ln.units));
}


function refreshResultsTabUI() {
  const appID = getCurrentApplicationID(); // your existing selector
  const metas = listResultsByApp(appID);
  const activeID = getActiveResultID(appID);

  // Populate dropdown
  const ddl = document.getElementById('resultsDropdown');
  ddl.innerHTML = '';
  for (const m of metas) {
    const opt = document.createElement('option');
    opt.value = m.resultID;
    opt.textContent = m.label
      ? `${m.label} — ${new Date(m.createdAt).toLocaleString()} ${m.isActive ? '(Active)' : ''}`
      : `${m.resultID} — ${new Date(m.createdAt).toLocaleString()} ${m.isActive ? '(Active)' : ''}`;
    if (m.resultID === activeID) opt.selected = true;
    ddl.appendChild(opt);
  }

  // Render selected result
  const selectedID = ddl.value ? Number(ddl.value) : null;
  renderSelectedResult(selectedID);
}

function renderSelectedResult(resultID) {
  const container = document.getElementById('resultsLinesContainer');
  container.innerHTML = '';
  if (!resultID) return;

  const lines = getResultLines(resultID);
  if (lines.length === 0) { container.textContent = 'No lines saved.'; return; }

  // Example: simple table render (use your existing component style)
  const table = document.createElement('table');
  // ... add thead/th, then rows from lines
  container.appendChild(table);
}

// Events
document.getElementById('resultsDropdown').addEventListener('change', e => {
  renderSelectedResult(Number(e.target.value));
});

document.getElementById('btnSetActiveResult').addEventListener('click', () => {
  const appID = getCurrentApplicationID();
  const selectedID = Number(document.getElementById('resultsDropdown').value);
  if (!selectedID) return;
  setActiveResult(appID, selectedID);
  refreshResultsTabUI();
});
