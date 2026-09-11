const GAS_API_URL = "https://script.google.com/macros/s/AKfycbylqvDTmNknNiKQ35GGigqDzosSSRMlqRt0RIWG4nIjIhf1bLs8XVwhKWzhfsCtRQQ0AQ/exec"; // Ganti setelah deploy GAS

const app = {
  user: null,
  masterData: [],
  lokasiList: [],
  stockSystemMap: {},
  settings: {},
  currentUPCData: null,
  html5QrCodeScanner: null,
  db: null,

  async init() {
    this.initIndexedDB();
    this.checkNetworkStatus();
    window.addEventListener('online', () => this.onNetworkChange(true));
    window.addEventListener('offline', () => this.onNetworkChange(false));

    this.loadInitialData();
  },

  // INDEXED DB FOR OFFLINE SYNC
  initIndexedDB() {
    const request = indexedDB.open("SOMandiriDB", 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("pendingSO")) {
        db.createObjectStore("pendingSO", { keyPath: "localId", autoIncrement: true });
      }
    };
    request.onsuccess = (e) => { this.db = e.target.result; };
  },

  checkNetworkStatus() {
    this.onNetworkChange(navigator.onLine);
  },

  onNetworkChange(isOnline) {
    const el = document.getElementById("netStatus");
    const txt = document.getElementById("netText");
    if (isOnline) {
      el.className = "net-status online";
      txt.innerText = "Mode Online";
      this.syncOfflineData();
    } else {
      el.className = "net-status offline";
      txt.innerText = "Mode Offline (Data disimpan di HP)";
    }
  },

  // API FETCH HELPER
  async fetchAPI(action, method = "GET", payload = null) {
    this.showLoading(true);
    try {
      let url = `${GAS_API_URL}?action=${action}`;
      let opts = { method: method };
      if (method === "POST" && payload) {
        opts.body = JSON.stringify({ action: action, ...payload });
      }
      const res = await fetch(url, opts);
      const json = await res.json();
      this.showLoading(false);
      return json;
    } catch (e) {
      this.showLoading(false);
      return { status: "offline", message: "Koneksi terputus. Menggunakan data lokal." };
    }
  },

  async loadInitialData() {
    const res = await this.fetchAPI("getInitialData");
    if (res.status === "success") {
      this.masterData = res.master || [];
      this.lokasiList = res.lokasi || [];
      this.stockSystemMap = res.stockSystem || {};
      this.settings = res.settings || {};
      this.renderLokasiSelect();
    }
  },

  // AUTHENTICATION
  async handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById("loginUsername").value;
    const p = document.getElementById("loginPassword").value;

    const res = await this.fetchAPI("login", "POST", { username: u, password: p });
    if (res.status === "success") {
      this.user = res.user;
      document.getElementById("loginScreen").classList.remove("active");
      document.getElementById("dashboardScreen").classList.add("active");
      
      document.getElementById("displayStaffName").innerText = this.user.namaStaff;
      document.getElementById("displayRole").innerText = this.user.role;
      document.getElementById("userInitial").innerText = this.user.namaStaff.charAt(0).toUpperCase();

      if (this.user.role === "ADMIN") {
        document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
      }
    } else {
      alert(res.message);
    }
  },

  togglePassword() {
    const inp = document.getElementById("loginPassword");
    inp.type = inp.type === "password" ? "text" : "password";
  },

  // LOKASI & BARCODE SEARCH
  renderLokasiSelect() {
    const sel = document.getElementById("selectLokasi");
    sel.innerHTML = '<option value="">-- Pilih Lokasi --</option>';
    this.lokasiList.forEach(l => {
      sel.innerHTML += `<option value="${l.idLokasi}">${l.namaLokasi}</option>`;
    });
  },

  searchBarcodeMaster() {
    const code = document.getElementById("inputBarcode").value.trim();
    if (!code) return;

    const item = this.masterData.find(m => 
      m.kodeUPC === code || m.artikelNumber === code || m.partNumber === code
    );

    const card = document.getElementById("productResultCard");
    card.classList.remove("hidden");

    if (item) {
      this.currentUPCData = item;
      document.getElementById("resUPC").innerText = item.kodeUPC;
      document.getElementById("resDeskripsi").innerText = item.deskripsiProduk;
      document.getElementById("resDept").innerText = item.department;
      document.getElementById("resVendor").innerText = item.vendorName;
      
      const qtySys = this.stockSystemMap[item.kodeUPC] || 0;
      document.getElementById("resQtySystem").innerText = qtySys;
    } else {
      // Unregistered Modal Alert
      this.openModal("modalUnregistered");
    }
  },

  proceedUnregistered() {
    const code = document.getElementById("inputBarcode").value.trim();
    this.closeModal("modalUnregistered");
    
    this.currentUPCData = {
      kodeUPC: code, artikelNumber: "-", deskripsiProduk: "UNKNOWN", department: "UNKNOWN", vendorCode: "-", vendorName: "UNKNOWN"
    };
    
    document.getElementById("resUPC").innerText = code;
    document.getElementById("resDeskripsi").innerText = "UNKNOWN (Tidak Terdaftar)";
    document.getElementById("resDept").innerText = "UNKNOWN";
    document.getElementById("resVendor").innerText = "UNKNOWN";
    document.getElementById("resQtySystem").innerText = "0";
  },

  // CAMERA SCANNER ENGINE
  toggleCameraScanner() {
    const wrap = document.getElementById("scannerContainer");
    if (wrap.classList.contains("hidden")) {
      wrap.classList.remove("hidden");
      this.startHtml5Qrcode();
    } else {
      this.stopCameraScanner();
    }
  },

  startHtml5Qrcode() {
    this.html5QrCodeScanner = new Html5Qrcode("reader");
    this.html5QrCodeScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      (decodedText) => {
        document.getElementById("inputBarcode").value = decodedText;
        this.stopCameraScanner();
        this.searchBarcodeMaster();
      }
    );
  },

  stopCameraScanner() {
    if (this.html5QrCodeScanner) {
      this.html5QrCodeScanner.stop().then(() => {
        document.getElementById("scannerContainer").classList.add("hidden");
      });
    }
  },

  // SAVE & OFFLINE ENGINE
  validateAndSaveSO() {
    const idLok = document.getElementById("selectLokasi").value;
    const qty = document.getElementById("inputQtySO").value;
    
    if (!idLok || !this.currentUPCData || !qty) {
      alert("Harap lengkapi Lokasi, Barcode, dan Qty!");
      return;
    }

    // Direct save logic or check duplicate modal
    this.confirmSaveSO("ADD");
  },

  async confirmSaveSO(mode) {
    this.closeModal("modalDuplicate");
    const selLok = document.getElementById("selectLokasi");
    const namaLok = selLok.options[selLok.selectedIndex].text;
    
    const itemData = {
      idLokasi: selLok.value,
      namaLokasi: namaLok,
      qtySO: document.getElementById("inputQtySO").value,
      keterangan: document.getElementById("inputKeterangan").value,
      mode: mode,
      ...this.currentUPCData
    };

    if (navigator.onLine) {
      const res = await this.fetchAPI("saveSO", "POST", { items: [itemData], user: this.user });
      alert(res.message);
    } else {
      this.saveToIndexedDB(itemData);
      alert("Koneksi offline! Data berhasil disimpan di memori HP dan akan otomatis ter-upload saat online.");
    }

    // Reset Form Input tapi Tetap di Lokasi
    document.getElementById("inputBarcode").value = "";
    document.getElementById("inputQtySO").value = "";
    document.getElementById("inputKeterangan").value = "";
    document.getElementById("productResultCard").classList.add("hidden");
  },

  saveToIndexedDB(item) {
    const tx = this.db.transaction("pendingSO", "readwrite");
    tx.objectStore("pendingSO").add(item);
  },

  async syncOfflineData() {
    if (!this.db) return;
    const tx = this.db.transaction("pendingSO", "readonly");
    const store = tx.objectStore("pendingSO");
    const req = store.getAll();

    req.onsuccess = async () => {
      const items = req.result;
      if (items.length > 0) {
        const res = await this.fetchAPI("saveSO", "POST", { items: items, user: this.user });
        if (res.status === "success") {
          const clearTx = this.db.transaction("pendingSO", "readwrite");
          clearTx.objectStore("pendingSO").clear();
          console.log("Offline Data Synced Successfully!");
        }
      }
    };
  },

  // MODAL UTILS
  openModal(id) { document.getElementById(id).classList.add("active"); },
  closeModal(id) { document.getElementById(id).classList.remove("active"); },
  showLoading(val) {
    const el = document.getElementById("loadingOverlay");
    if (val) el.classList.remove("hidden"); else el.classList.add("hidden");
  },
  switchTab(tabId) {
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.querySelectorAll(".tab-item").forEach(t => t.classList.remove("active"));
    document.getElementById(tabId).classList.add("active");
  }
};

window.addEventListener("DOMContentLoaded", () => app.init());
