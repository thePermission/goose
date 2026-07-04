import { getAcpClient } from './acpConnection';
import type {
  MarketplaceSourceInfo,
  CatalogPluginInfo,
  InstalledPluginInfo,
  InstalledPluginResult_unstable,
} from '@aaif/goose-sdk';

export async function listMarketplaces(): Promise<MarketplaceSourceInfo[]> {
  const client = await getAcpClient();
  const res = await client.goose.marketplaceList_unstable({});
  return res.marketplaces;
}

export async function addMarketplace(
  name: string,
  kind: string,
  location: string
): Promise<void> {
  const client = await getAcpClient();
  await client.goose.marketplaceAdd_unstable({ name, kind, location });
}

export async function removeMarketplace(name: string): Promise<void> {
  const client = await getAcpClient();
  await client.goose.marketplaceRemove_unstable({ name });
}

export async function browseMarketplace(name: string): Promise<CatalogPluginInfo[]> {
  const client = await getAcpClient();
  const res = await client.goose.marketplaceBrowse_unstable({ name });
  return res.plugins;
}

export async function installMarketplacePlugin(
  marketplace: string,
  plugin: string,
  autoUpdate = false
): Promise<InstalledPluginResult_unstable> {
  const client = await getAcpClient();
  return await client.goose.marketplaceInstall_unstable({ marketplace, plugin, autoUpdate });
}

export async function listInstalledPlugins(): Promise<InstalledPluginInfo[]> {
  const client = await getAcpClient();
  const res = await client.goose.pluginsList_unstable({});
  return res.plugins;
}

export async function setPluginEnabled(name: string, enabled: boolean): Promise<void> {
  const client = await getAcpClient();
  await client.goose.pluginsSetEnabled_unstable({ name, enabled });
}

export async function updatePlugin(name: string): Promise<InstalledPluginResult_unstable> {
  const client = await getAcpClient();
  return await client.goose.pluginsUpdate_unstable({ name });
}
