// layout.js —— 决策树布局（坐标唯一产出点）。
//
// 契约（04 §4，K 口径）：
//   - layoutGraph(graph) → { positions: {id: {x, y, depth}}, width, height }；
//   - v0 算法（确定性）：children 顺序固定 [yes, no]；中序 DFS 给叶子按访问序分配
//     x = order * X_GAP；后序回填内部节点 x = (yes.x + no.x) / 2；y = depth * Y_GAP；
//   - 双跑坐标完全相等（结构确定 → 坐标确定）；坐标只在本模块产出，渲染层只消费；
//   - M3 升级 tidy 精化（Buchheim 系）；本文件为坐标唯一产出点不变。

export const LAYOUT = Object.freeze({
  X_GAP: 150,   // 相邻叶子水平间距
  Y_GAP: 110,   // 层间垂直间距
  MARGIN: 40,   // 画布内边距
  NODE_R: 26,   // 节点半径
});

export function layoutGraph(graph) {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const isNode = (id) => nodeById.has(id);

  const positions = Object.create(null);
  let leafOrder = 0;
  let maxDepth = 0;

  // 单次迭代 DFS：叶（裁定）按中序编号；内部节点在其两个子树定位后回填中点。
  // 栈元素 {id, depth, expanded}；expanded=false 表示首次入栈（children 未压入）。
  const stack = [{ id: graph.root, depth: 0, expanded: false }];
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (!isNode(top.id)) {
      if (positions[top.id] === undefined) {
        positions[top.id] = { x: leafOrder * LAYOUT.X_GAP, y: top.depth * LAYOUT.Y_GAP, depth: top.depth };
        leafOrder += 1;
        if (top.depth > maxDepth) maxDepth = top.depth;
      }
      stack.pop();
      continue;
    }
    if (!top.expanded) {
      top.expanded = true;
      const n = nodeById.get(top.id);
      // 先压 no 再压 yes → yes 子树先处理（保持 [yes, no] 中序）
      stack.push({ id: n.no.to, depth: top.depth + 1, expanded: false });
      stack.push({ id: n.yes.to, depth: top.depth + 1, expanded: false });
      continue;
    }
    // 回填：两个分支目标均已定位
    const n = nodeById.get(top.id);
    positions[top.id] = {
      x: (positions[n.yes.to].x + positions[n.no.to].x) / 2,
      y: top.depth * LAYOUT.Y_GAP,
      depth: top.depth,
    };
    if (top.depth > maxDepth) maxDepth = top.depth;
    stack.pop();
  }

  // 居中校正：整体平移使画布从 MARGIN 开始
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of Object.values(positions)) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }
  for (const p of Object.values(positions)) {
    p.x = p.x - minX + LAYOUT.MARGIN;
    p.y = p.y + LAYOUT.MARGIN;
  }
  const width = (maxX - minX) + LAYOUT.MARGIN * 2 + LAYOUT.NODE_R;
  const height = maxDepth * LAYOUT.Y_GAP + LAYOUT.MARGIN * 2;
  return { positions, width, height };
}
