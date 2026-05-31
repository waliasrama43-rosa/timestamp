# TrustMark - Dokumen Handover

**Tanggal:** 31 Mei 2026  
**Repository:** https://github.com/waliasrama43-rosa/timestamp  
**Branch Aktif:** `fix/gas-blank-page` (latest), `feature/backend-cloud-icons`  
**Platform:** Google Apps Script (GAS) + HtmlService  

---

## 1. Ringkasan Proyek

TrustMark adalah aplikasi web (PWA) untuk memberi **timestamp, lokasi GPS, dan watermark verifikasi** pada foto. Ditujukan untuk dokumentasi lapangan (survei, inspeksi, dll) yang membutuhkan bukti waktu dan lokasi otentik.

### Fitur Utama
- Upload foto dari galeri atau kamera
- Overlay timestamp (tanggal/waktu WIB) + lokasi GPS + alamat
- Peta interaktif (Leaflet + OpenStreetMap) untuk pilih lokasi
- Kode verifikasi unik (VRF) per foto
- Injeksi EXIF metadata (GPS, datetime, device info)
- Logo organisasi kustom
- Sistem pembayaran QRIS (Basic Rp3.000/hari, Pro Rp15.000/bulan)
- Cloud storage ke Google Drive (Pro only)
- PWA - bisa di-install ke home screen

---

## 2. Struktur File

```
timestamp/
├── Code.gs              ← Router utama: doGet(), routing ?page=xxx, icon SVG
├── BackendService.gs    ← Server-side: subscription, payment, Google Drive API
├── index.html           ← Full app (~1725 baris): HTML + CSS + JavaScript
├── manifest.json        ← PWA manifest (icons, theme, display)
├── sw.js                ← Service Worker (cache CDN resources)
├── test-minimal.html    ← Halaman diagnostik untuk test CDN loading
├── icon-192.svg         ← App icon (tidak dipakai, SVG inline di Code.gs)
├── icon-512.svg         ← App icon (tidak dipakai, SVG inline di Code.gs)
└── HANDOVER.md          ← Dokumen ini
```

---

## 3. Dependensi Eksternal (CDN)

| Library | Versi | Fungsi |
|---------|-------|--------|
| Leaflet | 1.9.4 | Peta interaktif (unpkg.com) |
| piexifjs | 1.0.6 | Baca/tulis EXIF metadata JPEG (jsdelivr) |
| QRCode | 1.5.3 | Generate QR code QRIS (jsdelivr) |
| Material Icons | - | Icon UI (Google Fonts) |

---

## 4. Arsitektur Backend (GAS)

### Code.gs - Router
```
doGet(e) → routing berdasarkan ?page= parameter:
  - (kosong) → index.html (app utama)
  - manifest  → manifest.json (Content-Type: JSON)
  - sw        → sw.js (Content-Type: JavaScript)
  - icon-192  → SVG icon inline
  - icon-512  → SVG icon inline
  - api       → handleApiRequest (JSON API)
  - test      → test-minimal.html (diagnostik)
```

### BackendService.gs - Business Logic
```
Subscription:
  - checkSubscription()        → cek status langganan user
  - getSubscriptionStatus()    → quick status check
  - activateSubscription()     → aktifkan paket (dengan validasi)
  - validatePayment()          → validasi pembayaran

Cloud Storage (Google Drive):
  - getTrustMarkFolder()       → get/create folder "TrustMark" di Drive
  - savePhotoToDrive()         → simpan foto (Pro only)
  - getPhotoHistory()          → list foto tersimpan (paginated)
  - deletePhotoFromDrive()     → hapus foto dari Drive
  - getStorageInfo()           → hitung jumlah foto
```

### Storage
- **PropertiesService.getUserProperties()** → subscription data per user
- **Google Drive** → foto tersimpan (folder "TrustMark")
- **localStorage (client)** → cache subscription, logo, lokasi favorit, daily count

---

## 5. Status Saat Ini

### Yang BERFUNGSI (Desktop Browser)
- [x] Halaman tampil di desktop Chrome/Firefox
- [x] Upload foto & preview canvas
- [x] Overlay timestamp pada foto
- [x] EXIF injection
- [x] Leaflet map (pilih lokasi, search, GPS)
- [x] Download foto ber-timestamp
- [x] QRIS payment flow
- [x] `google.script.run` communication
- [x] Subscription management (server-side)
- [x] Google Drive cloud storage (Pro)
- [x] Test diagnostic page (?page=test)

### Yang TIDAK BERFUNGSI (Mobile)
- [ ] **App blank putih di mobile** ← MASALAH UTAMA
- [ ] Service Worker tidak bisa register (GAS sandbox)
- [ ] PWA install prompt tidak muncul

---

## 6. Analisis Masalah Mobile (Root Cause)

### Masalah Inti: GAS HtmlService Sandbox

Google Apps Script menyajikan HTML melalui **sandboxed iframe** dengan domain:
```
https://n-xxxxxxxxx-script.googleusercontent.com/...
```

Sandbox ini memiliki batasan ketat:

1. **Content Security Policy (CSP)** - membatasi script-src
2. **Iframe sandbox attributes** - `allow-scripts` ada, tapi `allow-same-origin` terbatas
3. **Service Worker DIBLOKIR** - SW hanya bisa register di same-origin, tapi GAS iframe berbeda origin
4. **Beberapa mobile browser** (Samsung Internet, UC Browser, Opera Mini) lebih ketat terhadap iframe CSP

### Mengapa Desktop Berfungsi tapi Mobile Tidak

| Aspek | Desktop Chrome | Mobile Chrome/Samsung |
|-------|---------------|----------------------|
| CSP enforcement | Lebih permisif | Lebih ketat |
| CDN script loading | Biasanya OK | Kadang diblokir |
| Memory untuk ~1725 baris JS | OK | Bisa timeout |
| Iframe rendering | Cepat | Lambat/blank |

### Fix yang Sudah Dicoba (Tidak Berhasil)
1. ✅ Tambah `<base target="_top">` — diperlukan tapi tidak cukup
2. ✅ Ganti ke `createTemplateFromFile().evaluate()` — lebih baik tapi tetap blank
3. ✅ Fix escaped `<\/script>` tags — benar tapi bukan root cause
4. ❌ CDN scripts tetap tidak load di beberapa mobile browser

---

## 7. Alternatif Pendekatan (Rekomendasi)

### Opsi A: Static Hosting + GAS API Only (DIREKOMENDASIKAN)

**Konsep:** Host HTML/CSS/JS di platform lain, gunakan GAS hanya sebagai backend API.

```
[User Browser] → [GitHub Pages / Vercel / Netlify]
                         ↓ (fetch API)
                  [GAS Web App as API endpoint]
                         ↓
                  [Google Drive / Properties]
```

**Keunggulan:**
- Tidak ada iframe sandbox → semua CDN pasti load
- Service Worker bisa berfungsi → PWA install OK
- Mobile compatible 100%
- Lebih cepat (no GAS rendering overhead)

**Platform hosting gratis:**
- GitHub Pages (github.com)
- Vercel (vercel.com)
- Netlify (netlify.com)
- Cloudflare Pages (pages.cloudflare.com)

**Perubahan yang diperlukan:**
- Pindahkan `index.html`, `sw.js`, `manifest.json` ke hosting statis
- GAS tetap jadi backend, tapi serve JSON via `doGet(?page=api&action=...)` dan `doPost()`
- Ganti semua `google.script.run` → `fetch()` ke URL GAS
- Tambah CORS headers di GAS response

---

### Opsi B: Inline Semua Library ke HTML (Workaround GAS)

**Konsep:** Download semua CDN library dan inline-kan langsung ke `index.html`.

```html
<!-- Alih-alih: -->
<script src="https://cdn.jsdelivr.net/npm/piexifjs@1.0.6/piexif.js"></script>

<!-- Menjadi: -->
<script>
  // === PIEXIFJS v1.0.6 (inline) ===
  (function(){... seluruh isi piexif.js ...})();
</script>
```

**Keunggulan:**
- Tidak perlu CDN (tidak terblokir CSP)
- Tetap di GAS (tidak perlu hosting lain)

**Kelemahan:**
- File `index.html` menjadi SANGAT besar (~500KB+)
- GAS ada limit ukuran file HTML
- Leaflet.js saja ~170KB minified
- Update library jadi manual
- Tetap tidak bisa Service Worker

---

### Opsi C: GAS Templating dengan `<?!= include() ?>`

**Konsep:** Pecah file HTML menjadi beberapa file kecil, gabungkan via GAS template.

```
index.html          ← template utama dengan <?!= include('styles') ?>
styles.html         ← CSS only
app-scripts.html    ← main JS
lib-leaflet.html    ← inline leaflet.js
lib-piexif.html     ← inline piexif.js
lib-qrcode.html     ← inline qrcode.js
```

**Code.gs:**
```javascript
function doGet(e) {
  var template = HtmlService.createTemplateFromFile('index');
  return template.evaluate()...
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
```

**index.html:**
```html
<head>
  <base target="_top">
  <style><?!= include('styles') ?></style>
</head>
<body>
  ...
  <script><?!= include('lib-piexif') ?></script>
  <script><?!= include('lib-qrcode') ?></script>
  <script><?!= include('app-scripts') ?></script>
</body>
```

**Keunggulan:**
- Tidak perlu CDN → tidak diblokir CSP
- Modular (file terpisah)
- Masih dalam ekosistem GAS

**Kelemahan:**
- Ukuran total tetap besar
- GAS serve time lebih lama
- Service Worker tetap tidak bisa
- Limit GAS: max output ~2MB (biasanya cukup)

---

### Opsi D: Android WebView App (APK)

**Konsep:** Bungkus web app dalam native Android app menggunakan WebView.

**Tools:** Android Studio, Capacitor, atau PWABuilder

**Keunggulan:**
- Full control atas WebView settings
- Tidak ada iframe sandbox
- Bisa akses native features (kamera, GPS lebih baik)

**Kelemahan:**
- Perlu publish ke Play Store atau sideload APK
- Maintenance Android app terpisah
- Perlu Android development knowledge

---

## 8. Rekomendasi Prioritas

| Prioritas | Opsi | Effort | Hasil |
|-----------|------|--------|-------|
| 1 (Best) | **A: Static Hosting + GAS API** | Medium | 100% mobile compatible, PWA OK |
| 2 | **C: GAS Template + Inline Libs** | Medium | Mungkin work, no PWA |
| 3 | **B: Inline All to HTML** | Low | Risky (file size), no PWA |
| 4 | **D: Native App** | High | Best UX, most work |

---

## 9. Migrasi ke Opsi A (Step-by-step)

Jika memilih Opsi A (Static Hosting), berikut langkahnya:

### 9.1 Persiapan GAS Backend

Ubah `Code.gs` agar menerima POST request dan return JSON:

```javascript
function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var action = data.action;
  var result;
  
  try {
    switch(action) {
      case 'activateSubscription':
        result = activateSubscription(data.tier, data.amount);
        break;
      case 'checkSubscription':
        result = checkSubscription();
        break;
      case 'savePhoto':
        result = savePhotoToDrive(data.base64, data.filename, data.metadata);
        break;
      // ... dst
    }
    return ContentService.createTextOutput(JSON.stringify({success:true, data:result}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({success:false, error:err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

### 9.2 Frontend: Ganti google.script.run → fetch

```javascript
// LAMA (GAS only):
google.script.run
  .withSuccessHandler(callback)
  .checkSubscription();

// BARU (fetch ke GAS Web App URL):
var GAS_URL = 'https://script.google.com/macros/s/DEPLOY_ID/exec';

fetch(GAS_URL, {
  method: 'POST',
  body: JSON.stringify({ action: 'checkSubscription' })
})
.then(r => r.json())
.then(data => callback(data.data))
.catch(err => console.error(err));
```

### 9.3 Deploy Frontend ke GitHub Pages

```bash
# Buat branch gh-pages
git checkout -b gh-pages

# Pindahkan file frontend ke root
# index.html, sw.js, manifest.json, icons

git push origin gh-pages
```

Aktifkan di: Settings → Pages → Source: gh-pages branch

URL: `https://waliasrama43-rosa.github.io/timestamp/`

---

## 10. Data Pembayaran QRIS

```
Merchant: NASI JAGUNG PUSPO
Bank: Bank Muamalat
Kota: PASURUAN
Kode Pos: 67176
```

QRIS Static payload tersimpan di variabel `QRIS_STATIC` dalam `index.html`.
Dynamic amount di-generate client-side dengan menambahkan tag 54 (amount) dan recalculate CRC.

---

## 11. Keamanan

| Aspek | Status | Catatan |
|-------|--------|---------|
| Payment verification | Client-side only | Tidak ada server-side payment gateway |
| Subscription storage | PropertiesService (server) + localStorage (client) | Server = source of truth |
| CSRF protection | Via google.script.run built-in | State-mutating ops only via script.run |
| Drive file deletion | Verified folder ownership | File harus di folder TrustMark |
| Logo upload | Max 500KB limit | Prevent localStorage overflow |
| XSS prevention | Safe DOM APIs for cloud photos | No innerHTML with user data |

---

## 12. Credential & Config

| Item | Lokasi |
|------|--------|
| GAS Project | Google Apps Script Editor (akun pemilik) |
| Google Drive folder | Auto-created "TrustMark" di root Drive user |
| QRIS merchant data | Hardcoded di index.html (var QRIS_STATIC) |
| Subscription data | PropertiesService.getUserProperties() |
| Icons | Inline SVG di Code.gs |

---

## 13. Fitur yang Belum Selesai (Backlog)

| # | Fitur | Status | Catatan |
|---|-------|--------|---------|
| 1 | Map marker on downloaded photo | Not started | Perlu render static map pin di canvas |
| 2 | Logo size slider | Not started | Big/small control |
| 3 | Logo drag-and-drop positioning | Not started | Free placement on photo |
| 4 | Verification code 32-digit | Not started | Alphanumeric, vertical center-right |
| 5 | Remove white overlay background | Not started | Text marks directly on photo |
| 6 | Font size control | Not started | User customization |
| 7 | Logo size control | Not started | User customization |
| 8 | Server-side payment verification | Not started | Webhook integration needed |

---

## 14. Cara Test Lokal

Untuk development tanpa GAS:
1. Buka `index.html` langsung di browser (file://)
2. Semua fitur client-side berfungsi
3. `google.script.run` akan di-skip (fallback ke localStorage)
4. Payment tetap bisa "diaktifkan" secara lokal

---

## 15. Kontak & Referensi

- **Repository:** https://github.com/waliasrama43-rosa/timestamp
- **GAS Docs:** https://developers.google.com/apps-script/guides/html
- **Leaflet:** https://leafletjs.com/reference.html
- **Piexifjs:** https://github.com/hMatoba/piexifjs
- **QRIS EMVCo Spec:** EMV QR Code Specification for Payment Systems

---

*Dokumen ini dibuat sebagai referensi handover untuk melanjutkan development TrustMark dengan pendekatan alternatif yang kompatibel dengan mobile.*
