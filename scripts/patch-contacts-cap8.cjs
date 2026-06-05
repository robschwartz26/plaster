#!/usr/bin/env node
// Patches @capacitor-community/contacts@7.2.0 to work with Capacitor 8.
//
// The plugin's Package.swift pins capacitor-swift-pm to `from: "7.0.0"`, which
// Swift PM resolves as >=7.0.0, <8.0.0 — conflicting with our Capacitor 8.3.1
// and breaking the iOS build ("Missing package product CapApp-SPM").
//
// Remove this script once the official Capacitor 8 release lands:
// https://github.com/capacitor-community/contacts/pull/155

const fs = require('fs')
const path = require('path')

const target = path.resolve(__dirname, '../node_modules/@capacitor-community/contacts/Package.swift')

if (!fs.existsSync(target)) {
  console.log('[patch-contacts-cap8] Package.swift not found — skipping')
  process.exit(0)
}

const original = fs.readFileSync(target, 'utf8')
const patched = original.replace(
  '.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0")',
  '.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")'
)

if (patched === original) {
  console.log('[patch-contacts-cap8] Already patched — nothing to do')
} else {
  fs.writeFileSync(target, patched, 'utf8')
  console.log('[patch-contacts-cap8] Patched capacitor-swift-pm from: "7.0.0" → "8.0.0"')
}
