/**
 * Cryptographic helpers for End-to-End Encryption (E2EE)
 * Uses Web Crypto API for RSA-OAEP and AES-GCM
 */

const CryptoUtils = {
  // --- RSA Key Management ---

  async generateRSAKeyPair() {
    return await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"]
    );
  },

  async exportPublicKey(key) {
    const exported = await crypto.subtle.exportKey("jwk", key);
    return JSON.stringify(exported);
  },

  async importPublicKey(jwkStr) {
    const jwk = JSON.parse(jwkStr);
    return await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["encrypt"]
    );
  },

  async exportPrivateKey(key) {
    const exported = await crypto.subtle.exportKey("jwk", key);
    return JSON.stringify(exported);
  },

  async importPrivateKey(jwkStr) {
    const jwk = JSON.parse(jwkStr);
    return await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["decrypt"]
    );
  },

  // --- AES Key Management ---

  async generateAESKey() {
    return await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  },

  async exportAESKey(key) {
    const exported = await crypto.subtle.exportKey("jwk", key);
    return JSON.stringify(exported);
  },

  async importAESKey(jwkStr) {
    const jwk = JSON.parse(jwkStr);
    return await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"]
    );
  },

  // --- Encryption/Decryption ---

  async encryptRSA(publicKey, dataBuffer) {
    return await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      dataBuffer
    );
  },

  async decryptRSA(privateKey, encryptedBuffer) {
    return await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      encryptedBuffer
    );
  },

  async encryptAES(key, dataBuffer) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      dataBuffer
    );
    return { encrypted, iv };
  },

  async decryptAES(key, encryptedBuffer, iv) {
    return await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedBuffer
    );
  },

  // --- Encoding Helpers ---

  bufferToBase64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  },

  base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  },

  textToBuffer(text) {
    return new TextEncoder().encode(text);
  },

  bufferToText(buf) {
    return new TextDecoder().decode(buf);
  }
};

window.CryptoUtils = CryptoUtils;
