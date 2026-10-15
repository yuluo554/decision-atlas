// canonical.js —— 确定性序列化与哈希（确定性纪律 G1 的基座）。
//
// 契约（K 口径，动了会打挂测试）：
//   - canonicalStringify：对象键按 UTF-16 码点升序排序、无空白、数组保序；
//   - 非有限数（NaN/Infinity）与 undefined 一律抛错（确定性：不允许不可表达的取值混入）；
//   - sha256Hex 基于 canonicalStringify 的 UTF-8 字节。
// 本模块仅用于 Node 侧（构建/测试/CLI），不进浏览器 bundle（node:crypto 不可用于浏览器）。
import { createHash } from 'node:crypto';

export function canonicalStringify(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'boolean' || t === 'string') return JSON.stringify(value);
  if (t === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonicalStringify：不允许非有限数（' + String(value) + '）');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalStringify).join(',') + ']';
  }
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    const parts = [];
    for (const k of keys) {
      const v = value[k];
      if (v === undefined) throw new Error('canonicalStringify：不允许 undefined 值（键 ' + k + '）');
      parts.push(JSON.stringify(k) + ':' + canonicalStringify(v));
    }
    return '{' + parts.join(',') + '}';
  }
  throw new Error('canonicalStringify：不支持的值类型 ' + t);
}

export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function canonicalSha256(value) {
  return sha256Hex(canonicalStringify(value));
}
