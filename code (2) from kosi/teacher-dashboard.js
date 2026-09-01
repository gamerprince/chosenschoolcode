import { auth, db } from "./firebase-config.js";
import { requireRole } from "./auth-guard.js";
import { canonicalClassName, classLookupValues } from "./class-names.js";
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

const $ = id => document.getElementById(id);
let currentTab = "accounts";
let currentTeacherId = null;
let lastAnnualItems = [];

init();

async function init() {
  const { user } = await requireRole("teacher");
  currentTeacherId = user.uid;
  await loadTeacherClasses();
}

async function loadTeacherClasses() {
  const classSelect = $("filter-class");
  classSelect.innerHTML = '<option value="">-- Select Class --</option>';

  try {
    const assignmentQuery = query(collection(db, "teacher_assignments"), where("teacherId", "==", currentTeacherId));
    const assignmentSnap = await getDocs(assignmentQuery);
    const classes = new Set();

    assignmentSnap.forEach(doc => {
      const data = doc.data();
      if (data.className) classes.add(canonicalClassName(data.className));
    });

    if (classes.size === 0) {
      classSelect.innerHTML = '<option value="">No assigned classes</option>';
      $("main-list").innerHTML = '<tr><td colspan="5" class="p-10 text-center text-gray-400">You have not registered any classes yet.</td></tr>';
      return;
    }

    classes.forEach(cls => {
      classSelect.innerHTML += `<option>${cls}</option>`;
    });
  } catch (err) {
    console.error("Error loading assigned classes:", err);
    classSelect.innerHTML = '<option value="">Failed to load classes</option>';
  }
}

// Mobile Menu Toggle Logic
const mobileBtn = $("mobile-menu-btn");
const mobileMenu = $("mobile-menu");
const annualSessionInput = $("annual-session");
const annualWarning = $("annual-warning");
const annualWeightPanel = $("annual-weight-panel");
const btnCalcAnnual = $("btn-calc-annual");
const btnIssueAnnual = $("btn-issue-annual");
const annualMethodRadios = document.getElementsByName("annualMethod");

mobileBtn.onclick = () => {
  mobileMenu.classList.toggle("hidden");
};

// Wire up annual result UI
Array.from(annualMethodRadios).forEach(radio => {
  radio.onchange = () => {
    const method = getAnnualMethod();
    annualWeightPanel.classList.toggle("hidden", method !== "weighted");
    if (method === "average") {
      annualWarning.classList.add("hidden");
    }
  };
});
if (btnCalcAnnual) btnCalcAnnual.onclick = calculateAnnualResults;
if (btnIssueAnnual) btnIssueAnnual.onclick = issueAnnualResults;

// Wire up mobile logout and password buttons
$("logoutBtnMob").onclick = () => signOut(auth).then(() => window.location.href="portal.html");
if($("logoutBtnTop")) $("logoutBtnTop").onclick = () => signOut(auth).then(() => window.location.href="portal.html");
  
if ( $("open-password-modal-mob") ) {
  $("open-password-modal-mob").onclick = () => {
    mobileMenu.classList.add("hidden");
    $("password-modal").classList.remove("hidden");
  };
}
if ( $("open-password-modal") ) {
  $("open-password-modal").onclick = () => {
    $("password-modal").classList.remove("hidden");
  };
}
$("filter-class").onchange = loadData;
$("tab-accounts").onclick = () => switchTab("accounts");
$("tab-annual").onclick = () => switchTab("annual");

function switchTab(tab) {
  currentTab = tab;
  $("tab-accounts").className = tab === "accounts" ? "pb-2 px-4 font-bold border-b-4 border-[#6A29C5] text-[#6A29C5]" : "pb-2 px-4 font-bold border-b-4 border-transparent text-gray-400";
  $("tab-annual").className = tab === "annual" ? "pb-2 px-4 font-bold border-b-4 border-[#6A29C5] text-[#6A29C5]" : "pb-2 px-4 font-bold border-b-4 border-transparent text-gray-400";
  $("annual-controls").classList.toggle("hidden", tab !== "annual");
  loadData();
}

async function loadData() {
  const className = $("filter-class").value;
  if(!className) {
    $("stat-students").textContent = "-";
    $("stat-results").textContent = "-";
    $("stat-tests").textContent = "-";
    $("main-list").innerHTML = '<tr><td colspan="5" class="p-10 text-center text-gray-400">Please select a class above to view data.</td></tr>';
    return;
  }

  if (currentTab === "annual") {
    renderAnnualLanding(className);
    return;
  }

  const tbody = $("main-list");
  const thead = $("table-head");
  tbody.innerHTML = '<tr><td colspan="5" class="p-10 text-center font-bold text-gray-500 animate-pulse">Loading class data...</td></tr>';

  try {
    const qStudents = query(collection(db, "students_registry"), where("className", "in", classLookupValues(className)));
    const sSnap = await getDocs(qStudents);
    $("stat-students").textContent = sSnap.size;

    const qResults = query(
      collection(db, "compiledResults"),
      where("className", "in", classLookupValues(className)),
      where("teacherId", "==", currentTeacherId)
    );
    const rSnap = await getDocs(qResults);
    const uniqueStudents = new Set();
    rSnap.forEach(d => uniqueStudents.add((d.data().studentNameLower || d.data().studentName).toLowerCase()));
    $("stat-results").textContent = uniqueStudents.size;

    const qTests = query(
      collection(db, "tests"),
      where("className", "in", classLookupValues(className)),
      where("teacherId", "==", currentTeacherId)
    );
    const tSnap = await getDocs(qTests);
    $("stat-tests").textContent = tSnap.size;

    if (currentTab === "accounts") {
      thead.innerHTML = `<tr><th class="p-4">Student Name</th><th class="p-4 hidden sm:table-cell">Reg No</th><th class="p-4 hidden sm:table-cell">Gender</th><th class="p-4 text-center">Action</th></tr>`;
      tbody.innerHTML = sSnap.empty ? `<tr><td colspan="4" class="p-10 text-center text-gray-400">No students found for ${className}.</td></tr>` : "";
      const accounts = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      accounts.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
      accounts.forEach(s => {
        tbody.innerHTML += `
          <tr class="hover:bg-[#FDE7F9] transition-colors">
            <td class="p-4 font-bold text-gray-900">${s.fullName || 'Unknown'}</td>
            <td class="p-4 hidden sm:table-cell text-gray-600">${s.regNo || 'N/A'}</td>
            <td class="p-4 hidden sm:table-cell text-xs text-gray-500">${s.gender || 'N/A'}</td>
            <td class="p-4 text-center">
              <button onclick="window.location.href='teacher-compiled-result.html?name=${encodeURIComponent(s.fullName || '')}&class=${encodeURIComponent(className)}'" class="text-indigo-600 font-black border border-indigo-200 px-3 py-1 rounded shadow-sm bg-white hover:bg-indigo-600 hover:text-white transition-colors text-[10px]">ENTER SCORE</button>
            </td>
          </tr>`;
      });
    } else {
      thead.innerHTML = `<tr><th class="p-4">Student Name</th><th class="p-4">Subjects Breakdown</th><th class="p-4 text-center">Grand Total</th><th class="p-4 text-center">Action</th></tr>`;
      tbody.innerHTML = rSnap.empty ? `<tr><td colspan="4" class="p-10 text-center text-gray-400">No results have been compiled/saved for ${className} yet.</td></tr>` : "";
      const grouped = {};
      rSnap.forEach(d => {
        const r = d.data();
        const key = (r.studentNameLower || r.studentName).trim();
        if (!grouped[key]) {
          grouped[key] = { name: r.studentName, total: 0, subjects: [] };
        }
        grouped[key].total += (r.total || 0);
        grouped[key].subjects.push(`<span class="inline-block bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[10px] font-bold m-0.5 border border-gray-200">${r.subject}: ${r.total}</span>`);
      });

      Object.values(grouped).sort((a, b) => b.total - a.total).forEach(student => {
        tbody.innerHTML += `
          <tr class="hover:bg-indigo-50 transition-colors">
            <td class="p-4 font-bold text-gray-900">${student.name}</td>
            <td class="p-4">${student.subjects.join('')}</td>
            <td class="p-4 text-center font-black text-indigo-700 text-lg">${student.total}</td>
            <td class="p-4 text-center">
               <button onclick="window.location.href='teacher-compiled-result.html?name=${encodeURIComponent(student.name)}&class=${encodeURIComponent(className)}'" class="text-indigo-600 font-black border border-indigo-200 px-3 py-1 rounded shadow-sm bg-white hover:bg-indigo-600 hover:text-white transition-colors text-[10px]">EDIT SCORES</button>
            </td>
          </tr>`;
      });
    }
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="4" class="p-10 text-center text-red-500 font-bold">Error loading data.</td></tr>`;
  }
}

function renderAnnualLanding(className) {
  const thead = $("table-head");
  const tbody = $("main-list");
  $("stat-tests").textContent = "-";
  $("stat-results").textContent = "-";
  $("stat-students").textContent = "-";
  thead.innerHTML = `<tr><th class="p-4">Student</th><th class="p-4">Subject</th><th class="p-4 text-center">1st Term</th><th class="p-4 text-center">2nd Term</th><th class="p-4 text-center">3rd Term</th><th class="p-4 text-center">Annual Total</th><th class="p-4 text-center">Grade</th><th class="p-4 text-center">Status</th></tr>`;
  tbody.innerHTML = `<tr><td colspan="8" class="p-10 text-center text-gray-400">Select the annual calculation method and click Calculate Annual Result for ${className}.</td></tr>`;
  btnIssueAnnual.disabled = true;
  annualWarning.classList.add("hidden");
}

function getAnnualMethod() {
  const selected = Array.from(annualMethodRadios).find(r => r.checked);
  return selected ? selected.value : "average";
}

function gradeFromScore(score) {
  if (score >= 80) return "A1";
  if (score >= 70) return "B2";
  if (score >= 65) return "B3";
  if (score >= 60) return "C4";
  if (score >= 55) return "C5";
  if (score >= 50) return "C6";
  if (score >= 45) return "D7";
  if (score >= 40) return "E8";
  return "F9";
}

async function calculateAnnualResults() {
  const className = $("filter-class").value;
  const session = annualSessionInput.value.trim();
  const method = getAnnualMethod();

  if (!className || !session) {
    alert("Please select class and session for annual results.");
    return;
  }

  btnCalcAnnual.disabled = true;
  btnCalcAnnual.textContent = "Calculating...";
  annualWarning.classList.add("hidden");
  btnIssueAnnual.disabled = true;

  try {
    const qAnnual = query(
      collection(db, "compiledResults"),
      where("className", "in", classLookupValues(className)),
      where("session", "==", session),
      where("teacherId", "==", currentTeacherId)
    );
    const snap = await getDocs(qAnnual);

    if (snap.empty) {
      $("main-list").innerHTML = `<tr><td colspan="8" class="p-10 text-center text-gray-400">No compiled term results were found for ${className} in ${session}.</td></tr>`;
      return;
    }

    const aggregated = {};
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const studentKey = (data.studentNameLower || data.studentName || "").trim().toLowerCase();
      const subjectKey = `${studentKey}_${data.subject}`;
      if (!aggregated[subjectKey]) {
        aggregated[subjectKey] = {
          studentName: data.studentName,
          studentNameLower: studentKey,
          gender: data.gender || "",
          className: data.className,
          session: data.session,
          subject: data.subject,
          terms: { 1: null, 2: null, 3: null }
        };
      }
      if ([1,2,3].includes(data.term)) {
        aggregated[subjectKey].terms[data.term] = data;
      }
    });

    const items = Object.values(aggregated).map(item => {
      const term1 = item.terms[1]?.total ?? null;
      const term2 = item.terms[2]?.total ?? null;
      const term3 = item.terms[3]?.total ?? null;
      const missingTerms = [1,2,3].filter(t => item.terms[t] == null);

      let annualTotal = 0;
      if (method === "weighted") {
        const w1 = Number($("term-weight-1").value) || 0;
        const w2 = Number($("term-weight-2").value) || 0;
        const w3 = Number($("term-weight-3").value) || 0;
        const sumWeight = w1 + w2 + w3;
        if (sumWeight !== 100) {
          annualWarning.textContent = "Weighted percentages must add up to exactly 100%.";
          annualWarning.classList.remove("hidden");
          return null;
        }
        annualTotal = ((term1 || 0) * w1 + (term2 || 0) * w2 + (term3 || 0) * w3) / 100;
      } else {
        const present = [term1, term2, term3].filter(v => v !== null);
        annualTotal = present.reduce((sum, v) => sum + v, 0) / Math.max(present.length, 1);
      }

      return {
        ...item,
        term1,
        term2,
        term3,
        annualTotal: Number(annualTotal.toFixed(1)),
        grade: gradeFromScore(annualTotal),
        missingTerms,
        canIssue: item.terms[1] && item.terms[2] && item.terms[3]
      };
    }).filter(Boolean);

    if (items.some(item => item == null)) {
      btnCalcAnnual.disabled = false;
      btnCalcAnnual.textContent = "Calculate Annual Result";
      return;
    }

    const missingCount = items.filter(item => !item.canIssue).length;
    if (missingCount > 0) {
      annualWarning.textContent = `⚠️ ${missingCount} subject entries are missing one or more terms. Annual result can still be previewed but cannot be issued until all terms exist.`;
      annualWarning.classList.remove("hidden");
    }
    btnIssueAnnual.disabled = missingCount > 0 || items.length === 0;
    renderAnnualResults(items);
    $("stat-tests").textContent = items.length;
    $("stat-results").textContent = items.filter(item => item.canIssue).length;
    $("stat-students").textContent = [...new Set(items.map(item => item.studentName))].length;
  } catch (err) {
    console.error(err);
    alert("Error calculating annual results: " + err.message);
  } finally {
    btnCalcAnnual.disabled = false;
    btnCalcAnnual.textContent = "Calculate Annual Result";
  }
}

function renderAnnualResults(items) {
  lastAnnualItems = items || [];
  const tbody = $("main-list");
  const thead = $("table-head");
  thead.innerHTML = `<tr><th class="p-4">Student</th><th class="p-4">Subject</th><th class="p-4 text-center">1st Term</th><th class="p-4 text-center">2nd Term</th><th class="p-4 text-center">3rd Term</th><th class="p-4 text-center">Annual Total</th><th class="p-4 text-center">Grade</th><th class="p-4 text-center">Status</th></tr>`;
  tbody.innerHTML = "";

  items.sort((a, b) => a.studentName.localeCompare(b.studentName) || a.subject.localeCompare(b.subject));

  items.forEach(item => {
    const statusClass = item.canIssue ? "text-green-600" : "text-red-600";
    const statusText = item.canIssue ? "Ready" : "Missing term";
    tbody.innerHTML += [
      '<tr class="hover:bg-gray-50 transition-colors text-sm md:text-base">',
      `<td class="p-4 font-bold text-gray-900">${item.studentName}</td>`,
      `<td class="p-4">${item.subject}</td>`,
      `<td class="p-4 text-center">${item.term1 !== null ? item.term1 : "N/A"}</td>`,
      `<td class="p-4 text-center">${item.term2 !== null ? item.term2 : "N/A"}</td>`,
      `<td class="p-4 text-center">${item.term3 !== null ? item.term3 : "N/A"}</td>`,
      `<td class="p-4 text-center font-black text-indigo-700">${item.annualTotal}</td>`,
      `<td class="p-4 text-center">${item.grade}</td>`,
      `<td class="p-4 text-center text-[11px] uppercase font-bold ${statusClass}">${statusText}</td>`,
      '</tr>'
    ].join('');
  });
}

async function printAnnualReport() {
  if (!lastAnnualItems || !lastAnnualItems.length) {
    alert('No annual results to print. Calculate annual results first.');
    return;
  }
  const className = $("filter-class").value || '';
  const session = annualSessionInput.value || '';
  const now = new Date().toLocaleString();

  const grouped = {};
  lastAnnualItems.forEach(it => {
    const key = it.studentName + '|' + it.subject;
    grouped[key] = it;
  });

  const rowsHtml = Object.values(grouped).map(item => {
    return [
      '<tr>',
      `<td style="padding:8px;border:1px solid #ddd;font-weight:700">${item.studentName}</td>`,
      `<td style="padding:8px;border:1px solid #ddd">${item.subject}</td>`,
      `<td style="padding:8px;border:1px solid #ddd;text-align:center">${item.term1 !== null ? item.term1 : 'N/A'}</td>`,
      `<td style="padding:8px;border:1px solid #ddd;text-align:center">${item.term2 !== null ? item.term2 : 'N/A'}</td>`,
      `<td style="padding:8px;border:1px solid #ddd;text-align:center">${item.term3 !== null ? item.term3 : 'N/A'}</td>`,
      `<td style="padding:8px;border:1px solid #ddd;text-align:center;font-weight:700">${item.annualTotal}</td>`,
      `<td style="padding:8px;border:1px solid #ddd;text-align:center">${item.grade}</td>`,
      '</tr>'
    ].join('');
  }).join('');

  const html = [
    '<!doctype html><html><head><meta charset="utf-8"><title>Annual Report - ' + className + ' ' + session + '</title>',
    '<style>body{font-family:Arial,Helvetica,sans-serif;color:#111} .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px} table{border-collapse:collapse;width:100%} th,td{border:1px solid #ddd;padding:8px}</style>',
    '</head><body>',
    '<div class="header"><div><h2>Annual Result Report</h2><div>' + className + ' — ' + session + '</div></div><div style="text-align:right">Generated: ' + now + '</div></div>',
    '<table><thead><tr><th style="background:#f3f3f3;padding:10px;text-align:left">Student</th><th style="background:#f3f3f3;padding:10px;text-align:left">Subject</th><th style="background:#f3f3f3;padding:10px;text-align:center">1st Term</th><th style="background:#f3f3f3;padding:10px;text-align:center">2nd Term</th><th style="background:#f3f3f3;padding:10px;text-align:center">3rd Term</th><th style="background:#f3f3f3;padding:10px;text-align:center">Annual</th><th style="background:#f3f3f3;padding:10px;text-align:center">Grade</th></tr></thead><tbody>' + rowsHtml + '</tbody></table>',
    '<div style="margin-top:20px;font-size:12px;color:#666">Powered by Gloryland Foundation Academy — Annual Results</div>',
    '<script>window.onload=function(){setTimeout(()=>{window.print();},200)};<\/script>',
    '</body></html>'
  ].join('');

  const w = window.open('', '_blank');
  if (!w) {
    alert('Please allow popups to print the annual report.');
    return;
  }
  w.document.write(html);
  w.document.close();
}

if ($("btn-print-annual")) $("btn-print-annual").onclick = printAnnualReport;

async function issueAnnualResults() {
  const className = $("filter-class").value;
  const session = annualSessionInput.value.trim();
  const method = getAnnualMethod();
  const qAnnual = query(
    collection(db, "compiledResults"),
    where("className", "in", classLookupValues(className)),
    where("session", "==", session),
    where("teacherId", "==", currentTeacherId)
  );

  try {
    btnIssueAnnual.disabled = true;
    btnIssueAnnual.textContent = "Issuing...";
    const snap = await getDocs(qAnnual);
    const aggregated = {};

    snap.forEach(docSnap => {
      const data = docSnap.data();
      const studentKey = (data.studentNameLower || data.studentName || "").trim().toLowerCase();
      const subjectKey = `${studentKey}_${data.subject}`;
      if (!aggregated[subjectKey]) {
        aggregated[subjectKey] = {
          studentName: data.studentName,
          studentNameLower: studentKey,
          className: data.className,
          session: data.session,
          subject: data.subject,
          teacherId: currentTeacherId,
          terms: { 1: null, 2: null, 3: null },
        };
      }
      if ([1,2,3].includes(data.term)) {
        aggregated[subjectKey].terms[data.term] = data;
      }
    });

    const items = Object.values(aggregated).map(item => {
      const term1 = item.terms[1]?.total ?? null;
      const term2 = item.terms[2]?.total ?? null;
      const term3 = item.terms[3]?.total ?? null;
      const canIssue = item.terms[1] && item.terms[2] && item.terms[3];
      const w1 = Number($("term-weight-1").value) || 0;
      const w2 = Number($("term-weight-2").value) || 0;
      const w3 = Number($("term-weight-3").value) || 0;
      const annualTotal = method === "weighted"
        ? ((term1 || 0) * w1 + (term2 || 0) * w2 + (term3 || 0) * w3) / 100
        : (term1 + term2 + term3) / 3;

      return {
        ...item,
        term1,
        term2,
        term3,
        annualTotal: Number(annualTotal.toFixed(1)),
        grade: gradeFromScore(annualTotal),
        canIssue
      };
    }).filter(item => item.canIssue);

    if (!items.length) {
      alert("No complete annual records found. Ensure all 3 term results exist for each subject.");
      return;
    }

    const savePromises = items.map(item => {
      const annualId = `${item.studentNameLower.replace(/\s+/g, '_')}_${item.subject.replace(/\s+/g, '_')}_${className.replace(/\s+/g, '_')}_${session.replace(/\s+/g, '_')}_annual`;
      return setDoc(doc(db, "annualResults", annualId), {
        studentName: item.studentName,
        studentNameLower: item.studentNameLower,
        className: item.className,
        session: item.session,
        subject: item.subject,
        teacherId: item.teacherId,
        method,
        weights: {
          term1: Number($("term-weight-1").value) || 0,
          term2: Number($("term-weight-2").value) || 0,
          term3: Number($("term-weight-3").value) || 0
        },
        term1: item.term1,
        term2: item.term2,
        term3: item.term3,
        annualTotal: item.annualTotal,
        grade: item.grade,
        issuedAt: new Date().toISOString()
      });
    });

    await Promise.all(savePromises);
    alert(`✅ Issued ${items.length} annual result records successfully.`);
  } catch (err) {
    console.error(err);
    alert("Error issuing annual results: " + err.message);
  } finally {
    btnIssueAnnual.textContent = "Issue Annual Result";
    btnIssueAnnual.disabled = false;
  }
}

function renderStudentTable() {
  // No-op placeholder; actual student rendering is done on another page.
}

window.editStudent = async (docId, oldName) => {
  const newName = prompt("Enter the corrected name for the student:", oldName);
  if (!newName || !newName.trim() === oldName) return;
  try {
    await updateDoc(doc(db, "students", docId), { name: newName.trim() });
    loadData();
  } catch (err) {
    alert("Error updating student: " + err.message);
  }
};

window.deleteStudent = async (docId, name) => {
  if (!confirm(`WARNING: Are you sure you want to completely delete the account for "${name}"? This cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, "students", docId));
    loadData();
  } catch (err) {
    alert("Error deleting student: " + err.message);
  }
};

$("open-password-modal").onclick = () => {
  $("password-modal").classList.remove("hidden");
  $("password-msg").textContent = "";
};

const updatePwBtn = $("btn-update-password");
if (updatePwBtn) {
  updatePwBtn.onclick = async () => {
    const curPw = $("current-password").value;
    const newPw = $("new-password").value;
    const cfPw = $("confirm-password").value;
    const msg = $("password-msg");

    if (!curPw || !newPw || !cfPw) return msg.textContent = "❌ All fields required";
    if (newPw !== cfPw) {
      msg.className = "text-center text-xs mt-2 font-bold text-red-600";
      return msg.textContent = "❌ Passwords do not match!";
    }
    if (newPw.length < 6) {
      msg.className = "text-center text-xs mt-2 font-bold text-red-600";
      return msg.textContent = "❌ New password must be at least 6 characters";
    }

    try {
      const user = auth.currentUser;
      const credential = EmailAuthProvider.credential(user.email, curPw);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPw);
      msg.className = "text-center text-xs mt-2 font-bold text-green-600";
      msg.textContent = "✅ Password Updated!";
      setTimeout(() => $("password-modal").classList.add("hidden"), 1500);
    } catch (err) {
      msg.className = "text-center text-xs mt-2 font-bold text-red-600";
      msg.textContent = "❌ " + (err.message.includes("wrong-password") ? "Current password is incorrect" : err.message);
    }
  };
}

const logoutBtn = $("logoutBtn");
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    await signOut(auth);
    window.location.href = "portal.html";
  };
}
