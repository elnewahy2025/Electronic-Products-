import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// The worker sources use extensionless imports for both Wrangler and tsc.
// Resolve them to the .ts files so plain Node can load them via type stripping.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { verifyToken } = await import('../src/token');
const { buildZipStream, crc32Update, crc32Finalize } = await import('../src/zip');
const { auditFileStream, fetchDriveFile } = await import('../src/drive');
const { resolveToken } = await import('../src/resolve');
const { postCompletion } = await import('../src/complete');
const worker = (await import('../src/index')).default;

const encoder = new TextEncoder();
const SECRET = 'test-shared-secret';

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function signedToken(payload, secret = SECRET) {
  const encoded = encodePayload(payload);
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function basePayload(overrides = {}) {
  return {
    sid: randomUUID(),
    fid: randomUUID(),
    typ: 'single',
    exp: Math.floor(Date.now() / 1000) + 900,
    n: 'nonce-123',
    ...overrides,
  };
}

function streamOf(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function referenceCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function resolvedFile(overrides = {}) {
  return {
    file_version_id: randomUUID(),
    drive_url: 'https://drive.example.test/file',
    filename: 'file.bin',
    mime: 'application/octet-stream',
    size_bytes: 3,
    sha256: createHash('sha256').update('abc').digest('hex'),
    access_token: 'token-a',
    ...overrides,
  };
}

test('token: valid, tampered, expired and malformed', async () => {
  const payload = basePayload();
  const token = signedToken(payload);
  assert.deepEqual(await verifyToken(token, SECRET), payload);

  const [encoded, signature] = token.split('.');
  const flipped = (value) => (value[0] === 'A' ? `B${value.slice(1)}` : `A${value.slice(1)}`);
  assert.equal(await verifyToken(`${flipped(encoded)}.${signature}`, SECRET), null);
  assert.equal(await verifyToken(`${encoded}.${flipped(signature)}`, SECRET), null);
  assert.equal(await verifyToken(token, 'wrong-secret'), null);

  assert.equal(await verifyToken(signedToken(basePayload({ exp: Math.floor(Date.now() / 1000) - 1 })), SECRET), null);
  const boundaryPayload = basePayload({ exp: Math.floor(Date.now() / 1000) });
  assert.deepEqual(await verifyToken(signedToken(boundaryPayload), SECRET), boundaryPayload);

  for (const malformed of ['', 'abc', 'a.b.c', '!.!', signedToken({ typ: 'single', exp: payload.exp, n: 'x', sid: payload.sid })]) {
    assert.equal(await verifyToken(malformed, SECRET), null);
  }

  // A valid signature over a zip payload without fid is still accepted.
  const zipPayload = basePayload({ typ: 'zip', fid: undefined });
  delete zipPayload.fid;
  assert.deepEqual(await verifyToken(signedToken(zipPayload), SECRET), zipPayload);
});

test('token: digest comparison helper covers the whole 32-byte signature', () => {
  const crc = crc32Update(crc32Update(crc32Update(0xffffffff, encoder.encode('hello')), encoder.encode(' ')), encoder.encode('world'));
  assert.equal(crc32Finalize(crc), referenceCrc32(encoder.encode('hello world')));
});

test('zip: local headers, data descriptors, central directory, EOCD and CRC', async () => {
  const contents = ['hello world', 'second file', 'third'];
  const names = ['../../evil/../safe.txt', 'sub\\dir\\notes.txt', 'safe.txt'];
  const stream = buildZipStream(
    contents.map((text, index) => ({ name: names[index], stream: streamOf([text.slice(0, 3), text.slice(3)]) }))
  );
  const buffer = await collect(stream);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const expectedNames = ['safe.txt', 'sub/dir/notes.txt', 'safe-2.txt'];
  const records = [];
  let position = 0;

  for (let index = 0; index < contents.length; index++) {
    assert.equal(view.getUint32(position, true), 0x04034b50);
    assert.equal(view.getUint16(position + 4, true), 20);
    assert.equal(view.getUint16(position + 6, true) & 0x0008, 0x0008);
    assert.equal(view.getUint16(position + 6, true) & 0x0800, 0x0800);
    assert.equal(view.getUint16(position + 8, true), 0);
    assert.equal(view.getUint32(position + 14, true), 0);
    assert.equal(view.getUint32(position + 18, true), 0);
    assert.equal(view.getUint32(position + 22, true), 0);

    const nameLength = view.getUint16(position + 26, true);
    const name = buffer.subarray(position + 30, position + 30 + nameLength).toString('utf8');
    assert.equal(name, expectedNames[index]);
    assert.ok(!name.includes('..') && !name.includes('\\') && !name.startsWith('/'));

    const dataStart = position + 30 + nameLength;
    const dataEnd = dataStart + Buffer.byteLength(contents[index]);
    const data = buffer.subarray(dataStart, dataEnd);
    assert.equal(view.getUint32(dataEnd, true), 0x08074b50);
    const crc = view.getUint32(dataEnd + 4, true);
    assert.equal(view.getUint32(dataEnd + 8, true), data.length);
    assert.equal(view.getUint32(dataEnd + 12, true), data.length);
    assert.equal(crc, referenceCrc32(data));

    records.push({ name, crc, size: data.length, offset: position });
    position = dataEnd + 16;
  }

  const centralOffset = position;
  assert.equal(view.getUint32(position, true), 0x02014b50);
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    assert.equal(view.getUint32(position, true), 0x02014b50);
    assert.equal(view.getUint16(position + 8, true) & 0x0008, 0x0008);
    assert.equal(view.getUint32(position + 16, true), record.crc);
    assert.equal(view.getUint32(position + 20, true), record.size);
    assert.equal(view.getUint32(position + 24, true), record.size);
    assert.equal(view.getUint32(position + 42, true), record.offset);
    const nameLength = view.getUint16(position + 28, true);
    assert.equal(buffer.subarray(position + 46, position + 46 + nameLength).toString('utf8'), record.name);
    position += 46 + nameLength;
  }
  const centralSize = position - centralOffset;

  assert.equal(view.getUint32(position, true), 0x06054b50);
  assert.equal(view.getUint16(position + 8, true), records.length);
  assert.equal(view.getUint16(position + 10, true), records.length);
  assert.equal(view.getUint32(position + 12, true), centralSize);
  assert.equal(view.getUint32(position + 16, true), centralOffset);
  assert.equal(position + 22, buffer.length);
  assert.equal(new Set(records.map((record) => record.name)).size, records.length);
});

test('drive audit: counts actual bytes, hashes incrementally, fails closed on mismatch', async () => {
  const bytes = encoder.encode('x'.repeat(100000) + 'end');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const file = resolvedFile({ size_bytes: bytes.length, sha256 });
  const audited = auditFileStream(
    streamOf([bytes.subarray(0, 1), bytes.subarray(1, 70000), bytes.subarray(70000)]),
    file
  );

  const written = await collect(audited.stream);
  assert.equal(written.toString('hex'), Buffer.from(bytes).toString('hex'));
  assert.deepEqual(await audited.result, {
    file_version_id: file.file_version_id,
    bytes_sent: bytes.length,
    checksum: sha256,
  });

  const short = auditFileStream(streamOf(['abc']), resolvedFile({ size_bytes: 4, sha256: null }));
  await assert.rejects(collect(short.stream), (error) => error.code === 'SIZE_MISMATCH');
  await assert.rejects(short.result, (error) => error.code === 'SIZE_MISMATCH');

  const long = auditFileStream(streamOf(['abcd']), resolvedFile({ size_bytes: 3, sha256: null }));
  await assert.rejects(collect(long.stream), (error) => error.code === 'SIZE_MISMATCH');
  await assert.rejects(long.result, (error) => error.code === 'SIZE_MISMATCH');

  const badHash = auditFileStream(streamOf(['abc']), resolvedFile({ sha256: '0'.repeat(64) }));
  await assert.rejects(collect(badHash.stream), (error) => error.code === 'CHECKSUM_MISMATCH');
  await assert.rejects(badHash.result, (error) => error.code === 'CHECKSUM_MISMATCH');

  // Padding boundaries: 55/56/63/64/127 bytes exercise both final-block paths.
  for (const length of [0, 1, 55, 56, 57, 63, 64, 65, 127, 128]) {
    const data = encoder.encode('a'.repeat(length));
    const expected = createHash('sha256').update(data).digest('hex');
    const boundary = auditFileStream(
      streamOf([data.subarray(0, Math.floor(length / 2)), data.subarray(Math.floor(length / 2))]),
      resolvedFile({ size_bytes: length, sha256: expected })
    );
    await collect(boundary.stream);
    assert.equal((await boundary.result).checksum, expected);
  }
});

test('drive: every fetch uses the bearer token of its own file', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, authorization: init.headers.Authorization });
    return new Response(streamOf(['abc']), { status: 200 });
  };

  const first = resolvedFile({ access_token: 'token-for-seller-a' });
  const second = resolvedFile({ access_token: 'token-for-seller-b' });
  const a = await fetchDriveFile(first, new AbortController().signal, fakeFetch);
  const b = await fetchDriveFile(second, new AbortController().signal, fakeFetch);
  await collect(a.stream);
  await collect(b.stream);
  await a.result;
  await b.result;

  assert.equal(calls.length, 2);
  assert.equal(calls[0].authorization, 'Bearer token-for-seller-a');
  assert.equal(calls[1].authorization, 'Bearer token-for-seller-b');
});

test('resolve: per-file access_token is required; global token is not accepted', async () => {
  const payload = basePayload();
  const config = { token: SECRET, appInternalBase: 'https://app.example.test' };
  let captured;

  const fakeFetch = async (url, init) => {
    captured = { url, init, body: JSON.parse(init.body) };
    const file = resolvedFile({ file_version_id: payload.fid, access_token: 'per-file-token' });
    return new Response(
      JSON.stringify({ type: 'single', session_id: payload.sid, files: [file] }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  const resolution = await resolveToken('signed.token', payload, config, fakeFetch);
  assert.equal(captured.url, 'https://app.example.test/api/internal/resolve-token');
  assert.equal(captured.init.headers['x-internal-secret'], SECRET);
  assert.deepEqual(captured.body, { token: 'signed.token' });
  assert.equal(resolution.files[0].access_token, 'per-file-token');
  assert.equal('access_token' in resolution, false);

  const missingPerFileToken = async () =>
    new Response(
      JSON.stringify({
        type: 'single',
        session_id: payload.sid,
        access_token: 'global-token',
        files: [{ ...resolvedFile({ file_version_id: payload.fid }), access_token: undefined }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  await assert.rejects(
    resolveToken('signed.token', payload, config, missingPerFileToken),
    (error) => error.code === 'RESOLVE_BAD_RESPONSE'
  );
});

test('completion: retry rules and callback body with injected fetch', async () => {
  const config = { token: SECRET, appInternalBase: 'https://app.example.test' };
  const sessionId = randomUUID();
  const fileVersionId = randomUUID();
  const files = [{ file_version_id: fileVersionId, bytes_sent: 3, checksum: 'abc123' }];
  const delays = [];

  async function run(statuses, label) {
    const calls = [];
    const fakeFetch = async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      const status = statuses[calls.length - 1];
      if (status === 'throw') throw new Error('network down');
      return new Response(null, { status });
    };
    const failures = [];
    await postCompletion('signed.token', sessionId, files, config, {
      fetch: fakeFetch,
      sleep: async (ms) => {
        delays.push(ms);
      },
      onFailure: (code, status) => failures.push({ code, status }),
    });
    return { calls, failures, label };
  }

  const success = await run([200], 'success');
  assert.equal(success.calls.length, 1);
  assert.equal(success.calls[0].url, `https://app.example.test/api/download/${sessionId}/complete`);
  assert.equal(success.calls[0].init.headers['x-internal-secret'], SECRET);
  assert.deepEqual(success.calls[0].body, { token: 'signed.token', files });
  assert.deepEqual(success.failures, []);

  const retried = await run([500, 503, 200], 'retried');
  assert.equal(retried.calls.length, 3);

  const terminal = await run([400, 200], 'terminal');
  assert.equal(terminal.calls.length, 1);
  assert.deepEqual(terminal.failures, [{ code: 'COMPLETE_REJECTED', status: 400 }]);

  const transport = await run(['throw', 200], 'transport');
  assert.equal(transport.calls.length, 2);

  const exhausted = await run([500, 500, 500], 'exhausted');
  assert.equal(exhausted.calls.length, 3);
  assert.deepEqual(exhausted.failures, [{ code: 'COMPLETE_FAILED', status: undefined }]);

  assert.deepEqual(delays, [100, 200, 100, 100, 200]);
});

test('worker /stream: real streamed bytes, audit receipt and security headers', async () => {
  const originalFetch = globalThis.fetch;
  const payload = basePayload();
  const token = signedToken(payload);
  const bytes = encoder.encode('abc');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const appBase = 'https://app.example.test';
  const driveUrl = 'https://drive.example.test/file-abc';
  const calls = [];

  // Stub every network boundary. An unexpected URL throws instead of
  // reaching the network, so this test is fully self-contained.
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const headers = new Headers(init.headers);

    if (url === `${appBase}/api/internal/resolve-token`) {
      calls.push({
        kind: 'resolve',
        url,
        secret: headers.get('x-internal-secret'),
        body: JSON.parse(init.body),
      });
      return new Response(
        JSON.stringify({
          type: 'single',
          session_id: payload.sid,
          files: [{
            file_version_id: payload.fid,
            drive_url: driveUrl,
            filename: 'file.bin',
            mime: 'application/octet-stream',
            size_bytes: bytes.length,
            sha256,
            access_token: 'per-file-token',
          }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    if (url === driveUrl) {
      calls.push({ kind: 'drive', url, authorization: headers.get('authorization') });
      // Multiple chunks exercise incremental hashing over the real handler.
      return new Response(streamOf([bytes.subarray(0, 1), bytes.subarray(1)]), { status: 200 });
    }

    if (url === `${appBase}/api/download/${payload.sid}/complete`) {
      calls.push({
        kind: 'complete',
        url,
        secret: headers.get('x-internal-secret'),
        body: JSON.parse(init.body),
      });
      return new Response(
        JSON.stringify({ sessionCompleted: true, attemptNumber: 1 }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    throw new Error(`unexpected fetch: ${url}`);
  };

  const env = { DOWNLOAD_SERVICE_TOKEN: SECRET, APP_INTERNAL_URL: appBase };
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(promise); } };

  try {
    const request = new Request(
      `https://worker.test/stream?token=${encodeURIComponent(token)}`,
      { headers: { origin: appBase } }
    );

    const response = await worker.fetch(request, env, ctx);
    assert.equal(response.status, 200);

    // headers.ts applies both download metadata and download security headers.
    assert.equal(response.headers.get('content-type'), 'application/octet-stream');
    assert.equal(response.headers.get('content-length'), String(bytes.length));
    assert.equal(
      response.headers.get('content-disposition'),
      `attachment; filename="file.bin"; filename*=UTF-8''file.bin`
    );
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; sandbox");
    assert.equal(response.headers.get('access-control-allow-origin'), appBase);
    assert.equal(response.headers.get('vary'), 'Origin');

    // Drain the real handler body; the completion gate resolves on flush.
    const streamed = await collect(response.body);
    assert.equal(streamed.toString('hex'), Buffer.from(bytes).toString('hex'));
    await Promise.all(pending);

    assert.deepEqual(calls.map((call) => call.kind), ['resolve', 'drive', 'complete']);
    assert.equal(calls[0].secret, SECRET);
    assert.deepEqual(calls[0].body, { token });
    assert.equal(calls[1].authorization, 'Bearer per-file-token');
    assert.equal(calls[2].secret, SECRET);
    assert.deepEqual(calls[2].body, {
      token,
      files: [{ file_version_id: payload.fid, bytes_sent: bytes.length, checksum: sha256 }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
