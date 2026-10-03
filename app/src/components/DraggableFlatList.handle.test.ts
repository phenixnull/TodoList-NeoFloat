import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';

const packageSourceRoot = join(process.cwd(), 'node_modules', 'react-native-draggable-flatlist', 'src');

describe('handle-scoped draggable list patch', () => {
  it('supports attaching the list pan gesture to an item drag handle', () => {
    const types = readFileSync(join(packageSourceRoot, 'types.ts'), 'utf8');
    const rowItem = readFileSync(join(packageSourceRoot, 'components', 'RowItem.tsx'), 'utf8');
    const list = readFileSync(join(packageSourceRoot, 'components', 'DraggableFlatList.tsx'), 'utf8');
    const home = readFileSync(join(process.cwd(), 'src', 'app', 'index.tsx'), 'utf8');

    expect(types).toContain('dragGestureDetector');
    expect(types).toContain('dragGesture?:');
    expect(types).toContain('isDragging: boolean');
    expect(rowItem).toContain('dragGestureFactory?: () => GestureType');
    expect(rowItem).toContain('dragGesture={dragGesture}');
    expect(rowItem).toContain('isDragging={!!activeKey}');
    expect(list).toContain('dragGestureFactory={createDragGesture}');
    expect(list).toContain('props.dragGestureDetector === "item"');
    expect(home).toContain('dragGestureDetector="item"');
  });

  it('can completely disable nested autoscroll during handle drags', () => {
    const nested = readFileSync(
      join(packageSourceRoot, 'components', 'NestableDraggableFlatList.tsx'),
      'utf8',
    );
    const hook = readFileSync(
      join(packageSourceRoot, 'hooks', 'useNestedAutoScroll.tsx'),
      'utf8',
    );
    const list = readFileSync(
      join(packageSourceRoot, 'components', 'DraggableFlatList.tsx'),
      'utf8',
    );
    const cellRenderer = readFileSync(
      join(packageSourceRoot, 'components', 'CellRendererComponent.tsx'),
      'utf8',
    );
    const types = readFileSync(join(packageSourceRoot, 'types.ts'), 'utf8');
    const home = readFileSync(join(process.cwd(), 'src', 'app', 'index.tsx'), 'utf8');

    expect(types).toContain('autoscrollEnabled?: boolean');
    expect(types).toContain('dropAnimationConfig?: Partial<WithSpringConfig>');
    expect(types).toContain('dropAnimationMode?: "spring" | "instant"');
    expect(nested).toContain('autoscrollEnabled: props.autoscrollEnabled');
    expect(nested).toContain('autoscrollThreshold: props.autoscrollThreshold');
    expect(hook).toContain('autoscrollEnabled = true');
    expect(hook).toContain('autoscrollEnabled &&');
    expect(list).toContain('propsRef.current.dropAnimationConfig');
    expect(list).toContain('propsRef.current.dropAnimationMode === "instant"');
    expect(cellRenderer).toContain(
      'const clearDropTransformOnRelease = useStableCallback(() => {',
    );
    expect(cellRenderer).toContain('heldTanslate.value = 0;');
    expect(cellRenderer).toContain(
      'clearDropTransformOnRelease,',
    );
    expect(cellRenderer).toContain('[activeKey, clearDropTransformOnRelease]');
    expect(cellRenderer).toContain(
      'const t = activeKey ? translate.value : 0;',
    );
    expect(home).toContain('autoscrollEnabled={false}');
    expect(home).toContain('dropAnimationConfig={DRAG_SNAP_SPRING}');
    expect(home).toContain('dropAnimationMode="instant"');
  });
});
