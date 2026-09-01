import assert from 'node:assert/strict';
import { isReusableCommonsLicense } from '../src/commons.mjs';

const allowed = ['CC0', 'Public domain', 'CC BY', 'CC BY-SA'];
for (const license of ['CC0 1.0', 'Public domain', 'CC BY 4.0', 'CC BY 3.0', 'CC BY-SA 4.0', 'CC BY-SA 3.0']) {
  assert.equal(isReusableCommonsLicense(license, allowed), true, `${license} should be reusable`);
}
for (const license of ['CC BY-NC 4.0', 'CC BY-ND 4.0', 'CC BY-NC-SA 4.0', 'CC BY-NC-ND 4.0', 'All rights reserved', 'GFDL 1.2', '']) {
  assert.equal(isReusableCommonsLicense(license, allowed), false, `${license} should be rejected`);
}
console.log('Wikimedia Commons commercial-license policy tests passed.');
