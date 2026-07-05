import type { MarketplaceSourceInfo } from '@aaif/goose-sdk';
import { Button } from '../ui/button';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  title: { id: 'marketplaces.trust.title', defaultMessage: 'Confirm installation' },
  sourceLabel: { id: 'marketplaces.trust.sourceLabel', defaultMessage: 'Source' },
  pluginsLabel: { id: 'marketplaces.trust.pluginsLabel', defaultMessage: 'Plugins to install' },
  warning: {
    id: 'marketplaces.trust.warning',
    defaultMessage:
      'Plugins may include hooks that run local commands and MCP servers. Only install from sources you trust.',
  },
  cancel: { id: 'marketplaces.trust.cancel', defaultMessage: 'Cancel' },
  confirm: { id: 'marketplaces.trust.confirm', defaultMessage: 'Install' },
  installing: { id: 'marketplaces.trust.installing', defaultMessage: 'Installing…' },
});

export interface TrustDialogProps {
  open: boolean;
  source?: MarketplaceSourceInfo;
  plugins: string[];
  installing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function TrustDialog({
  open,
  source,
  plugins,
  installing,
  onConfirm,
  onCancel,
}: TrustDialogProps) {
  const intl = useIntl();
  if (!open) {
    return null;
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={intl.formatMessage(i18n.title)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="bg-background-primary rounded-lg border border-border-primary p-6 w-full max-w-md">
        <h3 className="text-lg font-medium mb-3">{intl.formatMessage(i18n.title)}</h3>
        <div className="text-sm mb-2">
          <div className="font-medium">{intl.formatMessage(i18n.sourceLabel)}</div>
          <div className="text-text-secondary">
            {source ? `${source.name} · ${source.kind} · ${source.location}` : ''}
          </div>
        </div>
        <div className="text-sm mb-2">
          <div className="font-medium">{intl.formatMessage(i18n.pluginsLabel)}</div>
          <ul className="list-disc pl-5 text-text-secondary">
            {plugins.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-red-500 mb-4">{intl.formatMessage(i18n.warning)}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={installing}>
            {intl.formatMessage(i18n.cancel)}
          </Button>
          <Button data-testid="marketplace-trust-confirm" onClick={onConfirm} disabled={installing}>
            {installing ? intl.formatMessage(i18n.installing) : intl.formatMessage(i18n.confirm)}
          </Button>
        </div>
      </div>
    </div>
  );
}
