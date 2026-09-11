const URL_WEB_APP = 'https://script.google.com/macros/s/AKfycbw0ZBoW8asZnFlsEIrJS90I9dkxdsf7AF3O2pEspMYdY23PqlMqgo2kx4KVUQ_tZV3Scg/exec';

// State Aplikasi
let masterData = [];
let lokasiList = ["RAK-A1", "RAK-A2", "RAK-B1", "GUDANG-UTAMA"];
let localHistory = [];
let verifikasiData = [];
let currentUser = null;
let currentScanner = null;
let scannerTarget = "barcode"; // "barcode" | "lokasi"

// DOM Elements
const uiToast = document.getElementById('toastNotification');
const uiToastMsg = document.getElementById('toastMessage');
const inputLokasi = document.getElementById('inputLokasi');
const lokasiSuggestion = document.getElementById('lokasiSuggestion');
const inputBarcode = document.getElementById('inputBarcode');
const inputQtySo = document.getElementById('inputQtySo');
const inputKeterangan = document.getElementById('inputKeterangan');
const productDetailCard = document.getElementById('productDetailCard');

// --- NOTIFIKASI TOAST (Zero Latency) ---
function showToast(message, type = "success") {
  uiToastMsg.textContent = message;
  const icon = document.getElementById('toastIcon');
  
  if (type === "success") {
    icon.innerHTML = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>';
    icon.style.stroke = "var(--green)";
  } else if (type === "loading") {
    icon.innerHTML = '<circle cx="12" cy="12" r="10"></circle><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>';
    icon.style.stroke = "#ffffff";
  } else {
    icon.innerHTML = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>';
    icon.style.stroke = "var(--red)";
  }

  uiToast.classList.remove('hidden');
  uiToast.classList.add('show');

  if (type !== "loading") {
    setTimeout(() => { uiToast.classList.remove('show'); }, 2500);
  }
}

// --- NAVIGASI TAB BAR ---
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const target = e.currentTarget;
    target.classList.add('active');
    const tabId = target.dataset.tab;
    document.getElementById(tabId).classList.add('active');

    // Trigger perbaharuan data tab
    if (tabId === 'tabVerifikasi') renderVerifikasiTable();
    if (tabId === 'tabHistory') renderHistoryList();
    if (tabId === 'tabAdmin') updateAdminStats();
  });
});

// --- TOGGLE SHOW/HIDE PASSWORD ---
document.getElementById('togglePasswordBtn').addEventListener('click', () => {
  const passInput = document.getElementById('loginPassword');
  const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
  passInput.setAttribute('type', type);
});

// --- AUTENTIKASI LOGIN ---
document.getElementById('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  showToast("Mengautentikasi...", "loading");

  const un = document.getElementById('loginUsername').value.trim();
  const pw = document.getElementById('loginPassword').value.trim();

  fetch(`${URL_WEB_APP}?action=login&username=${encodeURIComponent(un)}&password=${encodeURIComponent(pw)}`)
    .then(r => r.json())
    .then(res => {
      if (res.status === 'SUCCESS') {
        currentUser = res.data;
        document.getElementById('displayUserRole').textContent = currentUser.role || 'STAFF';
        
        if (currentUser.role === 'ADMIN') {
          document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
        }

        document.getElementById('loginScreen').classList.remove('active');
        document.getElementById('appContainer').classList.remove('hidden');
        showToast("Login Berhasil!", "success");

        // Load data master secara terpisah di latar belakang
        loadMasterDataSilent();
      } else {
        showToast(res.message || "Login gagal", "error");
      }
    })
    .catch(() => showToast("Gagal terhubung ke server", "error"));
});

// LOGOUT
document.getElementById('btnLogout').addEventListener('click', () => {
  currentUser = null;
  document.getElementById('appContainer').classList.add('hidden');
  document.getElementById('loginScreen').classList.add('active');
  document.getElementById('loginForm').reset();
  showToast("Berhasil Logout", "success");
});

// --- LOAD MASTER DATA BACKGROUND ---
function loadMasterDataSilent() {
  fetch(`${URL_WEB_APP}?action=getMaster`)
    .then(r => r.json())
    .then(res => {
      if (res.data) {
        masterData = res.data;
        // Ekstrak lokasi dari master data
        const extractedLocs = masterData.map(d => d.department).filter(Boolean);
        lokasiList = [...new Set([...lokasiList, ...extractedLocs])];
        updateAdminStats();
      }
    })
    .catch(err => console.error("Sinkronisasi latar belakang terputus:", err));
}

// --- SEARCH & AUTOCOMPLETE LOKASI ---
inputLokasi.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  lokasiSuggestion.innerHTML = "";

  if (!query) {
    lokasiSuggestion.classList.add('hidden');
    return;
  }

  const filtered = lokasiList.filter(l => l.toLowerCase().includes(query)).slice(0, 5);

  if (filtered.length > 0) {
    filtered.forEach(loc => {
      const li = document.createElement('li');
      li.textContent = loc;
      li.onclick = () => {
        inputLokasi.value = loc;
        lokasiSuggestion.classList.add('hidden');
        inputBarcode.focus();
      };
      lokasiSuggestion.appendChild(li);
    });
    lokasiSuggestion.classList.remove('hidden');
  } else {
    lokasiSuggestion.classList.add('hidden');
  }
});

// MODAL TAMBAH LOKASI
document.getElementById('btnAddLocation').addEventListener('click', () => {
  document.getElementById('addLocationModal').classList.remove('hidden');
  document.getElementById('newLocationInput').focus();
});

document.getElementById('btnCancelAddLocation').addEventListener('click', () => {
  document.getElementById('addLocationModal').classList.add('hidden');
});

document.getElementById('btnSaveNewLocation').addEventListener('click', () => {
  const newLoc = document.getElementById('newLocationInput').value.trim().toUpperCase();
  if (!newLoc) return showToast("Nama lokasi tidak boleh kosong", "error");

  if (!lokasiList.includes(newLoc)) {
    lokasiList.push(newLoc);
  }

  inputLokasi.value = newLoc;
  document.getElementById('newLocationInput').value = "";
  document.getElementById('addLocationModal').classList.add('hidden');
  showToast(`Lokasi ${newLoc} ditambahkan`, "success");
  inputBarcode.focus();
});

// --- PENCARIAN BARCODE OTOMATIS ---
inputBarcode.addEventListener('input', (e) => {
  const code = e.target.value.trim();
  if (code.length >= 3) {
    cekBarcodeData(code);
  } else {
    productDetailCard.classList.add('hidden');
  }
});

function cekBarcodeData(code) {
  const item = masterData.find(x => String(x.upc) === code || String(x.article) === code);
  if (item) {
    document.getElementById('resDeskripsi').textContent = item.desc || item.description || "-";
    document.getElementById('resDeptVendor').textContent = `${item.department || '-'} / ${item.brand || '-'}`;
    document.getElementById('resQtySystem').textContent = item.qtySystem || item.qty || "0";
    productDetailCard.classList.remove('hidden');
  } else {
    productDetailCard.classList.add('hidden');
  }
}

// --- LOGIKA SCANNER SVG & KAMERA ---
document.getElementById('btnOpenScanner').addEventListener('click', () => bukaScanner('barcode'));
document.getElementById('btnScanLokasi').addEventListener('click', () => bukaScanner('lokasi'));
document.getElementById('btnCloseScanner').addEventListener('click', tutupScanner);

function bukaScanner(target) {
  scannerTarget = target;
  document.getElementById('scannerModalTitle').textContent = target === 'barcode' ? 'Scan Barcode Item' : 'Scan Barcode Lokasi';
  document.getElementById('scannerModal').classList.remove('hidden');

  currentScanner = new Html5Qrcode("cameraViewport");
  currentScanner.start(
    { facingMode: "environment" },
    { fps: 15, qrbox: { width: 220, height: 220 } },
    (decodedText) => {
      tutupScanner();
      if (scannerTarget === 'barcode') {
        inputBarcode.value = decodedText;
        cekBarcodeData(decodedText);
        inputQtySo.focus();
      } else {
        inputLokasi.value = decodedText;
        inputBarcode.focus();
      }
      showToast("Scan Berhasil", "success");
    }
  ).catch(() => {
    tutupScanner();
    showToast("Akses kamera ditolak atau tidak tersedia", "error");
  });
}

function tutupScanner() {
  document.getElementById('scannerModal').classList.add('hidden');
  if (currentScanner) {
    currentScanner.stop().then(() => currentScanner.clear()).catch(() => {});
  }
}

// --- OPTIMISTIC SAVE (ZERO-LATENCY) ---
document.getElementById('btnSaveSo').addEventListener('click', () => {
  const loc = inputLokasi.value.trim();
  const bc = inputBarcode.value.trim();
  const qty = inputQtySo.value.trim();
  const notes = inputKeterangan.value.trim();

  if (!loc || !bc || !qty) {
    return showToast("Lokasi, Barcode, & Qty Wajib Diisi!", "error");
  }

  // 1. Eksekusi UI Instan (0 Detik Jeda)
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const newItem = { id: Date.now(), lokasi: loc, barcode: bc, qty: qty, notes: notes, time: timestamp, synced: true };
  
  localHistory.unshift(newItem);

  // Reset form langsung agar user bisa scan item berikutnya
  inputBarcode.value = "";
  inputQtySo.value = "";
  inputKeterangan.value = "";
  productDetailCard.classList.add('hidden');
  inputBarcode.focus();

  showToast(`Tersimpan: ${bc} (${qty} pcs)`, "success");

  // 2. Kirim data ke Google Sheets di latar belakang
  const payload = {
    action: 'saveSO',
    user: currentUser ? currentUser.username : 'GUEST',
    lokasi: loc,
    barcode: bc,
    qty: qty,
    notes: notes
  };

  fetch(URL_WEB_APP, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(err => {
    console.warn("Gagal sinkronisasi background:", err);
  });
});

// --- RENDER TAB HISTORY ---
function renderHistoryList() {
  const container = document.getElementById('historyListContainer');
  const searchVal = document.getElementById('searchHistory').value.toLowerCase();
  container.innerHTML = "";

  const filtered = localHistory.filter(h => 
    h.barcode.toLowerCase().includes(searchVal) || h.lokasi.toLowerCase().includes(searchVal)
  );

  document.getElementById('historyCountBadge').textContent = `${filtered.length} Item`;

  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-center" style="color:var(--text-sub); padding:20px;">Belum ada riwayat opname</p>';
    return;
  }

  filtered.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div>
        <div class="history-title">${item.barcode}</div>
        <div class="history-sub">Lokasi: <strong>${item.lokasi}</strong> • ${item.time}</div>
      </div>
      <div class="history-qty">+${item.qty}</div>
    `;
    container.appendChild(div);
  });
}

document.getElementById('searchHistory').addEventListener('input', renderHistoryList);

// --- RENDER TAB VERIFIKASI ---
function renderVerifikasiTable() {
  const tbody = document.getElementById('tableVerifikasiBody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center">Mengambil data selisih...</td></tr>';

  fetch(`${URL_WEB_APP}?action=getVerifikasi`)
    .then(r => r.json())
    .then(res => {
      tbody.innerHTML = "";
      if (!res.data || res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Semua data sesuai (Tidak ada selisih)</td></tr>';
        return;
      }
      res.data.forEach(row => {
        const tr = document.createElement('tr');
        const selisih = (row.qtySo || 0) - (row.qtySys || 0);
        tr.innerHTML = `
          <td>${row.lokasi}</td>
          <td>${row.barcode}</td>
          <td>${row.qtySys || 0}</td>
          <td>${row.qtySo || 0}</td>
          <td><span class="badge ${selisih < 0 ? 'danger' : 'success'}">${selisih}</span></td>
          <td><button class="ios-btn-icon blue-btn" onclick="showToast('Verifikasi disetujui', 'success')">✓</button></td>
        `;
        tbody.appendChild(tr);
      });
    })
    .catch(() => {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">Gagal memuat data verifikasi</td></tr>';
    });
}

document.getElementById('btnRefreshVerifikasi').addEventListener('click', renderVerifikasiTable);

// --- UPDATE STATS TAB ADMIN ---
function updateAdminStats() {
  document.getElementById('statTotalMaster').textContent = masterData.length;
  document.getElementById('statTotalLokasi').textContent = lokasiList.length;
}

// FORM TAMBAH USER ADMIN
document.getElementById('formAddUser').addEventListener('submit', (e) => {
  e.preventDefault();
  const un = document.getElementById('newUsername').value.trim();
  const pw = document.getElementById('newPassword').value.trim();
  const role = document.getElementById('newRole').value;

  showToast("Membuat user...", "loading");

  fetch(URL_WEB_APP, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'addUser', username: un, password: pw, role: role })
  }).then(() => {
    showToast(`User ${un} berhasil dibuat`, "success");
    document.getElementById('formAddUser').reset();
  }).catch(() => showToast("Gagal menambah user", "error"));
});
