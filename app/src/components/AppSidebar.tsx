import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import PressableScale from './PressableScale';
import { useHabitStore } from '../store/useHabitStore';
import { useTheme } from '../theme/theme';

type Props = {
  onClose: () => void;
};

type NavItem = {
  icon: string;
  label: string;
  href: string;
  description?: string;
  highlight?: boolean;
};

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: '导航',
    items: [
      { icon: 'home-circle-outline', label: '打卡主页', href: '/' },
      { icon: 'format-list-checks', label: '任务库', href: '/tasks' },
    ],
  },
  {
    title: 'AI 助手',
    items: [
      {
        icon: 'microphone',
        label: 'AI 语音输入',
        href: '/voice',
        description: '说话即转文字，中英混合',
        highlight: true,
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

// Main-app-style navigation drawer content: plain nav rows plus a dedicated,
// highlighted AI STT section that opens its own sub screen.
export default function AppSidebar({ onClose }: Props) {
  const router = useRouter();
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);

  const go = (href: string) => {
    onClose();
    router.push(href as never);
  };

  return (
    <View style={[styles.panel, { backgroundColor: theme.isLight ? '#f8fafc' : '#0b1025' }]}>
      <View style={[styles.brand, { borderBottomColor: theme.surfaceBorder }]}>
        <View style={[styles.brandIcon, { backgroundColor: theme.accentBackground, borderColor: theme.accentBorder }]}>
          <MaterialCommunityIcons name="heart-pulse" size={22} color={theme.accent} />
        </View>
        <View style={styles.brandTextWrap}>
          <Text style={[styles.brandTitle, { color: theme.text }]}>HabitPulse</Text>
          <Text style={[styles.brandSubtitle, { color: theme.subtleText }]}>打卡 · 专注 · 记录</Text>
        </View>
      </View>

      {NAV_SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.subtleText }]}>{section.title}</Text>
          {section.items.map((item) => (
            <PressableScale
              key={item.href}
              onPress={() => go(item.href)}
              style={[
                styles.row,
                item.highlight
                  ? {
                      backgroundColor: theme.accentBackground,
                      borderColor: theme.accentBorder,
                    }
                  : { backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
              ]}
            >
              <View
                style={[
                  styles.rowIcon,
                  {
                    backgroundColor: item.highlight ? 'rgba(34,211,238,0.16)' : theme.inputBackground,
                    borderColor: item.highlight ? 'rgba(103,232,249,0.30)' : theme.inputBorder,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={item.icon as never}
                  size={18}
                  color={item.highlight ? theme.accent : theme.mutedText}
                />
              </View>
              <View style={styles.rowTextWrap}>
                <Text
                  style={[
                    styles.rowLabel,
                    { color: item.highlight ? theme.accentText : theme.text },
                  ]}
                >
                  {item.label}
                </Text>
                {item.description ? (
                  <Text style={[styles.rowDescription, { color: theme.subtleText }]}>{item.description}</Text>
                ) : null}
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={16}
                color={item.highlight ? theme.accent : theme.subtleText}
              />
            </PressableScale>
          ))}
        </View>
      ))}

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.subtleText }]}>
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
  },
  brandIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
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
  },
  brandSubtitle: {
    fontSize: 12,
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
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextWrap: {
    flex: 1,
    gap: 1,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  rowDescription: {
    fontSize: 11,
  },
  footer: {
    marginTop: 'auto',
    paddingBottom: 12,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
  },
});
