// GANTI URL INI DENGAN GAS WEB APP URL SETELAH DEPLOYMENT
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbw0ZBoW8asZnFlsEIrJS90I9dkxdsf7AF3O2pEspMYdY23PqlMqgo2kx4KVUQ_tZV3Scg/exec"; 

let currentUser = null;
let masterDataCache = [];
let locationCache = [];
let html5QrScanner = null;
let selectedBarcodeData = null;
let pendingSoPayload = null;

// BRUTE FORCE LOCKOUT VARIABLES
let failedAttempts = 0;
let lockoutEndTime = 0;
let lockoutTimerInterval = null;

// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
  initPWA();
  initDB();
  setupEventListeners();
  checkSession();
});

// PWA SERVICE WORKER REGISTRATION
function initPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW Fail:', err));
  }
}

// INDEXEDDB FOR OFFLINE SYNC QUEUE
let db;
function initDB() {
  const req = indexedDB.open("StockOpnameDB", 1);
  req.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains("offlineQueue")) {
      db.createObjectStore("offlineQueue", { keyPath: "id" });
    }
  };
  req.onsuccess = (e) => { db = e.target.result; };
}

// EVENT LISTENERS SETUP
function setupEventListeners() {
  // Login Form
  document.getElementById("loginForm").addEventListener("submit", handleLoginSubmit);
  document.getElementById("togglePasswordBtn").addEventListener("click", togglePasswordVisibility);
  document.getElementById("btnLogout").addEventListener("click", handleLogout);

  // Navigation Tabs
  document.querySelectorAll(".nav-tab").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      
      e.target.classList.add("active");
      document.getElementById(e.target.dataset.tab).classList.add("active");
    });
  });

  // SO Controls
  document.getElementById("inputBarcode").addEventListener("input", handleBarcodeSearch);
  document.getElementById("btnSaveSo").addEventListener("click", handleSaveSoClick);
  document.getElementById("btnAddLocation").addEventListener("click", handleAddLocationPrompt);
  document.getElementById("btnDeleteLocation").addEventListener("click", handleDeleteLocationClick);

  // Scanner Modal
  document.getElementById("btnOpenScanner").addEventListener("click", openScanner);
  document.getElementById("btnCloseScanner").addEventListener("click", closeScanner);

  // Duplicate Dialog Actions
  document.getElementById("btnDupReplace").addEventListener("click", () => processSaveSo("REPLACE"));
  document.getElementById("btnDupAdd").addEventListener("click", () => processSaveSo("ADD"));
  document.getElementById("btnDupCancel").addEventListener("click", () => {
    document.getElementById("modalDuplicate").classList.add("hidden");
  });

  // Network Sync Listener
  window.addEventListener('online', syncOfflineQueue);
}

// BRUTE-FORCE LOCKOUT ALGORITHM
function handleLoginSubmit(e) {
  e.preventDefault();

  if (Date.now() < lockoutEndTime) return;

  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;

  showLoading(true, "Memverifikasi Akun...");

  fetchAPI("login", { username, password })
    .then(res => {
      showLoading(false);
      if (res.status === "SUCCESS") {
        failedAttempts = 0;
        currentUser = res.user;
        saveSession(currentUser);
        initAppUI();
      } else {
        failedAttempts++;
        if (failedAttempts % 6 === 0) {
          const lockMinutes = (failedAttempts / 6) * 10;
          lockoutEndTime = Date.now() + (lockMinutes * 60 * 1000);
          startLockoutTimer();
        } else {
          alert(res.message + ` (${6 - (failedAttempts % 6)} percobaan tersisa)`);
        }
      }
    })
    .catch(() => {
      showLoading(false);
      alert("Gagal terhubung ke server. Memeriksa mode offline...");
    });
}

function startLockoutTimer() {
  const alertBox = document.getElementById("lockoutAlert");
  const timerSpan = document.getElementById("lockoutTimer");
  alertBox.classList.remove("hidden");
  document.getElementById("btnLogin").disabled = true;

  lockoutTimerInterval = setInterval(() => {
    const remainingSec = Math.ceil((lockoutEndTime - Date.now()) / 1000);
    if (remainingSec <= 0) {
      clearInterval(lockoutTimerInterval);
      alertBox.classList.add("hidden");
      document.getElementById("btnLogin").disabled = false;
    } else {
      const m = Math.floor(remainingSec / 60).toString().padStart(2, '0');
      const s = (remainingSec % 60).toString().padStart(2, '0');
      timerSpan.textContent = `${m}:${s}`;
    }
  }, 1000);
}

function togglePasswordVisibility() {
  const pwdInput = document.getElementById("loginPassword");
  pwdInput.type = pwdInput.type === "password" ? "text" : "password";
}

// SESSION MANAGEMENT (AUTO LOGOUT 12 JAM)
function saveSession(user) {
  const sessionData = {
    user: user,
    expiry: Date.now() + (12 * 60 * 60 * 1000) // 12 Jam
  };
  localStorage.setItem("so_session", JSON.stringify(sessionData));
}

function checkSession() {
  const raw = localStorage.getItem("so_session");
  if (raw) {
    const session = JSON.parse(raw);
    if (Date.now() < session.expiry) {
      currentUser = session.user;
      initAppUI();
      return;
    }
  }
  handleLogout();
}

function handleLogout() {
  localStorage.removeItem("so_session");
  document.getElementById("loginScreen").classList.add("active");
  document.getElementById("appContainer").classList.add("hidden");
}

// UI INITIALIZATION AFTER LOGIN
function initAppUI() {
  document.getElementById("loginScreen").classList.remove("active");
  document.getElementById("appContainer").classList.remove("hidden");

  document.getElementById("displayStaffName").textContent = currentUser.nama;
  document.getElementById("displayUserRole").textContent = currentUser.role;

  if (currentUser.role === "ADMIN") {
    document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
  }

  loadMasterDataAndLocations();
}

function loadMasterDataAndLocations() {
  showLoading(true, "Sinkronisasi Master Data...");

  Promise.all([
    fetchAPI("getMasterData"),
    fetchAPI("getLocations")
  ]).then(([masterRes, locRes]) => {
    showLoading(false);
    if (masterRes.status === "SUCCESS") masterDataCache = masterRes.data;
    if (locRes.status === "SUCCESS") {
      locationCache = locRes.data;
      renderLocationDropdown();
    }
  }).catch(() => {
    showLoading(false);
    showNotification("Mode Offline Aktif");
  });
}

function renderLocationDropdown() {
  const select = document.getElementById("selectLocation");
  select.innerHTML = '<option value="">-- Pilih Lokasi --</option>';
  locationCache.forEach(loc => {
    if (loc.status === "APPROVED") {
      select.innerHTML += `<option value="${loc.nama}">${loc.nama}</option>`;
    }
  });
}

// BARCODE SEARCH & AUTO MATCHING
function handleBarcodeSearch(e) {
  const query = e.target.value.trim().toLowerCase();
  const detailBox = document.getElementById("productDetailCard");

  if (!query) {
    detailBox.classList.add("hidden");
    selectedBarcodeData = null;
    return;
  }

  const match = masterDataCache.find(item => 
    (item.upc && item.upc.toLowerCase() === query) ||
    (item.artikel && item.artikel.toLowerCase() === query) ||
    (item.partNum && item.partNum.toLowerCase() === query)
  );

  detailBox.classList.remove("hidden");

  if (match) {
    selectedBarcodeData = match;
    document.getElementById("resDeskripsi").textContent = match.deskripsi;
    document.getElementById("resDepartment").textContent = match.dept;
    document.getElementById("resVendor").textContent = match.vendorName;
    document.getElementById("resQtySystem").textContent = match.qtySystem;
  } else {
    selectedBarcodeData = {
      upc: query,
      deskripsi: "UNKNOWN",
      dept: "UNKNOWN",
      vendorCode: "UNKNOWN",
      vendorName: "UNKNOWN",
      qtySystem: 0
    };
    document.getElementById("resDeskripsi").textContent = "UNKNOWN (Data Tidak Terdaftar)";
    document.getElementById("resDepartment").textContent = "-";
    document.getElementById("resVendor").textContent = "-";
    document.getElementById("resQtySystem").textContent = "0";
  }
}

// SAVE STOCK OPNAME LOGIC
function handleSaveSoClick() {
  const lokasi = document.getElementById("selectLocation").value;
  const barcode = document.getElementById("inputBarcode").value.trim();
  const qtySo = document.getElementById("inputQtySo").value;

  if (!lokasi || !barcode || !qtySo) {
    alert("Lokasi, Barcode, dan Qty Opname Wajib Diisi!");
    return;
  }

  pendingSoPayload = {
    lokasi,
    kodeUpc: selectedBarcodeData ? selectedBarcodeData.upc : barcode,
    deskripsi: selectedBarcodeData ? selectedBarcodeData.deskripsi : "UNKNOWN",
    department: selectedBarcodeData ? selectedBarcodeData.dept : "UNKNOWN",
    vendorCode: selectedBarcodeData ? selectedBarcodeData.vendorCode : "UNKNOWN",
    vendorName: selectedBarcodeData ? selectedBarcodeData.vendorName : "UNKNOWN",
    qtySystem: selectedBarcodeData ? selectedBarcodeData.qtySystem : 0,
    qtySo: Number(qtySo),
    keterangan: document.getElementById("inputKeterangan").value,
    username: currentUser.username
  };

  // Pengecekan Duplikat
  processSaveSo("NEW");
}

function processSaveSo(mode) {
  pendingSoPayload.mode = mode;
  showLoading(true, "Menyimpan...");

  fetchAPI("saveStockOpname", pendingSoPayload)
    .then(res => {
      showLoading(false);
      document.getElementById("modalDuplicate").classList.add("hidden");
      if (res.status === "SUCCESS") {
        showNotification("Data SO Berhasil Disimpan!");
        resetSoForm();
      }
    })
    .catch(() => {
      // OFFLINE FALLBACK
      showLoading(false);
      saveToOfflineQueue(pendingSoPayload);
      document.getElementById("modalDuplicate").classList.add("hidden");
      showNotification("Tersimpan di Penyimpanan Lokal (Offline Mode)");
      resetSoForm();
    });
}

function resetSoForm() {
  document.getElementById("inputBarcode").value = "";
  document.getElementById("inputQtySo").value = "";
  document.getElementById("inputKeterangan").value = "";
  document.getElementById("productDetailCard").classList.add("hidden");
}

// OFFLINE QUEUE MANAGER
function saveToOfflineQueue(payload) {
  const tx = db.transaction("offlineQueue", "readwrite");
  payload.id = "OFFLINE-" + Date.now();
  tx.objectStore("offlineQueue").add(payload);
}

function syncOfflineQueue() {
  if (!db) return;
  const tx = db.transaction("offlineQueue", "readonly");
  const req = tx.objectStore("offlineQueue").getAll();

  req.onsuccess = () => {
    const items = req.result;
    if (items.length > 0) {
      fetchAPI("syncBatchSO", { items }).then(res => {
        if (res.status === "SUCCESS") {
          const clearTx = db.transaction("offlineQueue", "readwrite");
          clearTx.objectStore("offlineQueue").clear();
          showNotification("Auto Sync Berhasil!");
        }
      });
    }
  };
}

// SCANNER ENGINE TOGGLE (HTML5QRCODE / QUAGGA)
function openScanner() {
  document.getElementById("scannerModal").classList.remove("hidden");
  const engine = document.getElementById("scannerEngine").value;

  if (engine === "html5qr") {
    html5QrScanner = new Html5Qrcode("cameraViewport");
    html5QrScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      (decodedText) => {
        document.getElementById("inputBarcode").value = decodedText;
        handleBarcodeSearch({ target: { value: decodedText } });
        closeScanner();
      }
    );
  }
}

function closeScanner() {
  if (html5QrScanner) {
    html5QrScanner.stop().then(() => html5QrScanner.clear());
  }
  document.getElementById("scannerModal").classList.add("hidden");
}

// LOCATION MANAGEMENT
function handleAddLocationPrompt() {
  const name = prompt("Masukkan Nama Lokasi Baru:");
  if (name) {
    showLoading(true, "Menambahkan Lokasi...");
    fetchAPI("addLocation", { namaLokasi: name, username: currentUser.username }).then(() => {
      showLoading(false);
      loadMasterDataAndLocations();
    });
  }
}

function handleDeleteLocationClick() {
  const locName = document.getElementById("selectLocation").value;
  if (!locName) return alert("Pilih lokasi yang ingin dihapus!");

  const targetLoc = locationCache.find(l => l.nama === locName);
  if (targetLoc && confirm(`Yakin ingin mengajukan hapus lokasi ${locName}?`)) {
    fetchAPI("requestDeleteLocation", { id: targetLoc.id, username: currentUser.username })
      .then(res => alert(res.message))
      .then(() => loadMasterDataAndLocations());
  }
}

// HELPER REST FETCH ENGINE
function fetchAPI(action, payload = {}) {
  return fetch(GAS_API_URL, {
    method: "POST",
    body: JSON.stringify({ action, payload })
  }).then(r => r.json());
}

function showLoading(show, text = "Memuat...") {
  const overlay = document.getElementById("loadingOverlay");
  document.getElementById("loadingText").textContent = text;
  if (show) overlay.classList.remove("hidden");
  else overlay.classList.add("hidden");
}

function showNotification(msg) {
  const banner = document.getElementById("notificationBanner");
  document.getElementById("notifMessage").textContent = msg;
  banner.classList.remove("hidden");
  setTimeout(() => banner.classList.add("hidden"), 3000);
}
