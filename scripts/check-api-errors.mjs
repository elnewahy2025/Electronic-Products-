#!/usr/bin/env node
/**
 * Lightweight guard against leaking raw Error.message values from API routes.
 * API errors must go through publicError() or use a fixed token sentinel.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const API_ROOT = 'src/app/api';
const RAW_MESSAGE = /(?:\b[A-Za-z_$][\w$]*Err|\be\b|\berr\b|\berror\b)\??\.message\b/;
const findings = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name === 'route.ts') check(full);
  }
}

function check(file) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return;

    const errorField = line.match(/\berror\s*:/);
    if (errorField?.index !== undefined) {
      const tail = line.slice(errorField.index + errorField[0].length);
      if (RAW_MESSAGE.test(tail) && !/^\s*publicError\s*\(/.test(tail)) {
        findings.push(`${file}:${index + 1} raw error field: ${trimmed}`);
      }
    }

    if (/encodeURIComponent\s*\([^)\n]*\.message\b|error=\$\{[^}\n]*\.message\b/.test(line) && RAW_MESSAGE.test(line)) {
      findings.push(`${file}:${index + 1} raw error in redirect: ${trimmed}`);
    }
  });
}

walk(API_ROOT);

if (findings.length > 0) {
  console.error('Raw API error messages found; wrap them with publicError():\n');
  console.error(findings.map((finding) => `  - ${finding}`).join('\n'));
  process.exit(1);
}

console.log(`API error sanitization check passed (${relative(process.cwd(), API_ROOT)}).`);
