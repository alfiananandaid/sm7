// OBFUSCATION URL API GAS (Base64) - Ganti YWFh dengan base64 URL Web App Anda
// Contoh: btoa("[https://script.google.com/macros/s/AKfy.../exec](https://script.google.com/macros/s/AKfy.../exec)")
const ENC_API = "https://script.google.com/macros/s/AKfycbzI8zxVGcDTpS5wvW0Y3IkQa5UQyj-Gllp7KIQtFOeEJQ7LhMXvpfHXm7UYn6lEW142Fw/exec"; // MASUKKAN BASE64 DISINI
const getApiUrl = () => atob(ENC_API);

let html5QrcodeScanner;
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Cek Session (Auto Logout 12 Jam)
    const session = await db.userSession.toArray();
    if (session.length > 0 && session[0].expireTime > Date.now()) {
        currentUser = session[0];
        document.getElementById('staffName').innerText = currentUser.username;
        if(currentUser.role === 'Admin') document.getElementById('adminPanel').classList.remove('hidden');
        navigate('dashboard');
    }

    // Toggle Password Visibility
    const togglePass = document.getElementById('togglePassword');
    const passInput = document.getElementById('password');
    togglePass.addEventListener('click', () => {
        const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passInput.setAttribute('type', type);
    });

    // Login Handler
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading(true);
        const user = document.getElementById('username').value;
        const pass = passInput.value;
        
        try {
            const res = await fetch(getApiUrl(), {
                method: 'POST',
                body: JSON.stringify({ action: 'login', username: user, password: pass })
            }).then(r => r.json());
            
            if(res.status === 'success') {
                // Set 12 hours expiry
                const expire = Date.now() + (12 * 60 * 60 * 1000); 
                await db.userSession.clear();
                await db.userSession.add({ ...res.data, expireTime: expire });
                
                currentUser = res.data;
                document.getElementById('staffName').innerText = currentUser.username;
                if(currentUser.role === 'Admin') document.getElementById('adminPanel').classList.remove('hidden');
                
                passInput.value = '';
                navigate('dashboard');
            } else {
                alert(res.message);
            }
        } catch(e) {
            alert("Koneksi gagal. Cek jaringan.");
        }
        showLoading(false);
    });

    // Logout
    document.getElementById('btnLogout').addEventListener('click', async () => {
        await db.userSession.clear();
        currentUser = null;
        navigate('login');
    });

    // PWA Install Prompt
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        document.getElementById('btnInstall').classList.remove('hidden');
    });
    document.getElementById('btnInstall').addEventListener('click', async () => {
        if(deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                document.getElementById('btnInstall').classList.add('hidden');
            }
            deferredPrompt = null;
        }
    });

    // Barcode Scanner Init
    document.getElementById('btnScan').addEventListener('click', () => {
        if(html5QrcodeScanner) {
            html5QrcodeScanner.stop();
        }
        html5QrcodeScanner = new Html5Qrcode("reader");
        html5QrcodeScanner.start(
            { facingMode: "environment" }, 
            { fps: 10, qrbox: {width: 250, height: 150} },
            onScanSuccess, onScanFailure
        );
    });

    // Background Sync Offline Data (Simple Polling for demo, better with ServiceWorker Sync)
    setInterval(syncData, 60000); 
});

async function onScanSuccess(decodedText, decodedResult) {
    html5QrcodeScanner.stop();
    document.getElementById('manualBarcode').value = decodedText;
    showLoading(true);
    
    try {
        const res = await fetch(getApiUrl(), {
            method: 'POST',
            body: JSON.stringify({ action: 'scanBarcode', barcode: decodedText })
        }).then(r => r.json());
        
        document.getElementById('productInfo').classList.remove('hidden');
        if(res.status === 'success') {
            document.getElementById('resDesc').innerText = res.data.desc;
            document.getElementById('resUpc').innerText = res.data.upc;
            document.getElementById('resDept').innerText = res.data.dept;
            document.getElementById('resQtySys').innerText = res.data.qtySys;
        } else {
            // Data Unknown
            if(confirm("Data tidak terdaftar di sistem. Tetap lanjutkan sebagai Unknown?")) {
                document.getElementById('resDesc').innerText = "UNKNOWN ITEM";
                document.getElementById('resUpc').innerText = decodedText;
                document.getElementById('resDept').innerText = "-";
                document.getElementById('resQtySys').innerText = "0";
            } else {
                document.getElementById('productInfo').classList.add('hidden');
            }
        }
    } catch(err) {
        // Mode Offline
        alert("Mode Offline: Mengambil dari cache atau simpan sebagai draft.");
        document.getElementById('resDesc').innerText = "OFFLINE ITEM";
        document.getElementById('resUpc').innerText = decodedText;
    }
    showLoading(false);
}

function onScanFailure(error) { /* Ignore background scan errors */ }

document.getElementById('btnSaveSO').addEventListener('click', async () => {
    const lokasi = document.getElementById('soLocation').value;
    if(!lokasi) return alert("Set lokasi terlebih dahulu!");
    
    const upc = document.getElementById('resUpc').innerText;
    const qty = document.getElementById('inputQty').value;
    const ket = document.getElementById('inputKet').value;
    const desc = document.getElementById('resDesc').innerText;
    
    if(!qty) return alert("Qty harus diisi");
    
    const data = {
        id: 'SO-' + Date.now(),
        upc, desc, lokasi, qty, ket,
        timestamp: new Date().toISOString()
    };
    
    // Cek Duplikasi (Lokal)
    const exists = await db.offlineSO.where({upc: upc, lokasi: lokasi}).toArray();
    if(exists.length > 0) {
        const action = prompt("Data sudah ada di lokasi ini.\\nKetik 'R' untuk Replace, 'A' untuk Add.");
        if(action === 'R' || action === 'r') {
            await db.offlineSO.update(exists[0].id, {qty: qty, ket: ket});
        } else if(action === 'A' || action === 'a') {
            await db.offlineSO.update(exists[0].id, {qty: Number(exists[0].qty) + Number(qty)});
        } else {
            return; // Cancel
        }
    } else {
        await db.offlineSO.add(data);
    }
    
    alert("Tersimpan di perangkat.");
    document.getElementById('inputQty').value = '';
    document.getElementById('productInfo').classList.add('hidden');
    syncData(); // Trigger upload
});

async function syncData() {
    if(!navigator.onLine) return;
    const offlineData = await db.offlineSO.toArray();
    if(offlineData.length === 0) return;
    
    try {
        const res = await fetch(getApiUrl(), {
            method: 'POST',
            body: JSON.stringify({ action: 'syncOffline', payload: offlineData, user: currentUser.username })
        }).then(r => r.json());
        
        if(res.status === 'success') {
            await db.offlineSO.clear(); // Bersihkan yg berhasil sync
        }
    } catch(e) {
        console.log("Sync tertunda, koneksi tidak stabil.");
    }
}

// Navigasi View
function navigate(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    window.scrollTo(0,0);
}

function showLoading(show) {
    const el = document.getElementById('loadingOverlay');
    if(show) el.classList.remove('hidden');
    else el.classList.add('hidden');
}
