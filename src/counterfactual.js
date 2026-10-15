// counterfactual.js —— 反事实路径差（04 §5，M2）。
//
// 契约：
//   - 边身份 = from + branch（目标由树结构唯一决定，不参与身份）；
//   - diffPaths(traceA, traceB) → {onlyA, onlyB, common, divergeIndex, divergeNode}：
//     onlyA/onlyB = path(A) 与 path(B) 边身份集合的对称差两侧；common = 交集；
//     divergeIndex = 按对比序列首个边身份不同的下标；divergeNode = 该下标 A 侧边的 from；
//   - 断言契约：HTML 高亮的分叉边集合 == path(A) Δ path(B)（集合等式，双向包含都断言）；
//     assertHighlightSet 供实现方与测试共同使用。
// 纯函数：不读文件、不取时钟、不随机。

export function edgeIdentity(e) { return e.from + ':' + e.branch; }

export function diffPaths(traceA, traceB) {
  const setA = new Set(traceA.edges.map(edgeIdentity));
  const setB = new Set(traceB.edges.map(edgeIdentity));
  const onlyA = [...setA].filter((x) => !setB.has(x));
  const onlyB = [...setB].filter((x) => !setA.has(x));
  const common = [...setA].filter((x) => setB.has(x));
  // divergeIndex：按 traceA 的边序列找首个不在 setB 中的下标
  let divergeIndex = -1;
  for (let i = 0; i < traceA.edges.length; i++) {
    if (!setB.has(edgeIdentity(traceA.edges[i]))) { divergeIndex = i; break; }
  }
  const divergeNode = divergeIndex >= 0 ? traceA.edges[divergeIndex].from : null;
  return { onlyA, onlyB, common, divergeIndex, divergeNode };
}

// 断言契约（§5）：高亮集合必须与 path(A) Δ path(B) 集合相等（双向包含）。
// highlighted：身份字符串数组（或集合）。违反 → 抛错（携带两侧差异）。
export function assertHighlightSet(traceA, traceB, highlighted) {
  const { onlyA, onlyB } = diffPaths(traceA, traceB);
  const expected = new Set([...onlyA, ...onlyB]);
  const got = new Set(highlighted);
  const missing = [...expected].filter((x) => !got.has(x));
  const extra = [...got].filter((x) => !expected.has(x));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error('assertHighlightSet：高亮集合 ≠ path Δ path（缺失 [' + missing.join(', ') + ']，多余 [' + extra.join(', ') + ']）');
  }
}
