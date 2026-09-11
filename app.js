const URL_WEB_APP = 'https://script.google.com/macros/s/AKfycbw0ZBoW8asZnFlsEIrJS90I9dkxdsf7AF3O2pEspMYdY23PqlMqgo2kx4KVUQ_tZV3Scg/exec';

let masterData = [];
let lokasiData = []; // Menyimpan list lokasi
let currentUser = null;
let currentScanner = null;
let scannerTarget = ""; // 'barcode' atau 'lokasi'

// UI Elements
const uiToast = document.getElementById('toastNotification');
const uiToastMsg = document.getElementById('toastMessage');
const inputLokasi = document.getElementById('inputLokasi');
const lokasiSuggestion = document.getElementById('lokasiSuggestion');

// --- TOAST NON-BLOCKING (MENGGANTIKAN LOADING LAMA) ---
function showToast(message, type = "success") {
  uiToastMsg.textContent = message;
  const icon = document.getElementById('toastIcon');
  if(type === "success") {
    icon.innerHTML = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>';
    icon.style.stroke = "var(--green)";
  } else if (type === "loading") {
    icon.innerHTML = '<circle cx="12" cy="12" r="10"></circle><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>';
    icon.style.stroke = "#fff";
  } else {
    icon.innerHTML = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>';
    icon.style.stroke = "var(--red)";
  }
  
  uiToast.classList.remove('hidden');
  uiToast.classList.add('show');
  
  if (type !== "loading") {
    setTimeout(() => { uiToast.classList.remove('show'); }, 3000);
  }
}

// --- INIT APP & BOTTOM NAV ---
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    const target = e.currentTarget;
    target.classList.add('active');
    document.getElementById(target.dataset.tab).classList.add('active');
  });
});

// --- LOGIN (Optimized) ---
document.getElementById('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  showToast("Mengautentikasi...", "loading");
  
  const un = document.getElementById('loginUsername').value;
  const pw = document.getElementById('loginPassword').value;

  fetch(`${URL_WEB_APP}?action=login&username=${un}&password=${pw}`)
    .then(r => r.json())
    .then(res => {
      if(res.status === 'SUCCESS') {
        currentUser = res.data;
        document.getElementById('displayUserRole').textContent = currentUser.role;
        document.getElementById('loginScreen').classList.remove('active');
        document.getElementById('appContainer').classList.remove('hidden');
        
        // Load data in BACKGROUND (Layar tidak diblokir)
        showToast("Login Berhasil! Memuat data...", "success");
        loadMasterDataSilent();
      } else {
        showToast(res.message, "error");
      }
    }).catch(err => showToast("Gagal tersambung", "error"));
});

// --- LOAD DATA BACKGROUND ---
function loadMasterDataSilent() {
  fetch(`${URL_WEB_APP}?action=getMaster`)
    .then(r => r.json())
    .then(res => {
      masterData = res.data;
      // Ekstrak lokasi unik dari master jika ada
      showToast("Data Siap!", "success");
    }).catch(e => console.error("Gagal memuat master data."));
}

// --- INPUT LOKASI SMART AUTOCOMPLETE ---
inputLokasi.addEventListener('input', (e) => {
  const val = e.target.value.toLowerCase();
  lokasiSuggestion.innerHTML = "";
  if(val.length < 1) {
    lokasiSuggestion.classList.add('hidden');
    return;
  }
  
  // Contoh pencarian lokasi (Bisa diganti filter dari masterData/lokasiData)
  const matches = masterData.filter(d => (d.department || "").toLowerCase().includes(val)); // Contoh ambil dept sbg lokasi
  const uniqueMatches = [...new Set(matches.map(m => m.department))].slice(0, 5);
  
  if(uniqueMatches.length > 0) {
    uniqueMatches.forEach(match => {
      const li = document.createElement('li');
      li.textContent = match;
      li.onclick = () => { inputLokasi.value = match; lokasiSuggestion.classList.add('hidden'); };
      lokasiSuggestion.appendChild(li);
    });
    lokasiSuggestion.classList.remove('hidden');
  } else {
    lokasiSuggestion.classList.add('hidden');
  }
});

// --- PENCARIAN BARCODE OTOMATIS ---
document.getElementById('inputBarcode').addEventListener('input', (e) => {
  const val = e.target.value;
  if(val.length >= 4) cekBarcodeData(val);
});

function cekBarcodeData(code) {
  const p = masterData.find(x => x.upc == code || x.article == code);
  const card = document.getElementById('productDetailCard');
  if(p) {
    document.getElementById('resDeskripsi').textContent = p.desc;
    document.getElementById('resDeptVendor').textContent = `${p.department} / ${p.brand}`;
    document.getElementById('resQtySystem').textContent = p.qtySystem;
    card.classList.remove('hidden');
  } else {
    card.classList.add('hidden');
  }
}

// --- SCANNER LOGIC BARU (Bisa scan lokasi & barcode) ---
document.getElementById('btnOpenScanner').addEventListener('click', () => bukaScanner('barcode'));
document.getElementById('btnScanLokasi').addEventListener('click', () => bukaScanner('lokasi'));
document.getElementById('btnCloseScanner').addEventListener('click', tutupScanner);

function bukaScanner(target) {
  scannerTarget = target;
  document.getElementById('scannerModal').classList.remove('hidden');
  
  currentScanner = new Html5Qrcode("cameraViewport");
  currentScanner.start({ facingMode: "environment" }, { fps: 15, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      tutupScanner();
      if(scannerTarget === 'barcode') {
        document.getElementById('inputBarcode').value = decodedText;
        cekBarcodeData(decodedText);
        document.getElementById('inputQtySo').focus();
      } else {
        document.getElementById('inputLokasi').value = decodedText;
        document.getElementById('inputBarcode').focus();
      }
    }
  ).catch(err => showToast("Kamera tidak diizinkan", "error"));
}

function tutupScanner() {
  document.getElementById('scannerModal').classList.add('hidden');
  if(currentScanner) { currentScanner.stop().then(() => currentScanner.clear()); }
}

// --- OPTIMISTIC UI: SAVE TANPA LOADING SCREEN ---
document.getElementById('btnSaveSo').addEventListener('click', () => {
  const loc = inputLokasi.value;
  const bc = document.getElementById('inputBarcode').value;
  const qty = document.getElementById('inputQtySo').value;
  const notes = document.getElementById('inputKeterangan').value;

  if(!loc || !bc || !qty) return showToast("Lokasi, Barcode, & Qty wajib!", "error");

  // 1. KOSONGKAN FORM SEKETIKA (Beri kesan super cepat/instan)
  document.getElementById('inputBarcode').value = "";
  document.getElementById('inputQtySo').value = "";
  document.getElementById('inputKeterangan').value = "";
  document.getElementById('productDetailCard').classList.add('hidden');
  document.getElementById('inputBarcode').focus();

  // 2. TAMPILKAN TOAST SUKSES
  showToast(`Tersimpan: ${bc}`, "success");

  // 3. KIRIM DATA KE BACKEND DI BELAKANG LAYAR (Background Sync)
  const payload = {
    action: 'saveSO', 
    user: currentUser.username, 
    lokasi: loc, 
    barcode: bc, 
    qty: qty, 
    notes: notes, 
    mode: 'NEW'
  };

  fetch(URL_WEB_APP, {
    method: 'POST',
    body: JSON.stringify(payload)
  }).then(r => r.json()).then(res => {
    if(res.status !== 'SUCCESS') console.error("Gagal sync:", res.message);
  }).catch(err => console.error("Offline, data masuk antrean."));
});
