# APKMan

> Reverse engineer Android APKs directly in your browser. No uploads, no servers, no installs.

**[Live Demo →](https://apkman.zoe.im)**

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Rust](https://img.shields.io/badge/Rust-WASM-orange?logo=rust)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

### 🔍 Manifest Parser
Decode binary `AndroidManifest.xml` to readable XML. View package info, permissions, SDK versions, activities, services, receivers, and providers with intent filters.

### ☕ DEX → Java Decompiler
Full DEX-to-Java decompilation powered by a **Rust → WebAssembly** engine. Supports structured control flow (if/else, loops, switch, try/catch), SSA-style IR, type inference, and expression simplification. Smali view also available.

### 📦 Resource Browser
Parse `resources.arsc`, browse string tables, view images inline, and decode binary XML resources from the `res/` directory.

### 🔐 Signature Verification
Inspect APK signing certificates — issuer, subject, validity dates, fingerprints (MD5/SHA-1/SHA-256), and signature scheme versions.

### 📂 File Tree Browser
Full ZIP extraction with expandable folder tree, file sizes, and content viewer with syntax highlighting via Monaco Editor.

### 💾 Local Cache
Previously analyzed APKs are cached in IndexedDB (SHA-256 keyed). Re-open the same APK instantly without re-parsing.

## 🏗️ Architecture

```
APK File (browser File API)
  │
  ├─ JSZip ──────────── ZIP extraction + file tree
  │
  ├─ AXML Parser ────── Binary XML → readable XML (pure JS)
  │
  ├─ DEX Parser ─────── DEX header, strings, types, classes (pure JS)
  │
  ├─ DEX Decompiler ─── Rust → WASM (331KB)
  │   └─ CFG → SSA IR → Region Tree → Java source
  │
  ├─ Resource Parser ── resources.arsc → string/resource tables (pure JS)
  │
  └─ Signature Parser ─ PKCS#7 certificates + fingerprints (pure JS)
```

**Everything runs client-side.** Your APK files never leave your browser.

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + shadcn/ui + Tailwind CSS 4 |
| Language | TypeScript 5 |
| Decompiler | Rust → WebAssembly ([androguard/dex-decompiler](https://github.com/androguard/dex-decompiler)) |
| ZIP | JSZip |
| Code View | Monaco Editor |
| Cache | IndexedDB |

## 🚀 Getting Started

```bash
# Clone
git clone https://github.com/jiusanzhou/apkman.git
cd apkman

# Install
npm install

# Dev
npm run dev

# Build
npm run build
```

### Building the WASM Decompiler

The pre-built WASM binary is included in `public/wasm/`. To rebuild from source:

```bash
# Requirements: Rust + wasm-pack
cd vendor/dex-wasm
wasm-pack build --target web --release

# Copy output
cp pkg/dex_wasm_bg.wasm ../../public/wasm/
cp pkg/dex_wasm.js ../../public/wasm/
```

## 📋 Roadmap

- [ ] Search across strings, class names, and permissions
- [ ] Multi-DEX improved handling
- [ ] APK comparison (diff two versions)
- [ ] Export decompiled source as ZIP
- [ ] Web Worker parsing for large APKs
- [ ] PWA offline support

## 📄 License

MIT

---

Built with ❤️ by [@jiusanzhou](https://github.com/jiusanzhou)
