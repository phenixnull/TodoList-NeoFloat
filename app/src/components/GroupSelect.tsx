import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { dialog, type DialogOption } from './dialog/dialogs';
import PressableScale from './PressableScale';
import { useHabitStore } from '../store/useHabitStore';
import { useTheme } from '../theme/theme';

const GROUP_COLORS = [
  '#22d3ee',
  '#a78bfa',
  '#f472b6',
  '#fb923c',
  '#34d399',
  '#facc15',
  '#60a5fa',
  '#f87171',
  '#2dd4bf',
  '#c084fc',
];

type Props = {
  label: string;
  groups: string[];
  selected: string[];
  allLabel: string;
  onChange: (groups: string[]) => void;
  onCreateGroup?: (name: string) => void;
  onRenameGroup?: (oldName: string, newName: string) => void;
  onDeleteGroup?: (group: string) => void;
  light?: boolean;
};

export default function GroupSelect({
  label,
  groups,
  selected,
  allLabel,
  onChange,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  light = false,
}: Props) {
  const { settings } = useHabitStore();
  const theme = useTheme(light ? 'light' : settings.appearance);
  const [creatorVisible, setCreatorVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');

  const toggle = (group: string) => {
    onChange(selected.includes(group)
      ? selected.filter((item) => item !== group)
      : [...selected, group]);
  };

  const colorFor = (group: string) => {
    const index = group === allLabel ? -1 : groups.indexOf(group);
    return GROUP_COLORS[(index < 0 ? 0 : index) % GROUP_COLORS.length];
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

  const submitRename = () => {
    const nextName = renameName.trim();
    if (!renameTarget || !nextName || nextName === renameTarget) {
      setRenameTarget(null);
      return;
    }
    onRenameGroup?.(renameTarget, nextName);
    setRenameTarget(null);
  };

  const showGroupActions = (group: string) => {
    const options: DialogOption[] = [];

    if (onRenameGroup) {
      options.push({
        text: '改名',
        icon: 'pencil-outline',
        onPress: () => {
          setRenameName(group);
          setRenameTarget(group);
        },
      });
    }
    if (onDeleteGroup) {
      options.push({
        text: '删除',
        icon: 'trash-outline',
        danger: true,
        onPress: () => onDeleteGroup(group),
      });
    }
    if (!options.length) return;

    dialog.sheet({
      title: `抽屉：${group}`,
      message: '选择改名或删除。',
      options,
    });
  };

  const optionStyle = (active: boolean, color: string) => [
    styles.option,
    active && {
      backgroundColor: `${color}1f`,
      borderColor: `${color}88`,
    },
  ];

  const optionColor = (active: boolean, color: string) => (active ? color : theme.isLight ? '#475569' : '#64748b');

  return (
    <View style={styles.stack}>
      <PressableScale
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected.length === 0 }}
        style={optionStyle(selected.length === 0, '#22d3ee')}
        onPress={() => onChange([])}
      >
        <Text numberOfLines={1} style={[styles.optionText, { color: optionColor(selected.length === 0, '#22d3ee') }]}>
          {allLabel}
        </Text>
        <MaterialCommunityIcons
          name={selected.length === 0 ? 'check-circle' : 'circle-outline'}
          size={22}
          color={selected.length === 0 ? '#22d3ee' : theme.isLight ? '#94a3b8' : '#64748b'}
        />
      </PressableScale>

      {groups.map((group) => {
        const active = selected.includes(group);
        const color = colorFor(group);

        return (
          <PressableScale
            key={group}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`分组 ${group}，${active ? '已选中' : '未选中'}，长按管理`}
            style={optionStyle(active, color)}
            onPress={() => toggle(group)}
            onLongPress={() => showGroupActions(group)}
          >
            <Text numberOfLines={1} style={[styles.optionText, { color: optionColor(active, color) }]}>
              {group}
            </Text>
            <MaterialCommunityIcons
              name={active ? 'check-circle' : 'circle-outline'}
              size={22}
              color={active ? color : theme.isLight ? '#94a3b8' : '#64748b'}
            />
          </PressableScale>
        );
      })}

      {onCreateGroup ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`新增${label}`}
          style={[styles.option, styles.addButton, {
            backgroundColor: theme.isLight ? 'rgba(100,116,139,0.10)' : 'rgba(100,116,139,0.14)',
            borderColor: theme.surfaceBorder,
          }]}
          onPress={() => {
            setNewName('');
            setCreatorVisible(true);
          }}
        >
          <Text style={[styles.optionText, { color: theme.isLight ? '#475569' : '#94a3b8' }]}>
            新增分组
          </Text>
          <MaterialCommunityIcons name="plus" size={24} color={theme.isLight ? '#475569' : '#94a3b8'} />
        </PressableScale>
      ) : null}

      <Modal transparent visible={creatorVisible} animationType="fade" onRequestClose={() => setCreatorVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCreatorVisible(false)}>
          <Pressable style={[styles.modalCard, {
            backgroundColor: theme.isLight ? 'rgba(255,255,255,0.98)' : '#0b1024',
            borderColor: theme.surfaceBorder,
          }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>新增{label}</Text>
            <TextInput
              autoFocus
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={submitNewGroup}
              placeholder="输入分组名称"
              placeholderTextColor={theme.mutedText}
              style={[styles.modalInput, {
                borderColor: theme.inputBorder,
                backgroundColor: theme.inputBackground,
                color: theme.text,
              }]}
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.action, { borderColor: theme.surfaceBorder }]} onPress={() => setCreatorVisible(false)}>
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

      <Modal transparent visible={Boolean(renameTarget)} animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRenameTarget(null)}>
          <Pressable style={[styles.modalCard, {
            backgroundColor: theme.isLight ? 'rgba(255,255,255,0.98)' : '#0b1024',
            borderColor: theme.surfaceBorder,
          }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>重命名{label}</Text>
            <TextInput
              autoFocus
              value={renameName}
              onChangeText={setRenameName}
              onSubmitEditing={submitRename}
              placeholder="输入新的分组名称"
              placeholderTextColor={theme.mutedText}
              style={[styles.modalInput, {
                borderColor: theme.inputBorder,
                backgroundColor: theme.inputBackground,
                color: theme.text,
              }]}
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.action, { borderColor: theme.surfaceBorder }]} onPress={() => setRenameTarget(null)}>
                <Text style={[styles.actionText, { color: theme.mutedText }]}>取消</Text>
              </Pressable>
              <Pressable
                style={[styles.action, styles.primaryAction, { backgroundColor: theme.accent }]}
                onPress={submitRename}
              >
                <Text style={[styles.actionText, { color: theme.onAccent }]}>保存</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 9,
  },
  option: {
    width: '100%',
    minHeight: 54,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: 'rgba(100,116,139,0.12)',
  },
  addButton: {
    borderStyle: 'dashed',
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.68)',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 14,
  },
  modalInput: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  modalActions: {
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
