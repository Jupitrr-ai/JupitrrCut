#!/usr/bin/env node
/**
 * Ensures Firebase plist, google-services.json, and (optionally) .env.* agree.
 * Usage:
 *   node scripts/validate-firebase-config.mjs dev|prod
 *   node scripts/validate-firebase-config.mjs prod --native-only
 *   node scripts/validate-firebase-config.mjs prod --env-from-process
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** Parse Firebase GoogleService-Info.plist without deps (runs on EAS before bun install). */
function readPlist(filePath) {
  const full = path.join(root, filePath);
  if (!fs.existsSync(full)) {
    fail(`Missing plist: ${filePath}`);
    return null;
  }
  const xml = fs.readFileSync(full, 'utf8');
  const stringKeys = [
    'PROJECT_ID',
    'GCM_SENDER_ID',
    'CLIENT_ID',
    'REVERSED_CLIENT_ID',
    'STORAGE_BUCKET',
    'API_KEY',
    'GOOGLE_APP_ID',
    'BUNDLE_ID',
  ];
  const data = {};
  for (const key of stringKeys) {
    const re = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`);
    const m = xml.match(re);
    if (m) data[key] = m[1];
  }
  if (!data.PROJECT_ID) {
    fail(`Could not parse PROJECT_ID from ${filePath}`);
    return null;
  }
  return data;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const target = process.argv[2];
const nativeOnly = process.argv.includes('--native-only');
const envFromProcess = process.argv.includes('--env-from-process');

if (!target || !['dev', 'prod'].includes(target)) {
  console.error(
    'Usage: node scripts/validate-firebase-config.mjs <dev|prod> [--native-only] [--env-from-process]'
  );
  process.exit(1);
}

const registry = JSON.parse(
  fs.readFileSync(path.join(root, 'config/firebase-environments.json'), 'utf8')
);
const envMeta = registry.environments[target];
const androidPackage = registry.androidPackage;

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

function readJson(filePath) {
  const full = path.join(root, filePath);
  if (!fs.existsSync(full)) {
    fail(`Missing google-services json: ${filePath}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function readEnvFile(filePath) {
  const full = path.join(root, filePath);
  if (!fs.existsSync(full)) {
    fail(`Missing env file: ${filePath}`);
    return null;
  }
  const out = {};
  for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

function readEnvFromProcess() {
  const keys = [
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'EXPO_PUBLIC_FIREBASE_APP_ID',
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
    'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
    'EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME',
  ];
  const out = {};
  for (const key of keys) {
    if (process.env[key]) out[key] = process.env[key];
  }
  return out;
}

function projectNumberFromClientId(clientId) {
  if (!clientId) return null;
  const m = clientId.match(/^(\d+)-/);
  return m?.[1] ?? null;
}

function findAndroidClient(json) {
  return (json?.client ?? []).find(
    (c) => c?.client_info?.android_client_info?.package_name === androidPackage
  );
}

const plistData = readPlist(
  nativeOnly || envFromProcess ? `GoogleService-Info.plist` : envMeta.plist
);
const jsonData = readJson(
  nativeOnly || envFromProcess ? 'google-services.json' : envMeta.googleServicesJson
);

let env = null;
if (!nativeOnly) {
  env = envFromProcess ? readEnvFromProcess() : readEnvFile(envMeta.envFile);
}

if (plistData && jsonData) {
  const jsonProjectId = jsonData.project_info?.project_id;
  const jsonNumber = jsonData.project_info?.project_number;

  if (plistData.PROJECT_ID !== jsonProjectId) {
    fail(`PROJECT_ID mismatch: plist=${plistData.PROJECT_ID} json=${jsonProjectId}`);
  }
  if (plistData.GCM_SENDER_ID !== jsonNumber) {
    fail(`Project number mismatch: plist GCM=${plistData.GCM_SENDER_ID} json=${jsonNumber}`);
  }

  const androidClient = findAndroidClient(jsonData);
  if (!androidClient) {
    fail(`google-services.json has no client for package ${androidPackage}`);
  } else {
    const oauth = (androidClient.oauth_client ?? []).find((o) => o.client_type === 1);
    const web = (androidClient.oauth_client ?? []).find((o) => o.client_type === 3);
    if (!oauth) {
      fail(`Missing Android OAuth client (client_type 1) for ${androidPackage}`);
    } else {
      console.log(
        `[validate] Android OAuth hash: ${oauth.android_info?.certificate_hash ?? 'MISSING'}`
      );
    }
    if (!web) {
      fail(`Missing Web OAuth client (client_type 3) for ${androidPackage}`);
    }
  }
}

if (plistData && env) {
  const checks = [
    ['EXPO_PUBLIC_FIREBASE_PROJECT_ID', plistData.PROJECT_ID],
    ['EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', plistData.GCM_SENDER_ID],
    ['EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID', plistData.CLIENT_ID],
    ['EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME', plistData.REVERSED_CLIENT_ID],
    ['EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', plistData.STORAGE_BUCKET],
  ];

  for (const [key, expected] of checks) {
    const actual = env[key]?.trim();
    if (!actual) {
      fail(`Missing ${key} in ${envFromProcess ? 'process env' : envMeta.envFile}`);
    } else if (actual !== expected) {
      fail(`${key} mismatch: env=${actual} expected=${expected} (from plist)`);
    }
  }

  const apiKey = env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim();
  if (apiKey && apiKey !== plistData.API_KEY) {
    warn(
      `EXPO_PUBLIC_FIREBASE_API_KEY does not match plist API_KEY. ` +
        `Use the iOS app key from GoogleService-Info.plist for Firebase JS on mobile.`
    );
  }

  const appId = env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim();
  if (appId && appId !== plistData.GOOGLE_APP_ID) {
    warn(
      `EXPO_PUBLIC_FIREBASE_APP_ID (${appId}) does not match plist GOOGLE_APP_ID (${plistData.GOOGLE_APP_ID}). ` +
        `EAS production should use the iOS app ID, not the web app ID.`
    );
  }

  const webClientId = env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  const webNumber = projectNumberFromClientId(webClientId);
  if (webNumber && webNumber !== plistData.GCM_SENDER_ID) {
    fail(
      `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID project ${webNumber} != plist sender ${plistData.GCM_SENDER_ID}`
    );
  }

  if (jsonData && webClientId) {
    const androidClient = findAndroidClient(jsonData);
    const webInJson = (androidClient?.oauth_client ?? []).find((o) => o.client_type === 3);
    if (webInJson && webInJson.client_id !== webClientId) {
      fail(`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID does not match google-services.json Web client`);
    }
  }
}

if (warnings.length) {
  console.warn('[validate] Warnings:');
  for (const w of warnings) console.warn(`  - ${w}`);
  if (process.env.EAS_BUILD === 'true') {
    fail(
      'Resolve warnings above — EAS EXPO_PUBLIC_FIREBASE_* should match the iOS plist (see .env.production).'
    );
  }
}

if (errors.length) {
  console.error(`[validate] FAILED (${target}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`[validate] OK — Firebase config aligned for "${target}" (${envMeta.label})`);
