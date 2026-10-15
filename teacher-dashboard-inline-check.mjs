
  import { auth, db } from "./firebase-config.js";
  import { requireRole } from "./auth-guard.js";
  import { collection, query, where, getDocs, doc, deleteDoc, updateDoc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
  import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

  const $ = id => document.getElementById(id);
  let currentTab = "accounts";
  let currentTeacherId = null;
  let editingStudentId = null;

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
        if (data.className) classes.add(data.className);
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
  
  mobileBtn.onclick = () => {
    mobileMenu.classList.toggle("hidden");
  };

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
  $("add-student-btn").onclick = () => openStudentModal();
  $("cancel-student-btn").onclick = closeStudentModal;
  $("student-form").onsubmit = saveStudent;
  $("main-list").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit") editStudent(button.dataset.studentId);
    if (button.dataset.action === "delete") deleteStudent(button.dataset.studentId);
  });

  function switchTab(tab) {
    currentTab = tab;
    $("tab-accounts").className = tab === "accounts" ? "pb-2 px-4 font-bold border-b-4 border-[#6A29C5] text-[#6A29C5]" : "pb-2 px-4 font-bold border-b-4 border-transparent text-gray-400";
    loadData();
  }

  async function loadData() {
    const className = $("filter-class").value;
    $("add-student-btn").disabled = !className;
    if(!className) {
      $("stat-students").textContent = "-";
      $("stat-results").textContent = "-";
      $("stat-tests").textContent = "-";
      $("main-list").innerHTML = '<tr><td colspan="5" class="p-10 text-center text-gray-400">Please select a class above to view data.</td></tr>';
      return;
    }

    const tbody = $("main-list");
    const thead = $("table-head");
    tbody.innerHTML = '<tr><td colspan="5" class="p-10 text-center font-bold text-gray-500 animate-pulse">Loading class data...</td></tr>';

    try {
      // 1. Fetch Students from registry
      const qStudents = query(collection(db, "students_registry"), where("className", "==", className));
      const sSnap = await getDocs(qStudents);
      $("stat-students").textContent = sSnap.size;

      // 2. Fetch Results for this teacher
      const qResults = query(
        collection(db, "compiledResults"),
        where("className", "==", className),
        where("teacherId", "==", currentTeacherId)
      );
      const rSnap = await getDocs(qResults);
      
      // Calculate unique students with results
      const uniqueStudents = new Set();
      rSnap.forEach(d => uniqueStudents.add((d.data().studentNameLower || d.data().studentName).toLowerCase()));
      $("stat-results").textContent = uniqueStudents.size;

      // 3. Fetch Tests for this teacher
      const qTests = query(
        collection(db, "tests"),
        where("className", "==", className),
        where("teacherId", "==", currentTeacherId)
      );
      const tSnap = await getDocs(qTests);
      $("stat-tests").textContent = tSnap.size;

      // RENDER TABS
      if (currentTab === "accounts") {
        thead.innerHTML = `<tr><th class="p-4">Student Name</th><th class="p-4 hidden sm:table-cell">Reg No</th><th class="p-4 hidden sm:table-cell">Gender</th><th class="p-4 text-center">Action</th></tr>`;
        tbody.innerHTML = sSnap.empty ? `<tr><td colspan="4" class="p-10 text-center text-gray-400">No students found for ${className}.</td></tr>` : "";
        
        const accounts = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        accounts.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));

        accounts.forEach(s => {
          tbody.innerHTML += `
            <tr class="hover:bg-[#FDE7F9] transition-colors">
              <td class="p-4 font-bold text-gray-900">${escapeHtml(s.fullName || 'Unknown')}</td>
              <td class="p-4 hidden sm:table-cell text-gray-600">${escapeHtml(s.regNo || 'N/A')}</td>
              <td class="p-4 hidden sm:table-cell text-xs text-gray-500">${escapeHtml(s.gender || 'N/A')}</td>
              <td class="p-4 text-center">
                <div class="flex justify-center gap-2">
                  <button type="button" data-action="edit" data-student-id="${escapeHtml(s.id)}" class="text-indigo-600 font-black border border-indigo-200 px-3 py-1 rounded bg-white hover:bg-indigo-600 hover:text-white transition-colors text-[10px]">EDIT</button>
                  <button type="button" data-action="delete" data-student-id="${escapeHtml(s.id)}" class="text-red-600 font-black border border-red-200 px-3 py-1 rounded bg-white hover:bg-red-600 hover:text-white transition-colors text-[10px]">DELETE</button>
                </div>
              </td>
            </tr>`;
        });
      } else {
        thead.innerHTML = `<tr><th class="p-4">Student Name</th><th class="p-4">Subjects Breakdown</th><th class="p-4 text-center">Grand Total</th><th class="p-4 text-center">Action</th></tr>`;
        tbody.innerHTML = rSnap.empty ? `<tr><td colspan="4" class="p-10 text-center text-gray-400">No results have been compiled/saved for ${className} yet.</td></tr>` : "";
        
        // Grouping Logic
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

        // Render Grouped Rows
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

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  async function openStudentModal(studentId = null) {
    editingStudentId = studentId;
    const title = $("student-modal-title");
    const saveButton = $("save-student-btn");
    $("student-form").reset();
    title.textContent = studentId ? "Edit Student" : "Add Student";
    saveButton.textContent = studentId ? "Save Changes" : "Add Student";

    try {
      if (studentId) {
        const studentSnap = await getDoc(doc(db, "students_registry", studentId));
        if (!studentSnap.exists()) throw new Error("This student is no longer in the registry.");
        const student = studentSnap.data();
        $("student-full-name").value = student.fullName || student.name || "";
        $("student-gender").value = student.gender || "";
      }
      $("student-modal").classList.remove("hidden");
    } catch (err) {
      alert("Unable to load student: " + err.message);
    }
  }

  function closeStudentModal() {
    $("student-modal").classList.add("hidden");
    editingStudentId = null;
  }

  async function saveStudent(event) {
    event.preventDefault();
    const className = $("filter-class").value;
    const fullName = $("student-full-name").value.trim().replace(/\s+/g, " ");
    const gender = $("student-gender").value;
    const saveButton = $("save-student-btn");
    if (!className || !fullName) return;

    saveButton.disabled = true;
    try {
      if (editingStudentId) {
        await updateDoc(doc(db, "students_registry", editingStudentId), { fullName, name: fullName, gender });
      } else {
        const duplicateQuery = query(
          collection(db, "students_registry"),
          where("className", "==", className),
          where("fullName", "==", fullName)
        );
        const duplicateSnap = await getDocs(duplicateQuery);
        if (!duplicateSnap.empty) throw new Error("A student with this name is already registered in this class.");

        const prefix = className.toLowerCase().includes("kg") ? "N" : className.toLowerCase().includes("basic") ? "P" : "X";
        let regNo;
        let existingStudent;
        do {
          regNo = `${prefix}-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
          existingStudent = await getDoc(doc(db, "students_registry", regNo));
        } while (existingStudent.exists());

        await setDoc(doc(db, "students_registry", regNo), {
          regNo,
          fullName,
          name: fullName,
          className,
          gender,
          session: "",
          registeredAt: serverTimestamp(),
          status: "Active",
          registeredBy: currentTeacherId
        });
      }
      closeStudentModal();
      await loadData();
    } catch (err) {
      alert("Unable to save student: " + err.message);
    } finally {
      saveButton.disabled = false;
    }
  }

  async function editStudent(studentId) {
    await openStudentModal(studentId);
  }

  async function deleteStudent(studentId) {
    const studentSnap = await getDoc(doc(db, "students_registry", studentId));
    if (!studentSnap.exists()) return alert("This student is no longer in the registry.");
    const student = studentSnap.data();
    const name = student.fullName || student.name || "this student";
    if (!confirm(`Remove ${name} from this class roster? This does not delete saved scores or a student sign-in account.`)) return;
    try {
      await deleteDoc(doc(db, "students_registry", studentId));
      await loadData();
    } catch (err) {
      alert("Unable to remove student: " + err.message);
    }
  }

  // PASSWORD MANAGEMENT
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

    if (!curPw || !newPw || !cfPw) return msg.textContent = "âŒ All fields required";
    if (newPw !== cfPw) {
      msg.className = "text-center text-xs mt-2 font-bold text-red-600";
      return msg.textContent = "âŒ Passwords do not match!";
    }
    if (newPw.length < 6) {
      msg.className = "text-center text-xs mt-2 font-bold text-red-600";
      return msg.textContent = "âŒ New password must be at least 6 characters";
    }

    try {
      const user = auth.currentUser;
      const credential = EmailAuthProvider.credential(user.email, curPw);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPw);
      msg.className = "text-center text-xs mt-2 font-bold text-green-600";
      msg.textContent = "âœ… Password Updated!";
      setTimeout(() => $("password-modal").classList.add("hidden"), 1500);
    } catch (err) {
      msg.className = "text-center text-xs mt-2 font-bold text-red-600";
      msg.textContent = "âŒ " + (err.message.includes("wrong-password") ? "Current password is incorrect" : err.message);
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
