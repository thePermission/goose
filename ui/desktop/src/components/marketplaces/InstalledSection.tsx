import { useState } from 'react';
import type { InstalledPluginInfo } from '@aaif/goose-sdk';
import { useMarketplace } from './MarketplaceContext';
import { errorMessage } from './errorMessage';
import { toastService } from '../../toasts';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  heading: { id: 'marketplaces.installed.heading', defaultMessage: 'Installed' },
  empty: { id: 'marketplaces.installed.empty', defaultMessage: 'No plugins installed yet.' },
  loading: { id: 'marketplaces.installed.loading', defaultMessage: 'Loading installed plugins…' },
  autoUpdateOn: { id: 'marketplaces.installed.autoUpdateOn', defaultMessage: 'Auto-update: on' },
  autoUpdateOff: { id: 'marketplaces.installed.autoUpdateOff', defaultMessage: 'Auto-update: off' },
  enableLabel: { id: 'marketplaces.installed.enableLabel', defaultMessage: 'Enable {name}' },
  update: { id: 'marketplaces.installed.update', defaultMessage: 'Update' },
  updating: { id: 'marketplaces.installed.updating', defaultMessage: 'Updating…' },
  updateFailed: { id: 'marketplaces.installed.updateFailed', defaultMessage: 'Failed to update plugin' },
  toggleFailed: { id: 'marketplaces.installed.toggleFailed', defaultMessage: 'Failed to change plugin state' },
});

function InstalledPluginRow({ plugin }: { plugin: InstalledPluginInfo }) {
  const intl = useIntl();
  const { setPluginEnabled, updatePlugin } = useMarketplace();
  const [enabled, setEnabled] = useState(plugin.enabled);
  const [updating, setUpdating] = useState(false);
  const [toggling, setToggling] = useState(false);

  const handleToggle = async (next: boolean) => {
    setEnabled(next);
    setToggling(true);
    try {
      await setPluginEnabled(plugin.name, next);
    } catch (e) {
      setEnabled(!next);
      toastService.error({
        title: intl.formatMessage(i18n.toggleFailed),
        msg: errorMessage(e),
        traceback: errorMessage(e),
      });
    } finally {
      setToggling(false);
    }
  };

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await updatePlugin(plugin.name);
    } catch (e) {
      toastService.error({
        title: intl.formatMessage(i18n.updateFailed),
        msg: errorMessage(e),
        traceback: errorMessage(e),
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <li
      data-testid={`installed-plugin-${plugin.name}`}
      className="flex items-center justify-between border border-border-primary rounded-md px-3 py-2"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">
          {plugin.name} <span className="text-text-secondary">v{plugin.version}</span>
        </div>
        <div className="text-xs text-text-secondary truncate">{plugin.source}</div>
        <div className="text-xs text-text-secondary">
          {plugin.autoUpdate
            ? intl.formatMessage(i18n.autoUpdateOn)
            : intl.formatMessage(i18n.autoUpdateOff)}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {plugin.updatable && (
          <Button variant="secondary" size="sm" onClick={handleUpdate} disabled={updating}>
            {updating ? intl.formatMessage(i18n.updating) : intl.formatMessage(i18n.update)}
          </Button>
        )}
        <Switch
          aria-label={intl.formatMessage(i18n.enableLabel, { name: plugin.name })}
          checked={enabled}
          disabled={toggling}
          onCheckedChange={handleToggle}
        />
      </div>
    </li>
  );
}

export default function InstalledSection() {
  const intl = useIntl();
  const { installedPlugins, loading, errors } = useMarketplace();

  return (
    <section aria-label={intl.formatMessage(i18n.heading)}>
      <h2 className="text-lg font-medium mb-3">{intl.formatMessage(i18n.heading)}</h2>
      {errors.installed !== null && (
        <p role="alert" className="text-sm text-red-500 mb-3">
          {errors.installed}
        </p>
      )}
      {loading.installed && installedPlugins.length === 0 ? (
        <p className="text-sm text-text-secondary">{intl.formatMessage(i18n.loading)}</p>
      ) : installedPlugins.length === 0 && errors.installed === null ? (
        <p className="text-sm text-text-secondary">{intl.formatMessage(i18n.empty)}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {installedPlugins.map((p) => (
            <InstalledPluginRow key={p.name} plugin={p} />
          ))}
        </ul>
      )}
    </section>
  );
}
