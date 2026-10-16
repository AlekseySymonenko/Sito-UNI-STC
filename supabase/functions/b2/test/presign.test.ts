// Test della firma con il vettore ufficiale AWS (documentazione "Query String Auth").
// Esecuzione: node --experimental-strip-types --test supabase/functions/b2/test/
import { test } from 'node:test';
import assert from 'node:assert';
import { presign, typeFor } from '../index.ts';

test('firma SigV4 identica all\'esempio ufficiale AWS', async () => {
  const url = await presign({
    method: 'GET', host: 'examplebucket.s3.amazonaws.com', region: 'us-east-1', bucket: '', key: 'test.txt',
    accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    expires: 86400, date: new Date('2013-05-24T00:00:00Z'),
  });
  assert.match(url, /X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/);
});

test('tipi di file', () => {
  assert.strictEqual(typeFor('Lezione 1.PDF')?.kind, 'pdf');
  assert.strictEqual(typeFor('x.html'), null);
  assert.strictEqual(typeFor('x.svg'), null);
});
