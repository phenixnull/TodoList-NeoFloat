# 计时总时长与时间段同步设计

## 目标

一张任务卡同时有两类时间数据：

1. **时间段记录（timerSegments）**：一次开始/暂停，或手工补录的一段起止时间。
2. **手动时长 / 校准（manualDurationMs）**：用户独立维护的补充或扣减值，可以为负数。

manualDurationMs 可以是正数（补充）或负数（校准扣除）：

```text
total = max(0, closedSegmentMs + liveSegmentMs + manualDurationMs)
```

用户在编辑页直接编辑 manual 值；这个操作 **不会删除/裁剪时间段**。

### 手动值单独编辑

当用户只修改“手动时长 / 校准”时：

1. `timerSegments` 不参与这次 patch。
2. `manualDurationMs` 原样保存，支持正数和负数。
3. 总耗时立即变成 `max(0, 当前时间段合计 + 新 manual 值)`。
4. 之后新增、删除或编辑时间段，manual 值保持不变。
5. 如果任务正在计时，manual 值不需要锁定；计时会让总耗时继续实时增加。

## 修改总时长的统一算法

`setTaskTotalDuration(task, targetMs, now)` 的规则：

1. 如果任务正在计时，先把进行中 segment 的 `stopAt` 锁定到保存时间。
2. 计算锁存后的 segment 总时长 `segmentMs`。
3. 只写入一个 signed manual 校准值，不裁剪时间段：
   - `targetMs >= segmentMs`：`manualDurationMs = targetMs - segmentMs`。
   - `targetMs < segmentMs`：`manualDurationMs = targetMs - segmentMs`（负数）。
   - `targetMs = 0`：`manualDurationMs = -segmentMs`。
4. 不裁剪时间段，不新增 `removedSegmentIds`。

因此：

- 输入总时长 >= 已记录时间段总和：manual 为正数补充。
- 输入总时长 < 已记录时间段总和：manual 为负数校准，不破坏时间段历史。
- 输入总时长 = 已记录时间段总和：manual 清零，但时间段保留。

## 删除/清空时间段

删除单段、清空某一天、重置全部，都不能只提交“剩余列表”。

服务端需要保留明确的删除意图：

```text
tombstones = old.removedSegmentIds ∪ patch.removedSegmentIds
active = (old.timerSegments ∪ patch.timerSegments) - tombstones
```

这样做的好处：

- 手机端删除时间段后，刷新不会被服务端 union 重新拉回来。
- 两个设备同时新增各自的计时段时，仍然互不覆盖。
- 一台设备离线删除后，后续整任务同步也会携带 tombstone，不会复活已删段。
- 修改某个既有 segment 的起止时间时，因为它仍使用原 id，会按新时间覆盖旧值。

## 并发与刷新顺序

1. 客户端先本地提交新的 task 状态。
2. PATCH 携带完整 segment 列表、manual、以及本次新增 tombstone。
3. 服务端合并后更新 `updated_at`。
4. SSE/轮询刷新拿到的是服务端合并后的权威快照。
5. 本地 full-state sync 也必须携带 `removedSegmentIds`，避免离线后刷新复活旧段。

## 用户可见语义

- 编辑页字段显示“手动时长 / 校准”；普通输入是补充，`-` 开头是扣减。
- 卡片累计耗时使用 `calculateTaskDurationMs(task, now)`，避免只看当天 segment 漏掉历史时间段。
- “设置总耗时目标”只在显式调用 `setTaskTotalDuration` 时使用；它也是通过 signed manual 校准实现，不自动删段。
