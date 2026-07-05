import { useState } from 'react';
import { useMarketplace, type InstallOutcome } from './MarketplaceContext';
import { toastService } from '../../toasts';
import { Button } from '../ui/button';
import TrustDialog from './TrustDialog';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  heading: { id: 'marketplaces.browse.heading', defaultMessage: 'Browse' },
  selectLabel: { id: 'marketplaces.browse.selectLabel', defaultMessage: 'Marketplace' },
  browseButton: { id: 'marketplaces.browse.browseButton', defaultMessage: 'Browse' },
  browsing: { id: 'marketplaces.browse.browsing', defaultMessage: 'Browsing…' },
  noSource: { id: 'marketplaces.browse.noSource', defaultMessage: 'Add a source to browse its catalog.' },
  empty: { id: 'marketplaces.browse.empty', defaultMessage: 'No plugins in this catalog.' },
  unsupported: { id: 'marketplaces.browse.unsupported', defaultMessage: 'Unsupported' },
  install: { id: 'marketplaces.browse.install', defaultMessage: 'Install selected' },
  resultsHeading: { id: 'marketplaces.browse.resultsHeading', defaultMessage: 'Installation results' },
  resultSuccess: {
    id: 'marketplaces.browse.resultSuccess',
    defaultMessage: '{name}: installed (skills: {skills}, hooks: {hooks}, MCP: {mcp})',
  },
  resultFailure: { id: 'marketplaces.browse.resultFailure', defaultMessage: '{name}: failed — {error}' },
  installSucceeded: { id: 'marketplaces.browse.installSucceeded', defaultMessage: 'Plugins installed' },
  installPartial: { id: 'marketplaces.browse.installPartial', defaultMessage: 'Some plugins failed to install' },
  yes: { id: 'marketplaces.browse.yes', defaultMessage: 'yes' },
  no: { id: 'marketplaces.browse.no', defaultMessage: 'no' },
});

export default function BrowseSection() {
  const intl = useIntl();
  const { sources, catalog, browsedSource, browse, install, loading, errors } = useMarketplace();
  const [selectedSource, setSelectedSource] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trustOpen, setTrustOpen] = useState(false);
  const [results, setResults] = useState<InstallOutcome[] | null>(null);

  const activeSource = selectedSource || sources[0]?.name || '';
  const selectedPlugins = [...selected];
  const trustSource = sources.find((s) => s.name === (browsedSource ?? activeSource));

  const toggleSelected = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleConfirmInstall = async () => {
    const marketplace = browsedSource ?? activeSource;
    const outcomes = await install(marketplace, selectedPlugins);
    setResults(outcomes);
    setTrustOpen(false);
    setSelected(new Set());
    if (outcomes.every((o) => o.ok)) {
      toastService.success({ title: intl.formatMessage(i18n.installSucceeded), msg: '' });
    } else {
      toastService.error({
        title: intl.formatMessage(i18n.installPartial),
        msg: outcomes.filter((o) => !o.ok).map((o) => o.plugin).join(', '),
        traceback: '',
      });
    }
  };

  if (sources.length === 0) {
    return (
      <section aria-label={intl.formatMessage(i18n.heading)}>
        <h2 className="text-lg font-medium mb-3">{intl.formatMessage(i18n.heading)}</h2>
        <p className="text-sm text-text-secondary">{intl.formatMessage(i18n.noSource)}</p>
      </section>
    );
  }

  return (
    <section aria-label={intl.formatMessage(i18n.heading)}>
      <h2 className="text-lg font-medium mb-3">{intl.formatMessage(i18n.heading)}</h2>

      <div className="flex items-center gap-2 mb-4">
        <select
          data-testid="marketplace-browse-select"
          aria-label={intl.formatMessage(i18n.selectLabel)}
          value={activeSource}
          onChange={(e) => setSelectedSource(e.target.value)}
          className="h-9 rounded-md border border-border-primary bg-background-primary px-3 text-sm"
        >
          {sources.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <Button
          data-testid="marketplace-browse"
          onClick={() => browse(activeSource)}
          disabled={loading.browse}
        >
          {loading.browse ? intl.formatMessage(i18n.browsing) : intl.formatMessage(i18n.browseButton)}
        </Button>
      </div>

      {errors.browse !== null && (
        <p role="alert" className="text-sm text-red-500 mb-3">
          {errors.browse}
        </p>
      )}

      {browsedSource !== null && catalog.length === 0 && !loading.browse && (
        <p className="text-sm text-text-secondary mb-3">{intl.formatMessage(i18n.empty)}</p>
      )}

      {catalog.length > 0 && (
        <>
          <ul className="flex flex-col gap-2 mb-4">
            {catalog.map((p) => (
              <li
                key={p.name}
                className="flex items-start gap-3 border border-border-primary rounded-md px-3 py-2"
              >
                <input
                  type="checkbox"
                  aria-label={p.name}
                  disabled={!p.installable}
                  checked={selected.has(p.name)}
                  onChange={() => toggleSelected(p.name)}
                  className="mt-1"
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {p.name}
                    {!p.installable && (
                      <span className="ml-2 text-xs text-text-secondary">
                        ({intl.formatMessage(i18n.unsupported)})
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <div className="text-xs text-text-secondary">{p.description}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <Button
            data-testid="marketplace-install"
            onClick={() => setTrustOpen(true)}
            disabled={selectedPlugins.length === 0 || loading.install}
          >
            {intl.formatMessage(i18n.install)}
          </Button>
        </>
      )}

      {results !== null && (
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-2">{intl.formatMessage(i18n.resultsHeading)}</h3>
          <ul className="flex flex-col gap-1">
            {results.map((o) =>
              o.ok ? (
                <li key={o.plugin} className="text-sm text-text-secondary">
                  {intl.formatMessage(i18n.resultSuccess, {
                    name: o.plugin,
                    skills: o.result.skills.length,
                    hooks: o.result.hasHooks ? intl.formatMessage(i18n.yes) : intl.formatMessage(i18n.no),
                    mcp: o.result.hasMcp ? intl.formatMessage(i18n.yes) : intl.formatMessage(i18n.no),
                  })}
                </li>
              ) : (
                <li key={o.plugin} className="text-sm text-red-500">
                  {intl.formatMessage(i18n.resultFailure, { name: o.plugin, error: o.error })}
                </li>
              )
            )}
          </ul>
        </div>
      )}

      <TrustDialog
        open={trustOpen}
        source={trustSource}
        plugins={selectedPlugins}
        installing={loading.install}
        onConfirm={handleConfirmInstall}
        onCancel={() => setTrustOpen(false)}
      />
    </section>
  );
}
