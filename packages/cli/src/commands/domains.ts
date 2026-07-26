import { loadConfig } from '../lib/config.js';
import { VanishClient, type DomainInfo } from '../lib/api-client.js';
import { fail, failWithUnknownError } from '../lib/output.js';

interface JsonOptions {
  json?: boolean;
}

export async function domainAddCommand(
  hostname: string,
  options: JsonOptions & { channel?: string },
): Promise<void> {
  if (!options.channel) fail('Error: --channel is required', options, 'missing_channel');
  const client = authedClient(options);
  try {
    printDomain(await client.createDomain(hostname, options.channel), options);
  } catch (error) {
    failWithUnknownError(error, options, 'Failed to add custom domain');
  }
}

export async function domainsListCommand(options: JsonOptions): Promise<void> {
  const client = authedClient(options);
  try {
    const result = await client.listDomains();
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (result.reservation) {
      console.log(`Vanish namespace: ${result.reservation.hostname}`);
      console.log(`Publish under it with: vanish site ./site --root index.html --channel my-site --domain site.${result.reservation.hostname}`);
      if (result.domains.length > 0) console.log('');
    }
    if (result.domains.length === 0) {
      if (!result.reservation) console.log('No domains or Vanish namespace found.');
      return;
    }
    console.log(`${'HOSTNAME'.padEnd(44)} ${'STATUS'.padEnd(14)} CHANNEL`);
    for (const domain of result.domains) {
      console.log(`${domain.hostname.padEnd(44)} ${domain.status.padEnd(14)} ${domain.channel}`);
    }
  } catch (error) {
    failWithUnknownError(error, options, 'Failed to list custom domains');
  }
}

export async function domainReserveCommand(slug: string, options: JsonOptions): Promise<void> {
  const client = authedClient(options);
  try {
    const reservation = await client.reserveDomainNamespace(slug);
    if (options.json) {
      console.log(JSON.stringify(reservation, null, 2));
      return;
    }
    console.log(`Reserved: ${reservation.hostname}`);
    console.log(`Publish: vanish site ./site --root index.html --channel my-site --domain site.${reservation.hostname}`);
  } catch (error) {
    failWithUnknownError(error, options, 'Failed to reserve Vanish namespace');
  }
}

export async function domainReleaseCommand(options: JsonOptions): Promise<void> {
  const client = authedClient(options);
  try {
    const result = await client.releaseDomainNamespace();
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Released: ${result.hostname}`);
    }
  } catch (error) {
    failWithUnknownError(error, options, 'Failed to release Vanish namespace');
  }
}

export async function domainVerifyCommand(hostname: string, options: JsonOptions): Promise<void> {
  const client = authedClient(options);
  try {
    printDomain(await client.verifyDomain(hostname), options);
  } catch (error) {
    failWithUnknownError(error, options, 'Failed to verify custom domain');
  }
}

export async function domainAttachCommand(
  hostname: string,
  options: JsonOptions & { channel?: string },
): Promise<void> {
  if (!options.channel) fail('Error: --channel is required', options, 'missing_channel');
  const client = authedClient(options);
  try {
    printDomain(await client.attachDomain(hostname, options.channel), options);
  } catch (error) {
    failWithUnknownError(error, options, 'Failed to attach custom domain');
  }
}

export async function domainRemoveCommand(hostname: string, options: JsonOptions): Promise<void> {
  const client = authedClient(options);
  try {
    const result = await client.deleteDomain(hostname);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.status === 'deleting'
        ? `Domain removal queued: ${hostname}`
        : `Removed custom domain: ${hostname}`);
    }
  } catch (error) {
    failWithUnknownError(error, options, 'Failed to remove custom domain');
  }
}

function authedClient(options: JsonOptions): VanishClient {
  const config = loadConfig();
  if (!config.api_key) {
    fail('Not logged in. Use `vanish login` first.', options, 'auth_required');
  }
  return new VanishClient(config);
}

function printDomain(domain: DomainInfo, options: JsonOptions): void {
  if (options.json) {
    console.log(JSON.stringify(domain, null, 2));
    return;
  }
  console.log(domain.url);
  console.log(`Status: ${domain.status}`);
  console.log(`Channel: ${domain.channel}`);
  if (domain.parentHostname) console.log(`Namespace: ${domain.parentHostname}`);
  if (domain.dnsRecords.length > 0 && domain.status !== 'active') {
    console.log('\nDNS records:');
    for (const record of domain.dnsRecords) {
      console.log(`${record.type.padEnd(6)} ${record.name} -> ${record.value}`);
    }
    console.log(`\nVerify after DNS propagation: vanish domains verify ${domain.hostname}`);
  } else if (domain.managedDns && domain.status !== 'active') {
    console.log('DNS is managed by Vanish. TLS provisioning is in progress.');
    console.log(`Verify later: vanish domains verify ${domain.hostname}`);
  }
  if (domain.lastError) console.error(`Provider error: ${domain.lastError}`);
}
