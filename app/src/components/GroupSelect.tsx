import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import PressableScale from './PressableScale';
import { useHabitStore } from '../store/useHabitStore';
import { useTheme } from '../theme/theme';

type Props = {
  label: string;
  groups: string[];
  selected: string[];
  allLabel: string;
  onChange: (groups: string[]) => void;
  onCreateGroup?: (name: string) => void;
  onGroupLongPress?: (group: string) => void;
};

type Rect = { x: number; y: number; width: number; height: number };

export default function GroupSelect({
  label,
  groups,
  selected,
  allLabel,
  onChange,
  onCreateGroup,
  onGroupLongPress,
}: Props) {
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);
  const triggerRef = useRef<View | null>(null);
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<Rect>({ x: 20, y: 220, width: 320, height: 56 });
  const [creatorVisible, setCreatorVisible] = useState(false);
  const [newName, setNewName] = useState('');

  const selectedLabel = selected.length === 0
    ? allLabel
    : selected.length === 1
      ? selected[0]
      : `${selected[0]} +${selected.length - 1}`;

  const open = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setRect({ x, y, width, height });
      setVisible(true);
    });
  }, []);

  const toggle = (group: string) => {
    onChange(selected.includes(group)
      ? selected.filter((item) => item !== group)
      : [...selected, group]);
  };

  const submitNewGroup = () => {
    const name = newName.trim();
    if (!name) {
      setCreatorVisible(false);
      return;
    }
    onCreateGroup?.(name);
    setNewName('');
    setCreatorVisible(false);
  };

  return (
    <>
      <Pressable
        ref={triggerRef}
        accessibilityRole="button"
        accessibilityLabel={`${label}，当前${selectedLabel}`}
        style={[
          styles.trigger,
          selected.length > 0 && styles.triggerActive,
          { backgroundColor: theme.surface, borderColor: selected.length > 0 ? theme.accentBorder : theme.surfaceBorder },
        ]}
        onPress={open}
      >
        <View style={[styles.leadingIcon, { backgroundColor: theme.accentBackground }]}>
          <MaterialCommunityIcons name="shape" size={19} color={theme.accentText} />
        </View>
        <View style={styles.triggerText}>
          <Text style={[styles.triggerCaption, { color: theme.subtleText }]}>{label}</Text>
          <Text numberOfLines={1} style={[styles.triggerValue, { color: selected.length ? theme.text : theme.mutedText }]}>
            {selectedLabel}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-down" size={22} color={theme.mutedText} />
      </Pressable>

      <Modal transparent visible={visible} animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable
            style={[
              styles.sheet,
              {
                left: rect.x,
                top: Math.min(rect.y + rect.height + 8, 620),
                width: rect.width,
                backgroundColor: theme.isLight ? 'rgba(255,255,255,0.98)' : '#0b1024',
                borderColor: theme.surfaceBorder,
              },
            ]}
          >
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.text }]}>{label}</Text>
              <View style={styles.headerActions}>
                {onCreateGroup ? (
                  <PressableScale
                    accessibilityLabel={`新增${label}`}
                    style={[styles.iconButton, { backgroundColor: theme.accentBackground, borderColor: theme.accentBorder }]}
                    onPress={() => {
                      setNewName('');
                      setCreatorVisible(true);
                    }}
                  >
                    <MaterialCommunityIcons name="plus" size={19} color={theme.accentText} />
                  </PressableScale>
                ) : null}
                <PressableScale
                  accessibilityLabel="完成选择"
                  style={[styles.doneButton, { backgroundColor: theme.accent }]}
                  onPress={() => setVisible(false)}
                >
                  <MaterialCommunityIcons name="check" size={19} color={theme.onAccent} />
                </PressableScale>
              </View>
            </View>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
              <PressableScale
                style={[
                  styles.option,
                  selected.length === 0 && styles.optionActive,
                  { borderColor: selected.length === 0 ? theme.accentBorder : 'transparent', backgroundColor: selected.length === 0 ? theme.accentBackground : 'transparent' },
                ]}
                onPress={() => onChange([])}
              >
                <Text numberOfLines={1} style={[styles.optionText, { color: selected.length === 0 ? theme.accentText : theme.text }]}>
                  {allLabel}
                </Text>
                <MaterialCommunityIcons
                  name={selected.length === 0 ? 'check-circle' : 'circle-outline'}
                  size={21}
                  color={selected.length === 0 ? theme.accentText : theme.mutedText}
                />
              </PressableScale>

              {groups.map((group) => {
                const active = selected.includes(group);
                return (
                  <PressableScale
                    key={group}
                    style={[
                      styles.option,
                      active && styles.optionActive,
                      { borderColor: active ? theme.accentBorder : 'transparent', backgroundColor: active ? theme.accentBackground : 'transparent' },
                    ]}
                    onPress={() => toggle(group)}
                    onLongPress={onGroupLongPress ? () => onGroupLongPress(group) : undefined}
                  >
                    <Text numberOfLines={1} style={[styles.optionText, { color: active ? theme.accentText : theme.text }]}>
                      {group}
                    </Text>
                    <MaterialCommunityIcons
                      name={active ? 'check-circle' : 'circle-outline'}
                      size={21}
                      color={active ? theme.accentText : theme.mutedText}
                    />
                  </PressableScale>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent visible={creatorVisible} animationType="fade" onRequestClose={() => setCreatorVisible(false)}>
        <Pressable style={styles.creatorBackdrop} onPress={() => setCreatorVisible(false)}>
          <Pressable style={[styles.creator, { backgroundColor: theme.isLight ? 'rgba(255,255,255,0.98)' : '#0b1024', borderColor: theme.surfaceBorder }]}>
            <Text style={[styles.creatorTitle, { color: theme.text }]}>新建分组</Text>
            <TextInput
              autoFocus
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={submitNewGroup}
              placeholder="输入分组名称"
              placeholderTextColor={theme.mutedText}
              style={[styles.creatorInput, {
                borderColor: theme.inputBorder,
                backgroundColor: theme.inputBackground,
                color: theme.text,
              }]}
            />
            <View style={styles.creatorActions}>
              <Pressable
                style={[styles.action, { borderColor: theme.surfaceBorder }]}
                onPress={() => setCreatorVisible(false)}
              >
                <Text style={[styles.actionText, { color: theme.mutedText }]}>取消</Text>
              </Pressable>
              <Pressable
                style={[styles.action, styles.primaryAction, { backgroundColor: theme.accent }]}
                onPress={submitNewGroup}
              >
                <Text style={[styles.actionText, { color: theme.onAccent }]}>保存</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: '100%',
    minHeight: 58,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  triggerActive: {
    borderWidth: 1.5,
  },
  leadingIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerText: {
    flex: 1,
    gap: 2,
  },
  triggerCaption: {
    fontSize: 11,
    fontWeight: '700',
  },
  triggerValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.42)',
  },
  sheet: {
    position: 'absolute',
    maxHeight: 400,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#020617',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 16 },
    elevation: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    maxHeight: 310,
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 12,
    gap: 5,
  },
  option: {
    minHeight: 46,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  optionActive: {
    borderWidth: 1.5,
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    paddingRight: 10,
  },
  creatorBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.68)',
    paddingHorizontal: 24,
  },
  creator: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
  },
  creatorTitle: {
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 14,
  },
  creatorInput: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  creatorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  action: {
    minWidth: 86,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  primaryAction: {
    borderColor: 'transparent',
  },
  actionText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
