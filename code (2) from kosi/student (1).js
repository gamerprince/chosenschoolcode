/* ---------- Result checking logic ---------- */
import { db } from "./firebase-config.js";
import { classLookupValues } from "./class-names.js";
import {
  collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const $ = id => document.getElementById(id);

/* ---------- HELPER FUNCTIONS ---------- */
function suffix(n) {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

function validateSearchInputs(nameLower, className, termValue, session) {
  const errors = [];
  if (!nameLower) errors.push("Student name is required");
  if (!className || className === "Select a class") errors.push("Class is required");
  if (!termValue || termValue === "0") errors.push("Term is required");
  if (!session) errors.push("Session is required");
  if (termValue !== "Annual" && isNaN(Number(termValue))) errors.push("Invalid term value");
  return errors;
}

const getRemark = (score) => {
  if (score >= 75) return "Excellence";
  if (score >= 65) return "Very Good";
  if (score >= 55) return "Good";
  if (score >= 45) return "Satisfactory";
  if (score >= 40) return "Pass";
  return "Fail";
};

const getGrade = (score) => {
  if (score >= 80) return "A1";
  if (score >= 70) return "B2";
  if (score >= 65) return "B3";
  if (score >= 60) return "C4";
  if (score >= 55) return "C5";
  if (score >= 50) return "C6";
  if (score >= 45) return "D7";
  if (score >= 40) return "E8";
  return "F9";
};

/* ---------- RESULT LOOKUP ---------- */
document.addEventListener("DOMContentLoaded", () => {
  $("check").onclick = async () => {
    const resultDiv = $("result");
    resultDiv.innerHTML = "⏳ Searching...";
    $("printResult").classList.add("hidden");

    const name = $("studentName").value.trim();
    const nameLower = name.toLowerCase();
    const className = $("className").value;
    const termValue = $("term").value;
    const session = $("session").value.trim();

    const validationErrors = validateSearchInputs(nameLower, className, termValue, session);
    if (validationErrors.length > 0) {
      resultDiv.innerHTML = `
        <div class="p-4 bg-red-100 border border-red-400 rounded">
          <strong>❌ Validation Errors:</strong>
          <ul class="mt-2 list-disc list-inside text-sm">
            ${validationErrors.map(e => `<li>${e}</li>`).join("")}
          </ul>
        </div>`;
      return;
    }

    try {
      let q;
      if (termValue === "Annual") {
        q = query(
          collection(db, "compiledResults"),
          where("studentNameLower", "==", nameLower),
          where("className", "in", classLookupValues(className)),
          where("session", "==", session)
        );
      } else {
        q = query(
          collection(db, "compiledResults"),
          where("studentNameLower", "==", nameLower),
          where("className", "in", classLookupValues(className)),
          where("term", "==", Number(termValue)),
          where("session", "==", session)
        );
      }

      const snap = await getDocs(q);

      if (snap.empty) {
        resultDiv.innerHTML = `
          <div class="p-4 bg-yellow-100 border border-yellow-400 rounded">
            <strong>⚠️ No results found</strong>
            <p class="text-sm mt-1">Check your name, class, term and session are correct.</p>
          </div>`;
        return;
      }

      const docs = snap.docs.map(d => d.data());
      const first = docs[0];

      if (first.published !== true) {
        resultDiv.innerHTML = `<div class="p-4 bg-[#FDE7F9] text-[#6A29C5] rounded-lg text-center font-bold">⏳ Results Processing...</div>`;
        return;
      }
      if (first.feeCleared !== true) {
        resultDiv.innerHTML = `<div class="p-4 bg-red-50 text-red-800 rounded-lg text-center font-bold">🚫 ACCESS RESTRICTED - Clear fees to view.</div>`;
        return;
      }

      const logoUrl = new URL("logo.jpg", window.location.href).href;
      let tableHtml = "";
      let reportTitle = "";
      let termDisplay = "";

      if (termValue === "Annual") {
        reportTitle = "ANNUAL ACADEMIC REPORT";
        termDisplay = "1st, 2nd & 3rd Term (Cumulative)";

        const subjects = {};
        docs.forEach(r => {
          if (!subjects[r.subject]) subjects[r.subject] = { t1: 0, t2: 0, t3: 0 };
          if (r.term === 1) subjects[r.subject].t1 = r.total || 0;
          if (r.term === 2) subjects[r.subject].t2 = r.total || 0;
          if (r.term === 3) subjects[r.subject].t3 = r.total || 0;
        });

        let rowsHtml = "";
        Object.keys(subjects).sort().forEach(sub => {
          const subject = subjects[sub];
          const grandTotal = subject.t1 + subject.t2 + subject.t3;
          const average = Math.round(grandTotal / 3);

          rowsHtml += `
            <tr>
              <td class="border p-2 font-medium">${sub}</td>
              <td class="border p-2 text-center">${subject.t1 || "-"}</td>
              <td class="border p-2 text-center">${subject.t2 || "-"}</td>
              <td class="border p-2 text-center">${subject.t3 || "-"}</td>
              <td class="border p-2 text-center font-bold text-gray-700">${grandTotal}</td>
              <td class="border p-2 text-center font-black">${average}</td>
              <td class="border p-2 text-center font-bold text-[#6A29C5]">${getGrade(average)}</td>
              <td class="border p-2 text-center">${getRemark(average)}</td>
            </tr>`;
        });

        tableHtml = `
          <table class="w-full text-sm border-collapse border mb-4">
            <thead class="bg-gray-100">
              <tr>
                <th class="border p-2 text-left">Subject</th>
                <th class="border p-2">1st Term</th>
                <th class="border p-2">2nd Term</th>
                <th class="border p-2">3rd Term</th>
                <th class="border p-2 text-gray-700">Total (300)</th>
                <th class="border p-2 font-black">Avg (100)</th>
                <th class="border p-2">Grade</th>
                <th class="border p-2">Remarks</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>`;
      } else {
        reportTitle = "TERMLY ACADEMIC REPORT";
        termDisplay = `${termValue}${suffix(Number(termValue))} Term`;
        docs.sort((a, b) => a.subject.localeCompare(b.subject));

        const rowsHtml = docs.map(r => `
          <tr>
            <td class="border p-2">${r.subject}</td>
            <td class="border p-2 text-center">${r.test || 0}</td>
            <td class="border p-2 text-center">${r.exam || 0}</td>
            <td class="border p-2 text-center font-bold">${r.total || 0}</td>
            <td class="border p-2 text-center font-bold text-[#6A29C5]">${r.grade || "N/A"}</td>
            <td class="border p-2 text-center">${getRemark(r.total || 0)}</td>
          </tr>`).join("");

        tableHtml = `
          <table class="w-full text-sm border-collapse border mb-4">
            <thead class="bg-gray-100">
              <tr>
                <th class="border p-2 text-left">Subject</th>
                <th class="border p-2">Test</th>
                <th class="border p-2">Exam</th>
                <th class="border p-2">Total</th>
                <th class="border p-2">Grade</th>
                <th class="border p-2">Remarks</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>`;
      }

      resultDiv.innerHTML = `
        <div id="printableResult" class="p-8 bg-white">
          <div class="flex items-center justify-between border-b-4 border-double border-gray-800 pb-4 mb-6">
            <img src="${logoUrl}" style="width: 80px; height: 80px; object-fit: contain;">
            <div class="text-center flex-grow">
              <h1 class="text-2xl font-black text-[#6A29C5]">Chosen Generation Nursery and Primary Smart School</h1>
              <h2 class="text-lg font-bold mt-1">${reportTitle}</h2>
              <p class="text-xs font-bold italic text-gray-500">Excellence in Learning and Character</p>
            </div>
            <div style="width: 80px;"></div>
          </div>

          <div class="grid grid-cols-2 gap-2 text-sm mb-6 bg-gray-50 p-4 rounded border">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Class:</strong> ${className}</p>
            <p><strong>Term:</strong> ${termDisplay}</p>
            <p><strong>Session:</strong> ${session}</p>
          </div>

          ${tableHtml}
        </div>`;

      $("printResult").classList.remove("hidden");
    } catch (err) {
      console.error("Query Error:", err);
      resultDiv.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded border font-bold">Error: ${err.message}</div>`;
    }
  };

  /* ---------- PRINT LOGIC ---------- */
  $("printResult").onclick = () => {
    const win = window.open("", "", "width=900,height=800");
    if (!win) return alert("Please allow pop-ups");

    win.document.write(`
      <html>
      <head>
        <title>Student Report - Chosen Generation</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @media print { .no-print { display: none; } body { padding: 0; } }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; }
        </style>
      </head>
      <body>
        ${$("result").innerHTML}
        <div class="no-print text-center mt-8">
          <button onclick="window.print()" class="bg-red-600 text-white px-8 py-2 rounded font-bold">Print Now</button>
        </div>
      </body>
      </html>`);
  };
});
