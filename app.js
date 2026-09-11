// ==========================================
// CONFIGURATION & GAS BACKEND URL
// ==========================================
// GANTI DENGAN URL DEPLOYMENT GOOGLE APPS SCRIPT ANDA
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbw7SKrL5MWJqHBo4K0uCKdjXVVYQMAY9vbptdO3JSHffGKHGI4WkOLmS3tQqP4i-ReNBw/exec";

let currentUser = null;
let dbMaster = [];
let dbLokasi = [];
let dbStockSystem = [];
let dbSO = [];
let localOfflineQueue = JSON.parse(localStorage.getItem("so_offline_queue") || "[]");
let html5QrCodeEngine = null;
let pendingSOItem = null;

// Auto-Logout Timer (12 Jam)
const AUTO_LOGOUT_TIME = 12 * 60 * 60 * 1000;

document.addEventListener("DOMContentLoaded", () => {
  checkSession();
  initPWAInstall();
});

// ==========================================
// PWA INSTALLATION PROMPT
// ==========================================
let deferredPrompt;
function initPWAInstall() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('pwa-install-container').style.display = 'block';
  });
  document.getElementById('btn-install-pwa')?.addEventListener('click', () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
    }
  });
}

// ==========================================
// AUTH & LOGIN LOGIC
// ==========================================
function togglePasswordVisibility() {
  const p = document.getElementById("login-password");
  p.type = p.type === "password" ? "text" : "password";
}

async function login() {
  const u = document.getElementById("login-username").value.trim();
  const p = document.getElementById("login-password").value.trim();

  if (!u || p.length < 6) {
    alert("Username dan Password (min 6 kar) wajib diisi!");
    return;
  }

  try {
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "login", username: u, password: p })
    }).then(r => r.json());

    if (res.status === "success") {
      currentUser = res.user;
      localStorage.setItem("so_user_session", JSON.stringify({
        user: currentUser,
        loginTime: new Date().getTime()
      }));
      initAppSession();
    } else {
      alert(res.message);
    }
  } catch (err) {
    alert("Gagal koneksi ke server. Cek internet Anda!");
  }
}

function checkSession() {
  const sess = JSON.parse(localStorage.getItem("so_user_session") || "null");
  if (sess) {
    const now = new Date().getTime();
    if (now - sess.loginTime > AUTO_LOGOUT_TIME) {
      logout();
    } else {
      currentUser = sess.user;
      initAppSession();
    }
  }
}

function logout() {
  localStorage.removeItem("so_user_session");
  location.reload();
}

function initAppSession() {
  document.getElementById("sec-login").style.display = "none";
  document.getElementById("app-nav").style.display = "flex";
  document.getElementById("btn-sync").style.display = "block";
  document.getElementById("user-info").style.display = "block";
  document.getElementById("user-info").innerText = `${currentUser.nama} (${currentUser.role.toUpperCase()})`;

  if (currentUser.role === "admin") {
    document.querySelectorAll(".admin-only").forEach(e => e.style.display = "flex");
  }

  fetchInitialData();
  switchTab("so");
}

// ==========================================
// DATA SYNC ENGINE
// ==========================================
async function fetchInitialData() {
  try {
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "getInitialData" })
    }).then(r => r.json());

    if (res.status === "success") {
      dbMaster = res.master;
      dbLokasi = res.lokasi;
      dbStockSystem = res.stockSystem;
      dbSO = res.so;
      populateLokasiDropdown();
      if (res.settings.show_qty_system === "false") {
        document.getElementById("qty-system-container").style.display = "none";
      }
    }
  } catch (err) {
    console.log("Offline mode: Menggunakan data lokal");
  }
}

function populateLokasiDropdown() {
  const sel = document.getElementById("so-lokasi");
  sel.innerHTML = dbLokasi.map(l => `<option value="${l[1]}">${l[1]}</option>`).join("");
}

// ==========================================
// STOCK OPNAME SCANNER & INPUT LOGIC
// ==========================================
function lookupBarcode() {
  const bc = document.getElementById("so-barcode").value.trim();
  if (!bc) return;

  // Search Master
  const match = dbMaster.find(m => 
    String(m["Kode UPC"]) === bc || 
    String(m["Artikel Number"]) === bc || 
    String(m["Article Manufacturer Part Number"]) === bc
  );

  if (match) {
    document.getElementById("so-deskripsi").innerText = match["Deskripsi Produk"];
    document.getElementById("so-dept").innerText = match["Department"];
    document.getElementById("so-vendor").innerText = match["Vendor Name"];

    // Search Qty System
    const sysMatch = dbStockSystem.find(s => String(s[0]) === String(match["Kode UPC"]));
    document.getElementById("so-qty-system").innerText = sysMatch ? sysMatch[3] : "0";
  } else {
    if (confirm("Data TIDAK TERDAFTAR di Master System! Lanjutkan dengan status Unknown?")) {
      document.getElementById("so-deskripsi").innerText = "UNKNOWN PRODUCT";
      document.getElementById("so-dept").innerText = "UNKNOWN";
      document.getElementById("so-vendor").innerText = "UNKNOWN";
      document.getElementById("so-qty-system").innerText = "0";
    }
  }
  renderBarcodeHistory(bc);
}

function saveSO() {
  const lokasi = document.getElementById("so-lokasi").value;
  const bc = document.getElementById("so-barcode").value.trim();
  const qty = parseFloat(document.getElementById("so-qty").value);
  const ket = document.getElementById("so-ket").value;

  if (!lokasi || !bc || isNaN(qty)) {
    alert("Lokasi, Barcode, dan Qty Fisik WAJIB diisi!");
    return;
  }

  // Cek Duplikat di Lokasi yang Sama
  const dup = dbSO.find(s => s[2] === lokasi && String(s[3]) === bc);
  pendingSOItem = {
    idSO: "SO-" + Date.now(),
    timestamp: new Date().toISOString(),
    lokasi, kodeUPC: bc,
    deskripsi: document.getElementById("so-deskripsi").innerText,
    department: document.getElementById("so-dept").innerText,
    vendorCode: "", vendorName: document.getElementById("so-vendor").innerText,
    qtySO: qty,
    qtySystem: document.getElementById("so-qty-system").innerText,
    keterangan: ket,
    staffName: currentUser.nama
  };

  if (dup) {
    document.getElementById("dup-msg").innerText = `Barcode ${bc} sudah ada di lokasi ${lokasi} dengan Qty: ${dup[8]}.`;
    document.getElementById("modal-duplicate").classList.add("active");
  } else {
    executeSaveSO(pendingSOItem);
  }
}

function confirmDuplicateAction(type) {
  document.getElementById("modal-duplicate").classList.remove("active");
  if (type === "add") {
    const dup = dbSO.find(s => s[2] === pendingSOItem.lokasi && String(s[3]) === pendingSOItem.kodeUPC);
    pendingSOItem.qtySO += parseFloat(dup[8]);
  }
  executeSaveSO(pendingSOItem);
}

function executeSaveSO(item) {
  localOfflineQueue.push(item);
  localStorage.setItem("so_offline_queue", JSON.stringify(localOfflineQueue));
  
  // Clear Input, TAHAN LOKASI SAMA
  document.getElementById("so-barcode").value = "";
  document.getElementById("so-qty").value = "";
  document.getElementById("so-ket").value = "";

  alert("Data SO Tersimpan di HP (Auto-Sync saat Online)!");
  syncData();
}

async function syncData() {
  if (!navigator.onLine || localOfflineQueue.length === 0) return;

  try {
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "saveSOBatch",
        username: currentUser.username,
        staffName: currentUser.nama,
        items: localOfflineQueue
      })
    }).then(r => r.json());

    if (res.status === "success") {
      localOfflineQueue = [];
      localStorage.setItem("so_offline_queue", JSON.stringify([]));
      fetchInitialData();
    }
  } catch (e) {
    console.log("Gagal sync online");
  }
}

// ==========================================
// UI TAB NAVIGATION
// ==========================================
function switchTab(tabName) {
  document.querySelectorAll("section").forEach(s => s.style.display = "none");
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  
  document.getElementById(`sec-${tabName}`).style.display = "block";
  document.getElementById("page-title").innerText = tabName.toUpperCase();

  if (tabName === "verifikasi") renderVerifikasiList();
  if (tabName === "report") renderReportSummary();
}

function renderBarcodeHistory(bc) {
  const history = dbSO.filter(s => String(s[3]) === bc);
  const container = document.getElementById("so-history-list");
  container.innerHTML = history.map(h => `
    <div style="background:#FFF; padding:6px; border-radius:6px; margin-bottom:4px; border:1px solid #E5E5EA;">
      <b>${h[2]}</b> - Qty: ${h[8]} (${new Date(h[1]).toLocaleTimeString()}) by ${h[11]}
    </div>
  `).join("") || "Belum ada history.";
}

function exportToExcel() {
  const ws = XLSX.utils.json_to_sheet(dbSO);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hasil Stock Opname");
  XLSX.writeFile(wb, `Stock_Opname_${new Date().toISOString().slice(0,10)}.xlsx`);
}
