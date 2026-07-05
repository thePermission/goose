import { MainPanelLayout } from '../Layout/MainPanelLayout';
import SourcesSection from './SourcesSection';
import BrowseSection from './BrowseSection';
import InstalledSection from './InstalledSection';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  heading: { id: 'marketplaces.view.heading', defaultMessage: 'Marketplaces' },
  description: {
    id: 'marketplaces.view.description',
    defaultMessage:
      'Manage plugin marketplaces, browse their catalogs, install plugins, and manage installed plugins.',
  },
});

export default function MarketplacesView() {
  const intl = useIntl();
  return (
    <MainPanelLayout>
      <div className="flex flex-col min-w-0 flex-1 overflow-y-auto">
        <div className="bg-background-primary px-8 pb-4 pt-16">
          <h1 className="text-4xl font-light mb-1">{intl.formatMessage(i18n.heading)}</h1>
          <p className="text-sm text-text-secondary mb-6">{intl.formatMessage(i18n.description)}</p>
        </div>
        <div className="px-8 pb-16 flex flex-col gap-10">
          <SourcesSection />
          <BrowseSection />
          <InstalledSection />
        </div>
      </div>
    </MainPanelLayout>
  );
}
