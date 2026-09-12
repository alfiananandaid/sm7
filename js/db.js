// Konfigurasi IndexedDB menggunakan Dexie.js
const db = new Dexie("StockOpnameDB");
db.version(1).stores({
    userSession: 'id, username, role, token, expireTime',
    offlineSO: 'id, upc, desc, lokasi, qty, ket, timestamp',
    locationCache: 'id, name'
});
