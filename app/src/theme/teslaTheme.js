import { createTheme } from '@mantine/core';

/** Tesla dark zinc palette — extends v3 client/src/main.jsx tokens. */
export const teslaColors = {
  dark: [
    '#e4e4e7',
    '#a1a1aa',
    '#71717a',
    '#52525b',
    '#3f3f46',
    '#27272a',
    '#18181b',
    '#0f0f11',
    '#0a0a0b',
    '#050506',
  ],
};

export const teslaTokens = {
  bg: '#0a0a0b',
  bgElevated: '#0f0f11',
  bgHover: '#18181b',
  border: '#1f1f23',
  text: '#e4e4e7',
  textMuted: '#a1a1aa',
  accent: '#3b82f6',
  statusGreen: '#22c55e',
  statusRed: '#ef4444',
  radius: '6px',
};

export const teslaTheme = createTheme({
  primaryColor: 'dark',
  defaultRadius: 'xs',
  fontFamily:
    "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontFamilyMonospace:
    "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  colors: teslaColors,
  other: {
    ...teslaTokens,
  },
  components: {
    AppShell: {
      styles: {
        navbar: {
          backgroundColor: teslaTokens.bgElevated,
          borderRight: `1px solid ${teslaTokens.border}`,
        },
        main: {
          backgroundColor: teslaTokens.bg,
        },
      },
    },
    NavLink: {
      styles: {
        root: {
          borderRadius: 4,
          color: teslaTokens.textMuted,
          '&[data-active]': {
            backgroundColor: teslaColors.dark[5],
            color: teslaTokens.text,
          },
          '&:hover': {
            backgroundColor: teslaTokens.bgHover,
          },
        },
      },
    },
    Paper: {
      defaultProps: {
        withBorder: true,
      },
      styles: {
        root: {
          backgroundColor: teslaTokens.bgElevated,
          borderColor: teslaTokens.border,
        },
      },
    },
    Select: {
      defaultProps: {
        styles: {
          input: {
            backgroundColor: teslaTokens.bgElevated,
            borderColor: teslaTokens.border,
            color: teslaTokens.text,
          },
        },
      },
    },
    TextInput: {
      defaultProps: {
        styles: {
          input: {
            backgroundColor: teslaTokens.bgElevated,
            borderColor: teslaTokens.border,
            color: teslaTokens.text,
          },
        },
      },
    },
    NumberInput: {
      defaultProps: {
        styles: {
          input: {
            backgroundColor: teslaTokens.bgElevated,
            borderColor: teslaTokens.border,
            color: teslaTokens.text,
          },
        },
      },
    },
    SegmentedControl: {
      defaultProps: {
        styles: {
          root: { backgroundColor: teslaTokens.bg },
          indicator: { backgroundColor: teslaColors.dark[5] },
          label: { color: teslaTokens.textMuted },
        },
      },
    },
    Button: {
      defaultProps: {
        styles: {
          root: { borderColor: teslaTokens.border, color: teslaTokens.text },
        },
      },
    },
    Checkbox: {
      defaultProps: {
        color: 'gray',
        styles: (theme) => ({
          input: {
            backgroundColor: theme.colors.dark[6],
            borderColor: theme.colors.dark[3],
            '&:checked': {
              backgroundColor: theme.colors.gray[4],
              borderColor: theme.colors.gray[3],
            },
          },
          icon: {
            color: theme.colors.dark[9],
          },
        }),
      },
    },
    Modal: {
      styles: {
        content: {
          backgroundColor: teslaTokens.bgElevated,
          border: `1px solid ${teslaTokens.border}`,
        },
        header: {
          backgroundColor: teslaTokens.bgElevated,
        },
      },
    },
    Table: {
      styles: {
        table: {
          '--table-border-color': teslaTokens.border,
        },
      },
    },
  },
});
