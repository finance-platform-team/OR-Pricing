/* OR Pricing — business logic ported 1:1 from the ORPricingWebrescourse web resource.
 * Only host/data touchpoints changed: Dataverse calls go through ../dataverse.ts
 * (generated code-app data sources) and inline handlers run through ../handlerBridge.ts. */
import { dvGet, dvPost, dvPatch, dvDelete, dvSetLookup, dvUploadFile, dvDownloadFile, getCurrentUser } from "../dataverse";


/* ═══════════════════════
   CONFIG
═══════════════════════ */
const FLOW_URL = "https://931476765995ec97896bdf8b57b25e.4d.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/5a55535df3bd4134a642501e77079075/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=0t4wj7bNYP9I9mP5Y6gJPLGx-u2bv659OrO-HhUJcNc";

const MED_SUPPLY_CONFIG = {
  // AMH (129990001) & SMH (129990000)
  "129990000": { "Minor":6000,"Moderate":8000,"Major":11000,"Special Skills":16000,"Special Nature":22000,"Advanced":28000 },
  "129990001": { "Minor":6000,"Moderate":8000,"Major":11000,"Special Skills":16000,"Special Nature":22000,"Advanced":28000 },
  // ASH (129990002)
  "129990002": { "Minor":6000,"Moderate":10000,"Major":14000,"Special Skills":18000,"Special Nature":25000,"Advanced":30000 }
};
function getMedSupplyCfg(){
  const h = document.getElementById("fHospital")?.value || "";
  return MED_SUPPLY_CONFIG[h] || MED_SUPPLY_CONFIG["129990000"];
}
const CLASS_ORDER  = ["Minor","Moderate","Major","Special Skills","Special Nature","Advanced"];

// Dataverse integer values للـ orpx_classtype Global Choice
const CLASS_TYPE_MAP = {
  129990000: "Minor",
  129990001: "Moderate",
  129990002: "Major",
  129990003: "Special Skills",
  129990004: "Special Nature",
  129990005: "Advanced"
};
const CLASS_COLORS = {
  "Minor":         {bg:"rgba(100,116,139,.18)",color:"#94A3B8"},
  "Moderate":      {bg:"rgba(52,211,153,.14)",color:"#34D399"},
  "Major":         {bg:"rgba(251,191,36,.14)",color:"#FBBF24"},
  "Special Skills":{bg:"rgba(96,165,250,.14)",color:"#60A5FA"},
  "Special Nature":{bg:"rgba(167,139,250,.14)",color:"#A78BFA"},
  "Advanced":      {bg:"rgba(248,113,113,.14)",color:"#F87171"}
};

/* ═══════════════════════
   STATE
═══════════════════════ */
let S={
  recordId:null,outputId:null,currentTab:1,unlockedTabs:[1],
  hasConsumables:false,patientData:null,patientsCache:{},
  contractsCache:[],
  currentUserId:null,currentUserName:null,
  procedureCosts:[],procedureCostingIds:[],
  consumableItemIds:[],
  primaryProcedureId:null,
  supplyChainRecordId:null,
  baseCostTotal:0,serviceFee:0,medSupplyTotal:0,
  consumablesTotal:0,doctorFee:0,billingExtraFee:0,finalEstimate:0,
  consumableItems:[],costsLoaded:false,
  hasInsuranceCard:false,hasReferral:false,
  _tab2BannerAuthor:null,_tab2BannerDate:null,
  openQueryId:null,openQueryData:null,
  lastResolvedQuery:null
};

/* ═══════════════════════
   INIT
═══════════════════════ */
// Code app: this module is loaded by main.ts after the DOM is parsed, so start() is exported and called there
export function start(){
  loadUser();
  // Disable arrow-key increment/decrement on all number inputs
  document.addEventListener("keydown", e => {
    if((e.key === "ArrowUp" || e.key === "ArrowDown") && e.target.type === "number"){
      e.preventDefault();
    }
  });
  // Disable scroll wheel changing number inputs
  document.addEventListener("wheel", e => {
    if(e.target.type === "number") e.target.blur();
  }, { passive: true });
  // Enforce positive values on all number inputs
  document.addEventListener("input", e => {
    if(e.target.type === "number"){
      const min = parseFloat(e.target.min ?? 0);
      const val = parseFloat(e.target.value);
      if(!isNaN(val) && val < min){
        e.target.value = min;
      }
    }
  });
  // loadSpecialties بتتكال في initRouter لو في record id — أو هنا في list view
  initRouter();
}

/* ═══════════════════════════════════════
   GET RECORD ID FROM URL
   الـ Model-Driven App بيحط الـ id في الـ URL كـ query param
   مثال: ?id={eb3f7d4b-435e-f111-a826-000d3a4b5321}
═══════════════════════════════════════ */
function getRecordIdFromUrl(){
  try{
    // طريقة 1 — URL query param
    const params = new URLSearchParams(window.location.search);
    let id = params.get("id") || params.get("recordId") || "";
    if(id) return id.replace(/[{}]/g,"").toLowerCase();
    // Code app: launch params (?id=...) are copied into the URL by applyLaunchParams() in main.ts
  }catch(e){ console.warn("[URL] Could not get record ID:", e); }
  return null;
}

/* ═══════════════════════════════════════
   LOAD EXISTING RECORD
   يحمل الـ Record الموجود ويفتح الـ Tab الصح
═══════════════════════════════════════ */
async function loadExistingRecord(recordId){
  try{
    console.log(`[LOAD] Loading existing record: ${recordId}`);
    S.recordId = recordId;
    updateAuditTrailButtonVisibility();

    // جيب بيانات الـ Record
    const rec = await dvGet(
      `oprx_pricingrequests(${recordId})?$select=oprx_requestname,oprx_status,oprx_mainoperationname,` +
      `oprx_extconsumables,oprx_consumablesdesc,oprx_extradoctorfee,oprx_accommodationdays,oprx_hospital,` +
      `oprx_insurancecard_name,oprx_orreferral_name,oprx_billingremarks,oprx_billingextrafees,` +
      `_oprx_patientid_value,_oprx_contractid_value,_oprx_accommodationtypeid_value,_oprx_specialty_value,` +
      `_oprx_procedure1id_value,_oprx_procedure2id_value,_oprx_procedure3id_value,_oprx_primaryprocedureid_value,createdon,modifiedon` +
      `&$expand=oprx_patientid($select=opd_patientname,opd_patientcode,opd_patientbu,opd_age,opd_gendertext,opd_address),createdby($select=fullname),modifiedby($select=fullname)`
    );

    // ── Update Request Name & Status ──
    const reqName = rec.oprx_requestname || "—";
    document.getElementById("reqId").textContent = reqName;
    const statusLabel = getStatusLabel(rec.oprx_status);
    updateStatus(statusLabel);

    // ── Tab 1 Audit Banner — rendered after status routing (so freeze state is set first) ──
    const _tab1Author  = rec.createdby?.fullname;
    const _tab1Date    = rec.createdon;
    const _tab3Author  = rec.modifiedby?.fullname;
    const _tab3Date    = rec.modifiedon;
    const _tab3Status  = rec.oprx_status;

    // ── Fill Patient Info ──
    if(rec.oprx_patientid){
      const pat = rec.oprx_patientid;
      const patId = rec._oprx_patientid_value;
      if(patId){
        document.getElementById("fPatient").value = patId;
        const patName = pat.opd_patientname || "—";
        const patCode = pat.opd_patientcode || "—";
        document.getElementById("patientSearchInput").value = `${patCode} — ${patName}`;
        document.getElementById("patientSearchInput").style.color = "var(--brand-dark)";
        document.getElementById("patientSearchInput").style.fontWeight = "500";
        document.getElementById("patientClearBtn").style.display = "flex";
        document.getElementById("fPatientName").textContent    = patName;
        document.getElementById("fPatientCode").textContent    = patCode;
        document.getElementById("fPatientBU").textContent      = pat.opd_patientbu || "—";
        document.getElementById("fPatientAge").textContent     = pat.opd_age ? pat.opd_age + " yrs" : "—";
        document.getElementById("fPatientGender").textContent  = pat.opd_gendertext || "—";
        document.getElementById("fPatientAddress").textContent = pat.opd_address || "—";
        document.getElementById("patientInfoCard").style.display = "grid";
      }
    }

    // ── Fill Hospital ──
    if(rec.oprx_hospital != null){
      document.getElementById("fHospital").value = String(rec.oprx_hospital);
    }

    // ── Reload specialties with the correct tag for this hospital ──
    {
      const hospitalVal = rec.oprx_hospital != null ? String(rec.oprx_hospital) : "";
      loadSpecialties(getSpecialtyTagForHospital(hospitalVal));
    }

    // ── Fill Contract + Accommodation Types (بالتوازي) ──
    if(rec.oprx_hospital != null){
      const hospitalVal = String(rec.oprx_hospital);
      const searchInput = document.getElementById("contractSearchInput");
      const accomSel    = document.getElementById("fAccomType");
      searchInput.disabled    = true;
      searchInput.placeholder = "Loading...";
      accomSel.innerHTML      = '<option value="">— Select Type —</option>';
      accomSel.disabled       = true;
      try{
        const [contractsRes, accomRes, proceduresRes] = await Promise.all([
          dvGet(
            `oprx_contracts?$select=oprx_contractid,oprx_contractname` +
            `&$filter=statecode eq 0 and oprx_hospital eq ${hospitalVal}` +
            `&$orderby=oprx_contractname asc`
          ),
          dvGet(
            `oprx_accommodationtypes?$select=oprx_accommodationtypeid,oprx_typename` +
            `&$filter=statecode eq 0 and oprx_hospital eq ${hospitalVal}` +
            `&$orderby=oprx_typename asc`
          ),
          dvGet(
            `oprx_procedures?$select=oprx_procedureid,oprx_procedurename,oprx_classtype` +
            `&$filter=statecode eq 0 and oprx_hospital eq ${hospitalVal}` +
            `&$orderby=oprx_procedurename asc`
          )
        ]);

        // ── Contracts ──
        S.contractsCache = (contractsRes.value || []).map(c => ({id: c.oprx_contractid, name: c.oprx_contractname}));
        if(rec._oprx_contractid_value){
          const savedContract = S.contractsCache.find(c => c.id === rec._oprx_contractid_value);
          if(savedContract){ selectContract(savedContract); }
          else { document.getElementById("fContract").value = rec._oprx_contractid_value; }
        }
        searchInput.disabled    = false;
        searchInput.placeholder = `Search ${S.contractsCache.length} contract(s)...`;

        // ── Accommodation Types ──
        (accomRes.value || []).forEach(a => {
          const o = new Option(a.oprx_typename, a.oprx_accommodationtypeid);
          o.dataset.name = a.oprx_typename;
          accomSel.appendChild(o);
        });
        accomSel.disabled = false;
        if(rec._oprx_accommodationtypeid_value){
          accomSel.value = rec._oprx_accommodationtypeid_value;
        }

        // ── Procedures — populate SDROP THEN restore saved values ──
        populateProcedureDropdowns(proceduresRes.value || []);
        // Restore saved procedure values
        if(rec._oprx_procedure1id_value){
          const p = (proceduresRes.value||[]).find(x=>x.oprx_procedureid===rec._oprx_procedure1id_value);
          if(p){ const ct=CLASS_TYPE_MAP[p.oprx_classtype]||""; setSDropValue("proc1",p.oprx_procedureid,p.oprx_procedurename,ct,p.oprx_classtype); }
        }
        if(rec._oprx_procedure2id_value){
          const p = (proceduresRes.value||[]).find(x=>x.oprx_procedureid===rec._oprx_procedure2id_value);
          if(p){ const ct=CLASS_TYPE_MAP[p.oprx_classtype]||""; setSDropValue("proc2",p.oprx_procedureid,p.oprx_procedurename,ct,p.oprx_classtype); }
        }
        if(rec._oprx_procedure3id_value){
          const p = (proceduresRes.value||[]).find(x=>x.oprx_procedureid===rec._oprx_procedure3id_value);
          if(p){ const ct=CLASS_TYPE_MAP[p.oprx_classtype]||""; setSDropValue("proc3",p.oprx_procedureid,p.oprx_procedurename,ct,p.oprx_classtype); }
        }
        if(rec._oprx_primaryprocedureid_value) S.primaryProcedureId = rec._oprx_primaryprocedureid_value;
        detectPrimary();

        console.log(`[LOAD] ${S.contractsCache.length} contracts + ${accomRes.value?.length||0} accom types + ${proceduresRes.value?.length||0} procedures loaded`);
      }catch(e){
        console.warn("[LOAD] Hospital data fetch failed:", e);
        searchInput.disabled    = false;
        searchInput.placeholder = "Search contracts...";
        accomSel.disabled       = false;
      }
    }

    // ── Fill Accommodation Days & Doctor Fee ──
    if(rec.oprx_accommodationdays) document.getElementById("fAccomDays").value = rec.oprx_accommodationdays;
    if(rec.oprx_extradoctorfee){
      document.getElementById("fDoctorFee").value = rec.oprx_extradoctorfee;
      // Pre-fill billing doctor fee too so it shows in Tab 3
      document.getElementById("fBillingDoctorFee") && (document.getElementById("fBillingDoctorFee").value = rec.oprx_extradoctorfee);
    }

    // ── Fill Main Operation Name ──
    if(rec.oprx_mainoperationname){
      document.getElementById("fMainOp").value = rec.oprx_mainoperationname;
      updateCharCounter("fMainOp","ctrMainOp",250);
    }
    if(rec.oprx_billingremarks)    document.getElementById("fBillingRemarks").value = rec.oprx_billingremarks;
    if(rec.oprx_billingextrafees){
      document.getElementById("fBillingExtraFees").value = rec.oprx_billingextrafees;
      S.billingExtraFee = parseFloat(rec.oprx_billingextrafees) || 0;
      onBillingExtraFeesChange(); // sync remarks mandatory indicator
    }

    // ── Fill Specialty ──
    if(rec._oprx_specialty_value){
      // find specialty name from SDROP data
      const sp = SDROP_DATA.specialty.find(s=>s.id===rec._oprx_specialty_value);
      if(sp){
        setSDropValue("specialty", sp.id, sp.name);
        setSDropValue("billingSpecialty", sp.id, sp.name);
      } else {
        document.getElementById("fSpecialty").value = rec._oprx_specialty_value;
        document.getElementById("fBillingSpecialty").value = rec._oprx_specialty_value;
      }
    }

    // ── Fill Consumables ──
    if(rec.oprx_extconsumables){
      document.getElementById("fExtConsumables").checked = true;
      S.hasConsumables = true;
      document.getElementById("consumablesDescBox").style.display = "block";
      document.getElementById("tab1NextLabel").textContent = "Supply Chain";
      document.getElementById("tabBtn2").classList.remove("hidden");
    }
    if(rec.oprx_consumablesdesc){
      document.getElementById("fConsumablesDesc").value = rec.oprx_consumablesdesc;
      updateCharCounter("fConsumablesDesc","ctrConsDesc",1000);
    }

    // ── Load existing consumable items (for Supply Chain) ──
    await loadConsumableItems(recordId);

    // ── Check if files already uploaded on record ──
    loadFileMetadataFromRecord(rec);

    // ── Navigate to correct Tab based on Status ──
    const status = rec.oprx_status;
    unlockTab(1);

    if(status === 129990001){
      // Pending Supply Chain → فتح Tab 2
      markTabDone(1); freezeTab(1);
      unlockTab(2);
      goTab(2);
      await showResolvedQueryBanner(recordId);
      if(_tab1Author) renderAuditBanner(1, _tab1Author, _tab1Date, "Created by");
      showToast("Request loaded — enter consumables pricing.", "success");

    } else if(status === 129990006){
      // Pending OR Info → Supply Chain طلب معلومة ناقصة — فتح Tab 1 مع بانر السؤال
      unfreezeTab(1);
      goTab(1);
      await showOrQueryBanner(recordId);
      if(_tab1Author) renderAuditBanner(1, _tab1Author, _tab1Date, "Created by");
      showToast("Supply Chain needs more info — please reply.", "warning");

    } else if(status === 129990002){
      // Pending Billing → فتح Tab 3 (Billing Review)
      markTabDone(1); freezeTab(1);
      if(S.hasConsumables){ markTabDone(2); freezeTab(2); unlockTab(2); }
      unlockTab(3);
      goTab(3);
      if(_tab1Author) renderAuditBanner(1, _tab1Author, _tab1Date, "Created by");
      if(S.hasConsumables && S._tab2BannerAuthor) renderAuditBanner(2, S._tab2BannerAuthor, S._tab2BannerDate, "Submitted by");
      showToast("Request loaded — complete Billing Review.", "success");

    } else if(status === 129990003 || status === 129990004 || status === 129990005){
      // Pending Approval / Approved / Rejected → load costs + output + approval log then فتح Tab 5
      markTabDone(1); freezeTab(1);
      if(S.hasConsumables){ markTabDone(2); freezeTab(2); unlockTab(2); }
      markTabDone(3); freezeTab(3);
      markTabDone(4); freezeTab(4);
      unlockTab(3);
      unlockTab(4);
      unlockTab(5);
      await loadProcedureCosts(recordId);
      await loadPricingOutput(recordId);
      const approvalLog = await loadApprovalLog(recordId);
      goTab(5);
      document.getElementById("approvalPending").style.display = "none";
      document.getElementById("approvalReady").style.display  = "block";
      // ملي الـ estimate summary
      document.getElementById("approvalFinalVal").textContent  = fmt(S.finalEstimate);
      document.getElementById("approvalBreakdown").textContent =
        `${fmt(S.baseCostTotal)} + ${fmt(S.serviceFee)} (fees) + ${fmt(S.medSupplyTotal||0)} (meds) + ${fmt(S.consumablesTotal)} (consumables) + ${fmt(S.doctorFee)} (doctor)${S.billingExtraFee > 0 ? ` + ${fmt(S.billingExtraFee)} (billing extra)` : ""}`;
      // Render banners after freeze so pill shows correctly
      if(_tab1Author) renderAuditBanner(1, _tab1Author, _tab1Date, "Created by");
      if(S.hasConsumables && S._tab2BannerAuthor) renderAuditBanner(2, S._tab2BannerAuthor, S._tab2BannerDate, "Submitted by");
      if(_tab3Author && _tab3Status >= 129990003) renderAuditBanner(3, _tab3Author, _tab3Date, "Reviewed by");
      // استبدل الـ action buttons بـ read-only result
      const decisionEl = document.getElementById("approvalDecisionArea");
      if(decisionEl){
        if(status === 129990003){
          // Pending Approval — الـ Billing Team لسه ماتخدش قرار
          // نسيب الـ decision area زي ما هي (approve / reject buttons)
        } else if(status === 129990004){
          // Approved
          markTabDone(5); freezeTab(5);
          const comments = approvalLog?.oprx_comments ? `<br><span style="font-size:12px;opacity:.7;">Notes: ${approvalLog.oprx_comments}</span>` : "";
          decisionEl.innerHTML = `
            <div class="alert alert-success" style="font-size:13px;padding:18px;margin-top:8px;">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;flex-shrink:0;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <div><strong>Estimate Approved</strong>${comments}<br><span style="font-size:11px;opacity:.6;">Approved by Billing Team · EGP ${fmt(S.finalEstimate)}</span></div>
            </div>`;
        } else {
          // Rejected
          markTabDone(5); markTabRejected(5); freezeTab(5);
          const reason   = approvalLog?.oprx_rejectionreason || "—";
          const comments = approvalLog?.oprx_comments ? `<br><span style="font-size:12px;opacity:.7;">Notes: ${approvalLog.oprx_comments}</span>` : "";
          const suggestedHtml = approvalLog?.oprx_suggestedprice ? `<br><span style="font-size:12px;color:var(--amber);font-weight:600;">Suggested Price: EGP ${fmt(approvalLog.oprx_suggestedprice)}</span>` : "";
          decisionEl.innerHTML = `
            <div class="alert alert-danger" style="font-size:13px;padding:18px;margin-top:8px;">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <div><strong>Estimate Rejected</strong><br><span style="font-size:12px;">Reason: ${reason}</span>${suggestedHtml}${comments}<br><span style="font-size:11px;opacity:.6;">Rejected by Billing Team</span></div>
            </div>`;
        }
      }
      showToast("Request loaded — " + statusLabel, "success");

    } else {
      // Draft → Tab 1 (editable)
      goTab(1);
    }

    console.log(`[LOAD] Record loaded: ${reqName} — Status: ${statusLabel}`);

  }catch(e){
    console.error("[LOAD ERROR]", e);
    showToast("Failed to load record: " + e.message, "error");
  }
}

/* ── Check File existence من الـ _name columns في الـ record ──
   الـ Dataverse بيضيف oprx_insurancecard_name تلقائياً لو فيه file
── */
function loadFileMetadataFromRecord(rec){
  const showFileStatus = (nameVal, statusId, nameId, flag) => {
    if(nameVal){
      S[flag] = true;
      const statusEl = document.getElementById(statusId);
      const nameEl   = document.getElementById(nameId);
      if(statusEl) statusEl.style.display = "flex";
      // decode URL-encoded filename (Dataverse بيرجعه encoded)
      const displayName = decodeURIComponent(nameVal);
      if(nameEl)   nameEl.textContent = `${displayName} ✓`;
      console.log(`[LOAD] File exists: ${displayName}`);
    }
  };
  showFileStatus(rec.oprx_insurancecard_name, "insuranceFileStatus", "insuranceFileName", "hasInsuranceCard");
  showFileStatus(rec.oprx_orreferral_name,    "referralFileStatus",  "referralFileName",  "hasReferral");
}

async function loadConsumableItems(recordId){
  try{
    const d = await dvGet(
      `oprx_consumablesitems?$select=oprx_consumablesitemid,oprx_itemname,oprx_basecost,oprx_markuppct,oprx_finalcost,createdon,modifiedon` +
      `&$expand=createdby($select=fullname),modifiedby($select=fullname)` +
      `&$filter=_oprx_pricingrequestid_value eq ${recordId}&$orderby=createdon asc`
    );
    if(d.value && d.value.length){
      // BUG-11 FIX: كان Date.now()+Math.random() ممكن يتكرر في loop سريعة — بنستخدم index بدل كده
      S.consumableItems = d.value.map((i, _idx) => ({
        idx       : Date.now() + _idx * 1000,
        dvId      : i.oprx_consumablesitemid,
        name      : i.oprx_itemname === "Pending" ? "" : (i.oprx_itemname || ""),
        baseCost  : i.oprx_basecost  || 0,
        markupPct : i.oprx_markuppct || 20,
        finalCost : i.oprx_finalcost || 0
      }));
      S.consumableItemIds    = d.value.map(i => i.oprx_consumablesitemid);
      // الـ Record الأول هو الـ Supply Chain Record الأساسي
      S.supplyChainRecordId  = d.value[0]?.oprx_consumablesitemid || null;
      S.consumablesTotal     = S.consumableItems.reduce((a,i) => a + i.finalCost, 0);
      renderConsumablesList();
      calcScTotal();
      // ── Tab 2 Audit Banner data ──
      // BUG FIX: كنا بناخد وقت أول Item اتعمل (createdon لأول صف)، وده بيوري وقت
      // بداية إدخال البيانات مش وقت التقديم الفعلي — لو الـ Supply Chain رجع
      // وكمّل/عدّل بعد فترة، البانر كان بيوري وقت غلط (الأقدم). دلوقتي بناخد
      // آخر عنصر اتعدّل فيه حاجة (أعلى modifiedon) وموديفايد باي بتاعه، وده
      // أقرب تمثيل حقيقي لوقت آخر لمسة قبل الضغط على "Next".
      const latestItem = d.value.reduce((latest, cur) =>
        new Date(cur.modifiedon || cur.createdon) > new Date(latest.modifiedon || latest.createdon) ? cur : latest
      , d.value[0]);
      const bannerPerson = latestItem?.modifiedby?.fullname || latestItem?.createdby?.fullname;
      if(bannerPerson){
        S._tab2BannerAuthor = bannerPerson;
        S._tab2BannerDate   = latestItem.modifiedon || latestItem.createdon;
      }
      console.log(`[LOAD] ${d.value.length} consumable item(s) loaded — SC Record: ${S.supplyChainRecordId}`);
    }
  }catch(e){ console.warn("[LOAD] Consumable items failed:", e); }
}

/* ── Load Procedure Costs من oprx_procedurecostings ── */
async function loadProcedureCosts(recordId){
  try{
    const d = await dvGet(
      `oprx_procedurecostings?$select=oprx_procedurecostingid,oprx_name,oprx_isprimary,oprx_costpercentage,` +
      `oprx_accommodation,oprx_medicalcare,oprx_nursing,oprx_orroom,oprx_surgeonfee,oprx_assistantfee,` +
      `oprx_anesthesia,oprx_medsupplyamount,oprx_subtotal,_oprx_procedureid_value,createdon` +
      `&$expand=oprx_procedureid($select=oprx_classtype),createdby($select=fullname)` +
      `&$filter=_oprx_pricingrequestid_value eq ${recordId}&$orderby=oprx_isprimary desc`
    );
    if(d.value && d.value.length){
      S.procedureCostingIds = d.value.map(i => i.oprx_procedurecostingid);
      // أعد بناء procedureCosts من الـ Dataverse data
      S.procedureCosts = d.value.map(i => {
        const isPrimary = i.oprx_isprimary;
        const costPct   = i.oprx_costpercentage || (isPrimary ? 100 : 50);
        const pct       = costPct / 100;
        // نجيب الـ classType من الـ expanded procedure
        const ctInt   = i.oprx_procedureid?.oprx_classtype ?? null;
        const ctLabel = ctInt != null ? (CLASS_TYPE_MAP[ctInt] || "") : "";
        const safeDiv = (v, p) => (p > 0 ? (v || 0) / p : (v || 0));
        return {
          id        : i._oprx_procedureid_value || null,
          name      : i.oprx_name?.replace(/ — (Primary|Secondary)$/, "") || "Procedure",
          isPrimary,
          costPct,
          classType : ctLabel,
          costs: {
            Accommodation  : safeDiv(i.oprx_accommodation,   pct).toFixed(2),
            MedicalCare    : safeDiv(i.oprx_medicalcare,     pct).toFixed(2),
            NursingCare    : safeDiv(i.oprx_nursing,         pct).toFixed(2),
            ORRoom         : safeDiv(i.oprx_orroom,          pct).toFixed(2),
            SurgeonFee     : safeDiv(i.oprx_surgeonfee,      pct).toFixed(2),
            AssistantFee   : safeDiv(i.oprx_assistantfee,    pct).toFixed(2),
            AnesthesiaFee  : safeDiv(i.oprx_anesthesia,      pct).toFixed(2)
          }
        };
      });
      // إعادة حساب الـ totals من الـ subtotals المحفوظة
      S.baseCostTotal  = d.value.reduce((a, i) => a + (i.oprx_subtotal      || 0), 0);
      S.medSupplyTotal = d.value.reduce((a, i) => a + (i.oprx_medsupplyamount || 0), 0);
      // render الـ breakdown بنفس دالة الـ live fetch
      renderCostBreakdown();
      // BUG-03 FIX: كانت calculateAll() مش بتتكال — serviceFee و finalEstimate بيفضلوا 0 عند reload
      calculateAll();
      // نظهر الـ container ونخفي الـ alert
      document.getElementById("costFetchAlert").style.display        = "none";
      document.getElementById("costBreakdownContainer").style.display = "block";
      S.costsLoaded = true;
      // ── Tab 4 Audit Banner — created by Billing Team (Cost & Pricing) ──
      const firstCosting = d.value[0];
      if(firstCosting?.createdby?.fullname){
        renderAuditBanner(4, firstCosting.createdby.fullname, firstCosting.createdon, "Submitted by");
      }
      console.log(`[LOAD] ${d.value.length} procedure costing row(s) loaded`);
    }
  }catch(e){ console.warn("[LOAD] Procedure costs failed:", e); }
}

/* ── renderCostBreakdownFromLoaded — لم تعد مستخدمة
   loadProcedureCosts دلوقتي بتبني S.procedureCosts وبتكال renderCostBreakdown() مباشرة
   محتفظين بالـ function عشان لو في reference قديم ── */
function renderCostBreakdownFromLoaded(rows){
  // redirect لـ renderCostBreakdown — S.procedureCosts اتبنيت بالفعل في loadProcedureCosts
  renderCostBreakdown();
  document.getElementById("costFetchAlert").style.display        = "none";
  document.getElementById("costBreakdownContainer").style.display = "block";
  S.costsLoaded = true;
}

/* ── Load Approval Log من oprx_approvallogs ── */
async function loadApprovalLog(recordId){
  try{
    const d = await dvGet(
      `oprx_approvallogs?$select=oprx_approvallogid,oprx_decision,oprx_comments,oprx_rejectionreason,oprx_suggestedprice,createdon` +
      `&$expand=createdby($select=fullname)` +
      `&$filter=_oprx_pricingrequestid_value eq ${recordId}&$orderby=createdon desc&$top=1`
    );
    if(d.value && d.value.length){
      const log = d.value[0];
      // ── Tab 5 Audit Banner — created by Approver ──
      if(log.createdby?.fullname){
        const decisionLabel = log.oprx_decision === 129990000 ? "Approved by" : "Rejected by";
        renderAuditBanner(5, log.createdby.fullname, log.createdon, decisionLabel);
      }
      console.log(`[LOAD] Approval log loaded: ${log.oprx_approvallogid}`);
      return log;
    }
  }catch(e){ console.warn("[LOAD] Approval log failed:", e); }
  return null;
}

/* ── Load Pricing Output من oprx_pricingoutputs ── */
async function loadPricingOutput(recordId){
  try{
    const d = await dvGet(
      `oprx_pricingoutputs?$select=oprx_pricingoutputid,oprx_finalestimate,oprx_basecoststotal,` +
      `oprx_servicefees,oprx_consumablestotal,oprx_doctorfee,oprx_outputstatus` +
      `&$filter=_oprx_pricingrequestid_value eq ${recordId}&$top=1`
    );
    if(d.value && d.value.length){
      const out = d.value[0];
      S.outputId        = out.oprx_pricingoutputid;
      S.finalEstimate   = out.oprx_finalestimate   || S.finalEstimate;
      S.baseCostTotal   = out.oprx_basecoststotal  || S.baseCostTotal;
      S.serviceFee      = out.oprx_servicefees     || S.serviceFee;
      // medSupplyTotal مش بنقراها من هنا — BUG-03 fix بيحسبها من loadProcedureCosts → calculateAll
      S.consumablesTotal= out.oprx_consumablestotal|| S.consumablesTotal;
      S.doctorFee       = out.oprx_doctorfee       || S.doctorFee;
      // billingExtraFee بيجي من oprx_pricingrequests مش من pricingoutputs — اتحفظ في loadExistingRecord
      // تحديث الـ UI بالأرقام الفعلية
      document.getElementById("finalEstimate").textContent  = fmt(S.finalEstimate);
      document.getElementById("sumBase").textContent=fmt(S.baseCostTotal);
      document.getElementById("sumService").textContent=fmt(S.serviceFee);
      document.getElementById("sumMeds").textContent=fmt(S.medSupplyTotal||0);
      document.getElementById("sumConsumables").textContent=fmt(S.consumablesTotal);
      document.getElementById("sumDoctor").textContent=fmt(S.doctorFee);
      // Update Billing Extra Fees row
      const extraRow = document.getElementById("rowBillingExtra");
      if(extraRow) extraRow.style.display = S.billingExtraFee > 0 ? "flex" : "none";
      const sumExtraEl = document.getElementById("sumBillingExtra");
      if(sumExtraEl) sumExtraEl.textContent = fmt(S.billingExtraFee);
      console.log(`[LOAD] Pricing output loaded: ${S.outputId} — Final: EGP ${S.finalEstimate}`);
    }
  }catch(e){ console.warn("[LOAD] Pricing output failed:", e); }
}

function getStatusLabel(statusInt){
  const map = {
    129990000: "Draft",
    129990001: "Pending Supply Chain",
    129990002: "Pending Billing",
    129990003: "Pending Approval",
    129990004: "Approved",
    129990005: "Rejected",
    129990006: "Pending OR Info"
  };
  return map[statusInt] || "Draft";
}

/* ═══════════════════════
   DATAVERSE HELPERS
   dvGet / dvPost / dvPatch / dvDelete come from ../dataverse.ts,
   which routes them through the generated code-app data sources.
═══════════════════════ */

/**
 * STATUS AUDIT LOG — يسجّل كل تغيير حالة يحصل للطلب مع توقيته (createdon) واليوزر (createdby)
 * بيتنادى فورًا بعد أي dvPatch على oprx_status عشان نقدر نبني Timeline دقيق للطلب،
 * بما فيه رحلات الـ Return (Supply Chain ⇄ OR) المتكررة.
 * فشل التسجيل ميوقفش الـ flow الأساسي — بيتسجل في الـ Console بس.
 */
async function logStatusChange(recordId, newStatus){
  if(!recordId) return;
  try{
    await dvPost("oprx_statusauditlogs", {
      oprx_status: newStatus,
      "oprx_pricingrequest@odata.bind": `/oprx_pricingrequests(${recordId})`
    });
  }catch(e){
    console.error("[AUDIT LOG ERROR]", e);
  }
}

/* ═══════════════════════
   LOAD USER
═══════════════════════ */
async function loadUser(){
  try{
    // Code app: the signed-in user comes from the Power Apps app context
    const user = await getCurrentUser();
    S.currentUserId=user.id; S.currentUserName=user.name||"User";
    document.getElementById("userName").textContent=S.currentUserName;
    document.getElementById("userAv").textContent=S.currentUserName.charAt(0).toUpperCase();
  }catch(e){
    console.warn("[USER] Could not load user:", e);
    document.getElementById("userName").textContent="User";
  }
}

/* ═══════════════════════
   LOAD DATAVERSE DATA
═══════════════════════ */
/* ═══════════════════════
   LOAD SPECIALTIES
═══════════════════════ */
/* ── Map hospital value → specialty cr18c_tag value ── */
function getSpecialtyTagForHospital(hospitalVal){
  // AMH (129990001) → OR Pricing AMH tag (129990001)
  // SMH (129990000) / ASH (129990002) → OR Pricing ANC tag (989230001)
  // فاضي → null (يعطّل الـ specialty)
  if(!hospitalVal) return null;
  return hospitalVal === "129990001" ? "129990001" : "989230001";
}

async function loadSpecialties(tagValue){
  const tag = tagValue || null;
  // لو مفيش tag (مفيش hospital مختار) — عطّل الـ specialty وامسح الـ data
  const specialtyInput = document.getElementById("specialtySearch");
  if(!tag){
    if(specialtyInput){ specialtyInput.disabled = true; specialtyInput.placeholder = "Select a hospital first..."; }
    populateSDrop("specialty", []);
    populateSDrop("billingSpecialty", []);
    return;
  }
  if(specialtyInput){ specialtyInput.disabled = true; specialtyInput.placeholder = "Loading..."; }
  try{
    const d = await dvGet(`crd04_specialtieses?$select=crd04_specialtiesid,crd04_title&$filter=statecode eq 0 and cr18c_tag eq '${tag}'&$orderby=crd04_title asc`);
    const items = (d.value||[]).map(sp => ({ id: sp.crd04_specialtiesid, name: sp.crd04_title }));
    populateSDrop("specialty", items);
    populateSDrop("billingSpecialty", items);
    if(specialtyInput){ specialtyInput.disabled = false; specialtyInput.placeholder = `Search ${items.length} specialt${items.length===1?"y":"ies"}...`; }
    console.log(`[LOAD] ${items.length} specialties loaded (tag=${tag})`);
  }catch(e){
    console.warn("[LOAD] Specialties failed:", e);
    if(specialtyInput){ specialtyInput.disabled = false; specialtyInput.placeholder = "Search specialty..."; }
  }
}

async function loadDataverse(){
  // Patients — نخزنهم في cache بس، الـ search component هيستخدمهم
  try{
    const d=await dvGet("opd_patients?$select=opd_patientid,opd_patientname,opd_patientcode,opd_patientbu,opd_age,opd_gendertext,opd_address,opd_butext&$filter=statecode eq 0&$orderby=opd_patientname asc&$top=500");
    S.patientsCache={};
    (d.value||[]).forEach(p=>{
      S.patientsCache[p.opd_patientid]={
        name:p.opd_patientname||"—",code:p.opd_patientcode||"—",
        bu:p.opd_patientbu||p.opd_butext||"—",
        age:p.opd_age!=null?p.opd_age+" yrs":"—",
        gender:p.opd_gendertext||"—",address:p.opd_address||"—"
      };
    });
  }catch(e){
    console.error("[LOAD] Patients failed:", e);
    S.patientsCache = {};
    showToast("Could not load patients. Please refresh or contact support.", "error");
  }
  // Contracts — مش بنجيبهم هنا خالص
  // بيتجابوا on-demand في onHospitalChange() عشان نعمل server-side filter
  // ده أحسن للـ performance لأن العقود كتير وكل hospital عنده مجموعة مختلفة
  // Accommodation Types — مش بنجيبهم هنا
  // بيتجابوا on-demand في onHospitalChange() مع الـ contracts
  // Procedures — مش بنحملهم globally بعد كده
  // بيتجابوا on-demand في onHospitalChange() مع filter على oprx_hospital
  // NOTE: addConsumableItem() بيتكال بس في openNewForm — مش هنا
  // عشان لو بنفتح record موجودة addConsumableItem يعمل item فاضي قبل loadConsumableItems
}

/* ═══════════════════════
   TAB NAVIGATION
═══════════════════════ */
function goTab(n){
  if(!S.unlockedTabs.includes(n)) return;
  S.currentTab=n;
  document.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
  document.getElementById(`tabPanel${n}`).classList.add("active");
  const btn=document.getElementById(`tabBtn${n}`);
  // لا نشيل done — نضيف active فوقيها عشان يظهر الـ underline بس
  btn.classList.add("active");

  // ── لما بيفتح Tab 2 — اعرض الـ Consumables Description ──
  if(n === 2){
    const desc = document.getElementById("fConsumablesDesc")?.value?.trim();
    const scDescBox  = document.getElementById("scDescBox");
    const scDescText = document.getElementById("scDescText");
    if(desc && scDescBox && scDescText){
      scDescText.textContent = desc;
      scDescBox.style.display = "block";
    } else if(scDescBox){
      scDescBox.style.display = "none";
    }
  }
  // ── زرار "View OR Coordinator's Reply" يظهر بس في Tab 2 (Supply Chain) ──
  updateOrReplyButtonVisibility();
  // ── لما بيفتح Tab 3 (Billing Review) — ملي الجدول والـ accommodation ──
  if(n === 3){
    populateBillingReviewTab();
  }
  // ── لما بيفتح Tab 4 (Cost & Pricing) — لو الأسعار اتجابت قبل كده، أعد الحساب
  //    عشان أي تعديل حصل في Billing Review (Doctor Fee / Extra Fees) يظهر فورًا
  //    من غير ما المستخدم يحتاج يعمل refresh للصفحة ──
  if(n === 4 && S.costsLoaded){
    calculateAll();
  }
}
function unlockTab(n){
  if(S.unlockedTabs.includes(n)) return;
  S.unlockedTabs.push(n);
  const btn=document.getElementById(`tabBtn${n}`);
  btn.classList.remove("locked");
}
function markTabDone(n){
  const btn=document.getElementById(`tabBtn${n}`);
  btn.classList.remove("active","rejected");
  btn.classList.add("done");
}
function markTabRejected(n){
  const btn=document.getElementById(`tabBtn${n}`);
  btn.classList.remove("active","done");
  btn.classList.add("rejected");
}
function freezeTab(n){
  const panel = document.getElementById(`tabPanel${n}`);
  if(panel) panel.classList.add("tab-frozen");
}
function unfreezeTab(n){
  const panel = document.getElementById(`tabPanel${n}`);
  if(panel) panel.classList.remove("tab-frozen");
}


/* ═══════════════════════
   EVENTS — TAB 1
═══════════════════════ */
// onPatientChange removed — replaced by selectPatient() in search component
async function onHospitalChange(){
  clearError("fieldHospital");

  const hospitalVal = document.getElementById("fHospital").value;
  const searchInput = document.getElementById("contractSearchInput");
  const accomSel    = document.getElementById("fAccomType");

  // Reset contract + accom type عند تغيير الـ hospital
  clearContract();
  accomSel.innerHTML = '<option value="">— Select Type —</option>';
  accomSel.disabled  = true;

  if(!hospitalVal){
    searchInput.disabled    = true;
    searchInput.placeholder = "Select a hospital first...";
    S.contractsCache        = [];
    loadSpecialties(null);   // عطّل الـ specialty وامسح الـ data
    console.log("[HOSPITAL] No hospital selected");
    return;
  }

  // ── Loading state على الاتنين ──
  searchInput.disabled    = true;
  searchInput.placeholder = "Loading...";
  S.contractsCache        = [];

  // Reset الـ procedure dropdowns لما hospital يتغير
  resetProcedureDropdowns();

  // Reset الـ specialty dropdown وأعد تحميلها بالـ tag الصح للـ hospital
  clearSDropField("specialty");
  clearSDropField("billingSpecialty");
  loadSpecialties(getSpecialtyTagForHospital(hospitalVal));

  try{
    // نجيب الـ contracts والـ accom types والـ procedures بالتوازي — أسرع
    const [contractsRes, accomRes, proceduresRes] = await Promise.all([
      dvGet(
        `oprx_contracts?$select=oprx_contractid,oprx_contractname` +
        `&$filter=statecode eq 0 and oprx_hospital eq ${hospitalVal}` +
        `&$orderby=oprx_contractname asc`
      ),
      dvGet(
        `oprx_accommodationtypes?$select=oprx_accommodationtypeid,oprx_typename` +
        `&$filter=statecode eq 0 and oprx_hospital eq ${hospitalVal}` +
        `&$orderby=oprx_typename asc`
      ),
      dvGet(
        `oprx_procedures?$select=oprx_procedureid,oprx_procedurename,oprx_classtype` +
        `&$filter=statecode eq 0 and oprx_hospital eq ${hospitalVal}` +
        `&$orderby=oprx_procedurename asc`
      )
    ]);

    // ── Contracts ──
    S.contractsCache = (contractsRes.value || []).map(c => ({
      id   : c.oprx_contractid,
      name : c.oprx_contractname
    }));
    searchInput.disabled    = false;
    searchInput.placeholder = `Search ${S.contractsCache.length} contract(s)...`;

    // ── Accommodation Types ──
    (accomRes.value || []).forEach(a => {
      const o = new Option(a.oprx_typename, a.oprx_accommodationtypeid);
      o.dataset.name = a.oprx_typename;
      accomSel.appendChild(o);
    });
    accomSel.disabled = false;

    // ── Procedures ──
    populateProcedureDropdowns(proceduresRes.value || []);
    console.log(`[HOSPITAL] Loaded ${S.contractsCache.length} contracts + ${accomRes.value?.length||0} accom types + ${proceduresRes.value?.length||0} procedures for hospital=${hospitalVal}`);

  }catch(e){
    console.error("[HOSPITAL] Failed to load data:", e);
    S.contractsCache = [];
    searchInput.disabled    = true;
    searchInput.placeholder = "Failed to load contracts";
    accomSel.disabled = true;
    populateProcedureDropdowns([]);
    showToast("Could not load contracts and procedures for this hospital. Please refresh or contact support.", "error");
  }
}
/* ── Reset procedure dropdowns to empty (called on hospital change) ── */
function resetProcedureDropdowns(){
  ["proc1","proc2","proc3"].forEach(key => clearSDrop(key));
  detectPrimary();
}

/* ── Populate procedure dropdowns from an array of procedure records ── */
function populateProcedureDropdowns(procedures){
  const items = procedures.map(p => {
    const ctInt   = p.oprx_classtype;
    const ctLabel = (ctInt != null ? CLASS_TYPE_MAP[ctInt] : null) || "";
    return { id: p.oprx_procedureid, name: p.oprx_procedurename, classtype: ctLabel, classtypeint: ctInt ?? "" };
  });
  ["proc1","proc2","proc3"].forEach(key => populateSDrop(key, items));
  detectPrimary();
  console.log(`[PROC] ${items.length} procedure(s) loaded into SDROP`);
}

function onConsumablesToggle(){
  S.hasConsumables=document.getElementById("fExtConsumables").checked;
  document.getElementById("consumablesDescBox").style.display=S.hasConsumables?"block":"none";
  const btn2=document.getElementById("tabBtn2");
  if(S.hasConsumables){btn2.classList.remove("hidden");document.getElementById("tab1NextLabel").textContent="Supply Chain";}
  else{btn2.classList.add("hidden");document.getElementById("tab1NextLabel").textContent="Cost & Pricing";}
}
function onProcedureChange(){detectPrimary();}

function detectPrimary(){
  const procs=[1,2,3].map(i=>{
    const hidden = document.getElementById(`fProc${i}`);
    const id = hidden?.value || "";
    const name = document.getElementById(`proc${i}Search`)?.value?.trim() || "";
    const classType = hidden?.dataset?.classtype || "";
    return{idx:i, id, name, classType};
  }).filter(p=>p.id);

  if(!procs.length){
    [1,2,3].forEach(i=>{
      document.getElementById(`procBadge${i}`).style.display="none";
      document.getElementById(`procClass${i}`).style.display="none";
      document.getElementById(`procCard${i}`).classList.remove("has-value","is-primary");
    });
    document.getElementById("primaryAlert").style.display="none";
    return;
  }

  // ── Rank كل procedure حسب CLASS_ORDER ──
  procs.forEach(p=>{
    p.rank = CLASS_ORDER.indexOf(p.classType);
    // لو الـ classType مش في الـ list يبقى -1 (أقل أولوية)
  });

  // أعلى rank = Primary
  const maxRank = Math.max(...procs.map(p=>p.rank));
  const primaryProc = procs.find(p=>p.rank===maxRank);
  const primaryIdx = primaryProc ? primaryProc.idx : procs[0].idx;
  [1,2,3].forEach(i=>{
    const hidden=document.getElementById(`fProc${i}`);const badge=document.getElementById(`procBadge${i}`);const classDiv=document.getElementById(`procClass${i}`);const card=document.getElementById(`procCard${i}`);
    const ct=hidden?.dataset?.classtype||"";
    if(!hidden?.value){badge.style.display="none";classDiv.style.display="none";card.classList.remove("has-value","is-primary");return;}
    card.classList.add("has-value");badge.style.display="inline-block";classDiv.style.display="inline-block";
    if(i===primaryIdx){badge.className="primary-badge";badge.textContent="Primary";card.classList.add("is-primary");}
    else{badge.className="secondary-badge";badge.textContent="Secondary";card.classList.remove("is-primary");}
    const clr=CLASS_COLORS[ct]||CLASS_COLORS["Minor"];
    classDiv.style.background=clr.bg;classDiv.style.color=clr.color;classDiv.style.fontWeight="600";classDiv.textContent=ct;
  });
  document.getElementById("primaryAlert").style.display="flex";
  document.getElementById("primaryAlertText").textContent=
    `Primary: "${primaryProc.name}" (${primaryProc.classType}) — highest classification auto-selected.`;

  // ── حفظ الـ Primary Procedure ID في الـ State ──
  S.primaryProcedureId = primaryProc.id;
  console.log(`[PRIMARY] Set: ${primaryProc.name} (${primaryProc.classType}) → ${primaryProc.id}`);
}

async function completeTab1(){
  if(!validateTab1()) return;
  // ── Save oprx_pricingrequest + upload files ──
  showTabLoading(true, "Saving request...");
  try{
    // ── الـ Status بناءً على وجود Consumables ──
    // Pending Supply Chain (129990001) أو Pending Billing (129990002)
    const tab1Status = S.hasConsumables ? 129990001 : 129990002;
    await saveRequestRecord(tab1Status);
    await uploadFiles();

    // ── لو Consumables = Yes → نعمل Supply Chain Record فاضي مربوط بالـ Request ──
    if(S.hasConsumables && S.recordId){
      await createEmptySupplyChainRecord();
    }

    markTabDone(1);
    freezeTab(1);
    renderAuditBanner(1, S.currentUserName, new Date().toISOString(), "Submitted by");
    if(S.hasConsumables){unlockTab(2);goTab(2);}
    else{unlockTab(3);goTab(3);}
    document.getElementById("footerInfo").innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;stroke:var(--green);"><polyline points="20 6 9 17 4 12"/></svg> Request saved — ${S.hasConsumables?"enter consumables in Supply Chain.":"proceed to Billing Review."}`;
    showToast("Request info saved successfully.","success");
  }catch(e){
    console.error("Save request failed:", e);
    showToast("Save failed: " + (e.message||"Unknown error"),"error");
  }finally{
    showTabLoading(false);
  }
}

function validateTab1(){
  let valid=true;
  // Patient — check hidden input (search component)
  if(!document.getElementById("fPatient").value){showError("fieldPatient");valid=false;}else clearError("fieldPatient");
  // Other required fields
  [["fieldHospital","fHospital"],["fieldContract","fContract"],["fieldSpecialty","fSpecialty"],["fieldAccomType","fAccomType"],["fieldMainOp","fMainOp"],["fieldProc1","fProc1"]].forEach(([f,i])=>{
    const el=document.getElementById(i);
    if(!el||!el.value.trim()){showError(f);valid=false;}else clearError(f);
  });
  // Consumables Description — إلزامي لو External Consumables = Yes
  if(document.getElementById("fExtConsumables").checked){
    if(!document.getElementById("fConsumablesDesc").value.trim()){
      showError("fieldConsumablesDesc");valid=false;
    } else {
      clearError("fieldConsumablesDesc");
    }
  }
  // Files — إلزامية بس لو مفيش file محملة على الـ record
  const insuranceFile = document.getElementById("fInsuranceCard").files[0];
  const referralFile  = document.getElementById("fReferral").files[0];
  clearError("fieldInsurance");
  clearError("fieldReferral");
  // Size check — لو المستخدم اختار file بس أكبر من 32 MB
  if(insuranceFile && insuranceFile.size > MAX_FILE_BYTES){
    showError("fieldInsurance"); valid=false;
    showToast(`Insurance card exceeds 32 MB limit.`, "error");
  }
  if(referralFile && referralFile.size > MAX_FILE_BYTES){
    showError("fieldReferral"); valid=false;
    showToast(`OR Referral exceeds 32 MB limit.`, "error");
  }
  if(!valid) showToast("Please fill all required fields.","error");
  return valid;
}

/* ═══════════════════════
   TAB 2 — SUPPLY CHAIN
═══════════════════════ */
function addConsumableItem(){
  const idx=Date.now();
  S.consumableItems.push({idx,name:"",baseCost:0,markupPct:20,finalCost:0});
  renderConsumablesList();
}
function removeConsumableItem(idx){
  S.consumableItems=S.consumableItems.filter(i=>i.idx!==idx);
  renderConsumablesList();calcScTotal();
}
function renderConsumablesList(){
  const list=document.getElementById("consumablesList");list.innerHTML="";
  S.consumableItems.forEach(item=>{
    const div=document.createElement("div");div.className="consumable-item";
    div.innerHTML=`
      <div class="field"><label>Item Name <span class="req">*</span></label>
        <input type="text" placeholder="e.g. Surgical Mesh" value="${item.name}" data-onchange="updateConsumable(${item.idx},'name',this.value)"></div>
      <div class="field"><label>Base Cost (EGP)</label>
        <input type="number" min="0" step="any" placeholder="0.00" value="${item.baseCost||''}" data-onchange="updateConsumable(${item.idx},'baseCost',this.value)"></div>
      <div class="field"><label>Markup %</label>
        <input type="number" min="0" max="100" value="${item.markupPct}" data-onchange="updateConsumable(${item.idx},'markupPct',this.value)"></div>
      <div><label style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.05em;text-transform:uppercase;display:block;margin-bottom:5px;">Final Cost</label>
        <div class="consumable-calc" id="finalCost_${item.idx}">${fmt(item.finalCost)}</div></div>
      <button class="btn-remove" data-onclick="removeConsumableItem(${item.idx})">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>`;
    list.appendChild(div);
  });
}
function updateConsumable(idx,field,val){
  const item=S.consumableItems.find(i=>i.idx===idx);if(!item)return;
  if(field==="baseCost"||field==="markupPct")val=parseFloat(val)||0;
  item[field]=val;item.finalCost=item.baseCost*(1+item.markupPct/100);
  const el=document.getElementById(`finalCost_${idx}`);if(el)el.textContent=fmt(item.finalCost);
  calcScTotal();
}
function calcScTotal(){
  S.consumablesTotal=S.consumableItems.reduce((a,i)=>a+i.finalCost,0);
  document.getElementById("scTotalVal").textContent=`EGP ${fmt(S.consumablesTotal)}`;
}
/* ═══════════════════════════════════════════════════
   CREATE EMPTY SUPPLY CHAIN RECORD
   بيتعمل فور الضغط على Next في Tab 1 لو Consumables = Yes
   بيعمل POST record فاضي في oprx_consumablesitems
   مربوط بالـ Request — الـ Supply Chain هيعمل PATCH عليه بعدين
═══════════════════════════════════════════════════ */
async function createEmptySupplyChainRecord(){
  try{
    // لو في record موجود بالفعل — مش محتاج نعمل جديد
    if(S.supplyChainRecordId){
      console.log(`[SC] Supply Chain record already exists: ${S.supplyChainRecordId}`);
      return;
    }

    const body = {
      oprx_itemname  : "Pending",   // placeholder — هيتعدل من الـ Supply Chain
      oprx_basecost  : 0,
      oprx_markuppct : 20,
      oprx_finalcost : 0,
      "oprx_pricingrequestid@odata.bind": `/oprx_pricingrequests(${S.recordId})`
    };

    const id = await dvPost("oprx_consumablesitems", body);
    if(id){
      S.supplyChainRecordId = id;
      S.consumableItemIds   = [id];
      console.log(`[SC] Empty Supply Chain record created: ${id}`);
    }
  }catch(e){
    console.warn("[SC] Could not create Supply Chain record:", e.message);
  }
}

async function completeTab2(){
  const hasItems = S.consumableItems.some(i => i.name && i.baseCost > 0);
  if(!hasItems){ showToast("Please add at least one consumable item.","error"); return; }

  showTabLoading(true, "Saving consumables...");
  try{
    // ── Step 1: تأكد إن الـ Request Record موجود في Dataverse ──
    if(!S.recordId){
      console.log("[TAB2] No recordId — creating request record first...");
      await saveRequestRecord(129990001); // Pending Supply Chain
    }

    if(!S.recordId){
      throw new Error("Could not create or find the pricing request record.");
    }

    // ── Step 2: حفظ الـ items ──
    // لو في Supply Chain Record موجود (اتعمل في Tab 1) → PATCH عليه
    // لو مفيش → POST items جديدة مربوطة بالـ Request
    const validItems = S.consumableItems.filter(i => i.name && i.baseCost > 0);

    if(S.supplyChainRecordId && validItems.length >= 1){
      // ── PATCH الـ Record الأول (اللي اتعمل فاضي) ──
      const firstItem = validItems[0];
      await dvPatch("oprx_consumablesitems", S.supplyChainRecordId, {
        oprx_itemname  : firstItem.name,
        oprx_basecost  : firstItem.baseCost,
        oprx_markuppct : firstItem.markupPct,
        oprx_finalcost : parseFloat((firstItem.baseCost * (1 + firstItem.markupPct / 100)).toFixed(2))
      });
      console.log(`[SC] PATCH first item: "${firstItem.name}" → ${S.supplyChainRecordId}`);

      // ── POST باقي الـ items لو أكتر من item ──
      S.consumableItemIds = [S.supplyChainRecordId];
      for(let i = 1; i < validItems.length; i++){
        const item = validItems[i];
        const body = {
          oprx_itemname  : item.name,
          oprx_basecost  : item.baseCost,
          oprx_markuppct : item.markupPct,
          oprx_finalcost : parseFloat((item.baseCost * (1 + item.markupPct / 100)).toFixed(2)),
          "oprx_pricingrequestid@odata.bind": `/oprx_pricingrequests(${S.recordId})`
        };
        const id = await dvPost("oprx_consumablesitems", body);
        if(id){
          S.consumableItemIds.push(id);
          console.log(`[SC] POST extra item: "${item.name}" → ${id}`);
        }
      }
    } else {
      // ── مفيش Supply Chain Record سابق → POST كل الـ items ──
      // حذف القديم لو موجود
      if(S.consumableItemIds && S.consumableItemIds.length){
        for(const id of S.consumableItemIds){
          try{ await dvDelete("oprx_consumablesitems", id); }catch(e){}
        }
        S.consumableItemIds = [];
      }
      for(const item of validItems){
        const body = {
          oprx_itemname  : item.name,
          oprx_basecost  : item.baseCost,
          oprx_markuppct : item.markupPct,
          oprx_finalcost : parseFloat((item.baseCost * (1 + item.markupPct / 100)).toFixed(2)),
          "oprx_pricingrequestid@odata.bind": `/oprx_pricingrequests(${S.recordId})`
        };
        const id = await dvPost("oprx_consumablesitems", body);
        if(id){
          S.consumableItemIds.push(id);
          console.log(`[SC] POST item: "${item.name}" → ${id}`);
        }
      }
    }

    // ── Step 3: تحديث الـ consumablesTotal في الـ State ──
    S.consumablesTotal = validItems.reduce((a, i) => a + parseFloat((i.baseCost * (1 + i.markupPct / 100)).toFixed(2)), 0);

    // ── Step 5: تحديث الـ Status → Pending Billing (129990002) ──
    await dvPatch("oprx_pricingrequests", S.recordId, { oprx_status: 129990002 });
    await logStatusChange(S.recordId, 129990002);
    console.log("[STATUS] → Pending Billing (129990002)");
    updateStatus("Pending Billing");

    // ── Navigate ──
    markTabDone(2);
    freezeTab(2);
    renderAuditBanner(2, S.currentUserName, new Date().toISOString(), "Submitted by");
    unlockTab(3);
    goTab(3);

    showToast(`${validItems.length} consumable item(s) saved successfully.`, "success");
    document.getElementById("footerInfo").innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;stroke:var(--green);"><polyline points="20 6 9 17 4 12"/></svg> Supply Chain complete — proceed to Billing Review.`;

  }catch(e){
    console.error("[TAB2 ERROR]", e);
    showToast("Save failed: " + (e.message || "Unknown error"), "error");
  }finally{
    showTabLoading(false);
  }
}

/* ═══════════════════════
   TAB 3 — COST & PRICING
═══════════════════════ */
async function fetchCosts(){
  const hospitalSel = document.getElementById("fHospital");
  const hospital = hospitalSel.options[hospitalSel.selectedIndex]?.dataset?.label || hospitalSel.options[hospitalSel.selectedIndex]?.text || "";
  // fContract hidden input — نجيب الـ name من contractsCache
  const contractId_fetch = document.getElementById("fContract").value;
  const contractName = (S.contractsCache||[]).find(c=>c.id===contractId_fetch)?.name
    || document.getElementById("contractSearchInput").value
    || "";
  const accomSel=document.getElementById("fAccomType");
  const accomName=accomSel.options[accomSel.selectedIndex]?.dataset?.name||accomSel.options[accomSel.selectedIndex]?.text||"";
  const procedures=[1,2,3].map(i=>{
    const hidden=document.getElementById(`fProc${i}`);
    if(!hidden?.value) return null;
    const name = document.getElementById(`proc${i}Search`)?.value?.trim() || "";
    const classType = hidden.dataset?.classtype || "";
    return{id:hidden.value, name, classType};
  }).filter(Boolean);

  // ── تحديد الـ Primary بناءً على أعلى rank في CLASS_ORDER ──
  const getRank = (ct) => {
    const rank = CLASS_ORDER.indexOf(ct);
    return rank === -1 ? -1 : rank;  // classType مش موجود = أقل أولوية
  };

  // نجيب أعلى rank بين الـ procedures الموجودة
  const maxRank = Math.max(...procedures.map(p => getRank(p.classType)));

  // الـ Primary هو أول procedure عنده الـ maxRank — بنحدده بمكانه (index) مش بالـ ID،
  // عشان لو نفس العملية اتكررت في أكتر من slot (نفس الـ id بالظبط)، غير كده
  // المقارنة بالـ id كانت بتخلي الاتنين يبانوا Primary مع بعض
  const primaryIdx = procedures.findIndex(p => getRank(p.classType) === maxRank);

  console.log("[PRIMARY DETECTION]", procedures.map(p => `${p.name}(${p.classType}:${getRank(p.classType)})`), "→ Primary index:", primaryIdx);

  document.getElementById("fetchSpinner").style.display="block";
  document.getElementById("btnFetch").disabled=true;
  showProcessing("Fetching from DotCare", "Retrieving procedure pricing via stored procedure...");
  S.procedureCosts=[];
  try{
    for(let procIdx=0; procIdx<procedures.length; procIdx++){
      const proc = procedures[procIdx];
      const isPrimary = procIdx === primaryIdx;
      const costPct   = isPrimary ? 100 : 50;
      let costs={};
      try{
        // ── استدعاء الـ Flow بدون credentials عشان نتجنب CORS ──
        // الـ sig في الـ URL هو الـ Authentication بتاعنا
        const resp = await fetch(FLOW_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // بدون credentials أو Authorization — الـ sig في الـ URL كافي
          body: JSON.stringify({
            ContractName: contractName,
            AccommodationClassName: accomName,
            Operation: proc.name,
            Hospital: hospital,
            Specialty: document.getElementById("specialtySearch")?.value || ""
          })
        });
        if(resp.ok) {
          const data = await resp.json();
          // الـ Flow بيبعت { "Table1": [...] } — نستخرج الـ array
          const rows = Array.isArray(data) ? data : (data.Table1 || []);
          if(Array.isArray(rows) && rows.length) {
            // case-insensitive + trim match عشان أسماء الـ Flow ممكن تتغير
            const find = (keyword) => {
              const kw = keyword.toLowerCase();
              const row = rows.find(r => (r.EnName||"").trim().toLowerCase().includes(kw));
              return parseFloat(row?.finalPrice ?? 0);
            };
            costs = {
              Accommodation : find('accommodation'),
              NursingCare   : find('nursing'),
              MedicalCare   : find('medical care'),
              ORRoom        : find('operating room'),
              SurgeonFee    : find('surgeon fee'),
              AssistantFee  : find('assistant'),
              AnesthesiaFee : find('anesthes')
            };
            console.log("[FLOW] Parsed costs:", costs, "from rows:", rows.map(r=>r.EnName));
          } else {
            // fallback لو الـ Flow رجع object قديم بنفس أسماء الحقول
            costs = data;
          }
        } else {
          console.warn("[FLOW] Status:", resp.status, await resp.text().catch(()=>""));
          throw new Error(`Pricing service returned status ${resp.status}`);
        }
      }catch(e){
        console.error("[FLOW ERROR]", e);
        S.procedureCosts = [];
        S.costsLoaded = false;
        document.getElementById("btnSubmitToApproval").disabled = true;
        document.getElementById("costBreakdownContainer").style.display = "none";
        showToast(`Could not fetch costs for "${proc.name||"procedure"}". Please try again or contact support.`, "error");
        return;
      }
      S.procedureCosts.push({...proc,isPrimary,costPct,costs});
    }
    renderCostBreakdown();calculateAll();
    document.getElementById("costFetchAlert").style.display="none";
    document.getElementById("costBreakdownContainer").style.display="block";
    document.getElementById("btnSubmitToApproval").disabled=false;
    S.costsLoaded=true;
    showToast("Costs fetched successfully.","success");
  }finally{
    document.getElementById("fetchSpinner").style.display="none";
    document.getElementById("btnFetch").disabled=false;
    hideProcessing();
  }
}

function renderCostBreakdown(){
  const tbody=document.getElementById("costBreakdownBody");tbody.innerHTML="";
  let baseTotal=0; S.medSupplyTotal=0;
  S.procedureCosts.forEach(proc=>{
    const pct=proc.costPct/100;
    // Minor: no AssistantFee
    const isMinor = proc.classType === "Minor";
    const els = proc.isPrimary
      ? (isMinor
          ? ["Accommodation","NursingCare","MedicalCare","ORRoom","SurgeonFee","AnesthesiaFee"]
          : ["Accommodation","NursingCare","MedicalCare","ORRoom","SurgeonFee","AssistantFee","AnesthesiaFee"])
      : (isMinor
          ? ["ORRoom","SurgeonFee","AnesthesiaFee"]
          : ["ORRoom","SurgeonFee","AssistantFee","AnesthesiaFee"]);
    const clr=CLASS_COLORS[proc.classType]||CLASS_COLORS["Minor"];
    // ── Cost element rows ──
    els.forEach((el,i)=>{
      const adj=parseFloat(proc.costs[el]||0)*pct;baseTotal+=adj;
      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td style="font-size:12px;font-weight:500;">${i===0?proc.name:""}</td>
        <td>${i===0?`<span style="font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;background:${clr.bg};color:${clr.color};">${proc.classType}</span>`:""}</td>
        <td>${i===0?`<span style="font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;background:${proc.isPrimary?"var(--brand-light)":"var(--surface2)"};color:${proc.isPrimary?"var(--brand-dark)":"var(--text3)"};">${proc.isPrimary?"Primary":"Secondary"} (${proc.costPct}%)</span>`:""}</td>
        <td style="font-size:12px;color:var(--text2);">${el.replace(/([A-Z])/g," $1").trim()}</td>
        <td class="cost-val">${fmt(adj)}</td>`;
      tbody.appendChild(tr);
    });
    // ── Meds & Supplies row ──
    const medsAmt=(getMedSupplyCfg()[proc.classType]||0)*(proc.isPrimary?1:0.5);
    S.medSupplyTotal+=medsAmt;
    const medsTr=document.createElement("tr");
    medsTr.innerHTML=`
      <td></td><td></td><td></td>
      <td style="font-size:12px;color:var(--text2);font-style:italic;">Meds &amp; Supplies</td>
      <td class="cost-val" style="color:var(--amber);">${fmt(medsAmt)}</td>`;
    tbody.appendChild(medsTr);
  });
  S.baseCostTotal=baseTotal;
  document.getElementById("baseCostTotal").textContent=fmt(baseTotal);
}

function calculateAll(){
  S.serviceFee=S.baseCostTotal*0.15;
  // S.medSupplyTotal محسوبة بالفعل في renderCostBreakdown — مش نعيد حسابها
  const rawFee = parseFloat(document.getElementById("fDoctorFee").value);
  S.doctorFee = !isNaN(rawFee) ? rawFee : (S.doctorFee || 0); // BUG-6: fallback لـ S.doctorFee لو الـ input frozen أو فاضي
  S.finalEstimate=S.baseCostTotal+S.serviceFee+S.medSupplyTotal+S.consumablesTotal+S.doctorFee+S.billingExtraFee;

  // Update amounts (new breakdown bar design — just the number part)
  document.getElementById("sumBase").textContent=fmt(S.baseCostTotal);
  document.getElementById("sumService").textContent=fmt(S.serviceFee);
  document.getElementById("sumMeds").textContent=fmt(S.medSupplyTotal);
  document.getElementById("sumConsumables").textContent=fmt(S.consumablesTotal);
  document.getElementById("sumDoctor").textContent=fmt(S.doctorFee);
  document.getElementById("finalEstimate").textContent=fmt(S.finalEstimate);
  document.getElementById("approvalFinalVal").textContent=fmt(S.finalEstimate);

  // Show/hide Billing Extra Fees row
  const extraRow = document.getElementById("rowBillingExtra");
  if(extraRow) extraRow.style.display = S.billingExtraFee > 0 ? "flex" : "none";
  const sumExtraEl = document.getElementById("sumBillingExtra");
  if(sumExtraEl) sumExtraEl.textContent = fmt(S.billingExtraFee);

  // Animate progress bars relative to finalEstimate
  const total = S.finalEstimate || 1;
  const bars = [
    ["barBase",         S.baseCostTotal],
    ["barService",      S.serviceFee],
    ["barMeds",         S.medSupplyTotal],
    ["barCons",         S.consumablesTotal],
    ["barDoctor",       S.doctorFee],
    ["barBillingExtra", S.billingExtraFee]
  ];
  // reset الـ bars لـ 0 أولاً عشان الـ CSS transition يشتغل صح
  bars.forEach(([id]) => {
    const el = document.getElementById(id);
    if(el) el.style.width = "0%";
  });
  // بعدين نسيب frame واحد للـ browser يرسم الـ 0% ثم نعمل animate
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bars.forEach(([id, val]) => {
        const el = document.getElementById(id);
        if(el) el.style.width = Math.min(100, (val / total * 100)).toFixed(1) + "%";
      });
    });
  });

  const extraPart = S.billingExtraFee > 0 ? ` + Extra Fees ${fmt(S.billingExtraFee)}` : "";
  const brkText=`Base ${fmt(S.baseCostTotal)} + Fees ${fmt(S.serviceFee)} + Meds ${fmt(S.medSupplyTotal)} + Consumables ${fmt(S.consumablesTotal)} + Doctor ${fmt(S.doctorFee)}${extraPart}`;
  document.getElementById("finalBreakdown").textContent=brkText;
  document.getElementById("approvalBreakdown").textContent=brkText;
}

async function submitToApproval(){
  const sp = document.getElementById("submitSpinner");
  sp.style.display = "block";
  document.getElementById("btnSubmitToApproval").disabled = true;
  showTabLoading(true, "Saving pricing data...");

  try{
    // Phase 1 — ensure request record exists (only if not already created in Tab 1)
    if(!S.recordId){
      await saveRequestRecord();
    }

    // Phase 3 — save procedure costs
    showTabLoading(true, "Saving procedure costs...");
    await saveProcedureCosts();

    // Phase 4 — save consumable items (if any)
    // لو اتحفظوا بالفعل من Tab 2 (S.consumableItemIds.length > 0) مش محتاجين نعيد
    if(S.hasConsumables && S.consumableItems.some(i=>i.name&&i.baseCost>0) && !S.consumableItemIds.length){
      showTabLoading(true, "Saving consumables...");
      await saveConsumableItems();
    }

    // Phase 5 — save pricing output
    showTabLoading(true, "Saving pricing output...");
    await savePricingOutput();

    // Phase 6 — update request status → Pending Approval (129990003)
    await dvPatch("oprx_pricingrequests", S.recordId, { oprx_status: 129990003 });
    await logStatusChange(S.recordId, 129990003);
    console.log("[SUBMIT] oprx_pricingrequest status → Pending Approval");

    // Navigate to Approval tab
    markTabDone(4);
    freezeTab(4);
    renderAuditBanner(4, S.currentUserName, new Date().toISOString(), "Submitted by");
    unlockTab(5);
    goTab(5);
    document.getElementById("approvalPending").style.display = "none";
    document.getElementById("approvalReady").style.display  = "block";
    document.getElementById("approvalFinalVal").textContent  = fmt(S.finalEstimate);
    document.getElementById("approvalBreakdown").textContent = document.getElementById("finalBreakdown").textContent;
    updateStatus("Pending Approval");
    document.getElementById("footerInfo").innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;stroke:var(--amber);"><circle cx="12" cy="12" r="10"/></svg> Submitted — awaiting Billing Team approval.`;
    showToast("Request submitted for approval.","success");

  }catch(e){
    console.error("[SUBMIT ERROR]", e);
    showToast("Save error: " + (e.message||"Check console for details."),"error");
  }finally{
    sp.style.display = "none";
    document.getElementById("btnSubmitToApproval").disabled = false;
    showTabLoading(false);
  }
}

/* ═══════════════════════════════════════════════════════
   SAVE TO DATAVERSE — Full Implementation
   Phase 1: saveRequestRecord  → oprx_pricingrequest (POST/PATCH)
   Phase 2: uploadFiles        → oprx_insurancecard + oprx_orreferral
   Phase 3: saveProcedureCosts → oprx_procedurecosting (N rows)
   Phase 4: saveConsumables    → oprx_consumablesitems (N rows)
   Phase 5: savePricingOutput  → oprx_pricingoutputs (1 row)
   Phase 6: saveApprovalLog    → oprx_approvallogs (1 row)
═══════════════════════════════════════════════════════ */

/* ── PHASE 1: oprx_pricingrequest ── */
async function saveRequestRecord(statusVal = null){
  const patientId  = document.getElementById("fPatient").value;
  // fContract دلوقتي hidden input — value بيتسيت في selectContract()
  const contractId = document.getElementById("fContract").value;
  const accomSel   = document.getElementById("fAccomType");
  const accomId    = accomSel.value;
  const p1 = document.getElementById("fProc1");
  const p2 = document.getElementById("fProc2");
  const p3 = document.getElementById("fProc3");
  const primary = S.procedureCosts.find(p => p.isPrimary);

  const body = {
    oprx_mainoperationname  : document.getElementById("fMainOp").value,
    oprx_hospital           : parseInt(document.getElementById("fHospital").value) || null,
    oprx_extconsumables     : document.getElementById("fExtConsumables").checked,
    oprx_consumablesdesc    : document.getElementById("fConsumablesDesc").value,
    oprx_extradoctorfee     : parseFloat(document.getElementById("fDoctorFee").value) || 0,
    oprx_accommodationdays  : parseInt(document.getElementById("fAccomDays").value) || 0,
    ...(statusVal !== null ? { oprx_status: statusVal } : {})
  };

  // Lookups — odata.bind (بنضيف بس لو القيمة موجودة فعلاً)
  const isValidId = (v) => v && typeof v === "string" && v.trim().length > 10;

  // Patient, Contract, Procedures — نبعتهم بـ @odata.bind
  if(isValidId(patientId))  body["oprx_patientid@odata.bind"]          = `/opd_patients(${patientId})`;
  if(isValidId(contractId)) body["oprx_contractid@odata.bind"]         = `/oprx_contracts(${contractId})`;
  const specialtyId = document.getElementById("fSpecialty").value;
  if(isValidId(specialtyId)) body["oprx_Specialty@odata.bind"]         = `/crd04_specialtieses(${specialtyId})`;
  if(isValidId(p1.value))   body["oprx_procedure1id@odata.bind"]       = `/oprx_procedures(${p1.value})`;
  if(isValidId(p2.value))   body["oprx_procedure2id@odata.bind"]       = `/oprx_procedures(${p2.value})`;
  if(isValidId(p3.value))   body["oprx_procedure3id@odata.bind"]       = `/oprx_procedures(${p3.value})`;
  // الـ Primary بيتحدد من detectPrimary في Tab 1 ومخزون في S.primaryProcedureId
  const primaryIdToUse = S.primaryProcedureId || (primary && primary.id) || null;
  if(isValidId(primaryIdToUse)) body["oprx_primaryprocedureid@odata.bind"] = `/oprx_procedures(${primaryIdToUse})`;

  // ⚠️ AccommodationType — لا نبعته في الـ POST/PATCH العادي
  // بنبعته في PATCH منفصل بعد CREATE عشان المشكلة في الـ Publish

  if(S.recordId){
    // PATCH — update existing record
    await dvPatch("oprx_pricingrequests", S.recordId, body);
  } else {
    // POST — create new record (بدون AccommodationType)
    S.recordId = await dvPost("oprx_pricingrequests", body);
    if(S.recordId){
      // اجيب الـ autonumber اللي Dataverse ولّده
      try{
        const created = await dvGet(`oprx_pricingrequests(${S.recordId})?$select=oprx_requestname`);
        const autoName = created?.oprx_requestname || S.recordId.substring(0,8).toUpperCase();
        document.getElementById("reqId").textContent = autoName;
        console.log(`[SAVE] oprx_pricingrequest created: ${S.recordId} — Name: ${autoName}`);
      }catch(e){
        console.warn("[SAVE] Could not fetch autonumber name:", e.message);
      }
    }
  }

  // ── Audit Log — نسجّل الحالة الأولية لو اتحددت في النداء ده ──
  if(statusVal !== null) await logStatusChange(S.recordId, statusVal);


  // PATCH منفصل للـ AccommodationType بعد ما الـ Record اتعمل
  if(S.recordId && isValidId(accomId)){
    try{
      await dvPatchNavigationProperty(
        "oprx_pricingrequests", S.recordId,
        "oprx_AccommodationTypeId",
        "oprx_accommodationtypes", accomId
      );
      console.log(`[SAVE] AccommodationType linked: ${accomId}`);
    }catch(e){
      console.warn("[WARN] AccommodationType link failed:", e.message);
      // مش Fatal — الـ record اتعمل بنجاح
    }
  }
}

/* ── PHASE 2: File Upload — Insurance Card & OR Referral ── */
async function uploadFiles(){
  const insuranceFile = document.getElementById("fInsuranceCard").files[0];
  const referralFile  = document.getElementById("fReferral").files[0];
  if(!S.recordId) return;
  if(!insuranceFile && !referralFile) return;

  const total = (insuranceFile ? 1 : 0) + (referralFile ? 1 : 0);
  let done = 0;

  if(insuranceFile){
    showProcessing("Uploading Insurance Card", `Uploading file 1 of ${total}...`);
    await uploadFileToDataverse(S.recordId, "oprx_pricingrequests", "oprx_insurancecard", insuranceFile);
    done++;
    console.log("[UPLOAD] Insurance card uploaded");
  }
  if(referralFile){
    showProcessing("Uploading OR Referral", `Uploading file ${done + 1} of ${total}...`);
    await uploadFileToDataverse(S.recordId, "oprx_pricingrequests", "oprx_orreferral", referralFile);
    console.log("[UPLOAD] OR Referral uploaded");
  }
  hideProcessing();
}

async function uploadFileToDataverse(recordId, entitySet, columnName, file){
  // Dataverse File Column Upload — via the code-app SDK
  try{
    await dvUploadFile(entitySet, recordId, columnName, file);
  }catch(e){
    throw new Error(`File upload failed: ${e.message}`);
  }
}

/* ── PHASE 3: oprx_procedurecosting (سطر لكل procedure) ── */
async function saveProcedureCosts(){
  if(!S.recordId || !S.procedureCosts.length) return;

  // حذف السطور القديمة لو re-submit
  if(S.procedureCostingIds && S.procedureCostingIds.length){
    for(const id of S.procedureCostingIds){
      try{ await dvDelete("oprx_procedurecostings", id); }catch(e){}
    }
  }
  S.procedureCostingIds = [];

  for(const proc of S.procedureCosts){
    const pct = proc.costPct / 100;
    const body = {
      oprx_name            : `${proc.name} — ${proc.isPrimary ? "Primary" : "Secondary"}`,
      oprx_isprimary       : proc.isPrimary,
      oprx_costpercentage  : proc.costPct,
      // Cost elements
      oprx_accommodation   : parseFloat(proc.costs.Accommodation  || 0) * pct,
      oprx_medicalcare     : parseFloat(proc.costs.MedicalCare    || 0) * pct,
      oprx_nursing         : parseFloat(proc.costs.NursingCare    || 0) * pct,
      oprx_orroom          : parseFloat(proc.costs.ORRoom         || 0) * pct,
      oprx_surgeonfee      : parseFloat(proc.costs.SurgeonFee     || 0) * pct,
      oprx_assistantfee    : parseFloat(proc.costs.AssistantFee   || 0) * pct,
      oprx_anesthesia      : parseFloat(proc.costs.AnesthesiaFee  || 0) * pct,
      // Calculated
      oprx_medsupplyamount : (getMedSupplyCfg()[proc.classType] || 0) * pct,
      oprx_subtotal        : calcSubtotal(proc),
      // Lookups — only if valid IDs
      ...(S.recordId ? {"oprx_pricingrequestid@odata.bind": `/oprx_pricingrequests(${S.recordId})`} : {}),
      ...(proc.id    ? {"oprx_procedureid@odata.bind"     : `/oprx_procedures(${proc.id})`}          : {})
    };
    const id = await dvPost("oprx_procedurecostings", body);
    if(id) S.procedureCostingIds.push(id);
    console.log(`[SAVE] oprx_procedurecosting: ${proc.name} (${proc.isPrimary?"Primary":"Secondary"})`);
  }
}

/* ── PHASE 4: oprx_consumablesitems ── */
async function saveConsumableItems(){
  if(!S.recordId) return;
  const validItems = S.consumableItems.filter(i => i.name && i.baseCost > 0);
  if(!validItems.length) return;

  // حذف السطور القديمة لو re-submit
  if(S.consumableItemIds && S.consumableItemIds.length){
    for(const id of S.consumableItemIds){
      try{ await dvDelete("oprx_consumablesitems", id); }catch(e){}
    }
  }
  S.consumableItemIds = [];

  for(const item of validItems){
    const body = {
      oprx_itemname  : item.name,
      oprx_basecost  : item.baseCost,
      oprx_markuppct : item.markupPct,
      oprx_finalcost : item.finalCost,
      ...(S.recordId ? {"oprx_pricingrequestid@odata.bind": `/oprx_pricingrequests(${S.recordId})`} : {})
    };
    const id = await dvPost("oprx_consumablesitems", body);
    if(id) S.consumableItemIds.push(id);
    console.log(`[SAVE] oprx_consumablesitems: ${item.name} — EGP ${item.finalCost}`);
  }
}

/* ── PHASE 5: oprx_pricingoutputs ── */
async function savePricingOutput(){
  if(!S.recordId) return;

  const body = {
    oprx_name             : `OUT-${S.recordId.substring(0,8).toUpperCase()}`,
    oprx_basecoststotal   : S.baseCostTotal,
    oprx_servicefees      : S.serviceFee,
    // medSupplyTotal مش محتاج تتحفظ — BUG-03 fix بيعيد حسابها من MED_SUPPLY_CONFIG عند reload
    oprx_consumablestotal : S.consumablesTotal,
    oprx_doctorfee        : S.doctorFee,
    oprx_finalestimate    : S.finalEstimate,
    oprx_outputstatus     : 129990000,   // Pending Approval
    ...(S.recordId ? {"oprx_pricingrequestid@odata.bind": `/oprx_pricingrequests(${S.recordId})`} : {})
  };

  if(S.outputId){
    // Update existing output
    await dvPatch("oprx_pricingoutputs", S.outputId, body);
    console.log(`[SAVE] oprx_pricingoutputs updated: ${S.outputId}`);
  } else {
    S.outputId = await dvPost("oprx_pricingoutputs", body);
    console.log(`[SAVE] oprx_pricingoutputs created: ${S.outputId}`);
  }
}

/* ── HELPERS ── */
function calcSubtotal(proc){
  const isMinor = proc.classType === "Minor";
  const els = proc.isPrimary
    ? (isMinor
        ? ["Accommodation","NursingCare","MedicalCare","ORRoom","SurgeonFee","AnesthesiaFee"]
        : ["Accommodation","NursingCare","MedicalCare","ORRoom","SurgeonFee","AssistantFee","AnesthesiaFee"])
    : (isMinor
        ? ["ORRoom","SurgeonFee","AnesthesiaFee"]
        : ["ORRoom","SurgeonFee","AssistantFee","AnesthesiaFee"]);
  const spSum = els.reduce((a,e) => a + parseFloat(proc.costs[e]||0), 0) * (proc.costPct/100);
  const meds  = (getMedSupplyCfg()[proc.classType]||0) * (proc.costPct/100);
  return spSum + meds;
}

/* ── Navigation Property PATCH ──
   بنستخدمها للـ Lookup columns اللي محتاجة
   Relationship مفردة بعد الـ Record Create
   Code app: implemented as an @odata.bind update (dvSetLookup)
── */
async function dvPatchNavigationProperty(entitySet, recordId, navPropName, relatedEntitySet, relatedId){
  try{
    await dvSetLookup(entitySet, recordId, navPropName, relatedEntitySet, relatedId);
  }catch(e){
    console.error(`[NAV PATCH ERROR] ${navPropName}:`, e);
    throw new Error(`Navigation property update failed (${e.message})`);
  }
}


/* ═══════════════════════
   FILE PREVIEW MODAL
═══════════════════════ */
async function previewFile(column, label){
  if(!S.recordId) return;
  const modal    = document.getElementById("filePreviewModal");
  const body     = document.getElementById("fileModalBody");
  const title    = document.getElementById("fileModalTitle");

  // BUG-12 FIX: نحرر الـ blob URL القديمة قبل ما نفتح preview جديد (memory leak)
  const oldIframe = modal.querySelector("iframe");
  const oldImg    = modal.querySelector("img");
  if(oldIframe && oldIframe.src.startsWith("blob:")) URL.revokeObjectURL(oldIframe.src);
  if(oldImg    && oldImg.src.startsWith("blob:"))    URL.revokeObjectURL(oldImg.src);

  title.textContent = label;
  body.innerHTML = `
    <div class="file-modal-loading">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
      Loading file...
    </div>`;
  modal.style.display = "flex";

  try{
    // Code app: file column download goes through the SDK; the preview uses data: URLs
    // because the code-app CSP allows data: (not blob:) for img/object.
    const file  = await dvDownloadFile("oprx_pricingrequests", S.recordId, column);
    const bytes = file.bytes;

    // اكتشف النوع من اسم الـ file أو الـ magic bytes
    const fname    = ((file.fileName || "") + " " + (column === "oprx_insurancecard"
      ? (document.getElementById("insuranceFileName")?.textContent || "")
      : (document.getElementById("referralFileName")?.textContent  || ""))).toLowerCase();
    const sig      = Array.from(bytes.slice(0, 4)).map(b => b.toString(16).padStart(2,"0")).join("");
    const isPdf    = sig === "25504446" || fname.includes(".pdf");
    const imgMime  = sig.startsWith("89504e47") ? "image/png"
                   : sig.startsWith("ffd8ff")   ? "image/jpeg"
                   : sig.startsWith("47494638") ? "image/gif"
                   : sig.startsWith("424d")     ? "image/bmp"
                   : sig === "52494646"         ? "image/webp" : "";
    // BUG-13 FIX: كانت الـ regex بتشترط مسافة أو ✓ بعد الامتداد — بيفشل على filenames عادية
    const isImage  = !!imgMime || /\.(png|jpg|jpeg|gif|webp|bmp)(\s|✓)?/i.test(fname);
    const mime     = isPdf ? "application/pdf" : (imgMime || "image/*");
    const blob     = new Blob([bytes], { type: mime });
    const dataUrl  = await new Promise((res, rej) => {
      const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob);
    });
    const showError = () => {
      const downloadUrl = URL.createObjectURL(blob);
      body.innerHTML = `<div class="file-modal-error">Cannot preview this file.<br><a href="${downloadUrl}" download="${(file.fileName || label).replace(/"/g,"")}" style="color:var(--brand);">Download file</a></div>`;
    };

    // ── PDF ──
    if(isPdf){
      body.innerHTML = `<object data="${dataUrl}" type="application/pdf" style="width:100%;height:100%;border:none;"></object>`;
    }
    // ── Image (+ fallback: حاول تعرضها كصورة على أي حال) ──
    else {
      body.innerHTML = `<img src="${dataUrl}" alt="${label}" style="max-width:100%;max-height:100%;object-fit:contain;padding:16px;">`;
      if(!isImage) body.querySelector("img").addEventListener("error", showError);
    }

  }catch(e){
    console.error("[PREVIEW ERROR]", e);
    body.innerHTML = `<div class="file-modal-error">Failed to load file.<br><small style="color:var(--text3);">${e.message}</small></div>`;
  }
}

function closeFilePreview(e){
  if(e && e.target !== document.getElementById("filePreviewModal")) return;
  const modal = document.getElementById("filePreviewModal");
  modal.style.display = "none";
  // تنظيف الـ blob URLs من الـ memory
  const iframe = modal.querySelector("iframe");
  const img    = modal.querySelector("img");
  if(iframe && iframe.src.startsWith("blob:")) URL.revokeObjectURL(iframe.src);
  if(img    && img.src.startsWith("blob:"))    URL.revokeObjectURL(img.src);
  const dl = modal.querySelector("a[download]");
  if(dl && dl.href.startsWith("blob:")) URL.revokeObjectURL(dl.href);
  document.getElementById("fileModalBody").innerHTML = "";
}

// إغلاق بـ Escape
document.addEventListener("keydown", e => {
  if(e.key === "Escape") closeFilePreview({target:document.getElementById("filePreviewModal")});
});

/* ═══════════════════════
   TAB 5 — APPROVAL
═══════════════════════ */
function toggleRejectForm(){const f=document.getElementById("rejectForm");f.style.display=f.style.display==="none"?"block":"none";}

async function approveRequest(){
  const comments = document.getElementById("fComments").value;
  try{
    await dvPost("oprx_approvallogs",{oprx_name:`APR-${Date.now().toString(36).toUpperCase()}`,oprx_decision:129990000,oprx_comments:comments,...(S.recordId ? {"oprx_pricingrequestid@odata.bind":`/oprx_pricingrequests(${S.recordId})`} : {}),
      ...(S.outputId  ? {"oprx_pricingoutputid@odata.bind" :`/oprx_pricingoutputs(${S.outputId})` } : {})
    });
    if(S.recordId) await dvPatch("oprx_pricingrequests",S.recordId,{oprx_status:129990004});
    if(S.recordId) await logStatusChange(S.recordId, 129990004);
    if(S.outputId) await dvPatch("oprx_pricingoutputs",S.outputId,{oprx_outputstatus:129990001});
  }catch(e){
    console.error("[APPROVE ERROR]",e);
    showToast("Approval save failed: " + (e.message||"Check console."), "error");
    return; // ← لا تعمل UI update لو الـ save فشل
  }
  const commentsHtml = comments ? `<br><span style="font-size:12px;opacity:.7;">Notes: ${comments}</span>` : "";
  document.getElementById("approvalDecisionArea").innerHTML = `
    <div class="alert alert-success" style="font-size:13px;padding:18px;margin-top:8px;">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;flex-shrink:0;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <div><strong>Estimate Approved</strong>${commentsHtml}<br><span style="font-size:11px;opacity:.6;">Approved by Billing Team · EGP ${fmt(S.finalEstimate)}</span></div>
    </div>`;
  markTabDone(5);
  freezeTab(5);
  updateStatus("Approved");
  renderAuditBanner(5, S.currentUserName, new Date().toISOString(), "Approved by");
  showToast("Estimate approved.","success");
}

async function confirmReject(){
  const reason         = document.getElementById("fRejectionReason").value.trim();
  const comments       = document.getElementById("fComments")?.value || "";
  const suggestedPrice = parseFloat(document.getElementById("fSuggestedPrice")?.value) || 0;
  let valid = true;
  if(!reason){ showError("fieldRejReason"); valid=false; }
  if(!suggestedPrice){ showError("fieldSuggestedPrice"); valid=false; }
  if(!valid){ showToast("Please fill all required fields.","error"); return; }
  try{
    await dvPost("oprx_approvallogs",{oprx_name:`REJ-${Date.now().toString(36).toUpperCase()}`,oprx_decision:129990001,oprx_comments:comments,oprx_rejectionreason:reason,oprx_suggestedprice:suggestedPrice,...(S.recordId ? {"oprx_pricingrequestid@odata.bind":`/oprx_pricingrequests(${S.recordId})`} : {}),
      ...(S.outputId  ? {"oprx_pricingoutputid@odata.bind" :`/oprx_pricingoutputs(${S.outputId})` } : {})
    });
    if(S.recordId) await dvPatch("oprx_pricingrequests",S.recordId,{oprx_status:129990005});
    if(S.recordId) await logStatusChange(S.recordId, 129990005);
    if(S.outputId) await dvPatch("oprx_pricingoutputs",S.outputId,{oprx_outputstatus:129990002});
  }catch(e){
    console.error("[REJECT ERROR]",e);
    showToast("Rejection save failed: " + (e.message||"Check console."), "error");
    return; // ← لا تعمل UI update لو الـ save فشل
  }
  const commentsHtml = comments ? `<br><span style="font-size:12px;opacity:.7;">Notes: ${comments}</span>` : "";
  const suggestedHtml = suggestedPrice ? `<br><span style="font-size:12px;color:var(--amber);font-weight:600;">Suggested Price: EGP ${fmt(suggestedPrice)}</span>` : "";
  document.getElementById("approvalDecisionArea").innerHTML = `
    <div class="alert alert-danger" style="font-size:13px;padding:18px;margin-top:8px;">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      <div><strong>Estimate Rejected</strong><br><span style="font-size:12px;">Reason: ${reason}</span>${suggestedHtml}${commentsHtml}<br><span style="font-size:11px;opacity:.6;">Rejected by Billing Team</span></div>
    </div>`;
  markTabRejected(5);
  freezeTab(5);
  updateStatus("Rejected");
  renderAuditBanner(5, S.currentUserName, new Date().toISOString(), "Rejected by");
  showToast("Estimate rejected.","success");
}

/* ═══════════════════════════════════════
   SUPPLY CHAIN ⇄ OR — INFO QUERY
   Status flow: Pending Supply Chain (129990001)
     → [SC sends query] → Pending OR Info (129990006)
     → [OR replies]      → Pending Supply Chain (129990001)
═══════════════════════════════════════ */
function openScAskModal(){
  document.getElementById("fScQueryComment").value = "";
  clearError("fieldScQuery");
  document.getElementById("scAskModalOverlay").style.display = "flex";
}

function closeScAskModal(event){
  if(event && event.target !== event.currentTarget) return;
  const overlay = document.getElementById("scAskModalOverlay");
  if(overlay) overlay.style.display = "none";
}

async function confirmScQuery(){
  const query = document.getElementById("fScQueryComment").value.trim();
  if(!query){
    showError("fieldScQuery");
    showToast("Please describe what's missing.","error");
    return;
  }
  if(!S.recordId){
    showToast("Request not saved yet — cannot send query.","error");
    return;
  }

  showTabLoading(true, "Sending to OR...");
  try{
    // ── Step 1: سجل الاستعلام (Open) مربوط بالـ Request ──
    // ملحوظة: oprx_name Autonumber — Dataverse بيولّده تلقائي، متبعتوش يدوي
    await dvPost("oprx_orinfoqueries", {
      oprx_query       : query,
      oprx_querystatus : 129990000, // Open
      "oprx_PricingRequest@odata.bind": `/oprx_pricingrequests(${S.recordId})`
    });
    console.log("[SC QUERY] Created — awaiting OR reply");

    // ── Step 2: تحديث حالة الطلب → Pending OR Info ──
    await dvPatch("oprx_pricingrequests", S.recordId, { oprx_status: 129990006 });
    await logStatusChange(S.recordId, 129990006);
    console.log("[STATUS] → Pending OR Info (129990006)");

    closeScAskModal();
    updateStatus("Pending OR Info");
    showToast("Request sent back to OR Coordinator.", "success");

    // ── رجّع المستخدم لليست — الطلب مش شغلة Supply Chain دلوقتي ──
    showListView();
    filterList();

  }catch(e){
    console.error("[SC QUERY ERROR]", e);
    showToast("Failed to send: " + (e.message||"Unknown error"), "error");
  }finally{
    showTabLoading(false);
  }
}

/**
 * يتنادى من جوه loadExistingRecord() لما status === 129990006
 * بيجيب آخر Open query ويعرضه فوق Tab 1 مع مربع الرد
 */
/**
 * يتنادى من جوه loadExistingRecord() لما status === 129990006
 * بيجيب آخر Open query ويخزّنها — وبيظهر زرار أحمر في الهيدر يفتح popup الرد
 */
async function showOrQueryBanner(recordId){
  try{
    const res = await dvGet(
      `oprx_orinfoqueries?$filter=_oprx_pricingrequest_value eq ${recordId} and oprx_querystatus eq 129990000` +
      `&$orderby=createdon desc&$top=1&$select=oprx_query,createdon` +
      `&$expand=createdby($select=fullname)`
    );
    const q = res.value?.[0];
    const btn = document.getElementById("scQueryPendingBtn");
    if(!q){
      console.warn("[OR QUERY] Status is Pending OR Info but no open query record found.");
      if(btn) btn.style.display = "none";
      return;
    }

    S.openQueryId = q.oprx_orinfoqueryid;
    S.openQueryData = {
      query : q.oprx_query || "—",
      meta  : `Asked by ${q.createdby?.fullname || "Supply Chain"} · ${new Date(q.createdon).toLocaleString()}`
    };
    if(btn) btn.style.display = "inline-flex";
    // يفتح تلقائي أول مرة يشوفه الـ OR عشان ميفوتوش
    openScQueryModal();
  }catch(e){
    console.error("[LOAD OR QUERY ERROR]", e);
  }
}

function openScQueryModal(){
  if(!S.openQueryData) return;
  document.getElementById("scQueryText").textContent = S.openQueryData.query;
  document.getElementById("scQueryMeta").textContent = S.openQueryData.meta;
  document.getElementById("fOrReplyComment").value = "";
  clearError("fieldOrReply");
  document.getElementById("scQueryModalOverlay").style.display = "flex";
}

function closeScQueryModal(event){
  if(event && event.target !== event.currentTarget) return;
  const overlay = document.getElementById("scQueryModalOverlay");
  if(overlay) overlay.style.display = "none";
}

/**
 * يتنادى من جوه loadExistingRecord() لما status === 129990001 (Pending Supply Chain)
 * بيجيب آخر Query اتردّ عليها (Answered) ويخزّنها — وبيظهر زرار "View Reply" لو موجودة
 */
async function showResolvedQueryBanner(recordId){
  try{
    const res = await dvGet(
      `oprx_orinfoqueries?$filter=_oprx_pricingrequest_value eq ${recordId} and oprx_querystatus eq 129990001` +
      `&$orderby=modifiedon desc&$top=1&$select=oprx_query,oprx_reply,modifiedon` +
      `&$expand=modifiedby($select=fullname)`
    );
    const q = res.value?.[0];
    if(!q){
      S.lastResolvedQuery = null;
      updateOrReplyButtonVisibility();
      return;
    }

    S.lastResolvedQuery = {
      query : q.oprx_query || "—",
      reply : q.oprx_reply || "—",
      meta  : `Replied by ${q.modifiedby?.fullname || "OR Coordinator"} · ${new Date(q.modifiedon).toLocaleString()}`
    };
    updateOrReplyButtonVisibility();
  }catch(e){
    console.error("[LOAD RESOLVED QUERY ERROR]", e);
  }
}

/**
 * الزرار الأخضر "View OR Coordinator's Reply" في الهيدر يظهر بس لو:
 *   1) فيه رد مخزّن (S.lastResolvedQuery)
 *   2) المستخدم واقف دلوقتي في Tab 2 (Supply Chain)
 */
function updateOrReplyButtonVisibility(){
  const btn = document.getElementById("viewOrReplyBtn");
  if(!btn) return;
  btn.style.display = (S.lastResolvedQuery && S.currentTab === 2) ? "inline-flex" : "none";
}

function openOrReplyModal(){
  if(!S.lastResolvedQuery) return;
  document.getElementById("orReplyQueryText").textContent = S.lastResolvedQuery.query;
  document.getElementById("orReplyText").textContent = S.lastResolvedQuery.reply;
  document.getElementById("orReplyMeta").textContent = S.lastResolvedQuery.meta;
  document.getElementById("orReplyModalOverlay").style.display = "flex";
}

function closeOrReplyModal(event){
  // لو الضغط جه من على الـ overlay نفسه أو من زرار "Got it" (من غير event) — اقفل
  if(event && event.target !== event.currentTarget) return;
  const overlay = document.getElementById("orReplyModalOverlay");
  if(overlay) overlay.style.display = "none";
}

/* ═══════════════════════════════════════
   AUDIT TRAIL — Timeline كامل لكل تغيير حالة حصل للطلب
   بيحسب المدة الحقيقية بين كل نقلة والتانية، وبيجمع المدد بتاعة
   نفس الفريق مع بعض حتى لو الطلب راح جه أكتر من مرة (Return loop)
═══════════════════════════════════════ */

// أي حالة تابعة لأنهي "فريق" — عشان نحسب الإجمالي صح.
// ملحوظة: مرحلة "Billing" فعليًا بتفضل مسؤولية الـ Billing Team لحد ما يحصل
// Approve/Reject فعلي — فـ "Pending Approval" بتتحسب هي كمان جوه إجمالي Billing.
const AUDIT_TEAM_OF_STATUS = {
  129990000: "Draft",
  129990001: "Supply Chain",
  129990002: "Billing",
  129990003: "Billing", // Pending Approval — لسه مسؤولية Billing لحد ما يتاخد قرار
  129990004: "Billing",
  129990005: "Billing",
  129990006: "OR Coordinator"
};
// لون الـ dot في الـ Timeline بس (تمييز بصري لمرحلة الاعتماد) — مالوش علاقة بتجميع الإجمالي
const AUDIT_DOT_COLOR_OVERRIDE = {
  129990003: "var(--purple)",
  129990004: "var(--purple)",
  129990005: "var(--purple)"
};
const AUDIT_TEAM_COLOR = {
  "Draft"         : "var(--text3)",
  "Supply Chain"  : "var(--amber)",
  "Billing"       : "var(--blue)",
  "OR Coordinator": "var(--red)"
};

/** يتنادى من جوه loadExistingRecord() — بيظهّر زرار Audit Trail لأي طلب اتحفظ فعلاً */
function updateAuditTrailButtonVisibility(){
  const btn = document.getElementById("auditTrailBtn");
  if(!btn) return;
  btn.style.display = S.recordId ? "inline-flex" : "none";
}

async function openAuditTrailModal(){
  if(!S.recordId) return;
  document.getElementById("auditTrailModalOverlay").style.display = "flex";
  const body   = document.getElementById("auditTimelineBody");
  const totals = document.getElementById("auditTotalsRow");
  body.innerHTML   = `<div style="text-align:center;color:var(--text3);font-size:12.5px;padding:20px;">Loading…</div>`;
  totals.innerHTML = "";

  try{
    const res = await dvGet(
      `oprx_statusauditlogs?$filter=_oprx_pricingrequest_value eq ${S.recordId}` +
      `&$orderby=createdon asc&$select=oprx_status,createdon` +
      `&$expand=createdby($select=fullname)`
    );
    const logs = res.value || [];
    if(!logs.length){
      body.innerHTML = `<div style="text-align:center;color:var(--text3);font-size:12.5px;padding:20px;">No audit history recorded yet for this request.</div>`;
      return;
    }

    // ── نحسب مدة كل مرحلة: الفرق بين توقيتها وتوقيت اللي بعدها (أو الآن لو هي آخر واحدة) ──
    const now = new Date();
    const teamTotals = {}; // { "Supply Chain": ms, "Billing": ms, ... }
    const items = logs.map((log, i) => {
      const isTerminal = (log.oprx_status === 129990004 || log.oprx_status === 129990005);
      const start = new Date(log.createdon);
      const end   = (i < logs.length - 1) ? new Date(logs[i+1].createdon) : now;
      // الحالات النهائية (Approved/Rejected) مالهاش "مدة انتظار" — الطلب اتقفل عندها،
      // فمينفعش نحسبها كـ (دلوقتي - وقت الاعتماد) لأن الرقم هيفضل يكبر كل ما تفتح الـ Audit تاني
      const durationMs = isTerminal ? 0 : Math.max(end - start, 0);
      const team = AUDIT_TEAM_OF_STATUS[log.oprx_status] || "—";
      const dotColor = AUDIT_DOT_COLOR_OVERRIDE[log.oprx_status] || AUDIT_TEAM_COLOR[team] || "var(--text3)";
      if(!isTerminal){
        teamTotals[team] = (teamTotals[team] || 0) + durationMs;
      }
      // نعتبرها "Return loop" لو دخلت في حالة Pending OR Info، أو رجعت لـ Pending Supply Chain
      // بعد ما كانت خرجت منها قبل كده (يعني مش أول ظهور للحالة دي)
      const isLoopEntry = log.oprx_status === 129990006 ||
        (log.oprx_status === 129990001 && logs.slice(0, i).some(l => l.oprx_status === 129990001));
      return {
        statusLabel : getStatusLabel(log.oprx_status),
        team, dotColor, durationMs, isTerminal, isLoopEntry,
        isOngoing   : i === logs.length - 1 && !isTerminal,
        byName      : log.createdby?.fullname || "—",
        when        : start.toLocaleString()
      };
    });

    // ── كروت الإجمالي فوق ──
    totals.innerHTML = Object.entries(teamTotals).map(([team, ms]) => `
      <div class="audit-total-chip">
        <div class="audit-total-chip-label" style="color:${AUDIT_TEAM_COLOR[team]||'var(--text3)'};">${team}</div>
        <div class="audit-total-chip-val">${formatTatHours(ms/3600000)}</div>
      </div>`).join("");

    // ── الـ Timeline نفسه ──
    body.innerHTML = items.map(it => `
      <div class="audit-item">
        <div class="audit-item-dot" style="background:${it.dotColor};"></div>
        <div class="audit-item-row">
          <span class="audit-item-status">${it.statusLabel}</span>
          <span class="audit-item-duration ${it.isLoopEntry?'is-loop':''}">
            ${it.isTerminal ? "Closed" : (it.isOngoing ? "Ongoing · " : "") + formatTatHours(it.durationMs/3600000)}
          </span>
        </div>
        <div class="audit-item-meta">${it.byName} · ${it.when}</div>
        ${it.isLoopEntry ? `<div class="audit-loop-tag">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:10px;height:10px;"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          Return loop
        </div>` : ""}
      </div>`).join("");

  }catch(e){
    console.error("[AUDIT TRAIL ERROR]", e);
    body.innerHTML = `<div style="text-align:center;color:var(--red);font-size:12.5px;padding:20px;">Failed to load audit trail.</div>`;
  }
}

function closeAuditTrailModal(event){
  if(event && event.target !== event.currentTarget) return;
  const overlay = document.getElementById("auditTrailModalOverlay");
  if(overlay) overlay.style.display = "none";
}

async function confirmOrReply(){
  const reply = document.getElementById("fOrReplyComment").value.trim();
  if(!reply){
    showError("fieldOrReply");
    showToast("Please enter a reply.","error");
    return;
  }
  if(!S.openQueryId){
    showToast("No open query found for this request.","error");
    return;
  }

  showTabLoading(true, "Sending reply...");
  try{
    // ── Step 1: اقفل الاستعلام وسجل الرد ──
    await dvPatch("oprx_orinfoqueries", S.openQueryId, {
      oprx_reply       : reply,
      oprx_querystatus : 129990001 // Answered
    });
    console.log("[OR REPLY] Query answered:", S.openQueryId);

    // ── Step 2: رجّع الطلب لـ Pending Supply Chain ──
    await dvPatch("oprx_pricingrequests", S.recordId, { oprx_status: 129990001 });
    await logStatusChange(S.recordId, 129990001);
    console.log("[STATUS] → Pending Supply Chain (129990001)");

    closeScQueryModal();
    document.getElementById("scQueryPendingBtn").style.display = "none";
    S.openQueryId = null;
    S.openQueryData = null;
    updateStatus("Pending Supply Chain");
    showToast("Reply sent — request returned to Supply Chain.", "success");

    showListView();
    filterList();

  }catch(e){
    console.error("[OR REPLY ERROR]", e);
    showToast("Failed to send reply: " + (e.message||"Unknown error"), "error");
  }finally{
    showTabLoading(false);
  }
}

/* ═══════════════════════════════════════
   TAB 3 — BILLING REVIEW
═══════════════════════════════════════ */

/**
 * Populates Tab 3 with:
 *  1. Procedure table (name, class, Primary/Secondary badge)
 *  2. Accommodation Type dropdown (copied from Tab 1's fAccomType options)
 *  3. ICU/Ward days from existing values on the record
 */
function populateBillingReviewTab(){
  // ── 1. Procedure Table ──
  const tbody = document.getElementById("billingProcTable");
  if(!tbody) return;

  const procs = [];
  [1,2,3].forEach(i => {
    const hidden = document.getElementById(`fProc${i}`);
    if(!hidden || !hidden.value) return;
    const ct   = hidden.dataset?.classtype || "";
    const name = document.getElementById(`proc${i}Search`)?.value?.trim() || hidden.value;
    procs.push({ idx: i, name, ct, id: hidden.value });
  });

  // إيه اللي Primary؟ نفس منطق detectPrimary — BUG-06 FIX: كانت ORDER عكسي ومختلف عن detectPrimary
  let primaryIdx = null;
  if(S.primaryProcedureId){
    // لو محفوظ من الـ detect
    const found = procs.find(p => p.id === S.primaryProcedureId);
    if(found) primaryIdx = found.idx;
  }
  if(!primaryIdx && procs.length > 0){
    // fallback: نفس منطق detectPrimary — أعلى rank في CLASS_ORDER
    const maxRank = Math.max(...procs.map(p => CLASS_ORDER.indexOf(p.ct)));
    const best = procs.find(p => CLASS_ORDER.indexOf(p.ct) === maxRank);
    primaryIdx = best ? best.idx : procs[0].idx;
  }

  const CLASS_COLORS_BR = {
    "Minor"         : { bg:"#EFF6FF", color:"#1D4ED8" },
    "Moderate"      : { bg:"#ECFDF5", color:"#065F46" },
    "Major"         : { bg:"#FFF7ED", color:"#9A3412" },
    "Special Skills": { bg:"#F5F3FF", color:"#4C1D95" },
    "Special Nature": { bg:"#FDF4FF", color:"#701A75" },
    "Advanced"      : { bg:"#FFF1F2", color:"#881337" }
  };

  if(procs.length === 0){
    tbody.innerHTML = '<tr><td colspan="3" style="padding:18px 14px;color:var(--text3);font-size:12px;text-align:center;">No procedures selected on this request.</td></tr>';
    return;
  }

  tbody.innerHTML = procs.map(p => {
    const isPrimary = p.idx === primaryIdx;
    const clr = CLASS_COLORS_BR[p.ct] || { bg:"#F3F4F6", color:"#374151" };
    const roleBadge = isPrimary
      ? `<span style="display:inline-block;padding:3px 12px;border-radius:9999px;background:var(--brand);color:#fff;font-size:11px;font-weight:700;letter-spacing:.03em;">Primary</span>`
      : `<span style="display:inline-block;padding:3px 12px;border-radius:9999px;background:var(--surface2);color:var(--text2);border:1px solid var(--border);font-size:11px;font-weight:600;">Secondary</span>`;
    const classBadge = p.ct
      ? `<span style="display:inline-block;padding:3px 12px;border-radius:9999px;background:${clr.bg};color:${clr.color};font-size:11px;font-weight:600;">${p.ct}</span>`
      : `<span style="color:var(--text3);font-size:12px;">—</span>`;
    return `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:12px 14px;font-size:13px;font-weight:${isPrimary?'600':'400'};color:var(--text);">${p.name}</td>
        <td style="padding:12px 14px;">${classBadge}</td>
        <td style="padding:12px 14px;">${roleBadge}</td>
      </tr>`;
  }).join("");

  // ── 2. Populate Accommodation Type dropdown from Tab 1's select ──
  const srcSel  = document.getElementById("fAccomType");
  const destSel = document.getElementById("fBillingAccomType");
  if(srcSel && destSel){
    // نسخ الـ options من Tab 1
    destSel.innerHTML = '<option value="">— Select Type —</option>';
    Array.from(srcSel.options).forEach(o => {
      if(!o.value) return;
      const newOpt = new Option(o.text, o.value);
      newOpt.dataset.name = o.dataset.name || o.text;
      destSel.appendChild(newOpt);
    });
    // اختيار نفس القيمة الموجودة في Tab 1
    if(srcSel.value) destSel.value = srcSel.value;
  }

  // ── 3. Pre-fill No. of Days ──
  const existingDays = document.getElementById("fAccomDays")?.value;
  if(existingDays && !document.getElementById("fBillingAccomDays").value){
    document.getElementById("fBillingAccomDays").value = existingDays;
  }

  // ── 3b. Pre-fill Extra Doctor Fee from Tab 1 ──
  const existingDocFee = document.getElementById("fDoctorFee")?.value;
  if(existingDocFee && !document.getElementById("fBillingDoctorFee").value){
    document.getElementById("fBillingDoctorFee").value = existingDocFee;
  }

  // ── 4. Fill Billing Contract search (editable) ──
  const srcContractInput = document.getElementById("contractSearchInput");
  const srcContractId    = document.getElementById("fContract")?.value || "";
  const srcContractName  = srcContractInput?.value || "";
  if(srcContractName && !document.getElementById("billingContractSearchInput").value){
    document.getElementById("billingContractSearchInput").value  = srcContractName;
    document.getElementById("billingContractSearchInput").style.color      = "var(--brand-dark)";
    document.getElementById("billingContractSearchInput").style.fontWeight = "600";
    document.getElementById("fBillingContract").value = srcContractId;
    document.getElementById("billingContractClearBtn").style.display = "flex";
  }

  // ── 5. Fill Billing Specialty from Tab 1's hidden input ──
  const srcSpecialtyId   = document.getElementById("fSpecialty").value;
  const srcSpecialtyName = document.getElementById("specialtySearch")?.value || "";
  if(srcSpecialtyId && !document.getElementById("fBillingSpecialty").value){
    setSDropValue("billingSpecialty", srcSpecialtyId, srcSpecialtyName);
  }
  // Sync read-only display after populating edit fields
  syncBillingReadOnly();
}

/**
 * Validates and saves Billing Review data to Dataverse,
 * then unlocks Tab 4 (Cost & Pricing).
 */
/**
 * Called when Billing Extra Fees input changes.
 * Makes Remarks mandatory when a fee value is entered.
 */
function onBillingExtraFeesChange(){
  const val = parseFloat(document.getElementById("fBillingExtraFees").value) || 0;
  const optSpan = document.getElementById("lblRemarksOpt");
  const reqSpan = document.getElementById("lblRemarksReq");
  if(val > 0){
    if(optSpan) optSpan.style.display = "none";
    if(reqSpan) reqSpan.style.display = "inline";
  } else {
    if(optSpan) optSpan.style.display = "inline";
    if(reqSpan) reqSpan.style.display = "none";
    clearError("fieldBillingRemarks");
  }
}

async function completeBillingReview(){
  const accomSel      = document.getElementById("fBillingAccomType");
  const accomDays     = parseInt(document.getElementById("fBillingAccomDays").value) || 0;
  const remarks       = document.getElementById("fBillingRemarks").value;
  const billingExtra  = parseFloat(document.getElementById("fBillingExtraFees").value) || 0;
  const billingDocFee = parseFloat(document.getElementById("fBillingDoctorFee").value) || 0;

  // Validate — Accommodation Type is required
  if(!accomSel.value){
    showError("fieldBillingAccomType");
    showToast("Please select an Accommodation Type.", "error");
    return;
  }
  clearError("fieldBillingAccomType");

  // Validate — Remarks mandatory when Billing Extra Fees entered
  if(billingExtra > 0 && !remarks.trim()){
    showError("fieldBillingRemarks");
    showToast("Remarks are required when Billing Extra Fees are entered.", "error");
    return;
  }
  clearError("fieldBillingRemarks");

  const spinner = document.getElementById("billingReviewSpinner");
  const btn     = document.getElementById("btnCompleteBillingReview");
  spinner.style.display = "block";
  btn.disabled = true;
  showTabLoading(true, "Saving billing review...");

  try{
    // ── Sync back to Tab 1 fields (so Cost tab picks the right values) ──
    const srcSel = document.getElementById("fAccomType");
    if(srcSel && accomSel.value) srcSel.value = accomSel.value;
    const accomDaysEl = document.getElementById("fAccomDays");
    if(accomDaysEl) accomDaysEl.value = accomDays > 0 ? accomDays : "";
    // Sync doctor fee back to Tab 1 so calculateAll() reads the updated value
    const docFeeEl = document.getElementById("fDoctorFee");
    if(docFeeEl && billingDocFee >= 0) docFeeEl.value = billingDocFee || "";

    // ── PATCH oprx_pricingrequest — save accommodation selection ──
    if(S.recordId){
      const patch = {
        oprx_accommodationdays : accomDays,
        oprx_billingremarks    : remarks || null,
        oprx_billingextrafees  : billingExtra > 0 ? billingExtra : null,
        oprx_extradoctorfee    : billingDocFee > 0 ? billingDocFee : 0
      };
      S.billingExtraFee = billingExtra;
      await dvPatch("oprx_pricingrequests", S.recordId, patch);
      // AccommodationType via $ref
      if(accomSel.value){
        try{
          await dvPatchNavigationProperty(
            "oprx_pricingrequests", S.recordId,
            "oprx_AccommodationTypeId",
            "oprx_accommodationtypes", accomSel.value
          );
        }catch(e){ console.warn("[BILLING REVIEW] AccomType link failed:", e.message); }
      }
      // Contract via $ref (if changed by Billing Team)
      const billingContractId = document.getElementById("fBillingContract").value;
      if(billingContractId && billingContractId !== document.getElementById("fContract").value){
        try{
          await dvPatchNavigationProperty(
            "oprx_pricingrequests", S.recordId,
            "oprx_contractid",
            "oprx_contracts", billingContractId
          );
          console.log("[BILLING REVIEW] Contract updated:", billingContractId);
        }catch(e){ console.warn("[BILLING REVIEW] Contract link failed:", e.message); }
      }
      // Specialty via $ref (if changed by Billing Team)
      const billingSpecialtyId = document.getElementById("fBillingSpecialty").value;
      if(billingSpecialtyId){
        try{
          await dvPatchNavigationProperty(
            "oprx_pricingrequests", S.recordId,
            "oprx_Specialty",
            "crd04_specialtieses", billingSpecialtyId
          );
          console.log("[BILLING REVIEW] Specialty updated:", billingSpecialtyId);
        }catch(e){ console.warn("[BILLING REVIEW] Specialty link failed:", e.message); }
      }
      console.log("[BILLING REVIEW] Saved to Dataverse");
    }

    markTabDone(3);
    freezeTab(3);
    unlockTab(4);
    // نحسب فورًا لو الأسعار كانت متجابة قبل كده — عشان أي رقم اتغير في Billing Review
    // (Doctor Fee / Billing Extra Fees) يظهر في Tab 4 من غير ما نستنى الـ goTab guard
    if(S.costsLoaded) calculateAll();
    goTab(4);
    renderAuditBanner(3, S.currentUserName, new Date().toISOString(), "Reviewed by");
    document.getElementById("footerInfo").innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;stroke:var(--green);"><polyline points="20 6 9 17 4 12"/></svg> Billing Review complete — proceed to Cost & Pricing.`;
    showToast("Billing Review saved.", "success");

  }catch(e){
    console.error("[BILLING REVIEW ERROR]", e);
    showToast("Save failed: " + (e.message || "Unknown error"), "error");
  }finally{
    spinner.style.display = "none";
    btn.disabled = false;
    showTabLoading(false);
  }
}


function showError(fieldId){document.getElementById(fieldId)?.classList.add("has-error");}
function clearError(fieldId){document.getElementById(fieldId)?.classList.remove("has-error");}
function fmt(n){return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});}

/* ── Character Counter ── */
function updateCharCounter(inputId, counterId, max){
  const el  = document.getElementById(inputId);
  const ctr = document.getElementById(counterId);
  if(!el || !ctr) return;
  const len = el.value.length;
  ctr.textContent = `${len.toLocaleString()} / ${max.toLocaleString()}`;
  ctr.classList.remove("warn","over");
  if(len >= max)           ctr.classList.add("over");
  else if(len >= max * .85) ctr.classList.add("warn");
}

const MAX_FILE_BYTES = 32 * 1024 * 1024; // 32 MB

/* ── File Size Validator ── */
function validateFileSize(input, fieldId){
  const file = input.files[0];
  if(!file) return;
  if(file.size > MAX_FILE_BYTES){
    // Clear the bad file
    input.value = "";
    showError(fieldId);
    // Show size-specific error message
    const msgEl = input.nextElementSibling; // the validation-msg span
    if(msgEl && msgEl.classList.contains("validation-msg")){
      const origMsg = msgEl.dataset.origMsg || msgEl.textContent;
      msgEl.dataset.origMsg = origMsg;
      msgEl.textContent = `File too large (${(file.size/1024/1024).toFixed(1)} MB). Max allowed is 32 MB.`;
      // Restore original message after 5s
      setTimeout(() => { msgEl.textContent = origMsg; clearError(fieldId); }, 5000);
    }
    showToast(`File "${file.name}" exceeds 32 MB limit.`, "error");
    return false;
  }
  clearError(fieldId);
  return true;
}

function showProcessing(title, sub){
  document.getElementById("processingTitle").textContent = title || "Processing...";
  document.getElementById("processingSub").textContent   = sub   || "Please wait";
  document.getElementById("processingOverlay").classList.add("visible");
}
function hideProcessing(){
  document.getElementById("processingOverlay").classList.remove("visible");
}

/* ── Audit Banner ── */
function renderAuditBanner(tabNum, fullname, isoDatetime, label){
  const el = document.getElementById(`auditBanner${tabNum}`);
  if(!el || !fullname) return;
  const initial = fullname.charAt(0).toUpperCase();
  const dateStr = isoDatetime
    ? new Date(isoDatetime).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})
      + " " + new Date(isoDatetime).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})
    : "";
  const panel = document.getElementById(`tabPanel${tabNum}`);
  const isFrozen = panel && panel.classList.contains("tab-frozen");
  const lockedPill = isFrozen
    ? `<div class="locked-pill visible" style="margin-left:auto;">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Section Locked
      </div>`
    : "";
  el.innerHTML = `
    <div class="audit-banner-wrap" style="justify-content:space-between;align-items:center;">
      <div class="audit-banner">
        <div class="audit-banner-av">${initial}</div>
        <span class="audit-banner-lbl">${label || "Submitted by"}</span>
        <span class="audit-banner-name">${fullname}</span>
        ${dateStr ? `<span class="audit-banner-sep">·</span><span class="audit-banner-time">${dateStr}</span>` : ""}
      </div>
      ${lockedPill}
    </div>`;
  el.style.display = "block";
}

function updateStatus(label){
  // BUG-10 FIX: كانت بتعمل string split على ":" وبيتعدد في CSS values زي var(--x) → parsing هش
  const pill=document.getElementById("globalStatus");pill.textContent=label;
  const map={
    "Draft"                :{bg:"var(--brand-light)",   color:"var(--brand-dark)", border:"1px solid rgba(165,116,77,.25)"},
    "Pending Supply Chain" :{bg:"var(--amber-bg)",      color:"var(--amber)",      border:"1px solid var(--amber-bdr)"},
    "Pending Billing"      :{bg:"var(--blue-bg)",       color:"var(--blue)",       border:"1px solid var(--blue-bdr)"},
    "Pending Approval"     :{bg:"var(--blue-bg)",       color:"var(--blue)",       border:"1px solid var(--blue-bdr)"},
    "Approved"             :{bg:"var(--green-bg)",      color:"var(--green)",      border:"1px solid var(--green-bdr)"},
    "Rejected"             :{bg:"var(--red-bg)",        color:"var(--red)",        border:"1px solid var(--red-bdr)"},
    "Pending OR Info"      :{bg:"var(--red-bg)",        color:"var(--red)",        border:"1px solid var(--red-bdr)"}
  };
  const s=map[label]||map["Draft"];
  pill.style.background=s.bg;
  pill.style.color=s.color;
  pill.style.border=s.border;
}

function showToast(msg,type="success"){
  document.querySelectorAll(".toast").forEach(t=>t.remove());
  const t=document.createElement("div");
  t.className=`toast toast-${type}`;
  // BUG-01 FIX: كانت nested ternary مكسورة — success icon بيتعرض على error toast والعكس
  const icon = type==="success"
    ? `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  t.innerHTML=icon+`<span>${msg}</span>`;
  document.body.appendChild(t);setTimeout(()=>t.remove(),3000);
}

/* ═══════════════════════
   PATIENT SEARCH
═══════════════════════ */
let patientFocusedIdx = -1;
let patientSearchResults = [];

function onPatientSearch(query){
  patientFocusedIdx = -1;
  if(!query || query.trim().length < 1){
    hidePatientDropdown();
    return;
  }
  const q = query.toLowerCase().trim();
  // Search by name OR patient code
  patientSearchResults = Object.entries(S.patientsCache)
    .filter(([id, p]) =>
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.bu.toLowerCase().includes(q)
    )
    .slice(0, 10); // max 10 results

  renderPatientDropdown(q);
}

function renderPatientDropdown(query){
  const dd = document.getElementById("patientDropdown");
  dd.innerHTML = "";

  if(patientSearchResults.length === 0){
    dd.innerHTML = `<div class="no-results">No patients found for "${query}"</div>`;
    dd.style.display = "block";
    return;
  }

  const hint = document.createElement("div");
  hint.className = "search-hint";
  hint.textContent = `${patientSearchResults.length} result${patientSearchResults.length>1?"s":""} found`;
  dd.appendChild(hint);

  patientSearchResults.forEach(([id, p], idx) => {
    const div = document.createElement("div");
    div.className = "patient-option";
    div.dataset.idx = idx;

    // Highlight matching text
    const hl = (text, q) => {
      const i = text.toLowerCase().indexOf(q.toLowerCase());
      if(i < 0) return text;
      return text.slice(0,i) + `<mark>${text.slice(i,i+q.length)}</mark>` + text.slice(i+q.length);
    };

    div.innerHTML = `
      <div class="patient-option-name">${hl(p.name, query)}</div>
      <div class="patient-option-meta">${hl(p.code, query)} · ${p.bu} · ${p.age} · ${p.gender}</div>
    `;
    div.onclick = () => selectPatient(id, p);
    dd.appendChild(div);
  });

  dd.style.display = "block";
}

function showPatientDropdown(){
  // Show recently loaded list on focus if field is empty
  const q = document.getElementById("patientSearchInput").value.trim();
  if(q.length > 0) onPatientSearch(q);
}

function hidePatientDropdown(){
  document.getElementById("patientDropdown").style.display = "none";
}

function selectPatient(id, pat){
  // Set hidden value
  document.getElementById("fPatient").value = id;

  // Update search input to show selected
  document.getElementById("patientSearchInput").value = `${pat.code} — ${pat.name}`;
  document.getElementById("patientSearchInput").style.color = "var(--brand-dark)";
  document.getElementById("patientSearchInput").style.fontWeight = "500";

  // Show clear button
  document.getElementById("patientClearBtn").style.display = "flex";

  // Hide dropdown
  hidePatientDropdown();

  // Fill patient info card
  document.getElementById("fPatientName").textContent    = pat.name;
  document.getElementById("fPatientCode").textContent    = pat.code;
  document.getElementById("fPatientBU").textContent      = pat.bu;
  document.getElementById("fPatientAge").textContent     = pat.age;
  document.getElementById("fPatientGender").textContent  = pat.gender;
  document.getElementById("fPatientAddress").textContent = pat.address;
  document.getElementById("patientInfoCard").style.display = "grid";

  S.patientData = pat;
  clearError("fieldPatient");
}

function clearPatient(){
  document.getElementById("fPatient").value = "";
  document.getElementById("patientSearchInput").value = "";
  document.getElementById("patientSearchInput").style.color = "";
  document.getElementById("patientSearchInput").style.fontWeight = "";
  document.getElementById("patientClearBtn").style.display = "none";
  document.getElementById("patientInfoCard").style.display = "none";
  S.patientData = null;
  hidePatientDropdown();
  patientSearchResults = [];
}

// Close dropdown when clicking outside
document.addEventListener("click", e => {
  if(!document.getElementById("patientSearchWrap")?.contains(e.target)){
    hidePatientDropdown();
  }
});

// Keyboard navigation in dropdown
document.addEventListener("keydown", e => {
  const dd = document.getElementById("patientDropdown");
  if(dd.style.display === "none") return;
  const opts = dd.querySelectorAll(".patient-option");
  if(!opts.length) return;

  if(e.key === "ArrowDown"){
    e.preventDefault();
    patientFocusedIdx = Math.min(patientFocusedIdx+1, opts.length-1);
    opts.forEach((o,i)=>o.classList.toggle("focused",i===patientFocusedIdx));
  } else if(e.key === "ArrowUp"){
    e.preventDefault();
    patientFocusedIdx = Math.max(patientFocusedIdx-1, 0);
    opts.forEach((o,i)=>o.classList.toggle("focused",i===patientFocusedIdx));
  } else if(e.key === "Enter" && patientFocusedIdx >= 0){
    e.preventDefault();
    const [id, p] = patientSearchResults[patientFocusedIdx];
    selectPatient(id, p);
  } else if(e.key === "Escape"){
    hidePatientDropdown();
  }
});

/* ═══════════════════════
   CONTRACT SEARCH
═══════════════════════ */
let contractSearchResults = [];

function onContractSearch(query){
  if(!query || query.trim().length < 1){
    hideContractDropdown();
    return;
  }
  const q = query.toLowerCase().trim();
  contractSearchResults = (S.contractsCache || []).filter(c =>
    c.name.toLowerCase().includes(q)
  ).slice(0, 10);
  renderContractDropdown(query);
}

function renderContractDropdown(query){
  const dd = document.getElementById("contractDropdown");
  dd.innerHTML = "";

  if(!contractSearchResults.length){
    dd.innerHTML = `<div class="no-results">No contracts found for "${query}"</div>`;
    dd.style.display = "block";
    return;
  }

  const hint = document.createElement("div");
  hint.className = "search-hint";
  hint.textContent = `${contractSearchResults.length} result${contractSearchResults.length > 1 ? "s" : ""} found`;
  dd.appendChild(hint);

  contractSearchResults.forEach((c, idx) => {
    const div = document.createElement("div");
    div.className = "patient-option";
    div.dataset.idx = idx;

    // Highlight matching text
    const hl = (text, q) => {
      const i = text.toLowerCase().indexOf(q.toLowerCase());
      if(i < 0) return text;
      return text.slice(0,i) + `<mark>${text.slice(i,i+q.length)}</mark>` + text.slice(i+q.length);
    };

    div.innerHTML = `<div class="patient-option-name">${hl(c.name, query)}</div>`;
    div.onclick = () => selectContract(c);
    dd.appendChild(div);
  });

  dd.style.display = "block";
}

function showContractDropdown(){
  const q = document.getElementById("contractSearchInput").value.trim();
  if(q.length > 0) onContractSearch(q);
  else if(S.contractsCache && S.contractsCache.length){
    // على focus بدون نص — اعرض كل العقود
    contractSearchResults = (S.contractsCache || []).slice(0, 10);
    renderContractDropdown("");
  }
}

function hideContractDropdown(){
  document.getElementById("contractDropdown").style.display = "none";
}

function selectContract(c){
  document.getElementById("fContract").value            = c.id;
  document.getElementById("contractSearchInput").value  = c.name;
  document.getElementById("contractSearchInput").style.color      = "var(--brand-dark)";
  document.getElementById("contractSearchInput").style.fontWeight = "600";
  document.getElementById("contractClearBtn").style.display       = "flex";
  hideContractDropdown();
  clearError("fieldContract");
  console.log(`[CONTRACT] Selected: ${c.name} (${c.id})`);
}

function clearContract(){
  document.getElementById("fContract").value            = "";
  document.getElementById("contractSearchInput").value  = "";
  document.getElementById("contractSearchInput").style.color      = "";
  document.getElementById("contractSearchInput").style.fontWeight = "";
  document.getElementById("contractClearBtn").style.display       = "none";
  hideContractDropdown();
  contractSearchResults = [];
}

// إغلاق الـ dropdown لما المستخدم يضغط برة
document.addEventListener("click", e => {
  if(!document.getElementById("contractSearchWrap")?.contains(e.target)){
    hideContractDropdown();
  }
});

/* ═══════════════════════
   BILLING CONTRACT SEARCH (Tab 3)
═══════════════════════ */
function toggleBillingEdit(){
  const editDiv=document.getElementById("billingInfoEdit");
  const roDiv=document.getElementById("billingInfoReadOnly");
  const btn=document.getElementById("btnBillingEdit");
  const isEdit=editDiv.style.display!=="none";
  if(isEdit){
    syncBillingReadOnly();
    editDiv.style.display="none";
    roDiv.style.display="block";
    btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;stroke:currentColor;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit';
  }else{
    editDiv.style.display="block";
    roDiv.style.display="none";
    btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;stroke:currentColor;"><polyline points="20 6 9 17 4 12"/></svg> Done';
  }
}

function syncBillingReadOnly(){
  const cName=document.getElementById("billingContractSearchInput")?.value||"—";
  document.getElementById("roContractName").textContent=cName;
  const spName=document.getElementById("billingSpecialtySearch")?.value||"—";
  document.getElementById("roSpecialtyName").textContent=spName||"—";
  const acSel=document.getElementById("fBillingAccomType");
  const acName=acSel?.options[acSel?.selectedIndex]?.text||"—";
  document.getElementById("roAccomTypeName").textContent=acName.includes("Select")?"—":acName;
  const days=document.getElementById("fBillingAccomDays")?.value||"0";
  document.getElementById("roAccomDays").textContent=days;
  const docFee=parseFloat(document.getElementById("fBillingDoctorFee")?.value)||0;
  const roDocFee=document.getElementById("roDoctorFee");
  if(roDocFee) roDocFee.textContent = docFee > 0 ? `EGP ${fmt(docFee)}` : "—";
}

let billingContractSearchResults = [];

function onBillingContractSearch(query){
  if(!query||query.trim().length<1){hideBillingContractDropdown();return;}
  const q=query.toLowerCase().trim();
  billingContractSearchResults=(S.contractsCache||[]).filter(c=>c.name.toLowerCase().includes(q)).slice(0,10);
  renderBillingContractDropdown(query);
}

function renderBillingContractDropdown(query){
  const dd=document.getElementById("billingContractDropdown");dd.innerHTML="";
  if(!billingContractSearchResults.length){
    dd.innerHTML=`<div class="no-results">No contracts found for "${query}"</div>`;
    dd.style.display="block";return;
  }
  const hint=document.createElement("div");hint.className="search-hint";
  hint.textContent=`${billingContractSearchResults.length} result${billingContractSearchResults.length>1?"s":""} found`;
  dd.appendChild(hint);
  billingContractSearchResults.forEach(c=>{
    const div=document.createElement("div");div.className="patient-option";
    const hl=(text,q)=>{const i=text.toLowerCase().indexOf(q.toLowerCase());if(i<0)return text;return text.slice(0,i)+`<mark>${text.slice(i,i+q.length)}</mark>`+text.slice(i+q.length);};
    div.innerHTML=`<div class="patient-option-name">${hl(c.name,query||"")}</div>`;
    div.onclick=()=>selectBillingContract(c);dd.appendChild(div);
  });dd.style.display="block";
}

function showBillingContractDropdown(){
  const q=document.getElementById("billingContractSearchInput").value.trim();
  if(q.length>0) onBillingContractSearch(q);
  else if(S.contractsCache&&S.contractsCache.length){
    billingContractSearchResults=(S.contractsCache||[]).slice(0,10);
    renderBillingContractDropdown("");
  }
}

function hideBillingContractDropdown(){document.getElementById("billingContractDropdown").style.display="none";}

function selectBillingContract(c){
  document.getElementById("fBillingContract").value=c.id;
  document.getElementById("billingContractSearchInput").value=c.name;
  document.getElementById("billingContractSearchInput").style.color="var(--brand-dark)";
  document.getElementById("billingContractSearchInput").style.fontWeight="600";
  document.getElementById("billingContractClearBtn").style.display="flex";
  hideBillingContractDropdown();
}

function clearBillingContract(){
  document.getElementById("fBillingContract").value="";
  document.getElementById("billingContractSearchInput").value="";
  document.getElementById("billingContractSearchInput").style.color="";
  document.getElementById("billingContractSearchInput").style.fontWeight="";
  document.getElementById("billingContractClearBtn").style.display="none";
  hideBillingContractDropdown();billingContractSearchResults=[];
}

document.addEventListener("click",e=>{
  if(!document.getElementById("billingContractSearchWrap")?.contains(e.target)) hideBillingContractDropdown();
});

/* ═══════════════════════════════════════════════════
   SEARCHABLE DROPDOWN ENGINE (SDROP)
   Supports: specialty, proc1, proc2, proc3, billingSpecialty
═══════════════════════════════════════════════════ */

// Data stores — populated from Dataverse
const SDROP_DATA = {
  specialty        : [],   // { id, name }
  proc1            : [],   // { id, name, classtype, classtypeint }
  proc2            : [],
  proc3            : [],
  billingSpecialty : []
};

// Focused item index per key
const SDROP_FOCUS = { specialty:-1, proc1:-1, proc2:-1, proc3:-1, billingSpecialty:-1 };

// Config map per key
const SDROP_CFG = {
  specialty        : { search:"specialtySearch",   dropdown:"specialtyDropdown",   hidden:"fSpecialty",        clear:"specialtyClear",        wrap:"specialtyWrap",        placeholder:"Search specialty..."   },
  proc1            : { search:"proc1Search",        dropdown:"proc1Dropdown",        hidden:"fProc1",             clear:"proc1Clear",             wrap:"proc1Wrap",             placeholder:"Search procedure...",  onSelect: onProcedureChange },
  proc2            : { search:"proc2Search",        dropdown:"proc2Dropdown",        hidden:"fProc2",             clear:"proc2Clear",             wrap:"proc2Wrap",             placeholder:"Search procedure...",  onSelect: onProcedureChange },
  proc3            : { search:"proc3Search",        dropdown:"proc3Dropdown",        hidden:"fProc3",             clear:"proc3Clear",             wrap:"proc3Wrap",             placeholder:"Search procedure...",  onSelect: onProcedureChange },
  billingSpecialty : { search:"billingSpecialtySearch", dropdown:"billingSpecialtyDropdown", hidden:"fBillingSpecialty", clear:"billingSpecialtyClear", wrap:"billingSpecialtyWrap", placeholder:"Search specialty..." }
};

function onSDropSearch(key){
  SDROP_FOCUS[key] = -1;
  const cfg = SDROP_CFG[key];
  const q   = document.getElementById(cfg.search).value.trim().toLowerCase();
  if(!q){ hideSDropDropdown(key); return; }
  renderSDropDropdown(key, q);
}

function onSDropFocus(key){
  const cfg = SDROP_CFG[key];
  const q   = document.getElementById(cfg.search).value.trim().toLowerCase();
  if(q) renderSDropDropdown(key, q);
  else  renderSDropDropdown(key, "");   // show all on focus
}

function renderSDropDropdown(key, q){
  const cfg  = SDROP_CFG[key];
  const dd   = document.getElementById(cfg.dropdown);
  const data = SDROP_DATA[key] || [];

  // BUG-7 FIX: لو الـ data فاضية — اشرح السبب بدل "No results"
  if(!data.length){
    const isProcedure = ["proc1","proc2","proc3"].includes(key);
    dd.innerHTML = `<div class="sdrop-empty">${isProcedure ? "Select a hospital first to load procedures." : "No options available."}</div>`;
    dd.style.display = "block"; return;
  }

  const filtered = q
    ? data.filter(i => i.name.toLowerCase().includes(q)).slice(0, 15)
    : data.slice(0, 15);

  dd.innerHTML = "";
  if(!filtered.length){
    dd.innerHTML = `<div class="sdrop-empty">No results${q ? ` for "${q}"` : ""}</div>`;
    dd.style.display = "block"; return;
  }
  if(data.length > 15){
    const hint = document.createElement("div");
    hint.className = "sdrop-hint";
    hint.textContent = filtered.length < data.length
      ? `${filtered.length} of ${data.length} — type to narrow`
      : `Showing ${filtered.length} of ${data.length}`;
    dd.appendChild(hint);
  }
  filtered.forEach((item, idx) => {
    const div = document.createElement("div");
    div.className = "sdrop-option";
    div.dataset.idx = idx;
    const hl = (text) => {
      if(!q) return text;
      const i = text.toLowerCase().indexOf(q);
      if(i < 0) return text;
      return text.slice(0,i) + `<mark>${text.slice(i,i+q.length)}</mark>` + text.slice(i+q.length);
    };
    div.innerHTML = hl(item.name);
    div.onclick = () => selectSDropItem(key, item);
    dd.appendChild(div);
  });
  dd.style.display = "block";
}

function selectSDropItem(key, item){
  const cfg = SDROP_CFG[key];
  document.getElementById(cfg.search).value      = item.name;
  document.getElementById(cfg.search).style.color      = "var(--brand-dark)";
  document.getElementById(cfg.search).style.fontWeight = "600";
  document.getElementById(cfg.hidden).value      = item.id;
  document.getElementById(cfg.clear).style.display = "flex";
  hideSDropDropdown(key);
  SDROP_FOCUS[key] = -1;
  // store dataset for procedure selects
  if(item.classtype !== undefined){
    document.getElementById(cfg.hidden).dataset.classtype    = item.classtype    || "";
    document.getElementById(cfg.hidden).dataset.classtypeint = item.classtypeint ?? "";
  }
  if(cfg.onSelect) cfg.onSelect();
  // clear validation error
  const fieldId = { specialty:"fieldSpecialty", proc1:"fieldProc1", proc2:"fieldProc2", proc3:"fieldProc3" }[key];
  if(fieldId) clearError(fieldId);
}

function clearSDropField(key){
  const cfg = SDROP_CFG[key];
  document.getElementById(cfg.search).value = "";
  document.getElementById(cfg.search).style.color      = "";
  document.getElementById(cfg.search).style.fontWeight = "";
  document.getElementById(cfg.hidden).value = "";
  document.getElementById(cfg.clear).style.display = "none";
  hideSDropDropdown(key);
  if(cfg.onSelect) cfg.onSelect();
}

function hideSDropDropdown(key){
  const dd = document.getElementById(SDROP_CFG[key].dropdown);
  if(dd) dd.style.display = "none";
}

function hideAllSDropDropdowns(){
  Object.keys(SDROP_CFG).forEach(k => hideSDropDropdown(k));
}

// Close on outside click
document.addEventListener("click", e => {
  Object.entries(SDROP_CFG).forEach(([key, cfg]) => {
    const wrap = document.getElementById(cfg.wrap);
    if(wrap && !wrap.contains(e.target)) hideSDropDropdown(key);
  });
});

// Keyboard navigation
document.addEventListener("keydown", e => {
  const activeKey = Object.keys(SDROP_CFG).find(k => {
    const dd = document.getElementById(SDROP_CFG[k].dropdown);
    return dd && dd.style.display !== "none";
  });
  if(!activeKey) return;
  const dd   = document.getElementById(SDROP_CFG[activeKey].dropdown);
  const opts = dd.querySelectorAll(".sdrop-option");
  if(!opts.length) return;
  if(e.key === "ArrowDown"){
    e.preventDefault();
    SDROP_FOCUS[activeKey] = Math.min(SDROP_FOCUS[activeKey]+1, opts.length-1);
    opts.forEach((o,i) => o.classList.toggle("focused", i===SDROP_FOCUS[activeKey]));
  } else if(e.key === "ArrowUp"){
    e.preventDefault();
    SDROP_FOCUS[activeKey] = Math.max(SDROP_FOCUS[activeKey]-1, 0);
    opts.forEach((o,i) => o.classList.toggle("focused", i===SDROP_FOCUS[activeKey]));
  } else if(e.key === "Enter" && SDROP_FOCUS[activeKey] >= 0){
    e.preventDefault();
    const q = document.getElementById(SDROP_CFG[activeKey].search).value.trim().toLowerCase();
    const data = SDROP_DATA[activeKey] || [];
    const filtered = q ? data.filter(i=>i.name.toLowerCase().includes(q)).slice(0,15) : data.slice(0,15);
    if(filtered[SDROP_FOCUS[activeKey]]) selectSDropItem(activeKey, filtered[SDROP_FOCUS[activeKey]]);
  } else if(e.key === "Escape"){
    hideSDropDropdown(activeKey);
  }
});

/* ── Populate SDROP from data arrays ── */
function populateSDrop(key, items){
  SDROP_DATA[key] = items;
}

/* ── Helper: set a SDROP field value + display (e.g. on record load) ── */
function setSDropValue(key, id, name, classtype, classtypeint){
  if(!id) return;
  const cfg = SDROP_CFG[key];
  document.getElementById(cfg.search).value             = name || "";
  document.getElementById(cfg.search).style.color       = "var(--brand-dark)";
  document.getElementById(cfg.search).style.fontWeight  = "600";
  document.getElementById(cfg.hidden).value             = id;
  document.getElementById(cfg.clear).style.display      = "flex";
  if(classtype !== undefined){
    document.getElementById(cfg.hidden).dataset.classtype    = classtype    || "";
    document.getElementById(cfg.hidden).dataset.classtypeint = classtypeint ?? "";
  }
}

/* ── Helper: clear a SDROP field (e.g. on hospital change) ── */
function clearSDrop(key){
  clearSDropField(key);
  SDROP_DATA[key] = [];
}
function showTabLoading(show, message=""){
  // Disable Next button and show loading state — scope to formView only
  const formView = document.getElementById("formView");
  const nextBtns = formView ? formView.querySelectorAll(".btn-brand") : [];
  nextBtns.forEach(btn => { btn.disabled = show; });
  if(show && message){
    document.getElementById("footerInfo").innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;stroke:var(--brand);animation:spin .7s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg> ${message}`;
  }
}


/* ═══════════════════════════════════════════════════
   LIST VIEW — State & Data
═══════════════════════════════════════════════════ */
let LIST = {
  records    : [],
  filtered   : [],
  sortField  : "createdon",
  sortDir    : "desc",
  roleFilter : "all"
};

const STATUS_LABEL = {
  129990000: "Draft",
  129990001: "Pending Supply Chain",
  129990002: "Pending Billing",
  129990003: "Pending Approval",
  129990004: "Approved",
  129990005: "Rejected",
  129990006: "Pending OR Info"
};

const STATUS_CLASS = {
  129990000: "draft",
  129990001: "supply-chain",
  129990002: "billing",
  129990003: "approval",
  129990004: "approved",
  129990005: "rejected",
  129990006: "or-info"
};

// Role → which statuses to show
const ROLE_STATUS_MAP = {
  coordinator : null,  // all
  billing     : [129990002, 129990003, 129990004, 129990005],
  supplychain : [129990001],
  all         : null
};

/* ── Router: decide LIST vs FORM vs COMPLIANCE on load ── */
function initRouter(){
  const id = getRecordIdFromUrl();
  const params = new URLSearchParams(window.location.search);
  if(params.get("view") === "compliance"){
    showComplianceView();
    loadUser();
    loadComplianceData();
  } else if(id){
    showFormView();
    // BUG-5 FIX: نستنى loadSpecialties تخلص الأول عشان SDROP_DATA.specialty يكون populated
    // قبل ما loadExistingRecord تحاول تلاقي الـ specialty name فيها
    Promise.all([loadDataverse(), loadSpecialties()]).then(() => loadExistingRecord(id));
  } else {
    showListView();
    loadListData();
    loadUser();
    // Pre-load specialties + dropdowns in background for when user clicks New
    loadSpecialties();
    loadDataverse();
  }
}

function showListView(){
  document.getElementById("listView").style.display  = "block";
  document.getElementById("formView").style.display  = "none";
  document.getElementById("complianceView").style.display = "none";
  document.getElementById("globalStatus").style.display = "none";
  // Set list date
  document.getElementById("listCurrentDate").textContent =
    new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
}

function showFormView(){
  document.getElementById("listView").style.display  = "none";
  document.getElementById("formView").style.display  = "block";
  document.getElementById("complianceView").style.display = "none";
  document.getElementById("globalStatus").style.display = "inline-flex";
  document.getElementById("currentDate").textContent =
    new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
}

function showComplianceView(){
  document.getElementById("listView").style.display  = "none";
  document.getElementById("formView").style.display  = "none";
  document.getElementById("complianceView").style.display = "block";
  document.getElementById("globalStatus").style.display = "none";
}

/* ── فتح/قفل الـ Compliance Dashboard ── */
function openComplianceDashboard(){
  history.pushState({view:"compliance"},"","?view=compliance");
  showComplianceView();
  loadComplianceData();
}
function closeComplianceDashboard(){
  history.pushState({},"",window.location.pathname);
  showListView();
  filterList();
}

/* ═══════════════════════════════════════
   TAT DASHBOARD — متوسط وقت الرد لكل يوزر لكل مرحلة
   المراحل: Supply Chain (Tab2) / Billing (Tab3+4) / Approval (Tab5)
   كل مرحلة بتتحسب من فرق التوقيت بين بداية المرحلة ولحظة أول
   إجراء فيها، ومنسوبة لليوزر اللي عمل الإجراء ده (createdby)
═══════════════════════════════════════ */

/** تنسيق عدد الساعات لشكل مقروء: "3h 20m" أو "2d 4h" */
function formatTatHours(hrs){
  if(hrs == null || isNaN(hrs)) return "—";
  if(hrs < 1) return `${Math.round(hrs*60)}m`;
  if(hrs < 24){
    const h = Math.floor(hrs), m = Math.round((hrs-h)*60);
    return m>0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(hrs/24), h = Math.round(hrs - d*24);
  return h>0 ? `${d}d ${h}h` : `${d}d`;
}


/* ═══════════════════════════════════════
   COMPLIANCE DASHBOARD — تحليل شامل لكل الطلبات مبني على الـ Status Audit Log
   (مش الحساب التقريبي القديم) — بيحسب مدة كل مرحلة بدقة حتى مع رحلات
   الـ Return (Supply Chain ⇄ OR) المتكررة، وبيوفّر Export لملف Excel/CSV
   للـ Compliance Reports.
═══════════════════════════════════════ */

const HOSPITAL_LABEL = { 129990000:"SMH", 129990001:"AMH", 129990002:"ASH" };
function getHospitalLabel(v){ return HOSPITAL_LABEL[v] ?? "—"; }

const STATUS_DOT_COLOR = {
  129990000: "var(--text3)",
  129990001: "var(--amber)",
  129990002: "var(--blue)",
  129990003: "var(--purple)",
  129990004: "var(--green)",
  129990005: "var(--red)",
  129990006: "var(--red)"
};

function _complianceDateFilter(){
  const from = document.getElementById("compDateFrom")?.value;
  const to   = document.getElementById("compDateTo")?.value;
  const parts = [];
  if(from) parts.push(`createdon ge ${from}T00:00:00Z`);
  if(to)   parts.push(`createdon le ${to}T23:59:59Z`);
  return parts.join(" and ");
}

function clearComplianceDateFilter(){
  document.getElementById("compDateFrom").value = "";
  document.getElementById("compDateTo").value   = "";
  loadComplianceData();
}

/** State مؤقت بيحتفظ بآخر بيانات اتحسبت — عشان الـ Export يستخدمها من غير ما يعمل fetch تاني */
let COMPLIANCE_ROWS = [];

async function loadComplianceData(){
  const btn      = document.getElementById("btnComplianceRefresh");
  const kpiGrid  = document.getElementById("complianceKpiGrid");
  const statusEl = document.getElementById("complianceStatusBars");
  const stageEl  = document.getElementById("complianceStageAvgs");
  const tbody    = document.getElementById("complianceTableBody");
  const hintEl   = document.getElementById("compFilterHint");
  if(btn) btn.disabled = true;
  statusEl.innerHTML = `<div class="comp-loading">Loading…</div>`;
  stageEl.innerHTML  = `<div class="comp-loading">Loading…</div>`;
  tbody.innerHTML    = `<tr><td colspan="9" style="padding:24px;text-align:center;color:var(--text3);">Loading…</td></tr>`;

  const from = document.getElementById("compDateFrom")?.value;
  const to   = document.getElementById("compDateTo")?.value;
  hintEl.textContent = (from || to) ? `Filtered: ${from||"…"} → ${to||"…"}` : "";

  try{
    // ── 1) الطلبات (مع فلتر التاريخ لو محدد) ──
    const dateFilter = _complianceDateFilter();
    const reqResp = await dvGet(
      `oprx_pricingrequests?$select=oprx_pricingrequestid,oprx_requestname,oprx_mainoperationname,createdon,oprx_status,oprx_hospital` +
      (dateFilter ? `&$filter=${dateFilter}` : "") +
      `&$expand=oprx_patientid($select=opd_patientname)` +
      `&$orderby=createdon desc&$top=500`
    );
    const requests = reqResp.value || [];
    const reqIds = requests.map(r => r.oprx_pricingrequestid);

    // ── 2) الـ Status Audit Logs بتاعة الطلبات دي كلها (chunked زي التاي دي دولت) ──
    const logsByReq = {};
    if(reqIds.length){
      const CHUNK = 30;
      const chunks = [];
      for(let i=0;i<reqIds.length;i+=CHUNK) chunks.push(reqIds.slice(i,i+CHUNK));

      const results = await Promise.all(chunks.map(chunk=>{
        const filter = chunk.map(id=>`_oprx_pricingrequest_value eq ${id}`).join(" or ");
        return dvGet(
          `oprx_statusauditlogs?$select=oprx_status,createdon,_oprx_pricingrequest_value` +
          `&$expand=createdby($select=fullname)` +
          `&$filter=${filter}&$orderby=createdon asc`
        ).catch(e=>{ console.error("[COMPLIANCE] chunk fetch failed:", e); return {value:[]}; });
      }));
      results.flatMap(r=>r.value||[]).forEach(log=>{
        const rid = log._oprx_pricingrequest_value;
        if(!logsByReq[rid]) logsByReq[rid] = [];
        logsByReq[rid].push(log);
      });
      console.log(`[COMPLIANCE] requests: ${requests.length} | audit logs: ${Object.values(logsByReq).reduce((s,a)=>s+a.length,0)}`);
    }

    // ── 3) نحسب لكل طلب: مدة كل فريق + عدد الـ Return loops + الحالة الحالية + إجمالي الدورة ──
    COMPLIANCE_ROWS = requests.map(req=>{
      const rid  = req.oprx_pricingrequestid;
      const logs = (logsByReq[rid] || []).sort((a,b)=> new Date(a.createdon) - new Date(b.createdon));
      const now  = new Date();

      let scMs = 0, orMs = 0, billMs = 0, loopCount = 0;
      let firstTs = req.createdon ? new Date(req.createdon) : null;
      let lastTs  = firstTs;

      logs.forEach((log,i)=>{
        const start = new Date(log.createdon);
        const end   = (i < logs.length-1) ? new Date(logs[i+1].createdon) : now;
        const isTerminal = (log.oprx_status === 129990004 || log.oprx_status === 129990005);
        const ms = isTerminal ? 0 : Math.max(end-start, 0);
        const team = AUDIT_TEAM_OF_STATUS[log.oprx_status];
        if(team === "Supply Chain") scMs += ms;
        else if(team === "OR Coordinator") orMs += ms;
        else if(team === "Billing") billMs += ms;

        if(log.oprx_status === 129990006) loopCount++;

        if(!firstTs || start < firstTs) firstTs = start;
        if(!lastTs || start > lastTs) lastTs = start;
      });

      const currentStatus = req.oprx_status ?? 129990000;
      const isClosed = (currentStatus === 129990004 || currentStatus === 129990005);
      const totalCycleMs = firstTs ? ((isClosed ? lastTs : now) - firstTs) : 0;

      return {
        id: rid,
        requestName : req.oprx_requestname || "—",
        operation   : req.oprx_mainoperationname || "—",
        patientName : req.oprx_patientid?.opd_patientname || "—",
        hospital    : getHospitalLabel(req.oprx_hospital),
        createdon   : req.createdon,
        status      : currentStatus,
        statusLabel : getStatusLabel(currentStatus),
        scHrs       : scMs/3600000,
        orHrs       : orMs/3600000,
        billHrs     : billMs/3600000,
        loopCount,
        totalCycleHrs: totalCycleMs/3600000,
        isClosed
      };
    });

    // ── 4) KPI Cards ──
    const total       = COMPLIANCE_ROWS.length;
    const approved    = COMPLIANCE_ROWS.filter(r=>r.status===129990004).length;
    const rejected    = COMPLIANCE_ROWS.filter(r=>r.status===129990005).length;
    const inProgress  = total - approved - rejected;
    const withLoop    = COMPLIANCE_ROWS.filter(r=>r.loopCount>0).length;
    const loopPct     = total ? Math.round((withLoop/total)*100) : 0;
    const closedRows  = COMPLIANCE_ROWS.filter(r=>r.isClosed);
    const avgCycle    = closedRows.length ? closedRows.reduce((s,r)=>s+r.totalCycleHrs,0)/closedRows.length : null;

    kpiGrid.innerHTML = `
      <div class="kpi-card"><div class="kpi-card-accent" style="background:var(--brand);"></div>
        <div class="kpi-card-label">Total Requests</div><div class="kpi-card-val">${total}</div>
        <div class="kpi-card-sub">In selected period</div></div>
      <div class="kpi-card"><div class="kpi-card-accent" style="background:var(--green);"></div>
        <div class="kpi-card-label">Approved</div><div class="kpi-card-val" style="color:var(--green);">${approved}</div>
        <div class="kpi-card-sub">${total?Math.round(approved/total*100):0}% of total</div></div>
      <div class="kpi-card"><div class="kpi-card-accent" style="background:var(--red);"></div>
        <div class="kpi-card-label">Rejected</div><div class="kpi-card-val" style="color:var(--red);">${rejected}</div>
        <div class="kpi-card-sub">${total?Math.round(rejected/total*100):0}% of total</div></div>
      <div class="kpi-card"><div class="kpi-card-accent" style="background:var(--amber);"></div>
        <div class="kpi-card-label">In Progress</div><div class="kpi-card-val" style="color:var(--amber);">${inProgress}</div>
        <div class="kpi-card-sub">Still moving through stages</div></div>
      <div class="kpi-card"><div class="kpi-card-accent" style="background:${withLoop?'var(--red)':'var(--green)'};"></div>
        <div class="kpi-card-label">Return Loop Rate</div><div class="kpi-card-val">${loopPct}%</div>
        <div class="kpi-card-sub">${withLoop} of ${total} needed a SC⇄OR round trip</div></div>
      <div class="kpi-card"><div class="kpi-card-accent" style="background:var(--blue);"></div>
        <div class="kpi-card-label">Avg Total Cycle</div><div class="kpi-card-val">${formatTatHours(avgCycle)}</div>
        <div class="kpi-card-sub">Across ${closedRows.length} closed request(s)</div></div>
    `;

    // ── 5) Status Distribution ──
    const statusCounts = {};
    COMPLIANCE_ROWS.forEach(r=>{ statusCounts[r.status] = (statusCounts[r.status]||0)+1; });
    const maxCount = Math.max(...Object.values(statusCounts), 1);
    statusEl.innerHTML = total ? Object.entries(statusCounts)
      .sort((a,b)=>b[1]-a[1])
      .map(([status,count])=>{
        const color = STATUS_DOT_COLOR[status] || "var(--text3)";
        const pct = Math.max((count/maxCount)*100, 4);
        return `
        <div class="comp-status-row">
          <span class="comp-status-dot" style="background:${color};"></span>
          <span class="comp-status-label">${getStatusLabel(Number(status))}</span>
          <div class="comp-status-track"><div class="comp-status-fill" style="width:${pct}%;background:${color};"></div></div>
          <span class="comp-status-count">${count}</span>
        </div>`;
      }).join("") : `<div class="comp-loading">No requests in this period.</div>`;

    // ── 6) Average Time per Stage (بس على الطلبات اللي فعلاً مرّت بالمرحلة دي) ──
    const stageAvg = (key) => {
      const vals = COMPLIANCE_ROWS.filter(r=>r[key]>0).map(r=>r[key]);
      return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
    };
    const scAvg = stageAvg("scHrs"), orAvg = stageAvg("orHrs"), billAvg = stageAvg("billHrs");
    stageEl.innerHTML = `
      <div class="comp-stage-row">
        <span class="comp-stage-name"><span class="comp-stage-dot" style="background:var(--amber);"></span>Supply Chain</span>
        <span class="comp-stage-val">${formatTatHours(scAvg)}</span>
      </div>
      <div class="comp-stage-row">
        <span class="comp-stage-name"><span class="comp-stage-dot" style="background:var(--red);"></span>OR Coordinator Reply</span>
        <span class="comp-stage-val">${formatTatHours(orAvg)}</span>
      </div>
      <div class="comp-stage-row">
        <span class="comp-stage-name"><span class="comp-stage-dot" style="background:var(--blue);"></span>Billing &amp; Approval</span>
        <span class="comp-stage-val">${formatTatHours(billAvg)}</span>
      </div>
    `;

    // ── 7) الجدول التفصيلي ──
    tbody.innerHTML = COMPLIANCE_ROWS.length ? COMPLIANCE_ROWS.map(r=>{
      const loopBadge = r.loopCount>0
        ? `<span class="comp-loop-badge has-loop">${r.loopCount}</span>`
        : `<span class="comp-loop-badge no-loop">0</span>`;
      return `
      <tr>
        <td style="padding:12px 16px;"><span class="req-id-link" style="cursor:pointer;" data-onclick="openRecord('${r.id}')">${r.requestName}</span></td>
        <td style="padding:12px 16px;">${r.hospital}</td>
        <td style="padding:12px 16px;color:var(--text2);">${r.createdon ? new Date(r.createdon).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "—"}</td>
        <td style="padding:12px 16px;"><span class="status-badge ${STATUS_CLASS[r.status]||'draft'}">${r.statusLabel}</span></td>
        <td style="padding:12px 16px;text-align:right;" class="dash-tat-num">${r.scHrs>0?formatTatHours(r.scHrs):"—"}</td>
        <td style="padding:12px 16px;text-align:right;" class="dash-tat-num">${r.orHrs>0?formatTatHours(r.orHrs):"—"}</td>
        <td style="padding:12px 16px;text-align:right;" class="dash-tat-num">${r.billHrs>0?formatTatHours(r.billHrs):"—"}</td>
        <td style="padding:12px 16px;text-align:center;">${loopBadge}</td>
        <td style="padding:12px 16px;text-align:right;" class="dash-tat-num">${formatTatHours(r.totalCycleHrs)}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="9" style="padding:24px;text-align:center;color:var(--text3);">No requests found for this period.</td></tr>`;

  }catch(e){
    console.error("[COMPLIANCE LOAD ERROR]", e);
    tbody.innerHTML = `<tr><td colspan="9" style="padding:24px;text-align:center;color:var(--red);">Failed to load: ${e.message||e}</td></tr>`;
    statusEl.innerHTML = `<div class="comp-loading" style="color:var(--red);">Failed to load.</div>`;
    stageEl.innerHTML  = `<div class="comp-loading" style="color:var(--red);">Failed to load.</div>`;
  }finally{
    if(btn) btn.disabled = false;
  }
}

/** بيصدّر جدول الـ Compliance الحالي لملف CSV بيفتح عادي في Excel (مع دعم الحروف العربية UTF-8) */
function exportComplianceCSV(){
  if(!COMPLIANCE_ROWS.length){
    showToast("No data to export — load the dashboard first.", "error");
    return;
  }
  const headers = [
    "Request","Operation","Patient","Hospital","Created On","Current Status",
    "Supply Chain (hrs)","OR Coordinator Reply (hrs)","Billing & Approval (hrs)",
    "Return Loops","Total Cycle (hrs)"
  ];
  const escapeCsv = (val) => {
    const s = String(val ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const rows = COMPLIANCE_ROWS.map(r => [
    r.requestName, r.operation, r.patientName, r.hospital,
    r.createdon ? new Date(r.createdon).toLocaleDateString("en-GB") : "",
    r.statusLabel,
    r.scHrs ? r.scHrs.toFixed(2) : "0",
    r.orHrs ? r.orHrs.toFixed(2) : "0",
    r.billHrs ? r.billHrs.toFixed(2) : "0",
    r.loopCount,
    r.totalCycleHrs ? r.totalCycleHrs.toFixed(2) : "0"
  ].map(escapeCsv).join(","));

  const csv = "\uFEFF" + [headers.join(","), ...rows].join("\r\n"); // BOM عشان Excel يقرأ العربي/الترميز صح
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const stamp = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `OR_Pricing_Compliance_Report_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Compliance report exported.", "success");
}

/* ── Open New Request Form ── */
function openNewForm(){
  // Reset all state
  S = {
    recordId:null,outputId:null,currentTab:1,unlockedTabs:[1],
    hasConsumables:false,patientData:null,patientsCache:S.patientsCache||{},
    contractsCache:[],
    currentUserId:S.currentUserId,currentUserName:S.currentUserName,
    procedureCosts:[],procedureCostingIds:[],
    consumableItems:[],consumableItemIds:[],
    primaryProcedureId:null,
    supplyChainRecordId:null,
    baseCostTotal:0,serviceFee:0,medSupplyTotal:0,
    consumablesTotal:0,doctorFee:0,billingExtraFee:0,finalEstimate:0,
    costsLoaded:false,
    // BUG-04 FIX: كانت hasInsuranceCard و hasReferral مش بيتـreset — validation الـ files بيفشل
    hasInsuranceCard:false,hasReferral:false,
    _tab2BannerAuthor:null,_tab2BannerDate:null,
    openQueryId:null,openQueryData:null,
    lastResolvedQuery:null
  };
  // Reset form fields
  resetFormFields();
  showFormView();
  // Push URL without id
  history.pushState({},"",window.location.pathname);
}

/* ── Go Back to List ── */
function goBackToList(){
  history.pushState({},"",window.location.pathname);
  showListView();
  loadListData(); // refresh list
}

/* ── Reset all form fields to blank ── */
function resetFormFields(){
  // Reset audit banners
  [1,2,3,4,5].forEach(n => {
    const b = document.getElementById(`auditBanner${n}`);
    if(b){ b.innerHTML = ""; b.style.display = "none"; }
  });
  // Reset OR Info Query UI (view-reply button + sc-query pending button)
  const viewReplyBtn = document.getElementById("viewOrReplyBtn");
  if(viewReplyBtn) viewReplyBtn.style.display = "none";
  const scQueryBtn = document.getElementById("scQueryPendingBtn");
  if(scQueryBtn) scQueryBtn.style.display = "none";
  const scQueryOverlay = document.getElementById("scQueryModalOverlay");
  if(scQueryOverlay) scQueryOverlay.style.display = "none";
  const scAskOverlay = document.getElementById("scAskModalOverlay");
  if(scAskOverlay) scAskOverlay.style.display = "none";
  const auditBtn = document.getElementById("auditTrailBtn");
  if(auditBtn) auditBtn.style.display = "none";
  const auditOverlay = document.getElementById("auditTrailModalOverlay");
  if(auditOverlay) auditOverlay.style.display = "none";
  // Patient
  document.getElementById("fPatient").value = "";
  document.getElementById("patientSearchInput").value = "";
  document.getElementById("patientSearchInput").style.color = "";
  document.getElementById("patientSearchInput").style.fontWeight = "";
  document.getElementById("patientClearBtn").style.display = "none";
  document.getElementById("patientInfoCard").style.display = "none";
  // Hospital, Contract, AccomType
  document.getElementById("fHospital").value = "";
  // Contract search reset
  clearContract();
  document.getElementById("contractSearchInput").disabled    = true;
  document.getElementById("contractSearchInput").placeholder = "Select a hospital first...";
  S.contractsCache = [];
  // Accommodation Type reset
  const accomSel = document.getElementById("fAccomType");
  accomSel.innerHTML = '<option value="">— Select Type —</option>';
  accomSel.disabled  = true;
  document.getElementById("fAccomDays").value = "";
  document.getElementById("fDoctorFee").value = "";
  document.getElementById("fSpecialty").value = "";
  clearSDropField("specialty");
  clearSDropField("proc1");
  clearSDropField("proc2");
  clearSDropField("proc3");
  clearSDropField("billingSpecialty");
  document.getElementById("fMainOp").value    = "";
  resetProcedureDropdowns();
  document.getElementById("fExtConsumables").checked = false;
  document.getElementById("consumablesDescBox").style.display = "none";
  document.getElementById("fConsumablesDesc").value = "";
  document.getElementById("tabBtn2").classList.add("hidden");
  document.getElementById("tab1NextLabel").textContent = "Billing Review";
  // Tabs reset
  document.querySelectorAll(".tab-btn").forEach(b=>{ b.classList.remove("done","active","locked"); });
  document.querySelectorAll(".tab-panel").forEach(p=>{ p.classList.remove("active","tab-frozen"); }); // BUG-F FIX: unfreeze all panels
  document.getElementById("tabBtn1").classList.add("active");
  document.getElementById("tabBtn2").classList.add("locked","hidden");
  document.getElementById("tabBtn3").classList.add("locked");
  document.getElementById("tabBtn4").classList.add("locked");
  document.getElementById("tabBtn5").classList.add("locked");
  S.unlockedTabs = [1];
  S.currentTab = 1;
  document.getElementById("tabPanel1").classList.add("active");
  // Billing Review reset
  document.getElementById("billingProcTable").innerHTML = '<tr><td colspan="3" style="padding:18px 14px;color:var(--text3);font-size:12px;text-align:center;">No procedures loaded.</td></tr>';
  const billingAccomSel = document.getElementById("fBillingAccomType");
  if(billingAccomSel){ billingAccomSel.innerHTML = '<option value="">— Select Type —</option>'; }
  // fIcuDays / fWardDays removed from HTML - safe guards kept
  document.getElementById("fIcuDays")        && (document.getElementById("fIcuDays").value = "");
  document.getElementById("fWardDays")       && (document.getElementById("fWardDays").value = "");
  document.getElementById("fBillingAccomDays")  && (document.getElementById("fBillingAccomDays").value = "");
  document.getElementById("fBillingDoctorFee")  && (document.getElementById("fBillingDoctorFee").value = "");
  document.getElementById("fBillingRemarks") && (document.getElementById("fBillingRemarks").value = "");
  document.getElementById("fBillingExtraFees") && (document.getElementById("fBillingExtraFees").value = "");
  // Reset remarks mandatory indicator
  const optSpan = document.getElementById("lblRemarksOpt");
  const reqSpan = document.getElementById("lblRemarksReq");
  if(optSpan) optSpan.style.display = "inline";
  if(reqSpan) reqSpan.style.display = "none";
  clearError("fieldBillingRemarks");
  clearError("fieldBillingExtraFees");
  // Reset read-only / edit toggle state in Tab 3
  const roDiv   = document.getElementById("billingInfoReadOnly");
  const editDiv = document.getElementById("billingInfoEdit");
  const editBtn = document.getElementById("btnBillingEdit");
  if(roDiv)   roDiv.style.display   = "block";
  if(editDiv) editDiv.style.display  = "none";
  if(editBtn) editBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;stroke:currentColor;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit';
  // Reset read-only display values
  if(document.getElementById("roContractName"))  document.getElementById("roContractName").textContent  = "—";
  if(document.getElementById("roSpecialtyName")) document.getElementById("roSpecialtyName").textContent = "—";
  if(document.getElementById("roAccomTypeName")) document.getElementById("roAccomTypeName").textContent = "—";
  if(document.getElementById("roAccomDays"))     document.getElementById("roAccomDays").textContent     = "0";
  if(document.getElementById("roDoctorFee"))     document.getElementById("roDoctorFee").textContent     = "—";
  // Reset billing contract search
  if(document.getElementById("billingContractSearchInput")){
    document.getElementById("billingContractSearchInput").value = "";
    document.getElementById("billingContractSearchInput").style.color = "";
    document.getElementById("billingContractSearchInput").style.fontWeight = "";
  }
  if(document.getElementById("billingContractClearBtn")) document.getElementById("billingContractClearBtn").style.display = "none";
  if(document.getElementById("fBillingContract"))  document.getElementById("fBillingContract").value = "";
  if(document.getElementById("fBillingSpecialty")) document.getElementById("fBillingSpecialty").value = "";
  // Cost section
  document.getElementById("costBreakdownContainer").style.display = "none";
  document.getElementById("costFetchAlert").style.display = "block";
  document.getElementById("btnSubmitToApproval").disabled = true;
  // Approval — reset كامل للـ DOM
  document.getElementById("approvalPending").style.display = "block";
  document.getElementById("approvalReady").style.display   = "none";
  document.getElementById("fComments")        && (document.getElementById("fComments").value = "");
  document.getElementById("fRejectionReason") && (document.getElementById("fRejectionReason").value = "");
  document.getElementById("fSuggestedPrice")  && (document.getElementById("fSuggestedPrice").value  = "");
  document.getElementById("rejectForm")       && (document.getElementById("rejectForm").style.display = "none");
  // نرجع الـ approvalDecisionArea لحالته الأصلية (Approve/Reject buttons)
  // لو كانت اتعملها override بـ "Approved" أو "Rejected" alert
  const decisionEl = document.getElementById("approvalDecisionArea");
  if(decisionEl && !decisionEl.querySelector(".approval-grid")){
    decisionEl.innerHTML = `
        <div class="field" style="margin-bottom:16px;">
          <label>Review Comments <span class="opt">(optional)</span></label>
          <textarea id="fComments" placeholder="Add any review notes..."></textarea>
        </div>
        <div class="approval-grid">
          <div class="approval-card" style="border-color:var(--green-bdr);">
            <h3 style="color:var(--green);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Approve Estimate
            </h3>
            <p>Confirm the estimate is accurate and ready to communicate to the patient.</p>
            <button class="btn btn-success" style="width:100%;" data-onclick="approveRequest()">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Confirm Approval
            </button>
          </div>
          <div class="approval-card" style="border-color:var(--red-bdr);">
            <h3 style="color:var(--red);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Reject Estimate
            </h3>
            <p>Return the request for correction. A rejection reason is mandatory.</p>
            <button class="btn btn-danger" style="width:100%;" data-onclick="toggleRejectForm()">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Reject &amp; Return
            </button>
          </div>
        </div>
        <div id="rejectForm" style="display:none;margin-top:16px;">
          <div class="alert alert-danger">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Rejection reason and suggested price are mandatory and will be shared with the OR Coordinator.</span>
          </div>
          <div class="form-grid" style="margin-bottom:12px;">
            <div class="field" id="fieldRejReason">
              <label>Rejection Reason <span class="req">*</span></label>
              <textarea id="fRejectionReason" placeholder="Explain why this estimate is being rejected..." maxlength="500"></textarea>
              <span class="validation-msg">Rejection reason is required.</span>
            </div>
            <div class="field" id="fieldSuggestedPrice">
              <label>Suggested Price (EGP) <span class="req">*</span></label>
              <input type="number" id="fSuggestedPrice" min="0" step="any" placeholder="0.00">
              <span class="validation-msg">Suggested price is required.</span>
            </div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-danger" data-onclick="confirmReject()">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Confirm Rejection
            </button>
            <button class="btn btn-ghost" data-onclick="toggleRejectForm()">Cancel</button>
          </div>
        </div>`;
  }
  // Consumables list
  S.consumableItems = [];
  document.getElementById("consumablesList").innerHTML = "";
  addConsumableItem(); // ← هنا الصح — بس في New Request مش عند load record موجودة
  // Status
  updateStatus("Draft");
  document.getElementById("reqId").textContent = "REQ-NEW";
  document.getElementById("footerInfo").innerHTML =
    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;stroke:var(--text3);"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Complete all required fields to proceed.`;
  // Files reset
  document.getElementById("insuranceFileStatus").style.display = "none";
  document.getElementById("insuranceFileName").textContent     = "";
  document.getElementById("referralFileStatus").style.display  = "none";
  document.getElementById("referralFileName").textContent      = "";
  S.hasInsuranceCard = false;
  S.hasReferral      = false;
  // Remove validation errors
  document.querySelectorAll(".has-error").forEach(el=>el.classList.remove("has-error"));
}

/* ═══════════════════════════════════════
   LOAD LIST DATA from Dataverse
═══════════════════════════════════════ */
async function loadListData(){
  document.getElementById("listLoading").style.display = "flex";
  document.getElementById("listEmpty").style.display   = "none";
  document.getElementById("listTable").style.display   = "none";

  try{
    const expand = [
      "oprx_patientid($select=opd_patientname)",
      "oprx_procedure1id($select=oprx_procedurename,oprx_classtype)",
      "oprx_procedure2id($select=oprx_procedurename,oprx_classtype)",
      "oprx_procedure3id($select=oprx_procedurename,oprx_classtype)",
      "oprx_primaryprocedureid($select=oprx_procedurename,oprx_classtype)"
    ].join(",");

    const select = [
      "oprx_pricingrequestid","oprx_requestname","oprx_mainoperationname",
      "oprx_status","oprx_extconsumables","oprx_hospital","createdon"
    ].join(",");

    const d = await dvGet(
      `oprx_pricingrequests?$select=${select}&$expand=${expand}&$orderby=createdon desc&$top=200`
    );

    LIST.records = (d.value || []).map(r => ({
      id             : r.oprx_pricingrequestid,
      requestName    : r.oprx_requestname || "—",
      patientName    : r.oprx_patientid?.opd_patientname || "—",
      operation      : r.oprx_mainoperationname || "—",
      proc1          : r.oprx_procedure1id?.oprx_procedurename || "",
      proc2          : r.oprx_procedure2id?.oprx_procedurename || "",
      proc3          : r.oprx_procedure3id?.oprx_procedurename || "",
      primaryProcName: r.oprx_primaryprocedureid?.oprx_procedurename || "",
      classification : getClassLabel(r.oprx_primaryprocedureid?.oprx_classtype),
      status         : r.oprx_status ?? 129990000,
      hospital       : r.oprx_hospital != null ? String(r.oprx_hospital) : "",
      consumables    : r.oprx_extconsumables,
      createdon      : r.createdon || ""
    }));

  }catch(e){
    console.error("[LIST] Failed to load requests:", e);
    LIST.records = [];
    showToast("Could not load pricing requests. Please refresh or contact support.", "error");
  }

  updateListStats();
  filterList();
}

function getClassLabel(intVal){
  return CLASS_TYPE_MAP[intVal] || "";
}

/* ═══════════════════════
   STATS BAR
═══════════════════════ */
function updateListStats(){
  const recs = LIST.records;
  document.getElementById("statTotal").textContent    = recs.length;
  document.getElementById("statPending").textContent  = recs.filter(r=>r.status===129990001).length;
  document.getElementById("statBilling").textContent  = recs.filter(r=>r.status===129990002||r.status===129990003).length;
  document.getElementById("statApproved").textContent = recs.filter(r=>r.status===129990004).length;
  document.getElementById("statRejected").textContent = recs.filter(r=>r.status===129990005).length;
}

/* ═══════════════════════
   FILTER & SORT
═══════════════════════ */
function filterList(){
  const q        = (document.getElementById("listSearchInput")?.value || "").toLowerCase().trim();
  const status   = document.getElementById("listStatusFilter")?.value || "";
  const hospital = document.getElementById("listHospitalFilter")?.value || "";
  const roleStatuses = ROLE_STATUS_MAP[LIST.roleFilter];

  LIST.filtered = LIST.records.filter(r => {
    // Role filter
    if(roleStatuses && !roleStatuses.includes(r.status)) return false;
    // Hospital filter
    if(hospital && r.hospital !== hospital) return false;
    // Status dropdown filter
    if(status && String(r.status) !== status) return false;
    // Text search
    if(q){
      const haystack = [r.requestName,r.patientName,r.operation,r.proc1,r.proc2,r.proc3].join(" ").toLowerCase();
      if(!haystack.includes(q)) return false;
    }
    return true;
  });

  sortListData();
  renderListTable();
}

function sortList(field){
  if(LIST.sortField === field){
    LIST.sortDir = LIST.sortDir === "asc" ? "desc" : "asc";
  } else {
    LIST.sortField = field;
    LIST.sortDir   = "asc";
  }
  // Update header arrows
  document.querySelectorAll(".list-table th").forEach(th=>{
    th.classList.remove("sort-asc","sort-desc");
  });
  const thMap = {
    "requestName":"th-reqid","patientName":"th-patient",
    "operation":"th-op","classification":"th-class",
    "consumables":"th-cons","status":"th-status","createdon":"th-date"
  };
  const thId = thMap[LIST.sortField];
  if(thId) document.getElementById(thId)?.classList.add(LIST.sortDir==="asc"?"sort-asc":"sort-desc");
  sortListData();
  renderListTable();
}

function sortListData(){
  const f = LIST.sortField;
  const d = LIST.sortDir === "asc" ? 1 : -1;
  LIST.filtered.sort((a,b)=>{
    let av = a[f] ?? "";
    let bv = b[f] ?? "";
    if(typeof av === "boolean") { av = av?1:0; bv = bv?1:0; }
    if(typeof av === "number")  return (av - bv) * d;
    return String(av).localeCompare(String(bv)) * d;
  });
}

/* ═══════════════════════
   RENDER TABLE
═══════════════════════ */
function renderListTable(){
  document.getElementById("listLoading").style.display = "none";
  const tbody = document.getElementById("listTableBody");
  tbody.innerHTML = "";

  if(!LIST.filtered.length){
    document.getElementById("listEmpty").style.display = "block";
    document.getElementById("listTable").style.display = "none";
    return;
  }

  document.getElementById("listEmpty").style.display = "none";
  document.getElementById("listTable").style.display  = "table";

  LIST.filtered.forEach(r => {
    const tr = document.createElement("tr");
    tr.onclick = () => openRecord(r.id);

    // ── Classification badge ──
    const clr = CLASS_COLORS[r.classification] || {bg:"var(--surface2)",color:"var(--text3)"};
    const classBadge = r.classification
      ? `<span class="class-badge" style="background:${clr.bg};color:${clr.color};">${r.classification}</span>`
      : `<span style="color:var(--text3);font-size:11px;">—</span>`;

    // ── Status badge ──
    const statusLabel = STATUS_LABEL[r.status] || "Draft";
    const statusCls   = STATUS_CLASS[r.status]  || "draft";
    const statusBadge = `<span class="status-badge ${statusCls}">${statusLabel}</span>`;

    // ── Procs cell — Primary bold أولاً، الباقي secondary ──
    const primaryProc = r.primaryProcName || r.proc1 || "";
    const allProcs    = [r.proc1, r.proc2, r.proc3].filter(Boolean);
    const secondaries = allProcs.filter(p => p !== primaryProc);
    let procsHtml = "";
    if(primaryProc) procsHtml += `<span class="cell-proc-primary">${primaryProc}</span>`;
    secondaries.forEach(p => { procsHtml += `<span class="cell-proc-secondary">+ ${p}</span>`; });
    if(!procsHtml) procsHtml = `<span style="color:var(--text3);font-size:11px;">—</span>`;

    // ── Consumables ──
    const consHtml = r.consumables
      ? `<span class="cell-cons yes">● Yes</span>`
      : `<span class="cell-cons no">— No</span>`;

    // ── Date ──
    const dateStr = r.createdon
      ? new Date(r.createdon).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})
      : "—";

    // ── Request name fallback ──
    const reqName = r.requestName || "—";

    tr.innerHTML = `
      <td><span class="req-id-link">${reqName}</span></td>
      <td><span class="cell-patient">${r.patientName || "—"}</span></td>
      <td><span class="cell-op" title="${r.operation || ''}">${r.operation || "—"}</span></td>
      <td>${procsHtml}</td>
      <td>${classBadge}</td>
      <td>${consHtml}</td>
      <td>${statusBadge}</td>
      <td class="cell-date">${dateStr}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ═══════════════════════
   OPEN RECORD
═══════════════════════ */
/* ── Full state + DOM reset قبل ما نفتح أي record (جديد أو موجود) ──
   دالة موحّدة عشان نضمن إن openRecord() و popstate handler
   الاتنين بيمسحوا نفس الحاجات بالظبط، ومنسيبش أي leftover
   من الـ record اللي كان مفتوح قبل كده (البAUG بتاع الـ caching) ── */
function resetStateForRecord(){
  S = {
    recordId:null,outputId:null,currentTab:1,unlockedTabs:[1],
    hasConsumables:false,patientData:null,patientsCache:S.patientsCache||{},
    contractsCache:[],
    currentUserId:S.currentUserId,currentUserName:S.currentUserName,
    procedureCosts:[],procedureCostingIds:[],
    consumableItems:[],consumableItemIds:[],
    primaryProcedureId:null,
    supplyChainRecordId:null,
    baseCostTotal:0,serviceFee:0,medSupplyTotal:0,
    consumablesTotal:0,doctorFee:0,billingExtraFee:0,finalEstimate:0,
    costsLoaded:false,
    hasInsuranceCard:false,hasReferral:false,
    _tab2BannerAuthor:null,_tab2BannerDate:null,
    openQueryId:null,openQueryData:null,
    lastResolvedQuery:null
  };
  resetFormFields();
}

function openRecord(recordId){
  // Push URL with id param so browser back works
  history.pushState({id:recordId},"",`?id=${recordId}`);
  showFormView();
  resetStateForRecord();
  loadExistingRecord(recordId);
}

/* ═══════════════════════
   ROLE SWITCHER
═══════════════════════ */
function onRoleChange(val){
  LIST.roleFilter = val;
  // Update list meta label
  const labels = {all:"System View",coordinator:"OR Coordinator",billing:"Billing Team",supplychain:"Supply Chain"};
  document.getElementById("listPageMeta").innerHTML =
    `${labels[val]||"All Requests"} · <span id="listCurrentDate">${document.getElementById("listCurrentDate")?.textContent||""}</span>`;
  filterList();
}

/* ── Browser back/forward support ── */
window.addEventListener("popstate", e => {
  const params = new URLSearchParams(window.location.search);
  const id = getRecordIdFromUrl();
  if(params.get("view") === "compliance"){ showComplianceView(); loadComplianceData(); }
  else if(id){ showFormView(); resetStateForRecord(); loadExistingRecord(id); }
  else  { showListView(); filterList(); }
});


/* ── "Back" button on the Billing tab (was: goTab(S.hasConsumables ? 2 : 1)) ── */
function goTabPrev(){ goTab(S.hasConsumables ? 2 : 1); }

/* ── Functions referenced from data-on* attributes (see handlerBridge.ts) ── */
export const HANDLERS = {
  addConsumableItem, approveRequest, clearBillingContract, clearComplianceDateFilter, clearContract, clearPatient, clearSDropField, closeAuditTrailModal, closeComplianceDashboard, closeFilePreview, closeOrReplyModal, closeScAskModal, closeScQueryModal, completeBillingReview, completeTab1, completeTab2, confirmOrReply, confirmReject, confirmScQuery, exportComplianceCSV, fetchCosts, filterList, goBackToList, goTab, goTabPrev, loadComplianceData, loadListData, onBillingContractSearch, onBillingExtraFeesChange, onConsumablesToggle, onContractSearch, onHospitalChange, onPatientSearch, onSDropFocus, onSDropSearch, openAuditTrailModal, openComplianceDashboard, openNewForm, openOrReplyModal, openRecord, openScAskModal, openScQueryModal, previewFile, removeConsumableItem, showBillingContractDropdown, showContractDropdown, showPatientDropdown, sortList, submitToApproval, toggleBillingEdit, toggleRejectForm, updateCharCounter, updateConsumable, validateFileSize
};
