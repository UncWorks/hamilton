import { addons } from 'storybook/internal/manager-api';
import { create } from 'storybook/internal/theming';

// Manager chrome in Hamilton's dark register (hex approximations of the
// OKLCH surface/text tokens — the manager UI cannot read app CSS vars).
addons.setConfig({
  theme: create({
    base: 'dark',
    brandTitle: 'H A M I L T O N',
    appBg: '#0b0e13',
    appContentBg: '#06090d',
    appBorderColor: '#1a1e25',
    barBg: '#0b0e13',
    colorSecondary: '#eb8c00',
    textColor: '#f3f2ee',
    textMutedColor: '#8a8780',
    fontBase: '"Inter Tight", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    fontCode: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  }),
});
