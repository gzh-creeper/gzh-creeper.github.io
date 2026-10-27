/*
 * ByteVeil format v1
 * ------------------------------------------------------------------
 * A tiny, dependency-free container for password-protected files.
 *
 *   header (authenticated as AES-GCM additional data)
 *     magic        8   "BYTEVEIL"
 *     version      1   1
 *     kdf          1   1 = PBKDF2-SHA-256
 *     cipher       1   1 = AES-256-GCM
 *     reserved     1   0
 *     iterations   4   big-endian uint32
 *     chunk size   4   big-endian uint32
 *     file size    8   big-endian uint64
 *     created at   8   big-endian uint64 (unix ms)
 *     salt        16
 *     base IV     12
 *     name length  2   big-endian uint16
 *     name         n   UTF-8
 *
 *   chunks
 *     length       4   big-endian uint32 (ciphertext + 16 byte tag)
 *     ciphertext   n
 *
 * Each chunk uses IV = base IV with its uint32 index written into the
 * final four bytes, and authenticates the header + chunk index + total
 * chunk count as additional data. This makes chunk reordering, swapping
 * between packages, and truncation detectable.
 *
 * This is encryption, not a toy byte shuffle. The result is only as
 * strong as the password chosen by the user.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ByteVeil = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var MAGIC = new Uint8Array([0x42, 0x59, 0x54, 0x45, 0x56, 0x45, 0x49, 0x4c]); // BYTEVEIL
  var VERSION = 1;
  var KDF_ID = 1;
  var CIPHER_ID = 1;
  var HEADER_FIXED = 66;
  var DEFAULT_ITERATIONS = 310000;
  var MIN_ITERATIONS = 50000;
  var MAX_ITERATIONS = 2000000;
  var DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;
  var MIN_CHUNK_SIZE = 64 * 1024;
  var MAX_CHUNK_SIZE = 32 * 1024 * 1024;
  var TAG_BYTES = 16;
  var SALT_BYTES = 16;
  var IV_BYTES = 12;
  var MAX_FILENAME_BYTES = 1024;
  var MAX_FILE_SIZE = 1024 * 1024 * 1024 * 1024; // 1 TiB
  var MAX_CHUNKS = 1000000;
  var KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%+-=?';

  var encoder = new TextEncoder();
  var decoder = new TextDecoder('utf-8', { fatal: true });

  function ByteVeilError(code, message, cause) {
    var err = Error.call(this, message);
    this.name = 'ByteVeilError';
    this.message = message || 'ByteVeil error';
    this.code = code || 'ERROR';
    if (cause) this.cause = cause;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ByteVeilError);
    else this.stack = err.stack;
  }
  ByteVeilError.prototype = Object.create(Error.prototype);
  ByteVeilError.prototype.constructor = ByteVeilError;

  function fail(code, message, cause) {
    throw new ByteVeilError(code, message, cause);
  }

  function subtle() {
    var c = root && (root.crypto || root.msCrypto);
    if (!c || !c.subtle) {
      fail('CRYPTO_UNAVAILABLE', '当前环境不支持 Web Crypto。请使用较新的 Chrome、Edge、Firefox 或 Safari。');
    }
    return c.subtle;
  }

  function randomBytes(length) {
    var c = root && (root.crypto || root.msCrypto);
    if (!c || typeof c.getRandomValues !== 'function') {
      fail('CRYPTO_UNAVAILABLE', '无法访问安全随机数生成器。');
    }
    var out = new Uint8Array(length);
    c.getRandomValues(out);
    return out;
  }

  function assertBlob(blob) {
    if (!blob || typeof blob.slice !== 'function' || typeof blob.arrayBuffer !== 'function' || typeof blob.size !== 'number') {
      fail('INVALID_FILE', '没有可读取的文件。');
    }
  }

  function normalizePassword(password) {
    if (typeof password !== 'string' || password.length === 0) {
      fail('PASSWORD_REQUIRED', '请输入密钥。');
    }
    if (password.length > 1024) {
      fail('PASSWORD_TOO_LONG', '密钥过长，请控制在 1024 个字符以内。');
    }
    return password.normalize('NFC');
  }

  function assertNotAborted(signal) {
    if (signal && signal.aborted) {
      fail('ABORTED', '操作已取消。');
    }
  }

  function emit(onProgress, payload) {
    if (typeof onProgress !== 'function') return;
    try {
      onProgress(payload);
    } catch (_) {
      /* A UI callback must never break an in-flight operation. */
    }
  }

  function nextTask() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  function sanitizeFileName(name) {
    var clean = String(name == null ? '' : name)
      .replace(/[\u0000-\u001f\u007f]/g, '_')
      .replace(/[\\/]/g, '_')
      .trim();

    if (!clean || clean === '.' || clean === '..') clean = 'file.bin';

    if (encoder.encode(clean).length > MAX_FILENAME_BYTES) {
      var dot = clean.lastIndexOf('.');
      var ext = dot > 0 && clean.length - dot <= 17 ? clean.slice(dot) : '';
      var stem = ext ? clean.slice(0, dot) : clean;
      var chars = Array.from(stem);
      var budget = MAX_FILENAME_BYTES - encoder.encode(ext).length;
      while (chars.length > 0 && encoder.encode(chars.join('')).length > budget) chars.pop();
      clean = (chars.join('') || 'file') + ext;
    }
    return clean;
  }

  function hasMagic(bytes) {
    if (!bytes) return false;
    var view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (view.length < MAGIC.length) return false;
    for (var i = 0; i < MAGIC.length; i++) {
      if (view[i] !== MAGIC[i]) return false;
    }
    return true;
  }

  function parseFixed(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < HEADER_FIXED) {
      fail('INVALID_FORMAT', '文件头不完整，这不是有效的 ByteVeil 封包。');
    }
    if (!hasMagic(bytes)) {
      fail('INVALID_FORMAT', '找不到 ByteVeil 标记，这不是本工具生成的封包。');
    }

    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var version = view.getUint8(8);
    if (version !== VERSION) {
      fail('UNSUPPORTED_VERSION', '暂不支持这个封包版本（v' + version + '）。');
    }
    if (view.getUint8(9) !== KDF_ID || view.getUint8(10) !== CIPHER_ID) {
      fail('UNSUPPORTED_FORMAT', '封包使用了不受支持的加密参数。');
    }

    var iterations = view.getUint32(12, false);
    if (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
      fail('INVALID_FORMAT', '封包的密钥派生参数不在安全范围内。');
    }

    var chunkSize = view.getUint32(16, false);
    if (chunkSize < MIN_CHUNK_SIZE || chunkSize > MAX_CHUNK_SIZE || chunkSize % 1024 !== 0) {
      fail('INVALID_FORMAT', '封包的分块大小无效。');
    }

    var originalSize = Number(view.getBigUint64(20, false));
    if (!Number.isSafeInteger(originalSize) || originalSize < 0 || originalSize > MAX_FILE_SIZE) {
      fail('INVALID_FORMAT', '封包声明的文件大小无效。');
    }

    var createdAtRaw = view.getBigUint64(28, false);
    var createdAt = Number(createdAtRaw);
    if (!Number.isSafeInteger(createdAt) || createdAt <= 0) createdAt = 0;

    var nameLength = view.getUint16(64, false);
    if (nameLength > MAX_FILENAME_BYTES) {
      fail('INVALID_FORMAT', '封包中的文件名长度异常。');
    }

    var totalChunks = originalSize === 0 ? 1 : Math.ceil(originalSize / chunkSize);
    if (!Number.isSafeInteger(totalChunks) || totalChunks < 1 || totalChunks > MAX_CHUNKS) {
      fail('INVALID_FORMAT', '封包的分块数量超出支持范围。');
    }

    return {
      version: version,
      iterations: iterations,
      chunkSize: chunkSize,
      originalSize: originalSize,
      createdAt: createdAt,
      nameLength: nameLength,
      totalChunks: totalChunks,
      salt: bytes.slice(36, 52),
      baseIv: bytes.slice(52, 64),
      headerLength: HEADER_FIXED + nameLength
    };
  }

  function parseHeader(bytes) {
    var fixed = parseFixed(bytes);
    if (bytes.length < fixed.headerLength) {
      fail('INVALID_FORMAT', '文件头不完整，这不是有效的 ByteVeil 封包。');
    }

    var nameBytes = bytes.slice(HEADER_FIXED, fixed.headerLength);
    var originalName;
    try {
      originalName = decoder.decode(nameBytes);
    } catch (err) {
      fail('INVALID_FORMAT', '封包中的文件名编码无效。', err);
    }
    originalName = sanitizeFileName(originalName);

    var expectedPackageSize =
      fixed.headerLength +
      fixed.totalChunks * 4 +
      fixed.originalSize +
      fixed.totalChunks * TAG_BYTES;

    if (!Number.isSafeInteger(expectedPackageSize)) {
      fail('INVALID_FORMAT', '封包体积超出支持范围。');
    }

    return {
      version: fixed.version,
      kdf: 'PBKDF2-SHA-256',
      cipher: 'AES-256-GCM',
      iterations: fixed.iterations,
      chunkSize: fixed.chunkSize,
      originalSize: fixed.originalSize,
      createdAt: fixed.createdAt,
      totalChunks: fixed.totalChunks,
      originalName: originalName,
      headerLength: fixed.headerLength,
      expectedPackageSize: expectedPackageSize
    };
  }

  async function readHeader(blob) {
    assertBlob(blob);
    if (blob.size < HEADER_FIXED) {
      fail('INVALID_FORMAT', '文件太小，不是有效的 ByteVeil 封包。');
    }

    var fixedBytes = new Uint8Array(await blob.slice(0, HEADER_FIXED).arrayBuffer());
    if (fixedBytes.length < HEADER_FIXED) {
      fail('INVALID_FORMAT', '文件头不完整，这不是有效的 ByteVeil 封包。');
    }
    var fixed = parseFixed(fixedBytes);
    if (blob.size < fixed.headerLength) {
      fail('INVALID_FORMAT', '文件头不完整，这不是有效的 ByteVeil 封包。');
    }

    var headerBytes = new Uint8Array(await blob.slice(0, fixed.headerLength).arrayBuffer());
    if (headerBytes.length !== fixed.headerLength) {
      fail('INVALID_FORMAT', '文件头不完整，这不是有效的 ByteVeil 封包。');
    }
    var info = parseHeader(headerBytes);
    if (blob.size !== info.expectedPackageSize) {
      fail('INVALID_FORMAT', '封包大小与文件头不一致，文件可能被截断或追加了数据。');
    }

    return { info: info, headerBytes: headerBytes };
  }

  function makeHeader(info) {
    var header = new Uint8Array(HEADER_FIXED + info.nameBytes.length);
    header.set(MAGIC, 0);
    header[8] = VERSION;
    header[9] = KDF_ID;
    header[10] = CIPHER_ID;
    header[11] = 0;

    var view = new DataView(header.buffer);
    view.setUint32(12, info.iterations, false);
    view.setUint32(16, info.chunkSize, false);
    view.setBigUint64(20, BigInt(info.originalSize), false);
    view.setBigUint64(28, BigInt(info.createdAt), false);
    header.set(info.salt, 36);
    header.set(info.baseIv, 52);
    view.setUint16(64, info.nameBytes.length, false);
    header.set(info.nameBytes, HEADER_FIXED);
    return header;
  }

  function chunkIv(baseIv, index) {
    var iv = new Uint8Array(baseIv);
    var view = new DataView(iv.buffer);
    view.setUint32(8, index, false);
    return iv;
  }

  function chunkAad(headerBytes, index, totalChunks) {
    var aad = new Uint8Array(headerBytes.length + 8);
    aad.set(headerBytes, 0);
    var view = new DataView(aad.buffer, headerBytes.length, 8);
    view.setUint32(0, index, false);
    view.setUint32(4, totalChunks, false);
    return aad;
  }

  async function deriveKey(password, salt, iterations, usage) {
    var raw = encoder.encode(password);
    var material = await subtle().importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      [usage]
    );
  }

  async function sealBlob(blob, password, options) {
    assertBlob(blob);
    options = options || {};
    var normalized = normalizePassword(password);
    subtle();

    if (blob.size > MAX_FILE_SIZE) {
      fail('FILE_TOO_LARGE', '文件超过 1 TiB，当前格式不支持。');
    }

    var signal = options.signal;
    var onProgress = options.onProgress;
    assertNotAborted(signal);

    var originalName = sanitizeFileName(blob.name || 'file.bin');
    var nameBytes = encoder.encode(originalName);
    var salt = randomBytes(SALT_BYTES);
    var baseIv = randomBytes(IV_BYTES);
    var createdAt = Date.now();
    var chunkSize = DEFAULT_CHUNK_SIZE;
    var totalChunks = blob.size === 0 ? 1 : Math.ceil(blob.size / chunkSize);
    var headerBytes = makeHeader({
      salt: salt,
      baseIv: baseIv,
      iterations: DEFAULT_ITERATIONS,
      chunkSize: chunkSize,
      originalSize: blob.size,
      createdAt: createdAt,
      nameBytes: nameBytes
    });
    var info = parseHeader(headerBytes);
    info.originalName = originalName;
    info.packageSize = info.expectedPackageSize;

    emit(onProgress, { phase: 'derive', progress: 0.01, mode: 'seal' });
    var key = await deriveKey(normalized, salt, DEFAULT_ITERATIONS, 'encrypt');
    assertNotAborted(signal);
    emit(onProgress, {
      phase: 'process',
      progress: 0.06,
      mode: 'seal',
      done: 0,
      total: totalChunks
    });

    var parts = [headerBytes];

    for (var index = 0; index < totalChunks; index++) {
      assertNotAborted(signal);

      var start = index * chunkSize;
      var end = Math.min(start + chunkSize, blob.size);
      var expectedLength = end - start;
      var plainBuffer = await blob.slice(start, end).arrayBuffer();
      if (plainBuffer.byteLength !== expectedLength) {
        fail('DATA_CHANGED', '读取文件时文件大小发生了变化，请重新选择文件。');
      }

      var encrypted;
      try {
        encrypted = await subtle().encrypt(
          {
            name: 'AES-GCM',
            iv: chunkIv(baseIv, index),
            additionalData: chunkAad(headerBytes, index, totalChunks),
            tagLength: 128
          },
          key,
          plainBuffer
        );
      } catch (err) {
        fail('ENCRYPT_FAILED', '加密失败，请重试。', err);
      }

      var lengthBuffer = new ArrayBuffer(4);
      new DataView(lengthBuffer).setUint32(0, encrypted.byteLength, false);
      parts.push(lengthBuffer, encrypted);

      var progress = 0.06 + 0.94 * ((index + 1) / totalChunks);
      emit(onProgress, {
        phase: 'process',
        progress: progress,
        mode: 'seal',
        done: index + 1,
        total: totalChunks
      });

      if (index % 2 === 1) await nextTask();
      assertNotAborted(signal);
    }

    var output = new Blob(parts, { type: 'application/octet-stream' });
    emit(onProgress, { phase: 'done', progress: 1, mode: 'seal', done: totalChunks, total: totalChunks });

    return {
      blob: output,
      filename: originalName + '.bveil',
      info: info
    };
  }

  async function openBlob(blob, password, options) {
    assertBlob(blob);
    options = options || {};
    var normalized = normalizePassword(password);
    subtle();

    var signal = options.signal;
    var onProgress = options.onProgress;
    assertNotAborted(signal);

    var header = await readHeader(blob);
    var info = header.info;
    var headerBytes = header.headerBytes;
    var totalChunks = info.totalChunks;
    var chunkSize = info.chunkSize;

    emit(onProgress, { phase: 'derive', progress: 0.01, mode: 'open' });
    var key = await deriveKey(normalized, headerBytes.slice(36, 52), info.iterations, 'decrypt');
    assertNotAborted(signal);
    emit(onProgress, {
      phase: 'process',
      progress: 0.06,
      mode: 'open',
      done: 0,
      total: totalChunks
    });

    var parts = [];
    var offset = info.headerLength;

    for (var index = 0; index < totalChunks; index++) {
      assertNotAborted(signal);

      if (offset + 4 > blob.size) {
        fail('INVALID_FORMAT', '封包数据不完整。');
      }
      var lengthBytes = await blob.slice(offset, offset + 4).arrayBuffer();
      offset += 4;
      if (lengthBytes.byteLength !== 4) {
        fail('INVALID_FORMAT', '封包数据不完整。');
      }
      var cipherLength = new DataView(lengthBytes).getUint32(0, false);

      var plainLength = index === totalChunks - 1
        ? info.originalSize - index * chunkSize
        : chunkSize;
      if (cipherLength !== plainLength + TAG_BYTES) {
        fail('INVALID_FORMAT', '封包分块长度异常。');
      }
      if (offset + cipherLength > blob.size) {
        fail('INVALID_FORMAT', '封包数据不完整。');
      }

      var ciphertext = await blob.slice(offset, offset + cipherLength).arrayBuffer();
      offset += cipherLength;
      if (ciphertext.byteLength !== cipherLength) {
        fail('INVALID_FORMAT', '封包数据不完整。');
      }

      var plain;
      try {
        plain = await subtle().decrypt(
          {
            name: 'AES-GCM',
            iv: chunkIv(headerBytes.slice(52, 64), index),
            additionalData: chunkAad(headerBytes, index, totalChunks),
            tagLength: 128
          },
          key,
          ciphertext
        );
      } catch (err) {
        fail('WRONG_KEY', '密钥不正确，或封包已损坏。', err);
      }

      if (plain.byteLength !== plainLength) {
        fail('INVALID_FORMAT', '还原后的数据长度异常。');
      }
      parts.push(plain);

      var progress = 0.06 + 0.94 * ((index + 1) / totalChunks);
      emit(onProgress, {
        phase: 'process',
        progress: progress,
        mode: 'open',
        done: index + 1,
        total: totalChunks
      });

      if (index % 2 === 1) await nextTask();
      assertNotAborted(signal);
    }

    if (offset !== blob.size) {
      fail('INVALID_FORMAT', '封包末尾存在多余数据。');
    }

    var output = new Blob(parts, { type: 'application/octet-stream' });
    emit(onProgress, { phase: 'done', progress: 1, mode: 'open', done: totalChunks, total: totalChunks });

    return {
      blob: output,
      filename: sanitizeFileName(info.originalName || 'restored.bin'),
      info: info
    };
  }

  async function inspectBlob(blob) {
    var header = await readHeader(blob);
    return Object.assign({}, header.info, { packageSize: blob.size });
  }

  function randomKey(length) {
    var count = length == null ? 28 : Math.floor(Number(length));
    if (!Number.isFinite(count) || count < 8 || count > 256) {
      fail('INVALID_LENGTH', '随机密钥长度应在 8 到 256 之间。');
    }
    var out = '';
    var limit = 256 - (256 % KEY_ALPHABET.length);
    while (out.length < count) {
      var bytes = randomBytes(64);
      for (var i = 0; i < bytes.length && out.length < count; i++) {
        if (bytes[i] < limit) out += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
      }
    }
    return out;
  }

  return {
    ByteVeilError: ByteVeilError,
    isContainer: hasMagic,
    hasMagic: hasMagic,
    sealBlob: sealBlob,
    openBlob: openBlob,
    inspectBlob: inspectBlob,
    randomKey: randomKey,
    sanitizeFileName: sanitizeFileName,
    constants: Object.freeze({
      VERSION: VERSION,
      DEFAULT_ITERATIONS: DEFAULT_ITERATIONS,
      DEFAULT_CHUNK_SIZE: DEFAULT_CHUNK_SIZE,
      MAX_FILE_SIZE: MAX_FILE_SIZE,
      MAGIC: 'BYTEVEIL'
    })
  };
});
