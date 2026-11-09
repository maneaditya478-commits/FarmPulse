export const colors = {
  leaf50: '#f3faf2',
  leaf100: '#e3f4e1',
  leaf200: '#c6e8c2',
  leaf300: '#9ad494',
  leaf600: '#2f7c2a',
  leaf700: '#276223',
  leaf800: '#234f21',
  background: '#f6faf4',
  card: '#ffffff',
  border: '#e2e8e4',
  text: '#0f172a',
  muted: '#64748b',
  danger: '#b91c1c',
  dangerSoft: '#fef2f2',
  warning: '#92400e',
  warningSoft: '#fffbeb',
  info: '#1d4ed8',
  infoSoft: '#eff6ff',
  success: '#166534',
  successSoft: '#f0fdf4',
};

export const severityColor = (severity?: string | null) => {
  switch (severity) {
    case 'critical':
      return { bg: colors.dangerSoft, fg: colors.danger };
    case 'high':
      return { bg: '#fff7ed', fg: '#c2410c' };
    case 'medium':
      return { bg: colors.warningSoft, fg: colors.warning };
    default:
      return { bg: colors.leaf50, fg: colors.leaf700 };
  }
};
