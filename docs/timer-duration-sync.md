# 计时总时长与时间段同步设计

## 目标

一张任务卡同时有两类时间数据：

1. **时间段记录（timerSegments）**：一次开始/暂停，或手工补录的一段起止时间。
2. **手动剩余时长（manualDurationMs）**：没有落到具体时间段的补充时长。

任务总时长固定使用：

```text
total = closedSegmentMs + liveSegmentMs + max(0, manualDurationMs)
```

用户在编辑页输入的“耗时”按 **任务总时长目标值** 解释，不再只是追加的 manual 值。

## 修改总时长的统一算法

`setTaskTotalDuration(task, targetMs, now)` 的规则：

1. `targetMs < 0` 按 0 处理。
2. 如果任务正在计时，先把当前打开的 segment 的 `stopAt` 锁定到保存时间。
   - 否则 open duration 会持续增长，用户刚保存的目标值马上又会失真。
3. 计算锁存后的 segment 总时长 `segmentMs`。
4. 从最新时间段往旧时间段裁剪：
   - `targetMs >= segmentMs`：保留全部时间段，`manualDurationMs = targetMs - segmentMs`。
   - `targetMs < segmentMs`：优先缩短最新时间段；如果整个最新时间段都要去掉，则删除该 segment。
   - `targetMs = 0`：删除全部时间段，且 `manualDurationMs = 0`。
5. 被完整删除的 segment id 进入 `removedSegmentIds`。
6. 一次 patch 同时提交：
   - `timerSegments`
   - `manualDurationMs`
   - `removedSegmentIds`

因此：

- 输入总时长 >= 已记录时间段总和：只增加无明细的 manual 补充。
- 输入总时长 < 已记录时间段总和：通过裁剪明细把总时长降到目标值。
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

- 编辑页字段显示“总耗时”，当前计时中会显示提示：保存时会先按当前时间锁存。
- 卡片累计耗时使用 `calculateTaskDurationMs(task, now)`，避免只看当天 segment 漏掉历史时间段。
- 手工输入不再是“追加时间”，而是“设置总耗时目标”。
