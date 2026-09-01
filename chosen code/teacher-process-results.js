import { auth, db } from './firebase-config.js';
import { requireRole } from './auth-guard.js';
import { 
  collection, query, where, getDocs, deleteDoc, doc 
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

const $ = id => document.getElementById(id);
let currentTeacherId = null;

init();
async function init() {
  const { user } = await requireRole("teacher");
  currentTeacherId = user.uid;
}

// mobile menu toggle and logout handlers
const mobileBtn = $("mobile-menu-btn");
const mobileMenu = $("mobile-menu");
if (mobileBtn) mobileBtn.onclick = () => mobileMenu.classList.toggle("hidden");
if ($("logoutBtnMob")) $("logoutBtnMob").onclick = () => window.location.href = "portal.html";
if ($("logoutBtnTop")) $("logoutBtnTop").onclick = () => window.location.href = "portal.html";
let allStudents = {}; 

// Load Student List
$("btn-load").onclick = async () => {
  const className = $("className").value.trim();
  const termVal = $("term").value;
  const session = $("session").value.trim();
  const msg = $("status-msg");

  if (!className || !termVal || !session) {
    alert("Please fill all filters");
    return;
  }

  msg.classList.remove("hidden");
  allStudents = {}; 

  try {
    if (termVal === "annual") {
      const q = query(
        collection(db, "compiledResults"),
        where("className", "==", className),
        where("session", "==", session),
        where("teacherId", "==", currentTeacherId)
      );
      const snap = await getDocs(q);
      
      if (snap.empty) {
        document.querySelector("tbody").innerHTML = '<tr><td colspan="4" class="p-10 text-center text-gray-400">No records found for this selection.</td></tr>';
        return;
      }

      let tempAnnual = {};
      snap.forEach(docSnap => {
        const data = docSnap.data();
        const name = data.studentName;
        const sub = data.subject;
        const t = data.term;
        const total = data.total;

        if (!tempAnnual[name]) tempAnnual[name] = { meta: data, subjectsMap: {} };
        if (!tempAnnual[name].subjectsMap[sub]) {
          tempAnnual[name].subjectsMap[sub] = { 1: '-', 2: '-', 3: '-' };
        }
        tempAnnual[name].subjectsMap[sub][t] = total;
      });

      const getGrade = (s) => {
        if (s >= 80) return "A1";
        if (s >= 70) return "B2";
        if (s >= 65) return "B3";
        if (s >= 60) return "C4";
        if (s >= 55) return "C5";
        if (s >= 50) return "C6";
        if (s >= 45) return "D7";
        if (s >= 40) return "E8";
        return "F9";
      };

      for (const name in tempAnnual) {
        const student = tempAnnual[name];
        const subjectsArray = [];
        for (const subName in student.subjectsMap) {
          const scores = student.subjectsMap[subName];
          let sum = 0, count = 0;
          if (scores[1] !== '-') { sum += scores[1]; count++; }
          if (scores[2] !== '-') { sum += scores[2]; count++; }
          if (scores[3] !== '-') { sum += scores[3]; count++; }

          const avg = count > 0 ? Math.round(sum / count) : 0;
          subjectsArray.push({
            subject: subName,
            term1: scores[1],
            term2: scores[2],
            term3: scores[3],
            total: avg,
            grade: getGrade(avg)
          });
        }

        allStudents[name] = {
          name: name,
          feeCleared: student.meta.annualCleared || false,
          position: "N/A",
          subjects: subjectsArray,
          meta: student.meta
        };
      }
    } else {
      const term = Number(termVal);
      const q = query(
        collection(db, "compiledResults"),
        where("className", "==", className),
        where("term", "==", term),
        where("session", "==", session),
        where("teacherId", "==", currentTeacherId)
      );

      const snap = await getDocs(q);
      
      if (snap.empty) {
        document.querySelector("tbody").innerHTML = '<tr><td colspan="4" class="p-10 text-center text-gray-400">No records found for this selection.</td></tr>';
        return;
      }

      snap.forEach(docSnap => {
        const data = docSnap.data();
        const name = data.studentName;
        
        if (!allStudents[name]) {
          allStudents[name] = {
            name: name,
            feeCleared: data.feeCleared || false,
            position: data.position || "N/A",
            subjects: [],
            meta: data 
          };
        }
        allStudents[name].subjects.push(data);
      });
    }

    renderStudentTable(); 

  } catch (err) {
    console.error(err);
    alert("Error loading students: " + err.message);
  } finally {
    msg.classList.add("hidden");
  }
};

const viewAnnualReportCard = (name) => {
  const s = allStudents[name];
  if (!s.feeCleared) {
    alert("❌ Result cannot be viewed: Annual clearance pending from Admin.");
    return;
  }

  const subjects = s.subjects;
  const session = $("session").value;
  const selectedClass = $("className").value;

  let grandTotal = 0;
  subjects.forEach(sub => grandTotal += sub.total);
  const average = subjects.length > 0 ? (grandTotal / subjects.length).toFixed(1) : 0;

  const getRemark = (score) => {
    if (score >= 75) return "Excellence";
    if (score >= 65) return "Very Good";
    if (score >= 55) return "Good";
    if (score >= 45) return "Satisfactory";
    if (score >= 40) return "Pass";
    return "Fail";
  };

  const logoUrl = new URL('logo.jpg', window.location.href).href;
  const win = window.open("", "", "width=900,height=800");
  if (!win) return alert("Please allow pop-ups");

  win.document.write(`
    <html>
    <head>
      <title>Annual Report Card - ${name}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        @media print { .no-print { display:none; } }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 14px; }
        .summary-box { display: flex; justify-content: space-between; font-weight: bold; padding: 10px; border: 2px solid #000; margin-top: 15px; }
      </style>
    </head>
    <body class="p-10">
      
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 4px double #333; padding-bottom: 15px; margin-bottom: 25px;">
        <img src="${logoUrl}" alt="Logo" style="width: 100px; height: 100px; object-fit: contain;">
        <div style="text-align: center; flex-grow: 1;">
          <h1 style="margin: 0; color: #6A29C5; font-size: 30px; font-weight: 900;">Chosen Generation Nursery and Primary Smart School</h1>
          <p style="margin: 5px 0 0 0; font-weight: bold; color: #444; font-style: italic;">Excellence in Learning and Character</p>
          <div style="margin-top: 10px;">
            <span style="background: #f3f4f6; border: 1px solid #ddd; padding: 5px 15px; font-size: 14px; font-weight: bold; border-radius: 4px; text-transform: uppercase;">
              ANNUAL REPORT CARD
            </span>
          </div>
        </div>
        <div style="width: 100px;"></div>
      </div>

      <div class="grid grid-cols-2 gap-4 mb-6 text-sm border p-4 bg-gray-50">
        <div><strong>NAME:</strong> ${name.toUpperCase()}</div>
        <div><strong>CLASS:</strong> ${selectedClass}</div>
        <div><strong>TERM:</strong> Annual (Averaged)</div>
        <div><strong>SESSION:</strong> ${session}</div>
      </div>

      <table>
        <thead>
          <tr class="bg-gray-100">
            <th>Subject</th>
            <th>1st Term</th>
            <th>2nd Term</th>
            <th>3rd Term</th>
            <th>Annual Avg (100)</th>
            <th>Grade</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${subjects.map(sub => `
            <tr>
              <td>${sub.subject}</td>
              <td>${sub.term1}</td>
              <td>${sub.term2}</td>
              <td>${sub.term3}</td>
              <td><strong>${sub.total}</strong></td>
              <td><strong class="text-[#6A29C5]">${sub.grade}</strong></td>
              <td>${getRemark(sub.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="summary-box">
        <span>TOTAL AVERAGE: ${average}%</span>
      </div>

      <div class="mt-6 p-4 border border-black">
        <div class="font-bold underline mb-1">PRINCIPAL'S REMARK:</div>
        <div class="italic">"${generatePrincipalRemark(average)}"</div>
      </div>
      
      <div class="no-print text-center mt-10">
        <button onclick="window.print()" class="bg-[#F51B9E] text-white px-10 py-2 rounded font-bold hover:bg-[#F51B9E] transition">Print Annual Result</button>
      </div>
    </body>
    </html>
  `);
};

function renderStudentTable() {
  const tbody = document.querySelector("tbody");
  tbody.innerHTML = "";
  
  const names = Object.keys(allStudents);
  const isAnnual = $("term").value === "annual";
  const termVal = $("term").value;
  const session = $("session").value;
  const selectedClass = $("className").value;
  
  names.forEach(name => {
    const s = allStudents[name];
    const row = document.createElement("tr");
    row.className = "border-b hover:bg-gray-50 transition text-sm md:text-base";
    
    const btnId = `view-${name.replace(/\s+/g, '-')}`;
    const subjectBadgeId = `subj-badge-${name.replace(/\s+/g, '-')}`;
    
    const isPublished = s.subjects.some(sub => sub.published === true);
    
    const feeStatusHtml = isAnnual ? 
      `<span class="text-blue-600 font-bold text-[10px] uppercase">N/A</span>` :
      `<span class="${s.feeCleared ? 'text-green-600' : 'text-red-600'} font-bold text-[10px] uppercase">${s.feeCleared ? 'Cleared' : 'Pending'}</span>`;

    const manageHtml = isAnnual ? 
      `<span class="text-gray-400 text-[10px] font-bold italic bg-gray-200 px-2 py-1 rounded">ANNUAL RECORD</span>` :
      (!isPublished ? `
        <button onclick="deleteStudentReport('${s.name}', '${selectedClass}', ${Number(termVal)}, '${session}')" class="text-red-600 hover:text-red-800 text-xs font-bold underline">
          Delete Result
        </button>
      ` : `
        <span class="text-gray-400 text-[10px] font-bold italic bg-gray-200 px-2 py-1 rounded">LOCKED (Published)</span>
      `);

    row.innerHTML = `
      <td class="p-2 md:p-4 font-bold text-gray-800">${s.name}</td>
      <td class="p-2 md:p-4 text-center">
        <button id="${subjectBadgeId}" class="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition px-2 py-1 rounded-full text-[10px] md:text-xs font-black cursor-pointer">
          ${s.subjects.length} Subjects
        </button>
      </td>
      <td class="p-2 md:p-4 text-center">${feeStatusHtml}</td>
      <td class="p-2 md:p-4 text-center">${manageHtml}</td>
      <td class="p-2 md:p-4 text-center">
        <button id="${btnId}" class="bg-indigo-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-indigo-700 transition">
          VIEW
        </button>
      </td>
    `;
    tbody.appendChild(row);

    document.getElementById(btnId).onclick = () => isAnnual ? viewAnnualReportCard(name) : viewReportCard(name);
    document.getElementById(subjectBadgeId).onclick = () => showSubjectsModal(name);
  });
}

function showSubjectsModal(studentName) {
  const student = allStudents[studentName];
  if (!student) return;

  const modal = $("subjectModal");
  const modalTitle = $("modalStudentName");
  const modalList = $("modalSubjectList");

  if (!modal || !modalTitle || !modalList) return;

  modalTitle.textContent = `${student.name} - Entered Subjects`;
  
  modalList.innerHTML = student.subjects.map((sub, idx) => `
    <li class="p-2 bg-gray-50 border rounded text-sm text-gray-700 font-semibold flex items-center justify-between">
      <span>${idx + 1}. ${sub.subject}</span>
    </li>
  `).join('');

  modal.classList.remove("hidden");
}

const closeModalBtn = $("closeModalBtn");
if (closeModalBtn) {
  closeModalBtn.onclick = () => {
    const modal = $("subjectModal");
    if (modal) modal.classList.add("hidden");
  };
}

window.deleteStudentReport = async (studentName, className, term, session) => {
  if (!confirm(`⚠️ Are you sure you want to delete all results for ${studentName}? \n\nThis will wipe their scores for this term so you can re-enter them in the 'Enter Result' page.`)) {
    return;
  }

  try {
    const q = query(
      collection(db, "compiledResults"),
      where("studentName", "==", studentName),
      where("className", "==", className),
      where("term", "==", term),
      where("session", "==", session)
    );

    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      alert("No matching records found to delete.");
      return;
    }

    const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, "compiledResults", d.id)));
    await Promise.all(deletePromises);

    alert("✅ Report deleted successfully. You can now re-enter the results.");
    $("btn-load").click();
    
  } catch (err) {
    console.error("Delete Error:", err);
    alert("Error deleting report: " + err.message);
  }
};

const viewReportCard = (name) => {
  const s = allStudents[name];
  if (!s.feeCleared) {
    alert("❌ Result cannot be viewed: School fees not cleared.");
    return;
  }

  const subjects = s.subjects;
  const meta = s.meta;
  const term = $("term").value;
  const session = $("session").value;
  const selectedClass = $("className").value;

  let grandTotal = 0;
  subjects.forEach(sub => grandTotal += sub.total);
  const average = subjects.length > 0 ? (grandTotal / subjects.length).toFixed(1) : 0;
  const position = s.subjects[0].position || "N/A";

  const getRemark = (score) => {
    if (score >= 75) return "Excellence";
    if (score >= 65) return "Very Good";
    if (score >= 55) return "Good";
    if (score >= 45) return "Satisfactory";
    if (score >= 40) return "Pass";
    return "Fail";
  };

  const logoUrl = new URL('logo.jpg', window.location.href).href;
  const win = window.open("", "", "width=900,height=800");
  if (!win) return alert("Please allow pop-ups");

  win.document.write(`
    <html>
    <head>
      <title>Report Card - ${name}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        @media print { .no-print { display:none; } }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 14px; }
        .summary-box { display: flex; justify-content: space-between; font-weight: bold; padding: 10px; border: 2px solid #000; margin-top: 15px; }
      </style>
    </head>
    <body class="p-10">
      
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 4px double #333; padding-bottom: 15px; margin-bottom: 25px;">
        <img src="${logoUrl}" alt="Logo" style="width: 100px; height: 100px; object-fit: contain;">
        <div style="text-align: center; flex-grow: 1;">
          <h1 style="margin: 0; color: #6A29C5; font-size: 30px; font-weight: 900;">Chosen Generation Nursery and Primary Smart School</h1>
          <p style="margin: 5px 0 0 0; font-weight: bold; color: #444; font-style: italic;">Excellence in Learning and Character</p>
        </div>
        <div style="width: 100px;"></div>
      </div>

      <div class="grid grid-cols-2 gap-4 mb-6 text-sm border p-4 bg-gray-50">
        <div><strong>NAME:</strong> ${name.toUpperCase()}</div>
        <div><strong>CLASS:</strong> ${selectedClass}</div>
        <div><strong>TERM:</strong> ${term}${suffix(term)} Term</div>
        <div><strong>SESSION:</strong> ${session}</div>
      </div>

      <table>
        <thead>
          <tr class="bg-gray-100">
            <th>Subject</th>
            <th>Test (40)</th>
            <th>Exam (60)</th>
            <th>Total (100)</th>
            <th>Grade</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${subjects.map(sub => `
            <tr>
              <td>${sub.subject}</td>
              <td>${sub.test}</td>
              <td>${sub.exam}</td>
              <td>${sub.total}</td>
              <td><strong class="text-[#6A29C5]">${sub.grade}</strong></td>
              <td>${getRemark(sub.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="summary-box">
        <span>TOTAL: ${grandTotal}</span>
        <span>AVG: ${average}%</span>
        <span>POSITION: ${position}${suffix(position)}</span>
      </div>

      <div class="mt-6 p-4 border border-black">
        <div class="font-bold underline mb-1">PRINCIPAL'S REMARK:</div>
        <div class="italic">"${generatePrincipalRemark(average)}"</div>
      </div>
      
      <div class="no-print text-center mt-10">
        <button onclick="window.print()" class="bg-[#F51B9E] text-white px-10 py-2 rounded font-bold hover:bg-[#F51B9E] transition">Print Result</button>
      </div>
    </body>
    </html>
  `);
};

function generatePrincipalRemark(avg) {
  if (avg >= 75) return "Excellent performance! Keep it up.";
  if (avg >= 60) return "Good result. Room for improvement.";
  if (avg >= 50) return "Average performance. Sit up.";
  return "Below average. Needs serious improvement.";
}

function suffix(n) {
  if (n === "N/A") return "";
  const num = parseInt(n);
  if (isNaN(num)) return "";
  const j = num % 10, k = num % 100;
  if (j == 1 && k != 11) return "st";
  if (j == 2 && k != 12) return "nd";
  if (j == 3 && k != 13) return "rd";
  return "th";
}
