import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import PressableScale from './PressableScale';
import { useHabitStore } from '../store/useHabitStore';

type Props = {
  onClose: () => void;
};

type NavItem = {
  icon: string;
  label: string;
  href: string;
  description?: string;
};

// Light diary palette to match the unified page style.
const C = {
  bg: '#ffffff',
  ink: '#26262a',
  ink2: '#55555c',
  ink3: '#9a9aa2',
  ink4: '#c6c6cd',
  orange: '#f59e0b',
  orangeDeep: '#e8890c',
  line: '#ececef',
  pill: '#f5f5f6',
  dark: '#2b2b2e',
  dark2: '#48484d',
};

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: '导航',
    items: [
      { icon: 'home-circle-outline', label: '打卡主页', href: '/' },
    ],
  },
  {
    title: 'AI 助手',
    items: [
      {
        icon: 'microphone',
        label: 'AI 语音记录',
        href: '/voice',
        description: '语音速记 · 图片 · 搜索',
      },
    ],
  },
  {
    title: '更多',
    items: [
      { icon: 'message-alert-outline', label: '问题反馈', href: '/feedback' },
      { icon: 'cog-outline', label: '设置', href: '/settings' },
    ],
  },
];

export default function AppSidebar({ onClose }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { settings } = useHabitStore();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const go = (href: string) => {
    onClose();
    router.push(href as never);
  };

  return (
    <View style={[styles.panel, { backgroundColor: C.bg }]}>
      <View style={styles.brand}>
        <View style={styles.brandIcon}>
          <MaterialCommunityIcons name="heart-pulse" size={22} color={C.orange} />
        </View>
        <View style={styles.brandTextWrap}>
          <Text style={styles.brandTitle}>HabitPulse</Text>
          <Text style={styles.brandSubtitle}>打卡 · 专注 · 记录</Text>
        </View>
      </View>

      {NAV_SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.items.map((item) => {
            const active = isActive(item.href);
            return (
              <PressableScale
                key={item.href}
                onPress={() => go(item.href)}
                accessibilityState={{ selected: active }}
                style={[styles.row, active ? styles.rowActive : styles.rowIdle]}
              >
                <View style={[styles.rowIcon, active ? styles.rowIconActive : styles.rowIconIdle]}>
                  <MaterialCommunityIcons
                    name={item.icon as never}
                    size={18}
                    color={active ? '#ffffff' : C.ink2}
                  />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={[styles.rowLabel, active ? styles.rowLabelActive : null]}>
                    {item.label}
                  </Text>
                  {item.description ? (
                    <Text style={[styles.rowDescription, active ? styles.rowDescriptionActive : null]}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={16}
                  color={active ? '#ffffff' : C.ink4}
                />
              </PressableScale>
            );
          })}
        </View>
      ))}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {settings.syncEnabled ? '已连接同步服务' : '本地模式'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    paddingTop: 62,
    paddingHorizontal: 16,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 18,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  brandIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: '#fff7e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTextWrap: {
    gap: 2,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.4,
    color: C.ink,
  },
  brandSubtitle: {
    fontSize: 12,
    color: C.ink3,
  },
  section: {
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginLeft: 6,
    color: C.ink3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  rowIdle: {
    backgroundColor: C.pill,
    borderColor: C.line,
  },
  rowActive: {
    backgroundColor: C.dark,
    borderColor: C.dark,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconIdle: {
    backgroundColor: '#ffffff',
    borderColor: C.line,
  },
  rowIconActive: {
    backgroundColor: C.dark2,
    borderColor: C.dark2,
  },
  rowTextWrap: {
    flex: 1,
    gap: 1,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
  },
  rowLabelActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  rowDescription: {
    fontSize: 11,
    color: C.ink3,
  },
  rowDescriptionActive: {
    color: '#d4d4d8',
  },
  footer: {
    marginTop: 'auto',
    paddingBottom: 12,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: C.ink3,
  },
});
