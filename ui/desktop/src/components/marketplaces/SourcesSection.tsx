import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useMarketplace } from './MarketplaceContext';
import { errorMessage } from './errorMessage';
import { toastService } from '../../toasts';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  heading: { id: 'marketplaces.sources.heading', defaultMessage: 'Sources' },
  namePlaceholder: { id: 'marketplaces.sources.namePlaceholder', defaultMessage: 'Name' },
  locationPlaceholder: {
    id: 'marketplaces.sources.locationPlaceholder',
    defaultMessage: 'Git URL or path',
  },
  kindLabel: { id: 'marketplaces.sources.kindLabel', defaultMessage: 'Kind' },
  kindClaude: { id: 'marketplaces.sources.kindClaude', defaultMessage: 'Claude' },
  kindCodex: { id: 'marketplaces.sources.kindCodex', defaultMessage: 'Codex' },
  add: { id: 'marketplaces.sources.add', defaultMessage: 'Add' },
  remove: { id: 'marketplaces.sources.remove', defaultMessage: 'Remove' },
  required: {
    id: 'marketplaces.sources.required',
    defaultMessage: 'Name and location are required.',
  },
  addFailed: { id: 'marketplaces.sources.addFailed', defaultMessage: 'Failed to add source' },
  removeFailed: { id: 'marketplaces.sources.removeFailed', defaultMessage: 'Failed to remove source' },
  empty: { id: 'marketplaces.sources.empty', defaultMessage: 'No sources configured yet.' },
});

export default function SourcesSection() {
  const intl = useIntl();
  const { sources, addSource, removeSource } = useMarketplace();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [kind, setKind] = useState('claude');
  const [formError, setFormError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (name.trim() === '' || location.trim() === '') {
      setFormError(intl.formatMessage(i18n.required));
      return;
    }
    setFormError(null);
    try {
      await addSource(name.trim(), kind, location.trim());
      setName('');
      setLocation('');
      setKind('claude');
    } catch (e) {
      setFormError(errorMessage(e));
      toastService.error({
        title: intl.formatMessage(i18n.addFailed),
        msg: errorMessage(e),
        traceback: errorMessage(e),
      });
    }
  };

  const handleRemove = async (sourceName: string) => {
    try {
      await removeSource(sourceName);
    } catch (e) {
      toastService.error({
        title: intl.formatMessage(i18n.removeFailed),
        msg: errorMessage(e),
        traceback: errorMessage(e),
      });
    }
  };

  return (
    <section aria-label={intl.formatMessage(i18n.heading)}>
      <h2 className="text-lg font-medium mb-3">{intl.formatMessage(i18n.heading)}</h2>

      {sources.length === 0 ? (
        <p className="text-sm text-text-secondary mb-3">{intl.formatMessage(i18n.empty)}</p>
      ) : (
        <ul className="flex flex-col gap-2 mb-4">
          {sources.map((s) => (
            <li
              key={s.name}
              className="flex items-center justify-between border border-border-primary rounded-md px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{s.name}</div>
                <div className="text-xs text-text-secondary truncate">
                  {s.kind} · {s.location}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                data-testid={`marketplace-source-remove-${s.name}`}
                aria-label={intl.formatMessage(i18n.remove)}
                onClick={() => handleRemove(s.name)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          data-testid="marketplace-source-name"
          aria-label={intl.formatMessage(i18n.namePlaceholder)}
          placeholder={intl.formatMessage(i18n.namePlaceholder)}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          data-testid="marketplace-source-location"
          aria-label={intl.formatMessage(i18n.locationPlaceholder)}
          placeholder={intl.formatMessage(i18n.locationPlaceholder)}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <select
          data-testid="marketplace-source-kind"
          aria-label={intl.formatMessage(i18n.kindLabel)}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="h-9 rounded-md border border-border-primary bg-background-primary px-3 text-sm"
        >
          <option value="claude">{intl.formatMessage(i18n.kindClaude)}</option>
          <option value="codex">{intl.formatMessage(i18n.kindCodex)}</option>
        </select>
        <Button data-testid="marketplace-source-add" onClick={handleAdd}>
          {intl.formatMessage(i18n.add)}
        </Button>
      </div>
      {formError !== null && (
        <p role="alert" className="text-sm text-red-500 mt-2">
          {formError}
        </p>
      )}
    </section>
  );
}
