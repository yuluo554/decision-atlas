// layout.js —— 决策树布局（坐标唯一产出点，04 §4，M3 tidy 精化）。
//
// 契约（K 口径，动了会打挂测试）：
//   - layoutGraph(graph) →
//       { positions, width, height, edgeTarget, leafSequence }
//     positions：{key: {x, y, depth}}，键 = 全部条件节点 id + 裁定叶实例键；
//     裁定叶按引用实例化：首次中序可达实例沿用裁定 id，后续实例键为 `id#2`/`id#3`…
//     （这是 v0 → M3 的 tidy 核心修正：共享裁定不再挤在单一坐标上产生长回边）；
//     edgeTarget：{'from:branch': positions 键}——每条边的实际目标实例（渲染层据此取端点）；
//     leafSequence：中序叶序（positions 键数组），叶子 x 沿该序列严格递增；
//   - 确定性：结构确定 → 坐标确定；双跑（含全部附加字段）完全相等；
//   - 结构不变量：叶子 x 严格递增（沿 leafSequence）；父节点 x = 两个子实例 x 的中点
//     （满足 K-6 放宽口径"居中于子节点范围"）；无重叠（相邻子树轮廓间距 ≥ X_GAP - 2·NODE_R，
//     构造性下界：任意节点 x 落在其子树叶跨度内，故间隙恒 ≥ 叶距 - 2R，无需位移步骤）；
//   - children 顺序固定 [yes, no]；渲染层只消费坐标，不做任何坐标运算（样式偏移除外）。

export const LAYOUT = Object.freeze({
  X_GAP: 150,   // 相邻叶子水平间距
  Y_GAP: 110,   // 层间垂直间距
  MARGIN: 40,   // 画布内边距
  NODE_R: 26,   // 节点半径
});

export function layoutGraph(graph) {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const isNode = (id) => nodeById.has(id);

  // 裁定叶实例键分配：同 id 第 1 次中序可达 → 原 id，之后 → id#2、id#3…
  //（preorder 与 inorder 的叶访问序一致，构造期编号即中序编号）
  const verdictSeq = new Map();
  const leafKeyOf = new Map(); // from:branch → positions 键（构建期顺带登记）
  function verdictKey(id) {
    const n = (verdictSeq.get(id) || 0) + 1;
    verdictSeq.set(id, n);
    return n === 1 ? id : id + '#' + n;
  }

  // 实例树：条件节点每 id 恰一实例（schema 保证树形：无环、单亲、全可达）；
  // 裁定引用 = 独立叶实例。
  function buildInstance(id, depth) {
    const inst = { id, key: id, depth, children: [], leaf: !isNode(id) };
    if (inst.leaf) inst.key = verdictKey(id);
    else instByIdSet(id, inst);
    if (!inst.leaf) {
      const n = nodeById.get(id);
      const yes = childInstance(n.yes.to, depth + 1, id + ':yes');
      const no = childInstance(n.no.to, depth + 1, id + ':no');
      inst.children = [yes, no];
    }
    return inst;
  }
  function childInstance(id, depth, edgeId) {
    if (isNode(id)) {
      const existing = instByIdGet(id);
      if (existing !== undefined) { leafKeyOf.set(edgeId, existing.key); return existing; }
      const inst = buildInstance(id, depth);
      leafKeyOf.set(edgeId, inst.key);
      return inst;
    }
    const inst = buildInstance(id, depth);
    leafKeyOf.set(edgeId, inst.key);
    return inst;
  }
  // 条件节点实例注册表（独立小 Map，避免与叶实例键混淆）
  const nodeInstances = new Map();
  function instByIdSet(id, inst) { nodeInstances.set(id, inst); }
  function instByIdGet(id) { return nodeInstances.get(id); }

  const rootInst = buildInstance(graph.root, 0);

  // 迭代后序：叶铺 x = leafOrder * X_GAP；内部节点 x = 两子实例中点。
  const postorder = [];
  const stack = [{ inst: rootInst, phase: 0 }];
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (top.phase === 0) {
      top.phase = 1;
      for (let i = top.inst.children.length - 1; i >= 0; i--) {
        stack.push({ inst: top.inst.children[i], phase: 0 });
      }
    } else {
      postorder.push(top.inst);
      stack.pop();
    }
  }

  let leafOrder = 0;
  let maxDepth = 0;
  const leafSequence = [];
  for (const inst of postorder) {
    if (inst.depth > maxDepth) maxDepth = inst.depth;
    if (inst.children.length === 0) {
      inst.x = leafOrder * LAYOUT.X_GAP;
      leafSequence.push(inst.key);
      leafOrder += 1;
    } else {
      const [yes, no] = inst.children;
      inst.x = (yes.x + no.x) / 2;
    }
  }

  // 整体平移：使最小 x 落在 MARGIN
  let minX = Infinity;
  let maxX = -Infinity;
  const all = [];
  collect(rootInst, all);
  for (const inst of all) {
    if (inst.x < minX) minX = inst.x;
    if (inst.x > maxX) maxX = inst.x;
  }
  const positions = Object.create(null);
  for (const inst of all) {
    positions[inst.key] = {
      x: inst.x - minX + LAYOUT.MARGIN,
      y: inst.depth * LAYOUT.Y_GAP + LAYOUT.MARGIN,
      depth: inst.depth,
    };
  }
  const edgeTarget = Object.create(null);
  for (const [edgeId, key] of leafKeyOf) edgeTarget[edgeId] = key;
  const width = maxX - minX + LAYOUT.MARGIN * 2 + LAYOUT.NODE_R;
  const height = maxDepth * LAYOUT.Y_GAP + LAYOUT.MARGIN * 2;
  return { positions, width, height, edgeTarget, leafSequence };
}

function collect(inst, out) {
  out.push(inst);
  for (const c of inst.children) collect(c, out);
}
