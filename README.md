# 🎬 SCA MOTION GRAPHICS — Technical Architecture & Deep Research Documentation

> **SCA MOTION GRAPHICS** is an autonomous, client-side, browser-native AI motion video workstation. It transforms raw talking-head videos, long podcasts, or product photos into retention-optimized short-form videos (TikTok, Reels, Shorts) using Google Gemini AI, Google MediaPipe Computer Vision, Canvas 2D multi-pass rendering, and WebCodecs hardware encoding.

---

## 📑 Daftar Isi
1. [Ringkasan Eksekutif & Karakteristik Utama](#1-ringkasan-eksekutif--karakteristik-utama)
2. [Arsitektur Sistem (High-Level Architecture)](#2-arsitektur-sistem-high-level-architecture)
3. [Manajemen State & Penyimpanan Data](#3-manajemen-state--penyimpanan-data)
4. [Pipeline Google Gemini AI & Multi-Modal Routing](#4-pipeline-google-gemini-ai--multi-modal-routing)
5. [Mesin Grafis Canvas 2D & Sandwich Cutout Layer](#5-mesin-grafis-canvas-2d--sandwich-cutout-layer)
6. [Sistem Tipografi Kinetik & 18 Preset Gaya](#6-sistem-tipografi-kinetik--18-preset-gaya)
7. [Mesin Audio: 16kHz WAV, RMS Envelope & BGM Ducking](#7-mesin-audio-16khz-wav-rms-envelope--bgm-ducking)
8. [Tiga Mode Operasi Utama](#8-tiga-mode-operasi-utama)
   - [Mode 1: Video Ngomong (Talking-Head)](#mode-1-video-ngomong-talking-head)
   - [Mode 2: Video Produk (E-Commerce Showcase)](#mode-2-video-produk-e-commerce-showcase)
   - [Mode 3: Clipper Studio (Podcast & Live Cutter)](#mode-3-clipper-studio-podcast--live-cutter)
9. [Pipeline Rendering & Ekspor Video (WebCodecs + MediaBunny)](#9-pipeline-rendering--ekspor-video-webcodecs--mediabunny)
10. [Panduan Menjalankan Localhost Full Dev](#10-panduan-menjalankan-localhost-full-dev)

---

## 1. Ringkasan Eksekutif & Karakteristik Utama

Auto Motion dikemas sebagai **single-page monolithic web application (1.8 MB)** tanpa bundler runtime wajib. Seluruh logika berjalan langsung di browser klien (*client-side execution*) dengan memanfaatkan API web modern:
- **Zero Heavy Backend**: Backend hanya bertindak sebagai static server / reverse proxy. Seluruh pemrosesan video, segmentasi orang, transkripsi kata per kata, dan komposit canvas dilakukan langsung di mesin lokal pengguna.
- **Multi-Modal AI**: Mengintegrasikan model Gemini Flash/Pro untuk transkripsi audio kata per kata, copywriter iklan, perancangan layout motion graphics, Gemini Audio TTS native, dan Imagen 3/4 untuk B-roll visual.
- **Hardware-Accelerated Encoding**: Menggunakan WebCodecs API (`VideoEncoder` + `AudioEncoder`) dengan muxer `mediabunny@1.59.1` untuk mengekspor MP4/WebM secara instan tanpa transcoding cloud berbayar.
- **Sandwich Person Cutout**: Memisahkan pembicara dari latar belakang via Google MediaPipe sehingga caption dan motion graphic dapat diselipkan di belakang kepala pembicara secara sinematik (*depth layering*).

---

## 2. Arsitektur Sistem (High-Level Architecture)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   AUTO MOTION CLIENT                                   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [UI Layer]                                                                            │
│  - Landing View (Mode Switcher, Presets, Settings, File Drop)                          │
│  - Studio Editor (Timeline, Preview Canvas, Keyframe Inspector, Layer Panels)          │
│  - Clipper Studio (Segment List, Virality Scorer, Moment Cutter)                       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [Core State Engine: Ut & jj]                                                          │
│  - Ut.words / Ut.chunks / Ut.segments / Ut.events / Ut.face / Ut.env                   │
│  - IndexedDB ('automotion:media', 'automotion:drafts') + LocalStorage ('automotion:*') │
├─────────────────────────────────────────┬──────────────────────────────────────────────┤
│  [Audio & AI Pipeline]                  │  [Vision & Canvas Engine]                    │
│  - AudioContext decodeAudioData         │  - MediaPipe Tasks Vision (Selfie Segmenter) │
│  - 16-bit Mono 16kHz WAV generator      │  - Interactive Magic Touch Segmenter         │
│  - 100Hz RMS Envelope Follower (Ut.env) │  - Canvas 2D Multi-pass Compositor           │
│  - Gemini Flash Speech-to-Text          │  - Kinetic Typography & Tiered Captions      │
│  - Gemini Art Director (Motion Planner) │  - 19+ Shaders & Transition Functions (co)   │
│  - Gemini Native Audio (Prebuilt Voice) │  - Halftone / CRT Scanlines / 35mm Grain     │
│  - Google Imagen 3/4 (B-Roll Generator) │  - Audio-Reactive Camera Zooms (Ut.faceFast) │
├─────────────────────────────────────────┴──────────────────────────────────────────────┤
│  [Export Engine]                                                                       │
│  - Realtime Canvas Frame Capturer -> WebCodecs VideoEncoder + AudioEncoder            │
│  - MediaBunny v1.59.1 Fast In-Browser MP4 / WebM Muxer                                 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Manajemen State & Penyimpanan Data

### 3.1. Objek State Utama (`Ut`)
Objek `Ut` adalah *single source of truth* untuk proyek aktif:
- `Ut.file`, `Ut.fileName`, `Ut.duration`, `Ut.srcW`, `Ut.srcH`: Metadata berkas sumber.
- `Ut.audio`: Buffer audio yang telah didekode (`AudioBuffer`).
- `Ut.env`: Kurva RMS energi audio 100Hz (Float32Array) untuk sinkronisasi ketukan bicara.
- `Ut.words`: Daftar kata dengan timestamp presisi desimal: `[{ w: "halo", s: 0.12, e: 0.45 }]`.
- `Ut.chunks`: Frasa atau kalimat terpotong rapi berdasarkan jeda nafas pembicara.
- `Ut.events`: Daftar event visual, kartu sorotan, animasi perbandingan, sticker, dan efek b-roll.
- `Ut.face`, `Ut.faceFast`, `Ut.faceSlow`: Koordinat deteksi wajah untuk auto-framing dan kamera zoom.
- `Ut.style`: Konfigurasi preset gaya aktif, warna aksen, font lead/punch, tone, transisi, dan filter.
- `Ut.settings`: Berisi `apiKey` (Gemini API key pengembang) dan `model` preferensi.

### 3.2. Objek Clipper (`jj`)
Digunakan secara eksklusif pada **Mode Clipper**:
- `jj.segs`: Segmen transkrip video panjang.
- `jj.chunks`: Potongan audio/video panjang berdurasi 30–60 detik.
- `jj.moments`: Daftar momen viral yang diekstrak AI (skor virality, timestamp mulai/selesai, judul hook).

### 3.3. Layer Persistensi
1. **`localStorage` via wrapper `wt`**: Menyimpan preferensi pengguna seperti `automotion:key`, `automotion:model`, `automotion:devMode`, `automotion:templates`, `automotion:optCut`.
2. **`IndexedDB`**:
   - `automotion:media`: Menyimpan cache frame video, thumbnail b-roll, audio WAV, dan analisis klip panjang.
   - `automotion:drafts`: Menyimpan riwayat proyek yang belum diekspor.

---

## 4. Pipeline Google Gemini AI & Multi-Modal Routing

Fungsi inti `Er(model, method, body, signal)` dan `Br(config)` menangani seluruh interaksi AI dengan mekanisme pertahanan tinggi (*fault-tolerant*):

### 4.1. Resilience & Fallback Chain
Jika sebuah model Gemini mengalami rate-limit (429), busy (503), atau kuota habis, Auto Motion otomatis beralih (*fallback*) secara berurutan ke model berikutnya:
1. `gemini-3-flash-preview`
2. `gemini-3.8-flash`
3. `gemini-3.6-flash`
4. `gemini-3.5-flash`
5. `gemini-flash-latest`
6. `gemini-2.5-flash`
7. `gemini-3.5-flash-lite`

### 4.2. Transkripsi Audio Kata-per-Kata
Audio video diekstrak menjadi 16-bit 16kHz mono WAV base64, lalu dikirim ke Gemini dengan instruksi:
```text
Transkripsikan ucapan dalam audio ini KATA PER KATA, persis seperti diucapkan
(pertahankan bahasa gaul, campuran Inggris, dan singkatan).
Untuk setiap kata isi:
- w: kata (tanda baca menempel pada kata, mis. "gitu," atau "kan?")
- s: detik mulai kata diucapkan (2 desimal, dihitung dari awal audio)
- e: detik selesai kata diucapkan
```

### 4.3. Art Director Motion Planning
Setelah transkrip diperoleh, Gemini bertindak sebagai **Art Director Motion Graphics** (`Hr`) untuk merancang:
- Kata kunci bernilai tinggi (*punch words*) yang harus diperbesar dengan warna mencolok.
- Penempatan kartu penjelasan (komparasi kiri-kanan, statistik/grafik, chat bubble, notifikasi).
- Pergerakan kamera dinamis (zoom-in saat pembicara mengucapkan kalimat krusial).
- Prompt pembuatan gambar untuk B-roll visual jika footage asli minim.

### 4.4. Gemini Native Speech Synthesis (TTS)
Pada Mode Video Produk tanpa orang, Auto Motion menggunakan fitur modalitas audio Gemini:
```javascript
generationConfig: {
  responseModalities: ["AUDIO"],
  speechConfig: {
    voiceConfig: {
      prebuiltVoiceConfig: { voiceName: voice } // Kore, Leda, Puck, Charon, Fenrir
    }
  }
}
```

### 4.5. Google Imagen 3/4 Integration
Otomatis menghasilkan gambar pendukung (B-roll) beresolusi tinggi rasio 9:16 atau 1:1 via `imagen-4.0-generate-001` / `imagen-3.0-generate-002` sesuai konteks narasi.

---

## 5. Mesin Grafis Canvas 2D & Sandwich Cutout Layer

Salah satu inovasi teknis terpenting Auto Motion adalah **Sandwich Cutout Layering**:

```
[Layer 1: Background]    -> Latar Belakang / Video Asli / Chapter Backdrop
[Layer 2: Ambient FX]    -> Partikel, 3D Grid, Halftone Dot Matrix
[Layer 3: Captions & FX] -> Teks Punch Word Raksasa, Judul Hook, Kartu Grafis
═══════════════════════════════════════════════════════════════════════════════
[Layer 4: Cutout Mask]   -> Hasil Segmentasi Orang (MediaPipe Tasks Vision)
═══════════════════════════════════════════════════════════════════════════════
[Layer 5: Foreground FX] -> B-Roll Popups, Garis Pembatas, Vignette, CRT Grain
```

Dengan hierarki ini, teks kata kunci raksasa dapat berada **tepat di belakang badan pembicara** tanpa menutupi wajahnya, menghasilkan kualitas video kelas agensi profesional.

### MediaPipe Tasks Vision (`@mediapipe/tasks-vision@1.0.1`):
1. Mengunduh model `selfie_segmenter.tflite` (float16).
2. Mengekstrak mask biner/alpha per frame.
3. Mengaplikasikan `destination-in` dan blur tepi halus (1–2px) agar batas kepala tampak natural.
4. Fitur **Magic Touch Interactive Segmenter** (`magic_touch.tflite`): Memungkinkan pengguna mengklik titik pada foto produk atau orang untuk menghapus latar belakang secara presisi.

---

## 6. Sistem Tipografi Kinetik & 18 Preset Gaya

### 6.1. 18 Preset Gaya Visual
1. **Glow Editorial (`glowpaper`)**: Teks ketik halus + kata kunci kuning menyala acak, halftone dot di belakang orang, light leaks.
2. **Glass Oranye (`glass`)**: Kartu kaca gelap transparan, kata kunci oranye menyala.
3. **Hype Doodle (`hype`)**: Font tebal besar, doodle bergetar, energik untuk tutorial kilat.
4. **Clean Biru (`clean`)**: Minimalis profesional modern, kata kunci biru elektrik.
5. **Karaoke Kuning (`karaoke`)**: Subtitle karaoke klasik kata aktif kuning.
6. **Neo Brutal (`brutal`)**: Kotak tebal bergaris hitam tegas, drop shadow keras.
7. **Editorial Serif (`editorial`)**: Font Playfair Display, krem hangat, 35mm film grain.
8. **Neon Cyber (`neon`)**: Font Chakra Petch + JetBrains Mono, efek scanlines CRT, HUD grid.
9. **Scrapbook (`paper`)**: Kertas tekstur, selotip, tulisan tangan Permanent Marker.
10. **Aurora Soft (`aurora`)**: Gradasi ungu-pink lembut, font Outfit.
11. **Swiss Minimal (`mono`)**: Hitam-putih tegas dengan aksen merah minimalis.
12. **Y2K Pop (`y2k`)**: Nuansa pink-cyan retro 2000-an, font Bungee.
13. **Bold Statement (`bold`)**: Font Bebas Neue raksasa, merah tegas.
14. **Blue Glow (`glow`)**: Teks miring menyala dengan awan kata dinamis.
15. **Kuning Tegas (`yellow`)**: Huruf kapital tebal tumpuk dengan header badge.
16. **Noir B&W (`noir`)**: Motion grafis monokrom dengan video pembicara tetap full-color.
17. **Silver Chrome (`silver`)**: Refleksi logam chrome berkilau di atas video.
18. **Neon Sinematik (`neon30`)**: Mode paling mutakhir: teks neon berkedip lalu berdenyut, sandwich text di belakang kepala, 3D tunnel grid, dan split screen.

### 6.2. 17 Animasi Teks Kinetik
- `pop`, `slide`, `blur`, `zoom`, `bounce`, `typewriter`, `wave`, `scramble`, `glitch`, `reveal`, `mask`, `split`, `stamp`, `track`, `flip`, `marker`, `custom (AI)`.

---

## 7. Mesin Audio: 16kHz WAV, RMS Envelope & BGM Ducking

1. **WAV Synthesizer In-Memory**: Mengonversi `AudioBuffer` kanal tunggal menjadi 16-bit PCM Linear 16.000 Hz dengan header RIFF 44-byte yang valid tanpa ketergantungan ffmpeg.
2. **RMS Envelope Analyzer (`Ut.env`)**:
   - Menghitung energi suara dengan resolusi 100 sampel per detik (interval 10ms).
   - Digunakan untuk:
     - **Auto-Ducking**: Menurunkan volume backsound secara otomatis hingga 70% saat pembicara bersuara, dan menaikkannya saat jeda nafas.
     - **Beat Shaking**: Memicu zoom punch kamera saat kata penting diucapkan dengan desibel tinggi.
3. **Procedural Web Audio Synthesizer**: Menghasilkan efek suara foley (whoosh transisi, pop notifikasi, impact bass) secara algoritmik menggunakan OscillatorNode dan GainNode tanpa perlu mengunduh file MP3 eksternal.

---

## 8. Tiga Mode Operasi Utama

### Mode 1: Video Ngomong (Talking-Head)
- Ditujukan untuk video edukasi, podcast, ulasan produk, atau tutorial di depan kamera.
- Alur: Upload Video -> AI STT -> Transkrip Kata -> AI Art Director menyusun punch words & kartu -> MediaPipe memotong latar -> Render Video.

### Mode 2: Video Produk (E-Commerce Showcase)
- Ditujukan untuk UMKM / affiliate marketing yang hanya memiliki foto atau video produk (tanpa pembicara).
- Input: Nama brand, judul, deskripsi, fitur, harga promo, CTA, durasi, dan foto produk.
- Alur: AI Copywriter merancang naskah -> Gemini Audio membacakan narasi -> Produk di-cutout -> Canvas menampilkan 3D show-case, badge diskon, dan kinetic headline -> Render Video.

### Mode 3: Clipper Studio (Podcast & Live Cutter)
- Ditujukan untuk memotong podcast atau live streaming berdurasi 10–60 menit menjadi klip pendek viral (Reels/Shorts).
- Alur: Video dipotong per segmen audio -> AI menganalisis transkrip -> Menilai hook retention & kelucuan/kontroversi -> Memilih 3–10 klip terbaik -> Masuk ke editor untuk dipoles.

---

## 9. Pipeline Rendering & Ekspor Video (WebCodecs + MediaBunny)

1. **Sinkronisasi Frame-Presisi**: Loop rendering tidak bergantung pada kecepatan layar (*non-realtime stepping*). Setiap frame digambar secara deterministik pada interval `1 / FPS` (biasanya 30 atau 60 FPS).
2. **WebCodecs Acceleration**: Menggunakan native browser `VideoEncoder` (codec `avc1.64002a` atau `vp8`/`vp9`) dan `AudioEncoder` (`mp4a.40.2` atau `opus`).
3. **MediaBunny Muxer**: Memaketkan bitstream video dan audio ter-encode langsung menjadi berkas kontainer MP4/WebM yang dapat langsung diputar di perangkat apa pun tanpa proses re-encoding tambahan.
4. **Fallback MediaRecorder**: Jika browser klien tidak mendukung WebCodecs, sistem otomatis beralih ke `MediaRecorder(canvas.captureStream())`.

---

## 10. Panduan Menjalankan Localhost Full Dev

Proyek ini telah dilengkapi dengan server pengembangan Node.js native (`server.js`) yang mendukung:
- **Live Reload Otomatis**: Memantau perubahan berkas dan merefresh browser seketika via Server-Sent Events (SSE).
- **HTTP 206 Partial Content**: Dukungan penuh untuk *range requests* video scrubbing dan seek audio.
- **MIME Types Lengkap**: Dukungan berkas `.wasm`, `.tflite`, `.mjs`, `.mp4`, `.wav`.
- **Pengaturan API Key Terintegrasi**: Tombol pengaturan API Key langsung di banner depan aplikasi.

### Menjalankan Server:
```bash
# Menggunakan npm
npm run dev

# Atau langsung menggunakan Node.js
node server.js
```

### Akses Aplikasi:
- **Aplikasi Utama**: [http://127.0.0.1:8765](http://127.0.0.1:8765)
- **Mode Pengembang**: [http://127.0.0.1:8765/#dev](http://127.0.0.1:8765/#dev)
- **Status Server**: [http://127.0.0.1:8765/health](http://127.0.0.1:8765/health)

*(Untuk browser desktop, sistem otomatis terhubung ke CloakBrowser Portable di port CDP 9242).*
