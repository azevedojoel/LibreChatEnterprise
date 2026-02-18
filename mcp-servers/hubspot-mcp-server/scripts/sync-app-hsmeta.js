#!/usr/bin/env node
/**
 * Syncs OAuth redirect URLs from hubspot-oauth-redirect-urls.json (single source of truth
 * at package root) into Daily Thread/src/app/app-hsmeta.json (required by HubSpot CLI).
 *
 * Run before `hs project upload` when adding new deployment domains.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const redirectUrlsPath = path.join(root, 'hubspot-oauth-redirect-urls.json');
const appHsmetaPath = path.join(root, 'Daily Thread', 'src', 'app', 'app-hsmeta.json');

const redirectUrls = JSON.parse(readFileSync(redirectUrlsPath, 'utf8'));
const appHsmeta = JSON.parse(readFileSync(appHsmetaPath, 'utf8'));

appHsmeta.config.auth.redirectUrls = redirectUrls;
writeFileSync(appHsmetaPath, JSON.stringify(appHsmeta, null, 2) + '\n');
console.log('Synced', redirectUrls.length, 'redirect URLs into app-hsmeta.json');
